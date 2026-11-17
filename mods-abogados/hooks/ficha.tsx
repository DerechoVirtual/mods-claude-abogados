// ─────────────────────────────────────────────────────────────────────────────
// MODS 7 y 8 · Ficha del expediente: Semáforo MASC y procurador
//
// Mod 7 · Semáforo MASC. Cuando Claude ESCRIBE una demanda en la carpeta del
// expediente activo (Write/Edit sobre un archivo de demanda, las secciones de
// la redacción rápida o el ensamblado del Word), comprueba si la ficha tiene
// el intento de negociación previa (art. 5 LO 1/2025) con medio, fecha y
// documento (art. 10). Si falta: «Sin MASC acreditado» en la banda.
//
// Mod 8 · Procurador. Si el procedimiento y la cuantía de la ficha exigen
// procurador (arts. 23 y 31 LEC) y la ficha no lo tiene: «Postulación
// obligatoria (arts. 23 y 31 LEC)».
//
// Los dos comparten UNA pastilla en la línea de estado, que solo aparece
// cuando aplica, y el panel /ficha (botones Burofax, Mediación y Oferta
// vinculante, con fecha y documento). /masc lo registra en una línea.
// Nunca bloquean nada: solo avisan. Las reglas están en config/masc.json y
// config/postulacion.json y DEBE VALIDARLAS UN ABOGADO.
// ─────────────────────────────────────────────────────────────────────────────

import type { On, ToolCallInput, ToolCallResult } from 'claude-code'
import {
  avisoProcurador,
  claveFicha,
  estadoMasc,
  exigeMasc,
  fechaLegible,
  leerArgumentosMasc,
  leerCuantia,
  normalizarConfigMasc,
  normalizarFichas,
  normalizarPostulacion,
  rutaDeDemanda,
  type Ficha,
} from './lib/expediente'
import { leerFechaUsuario } from './lib/plazos'
import { pulsable } from './pastilla'
import { textoSobre } from './lib/colores'
import { recortar, sinTildes } from './lib/texto'
import {
  abrirPanel,
  acentoODefecto,
  anotarError,
  colorAcento,
  conAtajo,
  escribirJson,
  estado,
  leerJson,
  panelAbierto,
  redibujar,
  type Cliente,
  type Motor,
  type Pastilla,
} from './lib/estado'

export const PANEL_FICHA = 'ficha'
const ARCHIVO = 'data/fichas.json'
const NOTA_ARCHIVO =
  'Fichas de expediente (Mods 7 y 8). Datos FICTICIOS de demostración. Clave: número de expediente (o nombre del cliente sin tildes). Las edita el panel /ficha y el comando /masc; también a mano.'

/** Lo que se está escribiendo en el panel (aún sin guardar). */
const formulario = {
  de: '', // clave de la ficha a la que corresponde
  procedimiento: '',
  cuantia: '',
  procurador: '',
  medio: '',
  fecha: '',
  documento: '',
  nota: '',
  mensaje: null as { texto: string; color: string } | null,
}

/** «falta el medio, la fecha y el documento» (en vez de «falta medio, fecha, documento»). */
function loQueFalta(faltan: readonly string[]): string {
  const conArticulo: Record<string, string> = { medio: 'el medio', fecha: 'la fecha', documento: 'el documento' }
  const lista = faltan.map(f => conArticulo[f] ?? f)
  const frase = lista.length <= 1 ? (lista[0] ?? '') : `${lista.slice(0, -1).join(', ')} y ${lista[lista.length - 1]}`
  return `${lista.length === 1 ? 'falta' : 'faltan'} ${frase}`
}

function fichaDe(cliente: Cliente | null): Ficha | undefined {
  return cliente ? estado.fichas[claveFicha(cliente)] : undefined
}

