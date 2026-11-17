// ─────────────────────────────────────────────────────────────────────────────
// MOD 10 · Siguientes pasos
//
// Al TERMINAR un escrito (y solo en una sesión de trabajo jurídico), se abre
// un panel con las tres peticiones más probables («Recurso de apelación contra
// la sentencia», «Preparar la vista»…), cada una con su porqué y su plazo.
// Al pulsar una, se envía a Claude la petición completa, como si la escribiera
// el abogado, con el cliente, el expediente, la ficha y el escrito recién hecho.
// En el mismo panel: «Que lo ataque el contrario» y «Ninguno». El panel se
// retira en cuanto el abogado escribe otra cosa.
//
// Las opciones salen de config/siguientes.json, las ordena Claude con el modelo
// pequeño (UNA llamada por escrito, guardada) y suben las que el abogado eligió
// otras veces. Si el modelo falla, las tres primeras de la tabla. Gasta un
// poco de uso: una llamada corta por escrito terminado.
// Nunca bloquea nada.
// ─────────────────────────────────────────────────────────────────────────────

import type { On, ToolCallInput, ToolCallResult, TurnCompleteInput, TurnStartInput } from 'claude-code'
import {
  anotarEleccion,
  candidatas,
  combinar,
  leerRespuestaModelo,
  normalizarConfigSiguientes,
  opcionesDeTabla,
  peticionCompleta,
  promptModelo,
  siFueraHoy,
  tipoDeEscrito,
  type Historial,
  type Opcion,
} from './lib/siguientes'
import { detectarEscritoTerminado, esEnsamblado, type EscritoTerminado } from './lib/escritos'
import { carpetaRedaccionDeSeccion, huella, rutaEscritoMd } from './lib/anonimizar'
import { claveFicha, estadoMasc, euros } from './lib/expediente'
import { textoSobre } from './lib/colores'
import { recortar } from './lib/texto'
import { acentoODefecto, anotarError, colorAcento, conAtajo, enviarUnaVez, estado, leerJson, panelAbierto, redibujar, type Motor } from './lib/estado'
import { atacarEscrito, escribeSeccion } from './contrario'

export const PANEL_SIGUIENTES = 'siguientes'
const CLAVE_HISTORIAL = 'siguientes-historial'
const CLAVE_CACHE = 'siguientes-cache'

/** Escrito terminado en el turno en curso (el panel sale al acabar el turno). */
let delTurno: { escrito: EscritoTerminado; md: string | null } | null = null
let carpetaSecciones: string | null = null
/** Se ha empezado a escribir otro escrito: el panel se retira en cuanto se pueda. */
let pendienteDeRetirar = false
let historial: Historial = {}
/** Respuestas del modelo ya pedidas: una sola llamada por escrito. */
const cache = new Map<string, Array<{ id: string; etiqueta?: string; porque?: string }>>()

function textoDelResultado(resultado: ToolCallResult): string {
  if (typeof resultado.text === 'string') return resultado.text
  if (typeof resultado.result === 'string') return resultado.result
  try {
    return JSON.stringify(resultado.result ?? '')
  } catch {
    return ''
  }
}

/** La ficha del cliente activo en una línea (para el modelo y para la petición). */
function resumenFicha(): string | undefined {
  const c = estado.clienteActivo
  if (!c) return undefined
  const f = estado.fichas[claveFicha(c)]
  if (!f) return undefined
  const masc = estadoMasc(f, estado.reglasMasc)
  const partes = [
    f.procedimiento ? `procedimiento ${estado.reglasPostulacion.procedimientos[f.procedimiento]?.nombre ?? f.procedimiento}` : '',
    f.cuantia !== undefined ? `cuantía ${euros(f.cuantia)}` : '',
    f.procurador ? `procurador ${f.procurador}` : 'sin procurador designado',
    masc.tipo === 'acreditado' ? `MASC: ${masc.resumen}` : masc.tipo === 'excepcion' ? `sin MASC: ${masc.texto}` : 'MASC sin acreditar',
  ].filter(Boolean)
  return partes.join(' · ')
}

function retirar($: Motor): void {
  if (!estado.siguientes) return
  estado.siguientes = null
  void $.ui.close({ id: PANEL_SIGUIENTES }).catch(() => undefined)
  redibujar($)
}

