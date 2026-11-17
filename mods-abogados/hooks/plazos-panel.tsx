// ─────────────────────────────────────────────────────────────────────────────
// MOD 1 · Panel de plazos procesales
//
//   /plazos          abre el panel (nunca lo cierra: «/plazos cerrar» lo cierra)
//                    y, con una ruta o sin análisis previo, saca los plazos
//                    del escrito (hooks/plazos-escrito.tsx)
//   /plazo-nuevo     registra un plazo (con argumentos o con un formulario)
//   /plazo-borrar    borra un plazo, siempre con confirmación
//
// Pestañas: «Del escrito» (los plazos de un escrito judicial, muy visual),
// «Mis plazos» (tabla viva), «Calculadora» (desglose día a día) y «Festivos»
// (los festivos cargados y las reglas de cómputo).
//
// Ciclo de dibujo (el de la documentación de mods): un botón o un campo cambia
// el estado de este módulo y pide `$.ui.invalidate`; Claude Code vuelve a
// llamar al hook `ui.render` del panel, que dibuja con el estado nuevo.
// Este mod NO toca las llamadas a herramientas.
// ─────────────────────────────────────────────────────────────────────────────

import type { On } from 'claude-code'
import {
  agruparDesglose,
  calcularPlazo,
  diasHabilesRestantes,
  fechaCorta,
  fechaLarga,
  JURISDICCIONES,
  leerArgumentosPlazo,
  leerFechaUsuario,
  leerJurisdiccion,
  nuevoId,
  plazosDeEjemplo,
  type Jurisdiccion,
  type Plazo,
  type PlazoCalculado,
} from './lib/plazos'
import {
  abrirPanel,
  acentoODefecto,
  actualizarHoy,
  anotarError,
  cargarConfiguracion,
  cargarPlazos,
  colorAcento,
  conAtajo,
  esDelCliente,
  estado,
  guardarPlazos,
  panelAbierto,
  redibujar,
  type Motor,
} from './lib/estado'
import { textoSobre } from './lib/colores'
import { recortar, sinTildes } from './lib/texto'
import { analizarEscrito, dibujarPlazosEscrito, escrito } from './plazos-escrito'

export const PANEL_PLAZOS = 'plazos'
export const NOTA_ORIENTATIVA =
  'Cálculo orientativo. Verifica el plazo según la norma aplicable y el calendario de tu órgano judicial.'

type Pestana = 'escrito' | 'plazos' | 'calculadora' | 'festivos'
type Vista = 'lista' | 'nuevo' | 'confirmar'

/** Estado de la interfaz del panel (se pierde al recargar el mod, y no pasa nada). */
const panel = {
  pestana: 'plazos' as Pestana,
  vista: 'lista' as Vista,
  borrarId: null as string | null,
  mensaje: null as string | null,
  borrador: { asunto: '', tipo: '', jurisdiccion: 'civil' as Jurisdiccion, notificacion: '', dias: '', cliente: '', especialesHabiles: false },
  errorFormulario: null as string | null,
  calc: { notificacion: '', dias: '20', jurisdiccion: 'civil' as Jurisdiccion, especialesHabiles: false },
}

const COLOR_ESTADO = { verde: 'success', ambar: 'warning', rojo: 'error', vencido: 'error' } as const

/** Abre el panel de plazos (también lo usa el Mod 3 desde su banda). */
export async function abrirPanelPlazos($: Motor, pestana: Pestana = 'plazos', conFoco = true): Promise<void> {
  panel.pestana = pestana
  await abrirPanel($, PANEL_PLAZOS, 'Plazos procesales', conFoco)
  redibujar($)
}

/** Texto corto de días hábiles restantes: «hoy», «1 día», «3 días», «vencido». */
export function textoRestantes(p: PlazoCalculado): string {
  if (p.restantes === null) return '—'
  if (p.restantes < 0) return 'vencido'
  if (p.restantes === 0) return 'hoy'
  return p.restantes === 1 ? '1 día' : `${p.restantes} días`
}

function borradorVacio() {
  return {
    asunto: '',
    tipo: '',
    jurisdiccion: 'civil' as Jurisdiccion,
    notificacion: '',
    dias: '',
    cliente: estado.clienteActivo?.nombre ?? '',
    especialesHabiles: false,
  }
}