/** Carga el formulario con la ficha del cliente activo (si ha cambiado de cliente). */
function prepararFormulario(cliente: Cliente | null): void {
  const clave = cliente ? claveFicha(cliente) : ''
  if (formulario.de === clave) return
  const f = fichaDe(cliente)
  formulario.de = clave
  formulario.procedimiento = f?.procedimiento ?? ''
  formulario.cuantia = f?.cuantia !== undefined ? String(f.cuantia).replace('.', ',') : ''
  formulario.procurador = f?.procurador ?? ''
  formulario.medio = f?.masc?.medio ?? ''
  formulario.fecha = f?.masc?.fecha ? fechaLegible(f.masc.fecha) : ''
  formulario.documento = f?.masc?.documento ?? ''
  formulario.nota = f?.masc?.nota ?? ''
  formulario.mensaje = null
}

/** Relee la configuración y las fichas. */
async function cargarFichas($: Motor): Promise<void> {
  estado.reglasMasc = normalizarConfigMasc(await leerJson($, 'config/masc.json', {}))
  estado.reglasPostulacion = normalizarPostulacion(await leerJson($, 'config/postulacion.json', {}))
  estado.fichas = normalizarFichas(await leerJson($, ARCHIVO, {}))
}

/** Guarda la ficha del cliente (relee antes el archivo para no pisar otras fichas). */
async function guardarFicha($: Motor, cliente: Cliente, cambio: (f: Ficha) => Ficha): Promise<boolean> {
  estado.fichas = normalizarFichas(await leerJson($, ARCHIVO, {}))
  const clave = claveFicha(cliente)
  const nueva = cambio({ ...(estado.fichas[clave] ?? {}) })
  estado.fichas = { ...estado.fichas, [clave]: nueva }
  const ok = await escribirJson($, ARCHIVO, { _nota: NOTA_ARCHIVO, fichas: estado.fichas })
  redibujar($)
  return ok
}

/** ¿Hay que avisar de MASC para el cliente activo? (solo con una demanda en curso de ESE cliente) */
function faltaMascAhora(): string[] | null {
  const cliente = estado.clienteActivo
  if (!estado.activos.masc || !cliente || !estado.demandaEnCurso) return null
  if (sinTildes(estado.demandaEnCurso.cliente) !== sinTildes(cliente.nombre)) return null
  if (!exigeMasc(cliente.jurisdiccion, estado.reglasMasc)) return null
  const e = estadoMasc(fichaDe(cliente), estado.reglasMasc)
  return e.tipo === 'falta' ? e.faltan : null
}

// ── Manejadores que llama register.tsx (ninguno lanza errores) ──────────────

/** MODS 7 y 8 · Al iniciar la sesión: lee reglas y fichas y registra /ficha y /masc. */
export async function iniciarFicha($: Motor): Promise<void> {
  try {
    await cargarFichas($)
    await $.command.register({
      name: 'ficha',
      description: 'Ficha del expediente activo: procedimiento, cuantía, procurador y MASC («/ficha cerrar» la cierra)',
      argumentHint: '[cerrar]',
      immediate: true,
    })
    if (estado.activos.masc) {
      await $.command.register({
        name: 'masc',
        description: 'Registra en la ficha el intento de negociación previa (LO 1/2025)',
        argumentHint: 'burofax|mediacion|oferta-vinculante | dd/mm/aaaa | documento [| nota]',
      })
    }
  } catch (error) {
    anotarError(`Mods 7 y 8: ${String(error).slice(0, 100)}`)
  }
}

/** MOD 7 · Después de una llamada: ¿Claude ha escrito una demanda del expediente activo? */
export function vigilarDemanda($: Motor, e: ToolCallInput, resultado: ToolCallResult): void {
  try {
    if (resultado.deny !== undefined || resultado.isError === true) return
    const cliente = estado.clienteActivo
    if (!cliente?.carpeta) return
    const ruta = rutaDeDemanda(e as unknown as Record<string, unknown>, cliente.carpeta, estado.cwd, estado.reglasMasc)
    if (!ruta) return
    const yaEstaba = estado.demandaEnCurso && sinTildes(estado.demandaEnCurso.cliente) === sinTildes(cliente.nombre)
    estado.demandaEnCurso = { cliente: cliente.nombre, ruta }
    if (!yaEstaba) {
      const faltan = faltaMascAhora()
      if (faltan) {
        $.ui.toast(
          `⚠ ${estado.reglasMasc.aviso} en la ficha de ${cliente.nombre} (art. 5 LO 1/2025): ${loQueFalta(faltan)}. Apúntalo en /ficha. Solo es un aviso.`,
          { timeoutMs: 10_000 },
        )
      }
      redibujar($)
    }
  } catch {
    // un fallo al vigilar no afecta a la llamada
  }
}