/** Ordena con el modelo pequeño (una vez por escrito) y redibuja. */
async function ordenarConClaude($: Motor, clave: string): Promise<void> {
  const s = estado.siguientes
  if (!s || s.clave !== clave) return
  try {
    let modelo = cache.get(clave)
    if (!modelo) {
      const guardadas = (await $.store.get(CLAVE_CACHE)) as Record<string, typeof modelo> | undefined
      modelo = guardadas?.[clave]
    }
    if (!modelo) {
      const { system, prompt } = promptModelo(s.contexto, s.ids, historial, estado.configSiguientes)
      const r = await $.model.complete({ model: 'haiku', system, prompt, maxTokens: 700, effort: 'low', timeoutMs: 20_000 })
      modelo = r.isAnswered ? leerRespuestaModelo(r.text, s.ids) : []
      cache.set(clave, modelo)
      const guardadas = ((await $.store.get(CLAVE_CACHE)) as Record<string, unknown> | undefined) ?? {}
      const recientes = Object.fromEntries([...Object.entries(guardadas), [clave, modelo]].slice(-20))
      await $.store.set(CLAVE_CACHE, recientes)
    }
    const actual = estado.siguientes
    if (!actual || actual.clave !== clave) return
    estado.siguientes = modelo.length
      ? { ...actual, opciones: combinar(modelo, actual.ids, historial, actual.contexto.tipo.id, estado.configSiguientes), origen: 'claude' }
      : { ...actual, origen: 'tabla' }
  } catch (error) {
    anotarError(`Mod 10: ${String(error).slice(0, 100)}`)
    if (estado.siguientes?.clave === clave) estado.siguientes = { ...estado.siguientes, origen: 'tabla' }
  }
  redibujar($)
}

/** El abogado elige una: se apunta en su historial y se envía la petición completa. */
async function elegir($: Motor, op: Opcion): Promise<void> {
  const s = estado.siguientes
  if (!s) return
  historial = anotarEleccion(historial, s.contexto.tipo.id, op.id)
  try {
    await $.store.set(CLAVE_HISTORIAL, historial)
  } catch {
    // el historial es una ayuda: sin él, sigue funcionando
  }
  const texto = peticionCompleta(op, s.contexto)
  retirar($)
  // Empieza otro trabajo: «Escrito terminado» (y su botón del contrario) ya no pintan nada en la banda.
  estado.escritoListo = null
  redibujar($)
  const enviado = await enviarUnaVez($, texto, true)
  if (enviado !== 'enviado' && enviado !== 'repetido') $.ui.toast(`No se pudo enviar (${enviado.fallo}).`)
}

async function abrir($: Motor, conFoco: boolean): Promise<void> {
  try {
    await $.ui.open(conFoco ? { id: PANEL_SIGUIENTES, title: 'Siguientes pasos', focus: true } : { id: PANEL_SIGUIENTES, title: 'Siguientes pasos' })
  } catch {
    // si no cabe, la banda lleva el botón para abrirlo
  }
}

// ── Manejadores que llama register.tsx (ninguno lanza errores) ──────────────

/** MOD 10 · Al iniciar la sesión: tabla, historial y /siguientes. */
export async function iniciarSiguientes($: Motor): Promise<void> {
  try {
    estado.configSiguientes = normalizarConfigSiguientes(await leerJson($, 'config/siguientes.json', {}))
    const h = await $.store.get(CLAVE_HISTORIAL)
    historial = h && typeof h === 'object' ? (h as Historial) : {}
    await $.command.register({ name: 'siguientes', description: 'Vuelve a abrir los siguientes pasos del último escrito terminado', immediate: true })
  } catch (error) {
    anotarError(`Mod 10: ${String(error).slice(0, 100)}`)
  }
}

/** MOD 10 · Después de cada llamada: ¿ha quedado terminado un escrito? (sin red, sin modelo) */
export function despuesDeHerramientaSiguientes(e: ToolCallInput, resultado: ToolCallResult): void {
  try {
    if (resultado.deny !== undefined || resultado.isError === true) return
    const datos = e as unknown as Record<string, unknown>
    if (String(e.tool) === 'Write' || String(e.tool) === 'Edit') {
      const seccion = typeof datos.file_path === 'string' ? carpetaRedaccionDeSeccion(datos.file_path) : null
      if (seccion) carpetaSecciones = seccion
      // Se escribe una sección: hay otro escrito en marcha, los pasos del anterior sobran.
      if (seccion && estado.siguientes && escribeSeccion(datos)) pendienteDeRetirar = true
      return
    }
    const salida = textoDelResultado(resultado)
    const escrito = detectarEscritoTerminado(datos, salida, false)
    if (!escrito) return
    const comando = typeof datos.command === 'string' ? datos.command : ''
    delTurno = { escrito, md: esEnsamblado(datos) ? rutaEscritoMd(comando, salida, carpetaSecciones) : null }
  } catch {
    // nada
  }
}