/** Valida el formulario y devuelve el plazo o el error. */
function plazoDelBorrador(): { plazo?: Omit<Plazo, 'id'>; error?: string } {
  const b = panel.borrador
  if (!b.asunto.trim()) return { error: 'Escribe el asunto.' }
  const notificacion = leerFechaUsuario(b.notificacion, estado.hoy)
  if (!notificacion) return { error: 'Fecha de notificación no válida (dd/mm/aaaa).' }
  const dias = Number(b.dias)
  if (!Number.isInteger(dias) || dias < 1 || dias > 365) return { error: 'Número de días entre 1 y 365.' }
  return {
    plazo: {
      asunto: b.asunto.trim(),
      tipo: b.tipo.trim() || 'Plazo',
      jurisdiccion: b.jurisdiccion,
      notificacion,
      dias,
      ...(b.cliente.trim() ? { cliente: b.cliente.trim() } : {}),
      ...(b.especialesHabiles ? { especialesHabiles: true } : {}),
    },
  }
}

/** Añade un plazo, lo guarda y devuelve el texto de confirmación. */
export async function anadirPlazo($: Motor, datos: Omit<Plazo, 'id'>): Promise<string> {
  const ahora = await $.clock.now()
  const plazo: Plazo = { ...datos, id: nuevoId(ahora, estado.plazos), creado: estado.hoy }
  estado.plazos = [...estado.plazos, plazo]
  await guardarPlazos($)
  redibujar($)
  const calc = estado.calculados.find(p => p.id === plazo.id)
  if (!calc?.fin) return `Plazo registrado: ${plazo.asunto}.`
  const quedan =
    calc.restantes === null ? '' : calc.restantes < 0 ? ' · ya vencido' : calc.restantes === 0 ? ' · vence hoy' : ` · ${calc.restantes === 1 ? 'queda 1 día hábil' : `quedan ${calc.restantes} días hábiles`}`
  return `Plazo registrado: ${plazo.asunto} · ${plazo.tipo} · vence el ${fechaLarga(calc.fin)}${
    calc.computo?.finPresentacion ? ' (hasta las 15:00, art. 135.5 LEC)' : ''
  }${quedan}. ${NOTA_ORIENTATIVA}`
}

/** Mueve un plazo a la papelera del archivo (recuperable a mano). */
async function borrarPlazo($: Motor, id: string): Promise<string | null> {
  const plazo = estado.plazos.find(p => p.id === id)
  if (!plazo) return null
  estado.plazos = estado.plazos.filter(p => p.id !== id)
  estado.papelera = [...estado.papelera, { ...plazo, creado: plazo.creado ?? estado.hoy }]
  await guardarPlazos($)
  redibujar($)
  return `${plazo.asunto} · ${plazo.tipo}`
}

/**
 * El orden en que la tabla enseña los plazos: con cliente activo, primero los
 * suyos y después los del resto del despacho; dentro de cada grupo, por fecha.
 * El número de cada fila («/plazo-borrar 2») sale de este mismo orden.
 */
export function ordenTabla(): { suyos: PlazoCalculado[]; resto: PlazoCalculado[]; todos: PlazoCalculado[] } {
  const cliente = estado.activos.colorCliente ? estado.clienteActivo : null
  const suyos = cliente ? estado.calculados.filter(p => esDelCliente(p, cliente)) : []
  const resto = estado.calculados.filter(p => !suyos.includes(p))
  return { suyos, resto, todos: [...suyos, ...resto] }
}

/** Busca un plazo por su número en la tabla o por texto. */
function buscarPlazo(consulta: string): { plazo?: PlazoCalculado; varios?: PlazoCalculado[] } {
  const n = Number(consulta)
  const { todos } = ordenTabla()
  if (Number.isInteger(n) && n >= 1 && n <= todos.length) return { plazo: todos[n - 1] }
  const q = sinTildes(consulta)
  const coincidencias = estado.calculados.filter(p => sinTildes(`${p.asunto} ${p.tipo} ${p.id}`).includes(q))
  if (coincidencias.length === 1) return { plazo: coincidencias[0] }
  return { varios: coincidencias }
}

/**
 * MOD 1 · Al iniciar la sesión (lo llama register.tsx): registra los tres
 * comandos de barra. Nunca lanza errores.
 */
export async function iniciarPanelPlazos($: Motor): Promise<void> {
  try {
    await $.command.register({
      name: 'plazos',
      description: 'Plazos: abre el panel y saca los plazos del escrito (con una ruta, los de ese archivo; «cerrar» lo cierra)',
      argumentHint: '[ruta del escrito | cerrar]',
      immediate: true,
    })
    await $.command.register({
      name: 'plazo-nuevo',
      description: 'Registra un plazo procesal (sin argumentos abre un formulario; «ejemplo» carga plazos ficticios)',
      argumentHint: 'Asunto | Tipo | civil | 14/11/2026 | 20 [| Cliente] [| urgente]',
    })
    await $.command.register({
      name: 'plazo-borrar',
      description: 'Borra un plazo procesal, con confirmación',
      argumentHint: '[número de la tabla o texto]',
    })
  } catch (error) {
    anotarError(`Mod 1: ${String(error).slice(0, 100)}`)
  }
}