/** MODS 7 y 8 · Comandos /ficha y /masc y el panel (hooks con filtro propio). */
export function registrarHooksFicha(on: On): void {
  on('command.run', { command: 'ficha' }, async ($, e) => {
    // /ficha siempre ABRE la ficha (y la pone delante); /ficha cerrar la cierra.
    if (/^cerrar$/i.test((e.args ?? '').trim())) {
      if (await panelAbierto($, PANEL_FICHA)) await $.ui.close({ id: PANEL_FICHA })
      return { text: 'Ficha cerrada.' }
    }
    await cargarFichas($)
    await abrirPanel($, PANEL_FICHA, 'Ficha del expediente', true)
    return {}
  }).catch(() => ({ text: 'mods-abogados: no se pudo abrir la ficha.' }))

  on('command.run', { command: 'masc' }, async ($, e) => {
    const cliente = estado.clienteActivo
    if (!cliente) return { text: 'Primero activa un cliente con /cliente.' }
    if (!(e.args ?? '').trim()) {
      await abrirPanel($, PANEL_FICHA, 'Ficha del expediente', true)
      return {}
    }
    const r = leerArgumentosMasc(e.args ?? '', estado.reglasMasc, t => leerFechaUsuario(t, estado.hoy))
    if ('error' in r) return { text: r.error }
    await guardarFicha($, cliente, f => ({ ...f, masc: r.masc }))
    formulario.de = '' // que el panel recoja lo guardado
    const ok = estadoMasc(fichaDe(cliente), estado.reglasMasc)
    return { text: ok.tipo === 'acreditado' ? `MASC registrado en la ficha de ${cliente.nombre}: ${ok.resumen}.` : 'No se pudo registrar.' }
  }).catch(() => ({ text: 'mods-abogados: no se pudo registrar el MASC.' }))

  // ── Panel /ficha ──────────────────────────────────────────────────────────
  on('ui.render', { component: 'Pane', requestId: PANEL_FICHA }, async ($, e) => {
    const tabla = $.ui.resolve(e)
    const { Box, Text, Button } = tabla
    const ancho = Math.max(30, e.props.bodyColumns)
    const cliente = estado.clienteActivo
    if (!('Input' in tabla) || !('Select' in tabla)) {
      return <Text>Aquí no hay campos para escribir: usa /masc burofax | dd/mm/aaaa | documento</Text>
    }
    const { Input, Select } = tabla
    const acento = acentoODefecto()
    const acentoHex = colorAcento()
    const cabecera = (texto: string) => (
      <Text backgroundColor={acento} color={acentoHex ? textoSobre(acentoHex) : 'inverseText'} bold wrap="truncate-end">
        {` 🗂  ${texto} `.padEnd(ancho, ' ')}
      </Text>
    )
    if (!cliente) {
      return (
        <Box flexDirection="column">
          {cabecera('FICHA DEL EXPEDIENTE')}
          <Text dimColor>No hay cliente activo. Elige uno con /cliente y vuelve a abrir la ficha.</Text>
        </Box>
      )
    }
    prepararFormulario(cliente)
    const f = fichaDe(cliente)
    const reglasP = estado.reglasPostulacion
    const reglasM = estado.reglasMasc
    const aviso = avisoProcurador(f, reglasP)
    const masc = estadoMasc(f, reglasM)
    const civil = exigeMasc(cliente.jurisdiccion, reglasM)

    const guardarDatos = async () => {
      const cuantia = formulario.cuantia.trim() ? leerCuantia(formulario.cuantia) : null
      if (formulario.cuantia.trim() && cuantia === null) {
        formulario.mensaje = { texto: `Cuantía no válida: «${formulario.cuantia}».`, color: 'error' }
        redibujar($)
        return
      }
      await guardarFicha($, cliente, x => {
        const { procedimiento: _p, cuantia: _c, procurador: _r, ...resto } = x
        return {
          ...resto,
          ...(formulario.procedimiento ? { procedimiento: formulario.procedimiento } : {}),
          ...(cuantia !== null ? { cuantia } : {}),
          ...(formulario.procurador.trim() ? { procurador: formulario.procurador.trim() } : {}),
        }
      })
      formulario.mensaje = { texto: 'Datos guardados en la ficha.', color: 'success' }
      redibujar($)
    }
    const guardarMasc = async () => {
      const r = leerArgumentosMasc(`${formulario.medio} | ${formulario.fecha} | ${formulario.documento} | ${formulario.nota}`, reglasM, t =>
        leerFechaUsuario(t, estado.hoy),
      )
      if ('error' in r) {
        formulario.mensaje = { texto: r.error.replace(/ Uso: .*$/, ''), color: 'error' }
        redibujar($)
        return
      }
      await guardarFicha($, cliente, x => ({ ...x, masc: r.masc }))
      formulario.mensaje = { texto: 'Intento de negociación registrado en la ficha.', color: 'success' }
      redibujar($)
    }
    const campo = (clave: 'cuantia' | 'procurador' | 'fecha' | 'documento' | 'nota', etiqueta: string, ayuda: string, alGuardar: () => Promise<void>) => (
      <Input
        key={`ficha-${clave}`}
        label={etiqueta}
        placeholder={ayuda}
        value={formulario[clave]}
        submitLabel="guardar"
        onInput={valor => {
          formulario[clave] = valor
          redibujar($)
        }}
        onSubmit={valor => {
          formulario[clave] = valor
          void alGuardar()
        }}
      />
    )
    const botonMedio = (medio: string, etiqueta: string, tecla: string) => (
      <Button
        key={`masc-${medio}`}
        label={conAtajo(`${formulario.medio === medio ? '● ' : ''}${etiqueta}`, tecla, e.surface)}
        hotkey={tecla}
        {...(formulario.medio === medio ? { variant: 'primary' as const } : {})}
        onPress={() => {
          formulario.medio = medio
          redibujar($)
        }}
      />
    )

    return (
      <Box flexDirection="column">
        {cabecera(`FICHA DEL EXPEDIENTE · ${cliente.nombre}${cliente.expediente ? ' · ' + cliente.expediente : ''}`)}
        {cliente.asunto && <Text dimColor wrap="truncate-end">{cliente.asunto}</Text>}
        <Text> </Text>

        <Text bold color={acento}>
          Procurador y abogado (arts. 23 y 31 LEC)
        </Text>
        {aviso ? (
          <Text color="warning" wrap="wrap">
            ⚠ {aviso.texto}. {aviso.motivo}
          </Text>
        ) : (
          <Text color={f?.procurador ? 'success' : 'text'} dimColor={!f?.procurador} wrap="wrap">
            {f?.procurador
              ? `✓ Procurador: ${f.procurador}`
              : f?.procedimiento || f?.cuantia !== undefined
                ? '✓ Según la ficha, no hace falta procurador.'
                : 'Indica el procedimiento y la cuantía para saber si hace falta procurador.'}
          </Text>
        )}
        <Select
          key="ficha-procedimiento"
          label="Procedimiento"
          value={formulario.procedimiento}
          options={[{ value: '', label: 'Sin indicar' }, ...Object.entries(reglasP.procedimientos).map(([v, r]) => ({ value: v, label: r.nombre }))]}
          onSelect={valor => {
            formulario.procedimiento = valor
            redibujar($)
          }}
        />
        {campo('cuantia', 'Cuantía (€)', 'p. ej. 2.340', guardarDatos)}
        {campo('procurador', 'Procurador', 'D./D.ª …', guardarDatos)}
        <Button key="ficha-guardar-datos" label={conAtajo('Guardar datos', 'd', e.surface)} hotkey="d" onPress={() => void guardarDatos()} />
        <Text> </Text>

        <Text bold color={acento}>
          Intento de negociación previa · MASC (arts. 5 y 10 LO 1/2025)
        </Text>
        {!civil ? (
          <Text dimColor>No se exige: el expediente no es del orden civil ({cliente.jurisdiccion}).</Text>
        ) : masc.tipo === 'acreditado' ? (
          <Text color="success" wrap="wrap">
            ✓ Acreditado: {masc.resumen}
          </Text>
        ) : masc.tipo === 'excepcion' ? (
          <Text color="success" wrap="wrap">
            ✓ No se exige: {masc.texto}
          </Text>
        ) : (
          <Text color="warning" wrap="wrap">
            ✗ {reglasM.aviso}: {loQueFalta(masc.faltan)}.
          </Text>
        )}
        {f?.masc?.nota && <Text dimColor wrap="wrap">{recortar(f.masc.nota, 300)}</Text>}
        <Box flexDirection="row" columnGap={1}>
          {botonMedio('burofax', 'Burofax', 'b')}
          {botonMedio('mediacion', 'Mediación', 'm')}
          {botonMedio('oferta-vinculante', 'Oferta vinculante', 'o')}
        </Box>
        {campo('fecha', 'Fecha', 'dd/mm/aaaa', guardarMasc)}
        {campo('documento', 'Documento que lo acredita', 'DOC. 5 · burofax y certificado de entrega', guardarMasc)}
        {campo('nota', 'Nota (opcional)', 'propuesta, respuesta…', guardarMasc)}
        <Button key="masc-guardar" label={conAtajo('Guardar MASC', 'g', e.surface)} hotkey="g" variant="primary" onPress={() => void guardarMasc()} />
        {formulario.mensaje && <Text color={formulario.mensaje.color}>{formulario.mensaje.texto}</Text>}
        <Text> </Text>
        <Text dimColor wrap="wrap">
          Orientativo: las reglas se comprobaron el 09/11/2026 con el texto vigente, pero debe validarlas un abogado. Solo avisa: nunca bloquea nada.
        </Text>
      </Box>
    )
  }).catch(($, e, next) => next(e))
}