/** MOD 10 · Un mensaje nuevo del abogado retira el panel (también al elegir una opción). */
export function empezarTurnoSiguientes($: Motor, e: TurnStartInput): void {
  if (e.agentId !== undefined) return
  delTurno = null
  retirar($)
}

/** MOD 10 · Acaba el turno: si se terminó un escrito en una sesión jurídica, el panel. */
export function terminarTurnoSiguientes($: Motor, e: TurnCompleteInput): void {
  try {
    if (e.agentId !== undefined || !delTurno) return
    const { escrito, md } = delTurno
    delTurno = null
    if (!estado.sesionJuridica) return // nunca en sesiones que no son de trabajo jurídico
    const cfg = estado.configSiguientes
    const cliente = estado.clienteActivo
    const ficha = cliente ? estado.fichas[claveFicha(cliente)] : undefined
    const tipo = tipoDeEscrito(escrito.nombre, ficha?.procedimiento, cfg)
    const ids = candidatas(tipo, cfg)
    if (ids.length === 0) return
    const resumen = resumenFicha()
    const contexto = {
      escrito: escrito.nombre,
      ruta: escrito.ruta,
      tipo,
      ...(cliente ? { cliente: cliente.nombre } : {}),
      ...(cliente?.expediente ? { expediente: cliente.expediente } : {}),
      ...(cliente?.asunto ? { asunto: cliente.asunto } : {}),
      ...(resumen ? { ficha: resumen } : {}),
    }
    const clave = huella(`${escrito.ruta}|${tipo.id}|${md ?? ''}`)
    estado.siguientes = { escrito, md, contexto, ids, clave, opciones: opcionesDeTabla(ids, historial, tipo.id, cfg), origen: 'calculando' }
    void abrir($, false)
    redibujar($)
    // El modelo, después del turno: no retiene a Claude.
    $.clock.after(50, () => void prepararYOrdenar($, clave))
  } catch (error) {
    anotarError(`Mod 10: ${String(error).slice(0, 100)}`)
  }
}

/** Añade el principio del escrito (si se encuentra) y ordena con Claude. */
async function prepararYOrdenar($: Motor, clave: string): Promise<void> {
  const s = estado.siguientes
  if (!s || s.clave !== clave) return
  if (s.md && !s.contexto.extracto) {
    try {
      if (await $.fs.exists(s.md)) {
        const texto = await $.fs.read(s.md)
        if (typeof texto === 'string' && estado.siguientes?.clave === clave) {
          estado.siguientes = { ...estado.siguientes, contexto: { ...estado.siguientes.contexto, extracto: texto.slice(0, 1500) } }
        }
      }
    } catch {
      // sin extracto también funciona
    }
  }
  await ordenarConClaude($, clave)
}