/** MOD 1 · Comandos y panel (hooks con filtro propio). Lo llama register.tsx. */
export function registrarHooksPanelPlazos(on: On): void {
  // ── Comandos ──────────────────────────────────────────────────────────────
  on('command.run', { command: 'plazos' }, async ($, e) => {
    const args = (e.args ?? '').trim()
    // /plazos nunca cierra el panel (parecía que «no hacía nada»): lo abre y lo pone delante.
    if (/^cerrar$/i.test(args)) {
      if (await panelAbierto($, PANEL_PLAZOS)) await $.ui.close({ id: PANEL_PLAZOS })
      return { text: 'Panel de plazos cerrado.' }
    }
    await actualizarHoy($)
    panel.vista = 'lista'
    // Con una ruta: los plazos de ese escrito.
    if (args) return { text: await analizarEscrito($, args) }
    // A secas: el panel. Si ya hay un escrito analizado (o se está leyendo), se
    // enseña; si no, se pide a Claude que analice el de la conversación.
    if (escrito.fase !== 'vacio') {
      await abrirPanelPlazos($, 'escrito', true)
      return {}
    }
    return { text: await analizarEscrito($, '') }
  }).catch(() => ({ text: 'mods-abogados: no se pudo abrir el panel de plazos.' }))

  on('command.run', { command: 'plazo-nuevo' }, async ($, e) => {
    await actualizarHoy($)
    const args = e.args.trim()

    // Sin argumentos: formulario en el panel.
    if (!args) {
      panel.borrador = borradorVacio()
      panel.errorFormulario = null
      panel.vista = 'nuevo'
      await abrirPanelPlazos($, 'plazos', true)
      return {}
    }

    // «/plazo-nuevo ejemplo»: plazos ficticios calculados respecto a hoy.
    if (/^ejemplos?$/i.test(args)) {
      return { text: await cargarEjemplos($) }
    }

    const leido = leerArgumentosPlazo(args, estado.hoy)
    if (leido.plazo) {
      const datos = { ...leido.plazo }
      if (!datos.cliente && estado.clienteActivo) datos.cliente = estado.clienteActivo.nombre
      return { text: await anadirPlazo($, datos) }
    }

    // Argumentos incompletos: se abre el formulario con lo que se entendió.
    const p = leido.parcial
    panel.borrador = {
      ...borradorVacio(),
      asunto: p.asunto ?? '',
      tipo: p.tipo ?? '',
      jurisdiccion: leerJurisdiccion(p.jurisdiccion ?? '') ?? 'civil',
      notificacion: p.notificacion ?? '',
      dias: p.dias ?? '',
      cliente: p.cliente || (estado.clienteActivo?.nombre ?? ''),
    }
    panel.errorFormulario = leido.error ?? null
    panel.vista = 'nuevo'
    await abrirPanelPlazos($, 'plazos', true)
    return { text: `${leido.error} Completa los datos en el panel.` }
  }).catch(() => ({ text: 'mods-abogados: no se pudo registrar el plazo.' }))

  on('command.run', { command: 'plazo-borrar' }, async ($, e) => {
    await actualizarHoy($)
    const consulta = e.args.trim()
    if (!consulta) {
      panel.vista = 'lista'
      panel.mensaje = 'Pulsa ✕ en el plazo que quieras borrar.'
      await abrirPanelPlazos($, 'plazos', true)
      return { text: 'Elige en el panel el plazo que quieres borrar.' }
    }
    const { plazo, varios } = buscarPlazo(consulta)
    if (!plazo) {
      if (varios && varios.length > 1) {
        return { text: `Hay ${varios.length} plazos que encajan: ${varios.map(v => v.asunto).join('; ')}. Usa el número de la tabla.` }
      }
      return { text: `No encuentro ningún plazo con «${consulta}».` }
    }
    panel.borrarId = plazo.id
    panel.vista = 'confirmar'
    await abrirPanelPlazos($, 'plazos', true)
    return { text: `Confirma en el panel el borrado de «${plazo.asunto} · ${plazo.tipo}».` }
  }).catch(() => ({ text: 'mods-abogados: no se pudo preparar el borrado.' }))

  // Al cerrar el panel, se vuelve a la lista.
  on('ui.close', { id: PANEL_PLAZOS }, async ($, e, next) => {
    panel.vista = 'lista'
    panel.mensaje = null
    return next(e)
  }).catch(($, e, next) => next(e))

  // ── Dibujo del panel ──────────────────────────────────────────────────────
  on('ui.render', { component: 'Pane', requestId: PANEL_PLAZOS }, async ($, e) => {
    const tabla = $.ui.resolve(e)
    const { Box, Text, Button } = tabla
    const ancho = Math.max(30, e.props.bodyColumns)
    const acento = acentoODefecto()
    const acentoHex = colorAcento()
    const redraw = () => redibujar($)

    // Cabecera con el color del cliente activo (Mod 4) o el de Claude Code.
    const cliente = estado.clienteActivo && estado.activos.colorCliente ? ` · Cliente: ${estado.clienteActivo.nombre}` : ''
    const cabecera = (
      <Box>
        <Text backgroundColor={acento} color={acentoHex ? textoSobre(acentoHex) : 'inverseText'} bold wrap="truncate-end">
          {` ⚖  PLAZOS PROCESALES${cliente} `.padEnd(ancho, ' ')}
        </Text>
      </Box>
    )

    // Pestañas: cuatro botones. La activa, en el color de acento y subrayada
    // (terminal) y como botón principal (app de escritorio, donde el subrayado no se ve).
    const pestana = (id: Pestana, etiqueta: string, tecla: string) => (
      <Button
        key={`pestana-${id}`}
        label={etiqueta}
        hotkey={tecla}
        plain
        {...(panel.pestana === id ? { variant: 'primary' as const } : {})}
        onPress={() => {
          panel.pestana = id
          panel.vista = 'lista'
          redraw()
        }}
      >
        {panel.pestana === id ? (
          <Text color={acento} bold underline>
            {etiqueta}
          </Text>
        ) : (
          <Text dimColor>{etiqueta}</Text>
        )}
      </Button>
    )

    let cuerpo
    if (panel.pestana === 'escrito') cuerpo = dibujarPlazosEscrito($, tabla, ancho, e.surface)
    else if (panel.pestana === 'calculadora') cuerpo = dibujarCalculadora($, tabla, ancho)
    else if (panel.pestana === 'festivos') cuerpo = dibujarFestivos($, tabla, e.surface)
    else if (panel.vista === 'nuevo') cuerpo = dibujarFormulario($, tabla)
    else if (panel.vista === 'confirmar') cuerpo = dibujarConfirmacion($, tabla, e.surface)
    else cuerpo = dibujarTabla($, tabla, ancho, e.surface)

    return (
      <Box flexDirection="column">
        {cabecera}
        <Box flexDirection="row" columnGap={e.surface === 'terminal' ? 3 : 1}>
          {pestana('escrito', 'Del escrito', '1')}
          {pestana('plazos', 'Mis plazos', '2')}
          {pestana('calculadora', 'Calculadora', '3')}
          {pestana('festivos', 'Festivos', '4')}
        </Box>
        <Text> </Text>
        {cuerpo}
        <Text> </Text>
        {estado.errores.map(err => (
          <Text color="warning">⚠ {err}</Text>
        ))}
        <Text dimColor italic>
          {NOTA_ORIENTATIVA}
        </Text>
      </Box>
    )
  }).catch(($, e, next) => next(e))
}