/**
 * Pastilla de la banda: solo cuando falta el MASC (con una demanda en curso) o
 * el procurador. `nivel`: 0, el aviso entero; 1 y 2, en dos palabras.
 */
export function chipFicha($: Motor, tabla: ReturnType<Motor['ui']['resolve']>, nivel: 0 | 1 | 2): Pastilla | null {
  try {
    const cliente = estado.clienteActivo
    if (!cliente) return null
    const faltaMasc = faltaMascAhora()
    const procurador = estado.activos.procurador ? avisoProcurador(fichaDe(cliente), estado.reglasPostulacion) : null
    if (!faltaMasc && !procurador) return null
    const { Text } = tabla
    const largo =
      faltaMasc && procurador
        ? `⚠ ${estado.reglasMasc.aviso} · Sin procurador (arts. 23 y 31 LEC)`
        : faltaMasc
          ? `⚠ ${estado.reglasMasc.aviso}`
          : `⚠ ${procurador!.texto}`
    const corto = faltaMasc && procurador ? '⚠ Sin MASC ni procurador' : faltaMasc ? '⚠ Sin MASC' : '⚠ Falta procurador'
    // Con muy poco sitio y los dos avisos a la vez, basta con decir dónde mirar.
    const texto = nivel === 0 ? largo : nivel === 2 && faltaMasc && procurador ? '⚠ Ficha' : corto
    const nodo = pulsable(
      tabla,
      'banda-ficha',
      'Abrir la ficha del expediente',
      () => void abrirPanel($, PANEL_FICHA, 'Ficha del expediente', true),
      <Text color="warning" bold wrap="truncate-end">
        {texto}
      </Text>,
    )
    return { nodo, ancho: texto.length + 1 }
  } catch {
    return null
  }
}