/** MOD 10 · /siguientes y el panel (hooks con filtro propio). */
export function registrarHooksSiguientes(on: On): void {
  on('command.run', { command: 'siguientes' }, async $ => {
    if (!estado.siguientes) return { text: 'No hay siguientes pasos pendientes: aparecen al terminar un escrito.' }
    await abrir($, true) // siempre lo pone delante, aunque ya estuviera abierto detrás de otro
    return {}
  }).catch(() => ({ text: 'mods-abogados: no se pudo abrir «Siguientes pasos».' }))

  on('ui.render', { component: 'Pane', requestId: PANEL_SIGUIENTES }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const ancho = Math.max(30, e.props.bodyColumns)
    const s = estado.siguientes
    const acento = acentoODefecto()
    const acentoHex = colorAcento()
    if (!s) return <Text dimColor>No hay siguientes pasos pendientes: aparecen al terminar un escrito.</Text>
    const origen =
      s.origen === 'calculando'
        ? 'Claude las está ordenando para este escrito…'
        : s.origen === 'claude'
          ? 'Ordenadas por Claude para este escrito, con lo que sueles elegir.'
          : 'Las habituales del despacho para este tipo de escrito.'
    return (
      <Box flexDirection="column">
        <Text backgroundColor={acento} color={acentoHex ? textoSobre(acentoHex) : 'inverseText'} bold wrap="truncate-end">
          {` ➡  SIGUIENTES PASOS · «${recortar(s.escrito.nombre, Math.max(20, ancho - 30))}» `.padEnd(ancho, ' ')}
        </Text>
        <Text dimColor wrap="wrap">
          {s.contexto.cliente ? `${s.contexto.cliente}${s.contexto.expediente ? ' · ' + s.contexto.expediente : ''} · ` : ''}
          {s.contexto.tipo.nombre}. {origen}
        </Text>
        <Text> </Text>
        {s.opciones.map((op, i) => {
          const hoy = siFueraHoy(op, estado.hoy, estado.festivos, estado.reglas)
          return (
            <Box key={`opcion-${op.id}`} flexDirection="column">
              <Button
                key={`siguiente-${i + 1}`}
                label={e.surface === 'terminal' ? `${i + 1}. ${op.etiqueta}` : op.etiqueta}
                hotkey={String(i + 1)}
                {...(i === 0 ? { variant: 'primary' as const } : {})}
                onPress={() => void elegir($, op)}
              />
              <Text dimColor wrap="wrap">
                {'   '}
                {op.porque}
              </Text>
              {op.plazoTexto && (
                <Text color="warning" wrap="wrap">
                  {'   ⏳ '}
                  {op.plazoTexto}
                  {hoy ? ` · ${hoy}` : ''}
                </Text>
              )}
            </Box>
          )
        })}
        <Text> </Text>
        <Box flexDirection="row" columnGap={2}>
          {estado.activos.contrario && (
            <Button
              key="siguientes-contrario"
              label={conAtajo('⚔ Que lo ataque el contrario', 'c', e.surface)}
              hotkey="c"
              onPress={() => {
                const escrito = s.escrito
                retirar($)
                void atacarEscrito($, escrito)
              }}
            />
          )}
          <Button key="siguientes-ninguno" label={conAtajo('Ninguno', '0', e.surface)} hotkey="0" onPress={() => retirar($)} />
        </Box>
        <Text dimColor wrap="wrap">
          Son sugerencias: decide el abogado. Los plazos son orientativos.
        </Text>
      </Box>
    )
  }).catch(($, e, next) => next(e))
}

/** ¿Hay que retirar los siguientes pasos porque ya se redacta otro escrito? Lo consulta register.tsx tras cada llamada. */
export function retirarSiEmpiezaOtro($: Motor): void {
  if (!pendienteDeRetirar) return
  pendienteDeRetirar = false
  retirar($)
}

/**
 * Línea de acción de la banda mientras hay siguientes pasos (el contrario va
 * dentro del panel). El texto se encoge y los botones no: nunca se cortan.
 */
export function filaSiguientes($: Motor, tabla: ReturnType<Motor['ui']['resolve']>, ancho: number) {
  try {
    const s = estado.siguientes
    if (!s) return null
    const { Box, Text, Button } = tabla
    // Lo que ocupan los dos botones: en el terminal el principal va entre
    // corchetes; en la app de escritorio la letra es más estrecha que una columna.
    const sitio = ancho - (estado.superficie === 'terminal' ? 31 : 27)
    const texto = sitio >= 34 ? `✅ Escrito terminado: «${recortar(s.escrito.nombre, sitio - 24)}»` : sitio >= 18 ? '✅ Escrito terminado' : '✅ Listo'
    return (
      <Box flexDirection="row" columnGap={1}>
        <Box flexShrink={1} minWidth={0}>
          <Text color="success" bold wrap="truncate-end">
            {texto}
          </Text>
        </Box>
        <Box flexShrink={0} flexDirection="row" columnGap={1}>
          <Button key="siguientes-abrir" label="Siguientes pasos" variant="primary" onPress={() => void abrir($, true)} />
          <Button key="siguientes-ahora-no" label="Ahora no" plain dimColor onPress={() => retirar($)} />
        </Box>
      </Box>
    )
  } catch {
    return null
  }
}