/** «Cargar ejemplo»: plazos ficticios que dan verde, ámbar, rojo y vencido HOY. */
async function cargarEjemplos($: Motor): Promise<string> {
  await actualizarHoy($)
  await cargarConfiguracion($)
  const ejemplos = plazosDeEjemplo(estado.hoy, estado.festivos, estado.reglas, await $.clock.now())
  // Los ejemplos anteriores se sustituyen; los plazos del usuario se conservan.
  estado.plazos = [...estado.plazos.filter(p => !p.id.startsWith('ejemplo-')), ...ejemplos]
  await guardarPlazos($)
  redibujar($)
  return `Cargados ${ejemplos.length} plazos de ejemplo (ficticios) calculados respecto a hoy, ${fechaLarga(estado.hoy)}.`
}

// ── Pestaña «Plazos» ────────────────────────────────────────────────────────

function dibujarTabla($: Motor, tabla: ReturnType<Motor['ui']['resolve']>, ancho: number, superficie: string) {
  const { Box, Text, Button } = tabla
  const acento = acentoODefecto()
  const { suyos, resto, todos: lista } = ordenTabla()
  const cliente = estado.activos.colorCliente ? estado.clienteActivo : null
  const estrecho = ancho < 72

  // Anchos de columna: lo que sobra se reparte entre asunto y tipo.
  const fijas = { notif: 10, vence: 10, hab: 10, borrar: 3 }
  const libre = Math.max(16, ancho - (fijas.notif + fijas.vence + fijas.hab + fijas.borrar) - 4)
  const anchoAsunto = Math.ceil(libre * 0.55)
  const anchoTipo = libre - anchoAsunto

  const estadoCelda = (p: PlazoCalculado) => {
    if (!p.estado) return <Text color="warning">error</Text>
    if (p.estado === 'vencido') {
      return (
        <Text backgroundColor="error" color="inverseText" bold>
          {' VENCIDO '}
        </Text>
      )
    }
    return (
      <Text color={COLOR_ESTADO[p.estado]} bold>
        ● {textoRestantes(p)}
      </Text>
    )
  }

  const fila = (p: PlazoCalculado) => {
    const i = lista.indexOf(p)
    const suyo = cliente !== null && suyos.includes(p)
    // Con cliente activo, los plazos de los demás van atenuados: no son de este asunto.
    const ajeno = cliente !== null && !suyo
    const marca = suyo ? <Text color={acento}>▌</Text> : <Text> </Text>
    const botonBorrar = (
      <Button
        key={`borrar-${p.id}`}
        label="✕"
        plain
        onPress={() => {
          panel.borrarId = p.id
          panel.vista = 'confirmar'
          redibujar($)
        }}
      />
    )
    if (estrecho) {
      return (
        <Box flexDirection="column">
          <Box flexDirection="row" columnGap={1}>
            {marca}
            <Text bold={!ajeno} dimColor={ajeno} wrap="truncate-end">
              {i + 1}. {p.asunto}
            </Text>
            {botonBorrar}
          </Box>
          <Box flexDirection="row" columnGap={1}>
            <Text dimColor wrap="truncate-end">
              {'   '}
              {p.tipo} · vence {p.fin ? fechaCorta(p.fin) : '—'}
            </Text>
            {estadoCelda(p)}
          </Box>
        </Box>
      )
    }
    return (
      <Box flexDirection="row">
        {marca}
        <Box width={anchoAsunto}>
          <Text wrap="truncate-end" dimColor={ajeno} bold={suyo}>
            {i + 1}. {p.asunto}
          </Text>
        </Box>
        <Box width={anchoTipo}>
          <Text wrap="truncate-end" dimColor>
            {p.tipo}
          </Text>
        </Box>
        <Box width={fijas.notif}>
          <Text>{fechaCorta(p.notificacion)}</Text>
        </Box>
        <Box width={fijas.vence}>
          <Text bold>{p.fin ? fechaCorta(p.fin) : '—'}</Text>
        </Box>
        <Box width={fijas.hab}>{estadoCelda(p)}</Box>
        {botonBorrar}
      </Box>
    )
  }
  const titulo = (texto: string) => (
    <Text bold color={acento} wrap="truncate-end">
      {texto}
    </Text>
  )

  return (
    <Box flexDirection="column">
      {lista.length === 0 && <Text dimColor>Todavía no hay plazos guardados. Pulsa «Nuevo plazo» o carga los de ejemplo.</Text>}
      {lista.length > 0 && !estrecho && (
        <Box flexDirection="row">
          <Text> </Text>
          <Box width={anchoAsunto}>
            <Text dimColor bold>Asunto</Text>
          </Box>
          <Box width={anchoTipo}>
            <Text dimColor bold>Tipo</Text>
          </Box>
          <Box width={fijas.notif}>
            <Text dimColor bold>Notificado</Text>
          </Box>
          <Box width={fijas.vence}>
            <Text dimColor bold>Vence</Text>
          </Box>
          <Box width={fijas.hab}>
            <Text dimColor bold>Quedan</Text>
          </Box>
        </Box>
      )}
      {cliente && titulo(suyos.length > 0 ? `De ${recortar(cliente.nombre, 40)}` : `${recortar(cliente.nombre, 40)} no tiene plazos guardados`)}
      {suyos.map(p => fila(p))}
      {cliente && resto.length > 0 && (
        <Text dimColor bold>
          Resto del despacho
        </Text>
      )}
      {resto.map(p => fila(p))}
      {estado.reglas.lexnet15h && (
        <Text color="suggestion">LexNET: el «Vence» ya incluye el margen hasta las 15:00 del día hábil siguiente (art. 135.5 LEC).</Text>
      )}
      {panel.mensaje && <Text color="suggestion">{panel.mensaje}</Text>}
      <Text> </Text>
      <Box flexDirection="row" columnGap={2}>
        <Button
          key="nuevo"
          label={conAtajo('+ Nuevo plazo', 'n', superficie)}
          hotkey="n"
          variant="primary"
          onPress={() => {
            panel.borrador = borradorVacio()
            panel.errorFormulario = null
            panel.vista = 'nuevo'
            redibujar($)
          }}
        />
        <Button
          key="ejemplo"
          label={conAtajo('Cargar ejemplos', 'e', superficie)}
          hotkey="e"
          onPress={async () => {
            panel.mensaje = await cargarEjemplos($)
            redibujar($)
          }}
        />
        <Button
          key="recargar"
          label={conAtajo('Recargar', 'r', superficie)}
          hotkey="r"
          onPress={async () => {
            await cargarConfiguracion($)
            await cargarPlazos($)
            panel.mensaje = 'Plazos, festivos y reglas vueltos a leer.'
            redibujar($)
          }}
        />
      </Box>
    </Box>
  )
}

// ── Formulario «Nuevo plazo» ────────────────────────────────────────────────

function dibujarFormulario($: Motor, tabla: ReturnType<Motor['ui']['resolve']>) {
  const { Box, Text, Button } = tabla
  if (!('Input' in tabla) || !('Select' in tabla)) {
    return <Text>Esta app no tiene campos de texto: usa /plazo-nuevo Asunto | Tipo | civil | 14/11/2026 | 20</Text>
  }
  const { Input, Select } = tabla
  const b = panel.borrador
  const guardar = async () => {
    const r = plazoDelBorrador()
    if (!r.plazo) {
      panel.errorFormulario = r.error ?? 'Datos incompletos.'
      redibujar($)
      return
    }
    panel.mensaje = await anadirPlazo($, r.plazo)
    panel.vista = 'lista'
    panel.errorFormulario = null
    redibujar($)
  }
  const campo = (clave: 'asunto' | 'tipo' | 'notificacion' | 'dias' | 'cliente', etiqueta: string, ayuda: string, foco = false) => (
    <Input
      key={`campo-${clave}`}
      label={etiqueta}
      placeholder={ayuda}
      value={b[clave]}
      submitLabel="guardar"
      {...(foco ? { autoFocus: true as const } : {})}
      onInput={valor => {
        panel.borrador = { ...panel.borrador, [clave]: valor }
        redibujar($)
      }}
      onSubmit={valor => {
        panel.borrador = { ...panel.borrador, [clave]: valor }
        void guardar()
      }}
    />
  )

  // Vista previa en vivo del vencimiento.
  const previa = plazoDelBorrador()
  let textoPrevia = ''
  if (previa.plazo) {
    try {
      const c = calcularPlazo(previa.plazo, estado.festivos, estado.reglas)
      const fin = c.finPresentacion ?? c.vencimiento
      const quedan = diasHabilesRestantes(estado.hoy, fin, previa.plazo.jurisdiccion, estado.festivos, estado.reglas, {
        especialesHabiles: previa.plazo.especialesHabiles === true,
      })
      textoPrevia = `Vencería el ${fechaCorta(fin)} (${fechaLarga(fin)}) · ${quedan < 0 ? 'ya vencido' : quedan === 0 ? 'vence hoy' : quedan + ' días hábiles'}`
    } catch {
      textoPrevia = ''
    }
  }

  return (
    <Box flexDirection="column">
      <Text bold color={acentoODefecto()}>
        Nuevo plazo
      </Text>
      {campo('asunto', 'Asunto', 'García c. Aseguradora Ficticia', true)}
      {campo('tipo', 'Escrito o actuación', 'Contestación a la demanda')}
      <Select
        key="campo-jurisdiccion"
        label="Jurisdicción"
        value={b.jurisdiccion}
        options={JURISDICCIONES.map(j => ({ value: j, label: j }))}
        onSelect={valor => {
          panel.borrador = { ...panel.borrador, jurisdiccion: (leerJurisdiccion(valor) ?? 'civil') as Jurisdiccion }
          redibujar($)
        }}
      />
      {campo('notificacion', 'Fecha de notificación', 'dd/mm/aaaa (o «hoy»)')}
      {campo('dias', 'Días hábiles', '20')}
      {campo('cliente', 'Cliente (opcional)', 'García')}
      <Button
        key="agosto"
        label={`${b.especialesHabiles ? '☑' : '☐'} Agosto y del 24 dic al 6 ene cuentan (despido, derechos fundamentales…)`}
        plain
        onPress={() => {
          panel.borrador = { ...panel.borrador, especialesHabiles: !panel.borrador.especialesHabiles }
          redibujar($)
        }}
      />
      {textoPrevia ? <Text color="suggestion">{textoPrevia}</Text> : null}
      {panel.errorFormulario ? <Text color="error">{panel.errorFormulario}</Text> : null}
      <Box flexDirection="row" columnGap={2}>
        <Button key="guardar" label="Guardar plazo" variant="primary" onPress={() => void guardar()} />
        <Button
          key="cancelar"
          label="Cancelar"
          onPress={() => {
            panel.vista = 'lista'
            panel.errorFormulario = null
            redibujar($)
          }}
        />
      </Box>
    </Box>
  )
}

// ── Confirmación de borrado ─────────────────────────────────────────────────

function dibujarConfirmacion($: Motor, tabla: ReturnType<Motor['ui']['resolve']>, superficie: string) {
  const { Box, Text, Button } = tabla
  const plazo = estado.calculados.find(p => p.id === panel.borrarId)
  if (!plazo) {
    panel.vista = 'lista'
    return <Text dimColor>Ese plazo ya no existe.</Text>
  }
  return (
    <Box flexDirection="column">
      <Text bold color="warning">
        ¿Borrar este plazo?
      </Text>
      <Text>
        {plazo.asunto} · {plazo.tipo} · vence {plazo.fin ? fechaLarga(plazo.fin) : '—'}
      </Text>
      <Text dimColor>No se pierde: queda en la papelera de plazos del plugin, por si hay que recuperarlo.</Text>
      <Box flexDirection="row" columnGap={2}>
        <Button
          key="confirmar-borrar"
          label={conAtajo('Sí, borrar', 's', superficie)}
          hotkey="s"
          variant="primary"
          onPress={async () => {
            const borrado = await borrarPlazo($, plazo.id)
            panel.mensaje = borrado ? `Borrado: ${borrado}.` : 'No se encontró el plazo.'
            panel.vista = 'lista'
            panel.borrarId = null
            redibujar($)
          }}
        />
        <Button
          key="cancelar-borrar"
          label={conAtajo('Cancelar', 'c', superficie)}
          hotkey="c"
          onPress={() => {
            panel.vista = 'lista'
            panel.borrarId = null
            redibujar($)
          }}
        />
      </Box>
    </Box>
  )
}

// ── Pestaña «Calculadora» ───────────────────────────────────────────────────

function dibujarCalculadora($: Motor, tabla: ReturnType<Motor['ui']['resolve']>, ancho: number) {
  const { Box, Text, Button } = tabla
  const c = panel.calc
  const controles =
    'Input' in tabla && 'Select' in tabla ? (
      <Box flexDirection="column">
        <tabla.Input
          key="calc-notificacion"
          label="Notificación"
          placeholder="dd/mm/aaaa (o «hoy»)"
          value={c.notificacion}
          submitLabel="calcular"
          autoFocus
          onInput={valor => {
            panel.calc = { ...panel.calc, notificacion: valor }
            redibujar($)
          }}
          onSubmit={valor => {
            panel.calc = { ...panel.calc, notificacion: valor }
            redibujar($)
          }}
        />
        <tabla.Input
          key="calc-dias"
          label="Días hábiles"
          placeholder="20"
          value={c.dias}
          submitLabel="calcular"
          onInput={valor => {
            panel.calc = { ...panel.calc, dias: valor }
            redibujar($)
          }}
          onSubmit={valor => {
            panel.calc = { ...panel.calc, dias: valor }
            redibujar($)
          }}
        />
        <tabla.Select
          key="calc-jurisdiccion"
          label="Jurisdicción"
          value={c.jurisdiccion}
          options={JURISDICCIONES.map(j => ({ value: j, label: j }))}
          onSelect={valor => {
            panel.calc = { ...panel.calc, jurisdiccion: (leerJurisdiccion(valor) ?? 'civil') as Jurisdiccion }
            redibujar($)
          }}
        />
        <Button
          key="calc-agosto"
          label={`${c.especialesHabiles ? '☑' : '☐'} Agosto y del 24 dic al 6 ene cuentan (despido, derechos fundamentales…)`}
          plain
          onPress={() => {
            panel.calc = { ...panel.calc, especialesHabiles: !panel.calc.especialesHabiles }
            redibujar($)
          }}
        />
      </Box>
    ) : (
      <Text dimColor>Esta app no tiene campos de texto.</Text>
    )

  const notificacion = leerFechaUsuario(c.notificacion, estado.hoy)
  const dias = Number(c.dias)
  let resultado
  if (!c.notificacion.trim()) {
    resultado = <Text dimColor>Escribe la fecha de notificación y los días.</Text>
  } else if (!notificacion || !Number.isInteger(dias) || dias < 1 || dias > 365) {
    resultado = <Text color="error">Fecha (dd/mm/aaaa) o número de días (1-365) no válidos.</Text>
  } else {
    const computo = calcularPlazo({ notificacion, dias, jurisdiccion: c.jurisdiccion, especialesHabiles: c.especialesHabiles }, estado.festivos, estado.reglas)
    const tramos = agruparDesglose(computo.desglose)
    const maximo = 70
    resultado = (
      <Box flexDirection="column">
        <Text bold color={acentoODefecto()}>
          Notificado el {fechaLarga(notificacion)} · {dias} días hábiles · {c.jurisdiccion}
        </Text>
        <Text bold>
          Vence el {fechaCorta(computo.vencimiento)} ({fechaLarga(computo.vencimiento)})
        </Text>
        {computo.finPresentacion && (
          <Text color="suggestion">
            Presentación hasta las 15:00 del {fechaCorta(computo.finPresentacion)} (art. 135.5 LEC)
          </Text>
        )}
        <Text dimColor>El día de la notificación no cuenta: se empieza al día siguiente.</Text>
        {tramos.slice(0, maximo).map(t =>
          t.habil ? (
            <Text>
              {'  '}
              {fechaCorta(t.fecha)} · día {t.contador}
              {t.contador === dias ? '  ← VENCE' : ''}
            </Text>
          ) : (
            <Text dimColor wrap="truncate-end">
              {'  '}
              {fechaCorta(t.fecha)}
              {t.hasta ? ` – ${fechaCorta(t.hasta)} (${t.cuantos} días)` : ''} · no cuenta: {t.motivo}
            </Text>
          ),
        )}
        {tramos.length > maximo && <Text dimColor>… y {tramos.length - maximo} líneas más</Text>}
        <Button
          key="calc-guardar"
          label="Guardar como plazo"
          onPress={() => {
            panel.borrador = {
              ...borradorVacio(),
              notificacion: c.notificacion,
              dias: c.dias,
              jurisdiccion: c.jurisdiccion,
              especialesHabiles: c.especialesHabiles,
            }
            panel.pestana = 'plazos'
            panel.vista = 'nuevo'
            redibujar($)
          }}
        />
      </Box>
    )
  }
  return (
    <Box flexDirection="column" width={Math.min(ancho, 100)}>
      {controles}
      <Text> </Text>
      {resultado}
    </Box>
  )
}

// ── Pestaña «Festivos» ──────────────────────────────────────────────────────

function dibujarFestivos($: Motor, tabla: ReturnType<Motor['ui']['resolve']>, superficie: string) {
  const { Box, Text, Button } = tabla
  const porAnio = new Map<string, typeof estado.festivos>()
  for (const f of [...estado.festivos].sort((a, b) => a.fecha.localeCompare(b.fecha))) {
    const anio = f.fecha.slice(0, 4)
    porAnio.set(anio, [...(porAnio.get(anio) ?? []), f])
  }
  return (
    <Box flexDirection="column">
      <Text dimColor wrap="wrap">
        Vienen los festivos nacionales. Los de tu comunidad y tu localidad hay que añadirlos: pídeselo a Claude («añade a los festivos del plugin de plazos el 23 de abril,
        San Jorge») y pulsa «Recargar».
      </Text>
      {[...porAnio.entries()].map(([anio, lista]) => (
        <Box flexDirection="column">
          <Text bold color={acentoODefecto()}>
            {anio}
          </Text>
          {lista.map(f => (
            <Text>
              {'  '}
              {fechaCorta(f.fecha)}/{anio.slice(2)} · {f.nombre}
              <Text dimColor>{f.ambito ? ` · ${f.ambito}` : ''}</Text>
            </Text>
          ))}
        </Box>
      ))}
      {estado.festivos.length === 0 && <Text color="warning">No hay festivos cargados.</Text>}
      <Text> </Text>
      <Text bold>Reglas de cómputo</Text>
      {JURISDICCIONES.map(j => {
        const r = estado.reglas.jurisdicciones[j]
        return (
          <Text>
            {'  '}
            {j}: agosto {r.agostoInhabil ? 'inhábil' : 'hábil'} · 24 dic–6 ene {r.navidadInhabil ? 'inhábil' : 'hábil'}
            <Text dimColor>{r.nota ? ` · ${r.nota}` : ''}</Text>
          </Text>
        )
      })}
      <Text>
        {'  '}LexNET 15:00 del día hábil siguiente (art. 135.5 LEC): {estado.reglas.lexnet15h ? 'ACTIVADO' : 'desactivado'}
      </Text>
      <Text> </Text>
      <Button
        key="recargar-festivos"
        label={conAtajo('Recargar', 'r', superficie)}
        hotkey="r"
        onPress={async () => {
          await cargarConfiguracion($)
          await cargarPlazos($)
          redibujar($)
        }}
      />
    </Box>
  )
}
