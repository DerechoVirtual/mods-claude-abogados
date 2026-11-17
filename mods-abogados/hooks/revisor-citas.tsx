// ─────────────────────────────────────────────────────────────────────────────
// MOD 2 · Revisor de citas legales
//
// Cada vez que Claude termina de escribir, busca las citas legales de su
// respuesta (artículos, sentencias, autos, ECLI, recursos, referencias CENDOJ)
// y les pone un semáforo de TRAZABILIDAD:
//   verde  → la cita aparece en una consulta de verificación de ESTE turno
//   ámbar  → formato plausible, pero ninguna consulta del turno la respalda
//   rojo   → formato imposible o sospechoso
// El mod no sabe Derecho y no lo finge: solo dice qué citas tienen respaldo
// en una consulta real y cuáles son texto escrito por el modelo.
//
// Eventos: turn.start (empieza el registro), tool.call (anota qué
// herramientas se usan y qué devuelven, SIN tocar la llamada: siempre
// next(e) tal cual), turn.complete (lee e.answer y el resto de textos del
// turno con $.session.messages()), ui.render (banda y panel /citas).
// ─────────────────────────────────────────────────────────────────────────────

import type { On, ToolCallInput, ToolCallResult, TurnCompleteInput, TurnStartInput } from 'claude-code'
import {
  crearEvidencia,
  esHerramientaVerificacion,
  extraerCitas,
  peorEstado,
  peticionVerificacion,
  resumir,
  revisarCitas,
  type CitaRevisada,
  type Evidencia,
} from './lib/citas'
import {
  abrirPanel,
  acentoODefecto,
  actualizarHoy,
  anotarError,
  colorAcento,
  conAtajo,
  enviarUnaVez,
  estado,
  horaMadrid,
  panelAbierto,
  redibujar,
  type Motor,
  type Pastilla,
} from './lib/estado'
import { textoSobre } from './lib/colores'
import { pulsable } from './pastilla'

export const PANEL_CITAS = 'citas'

/** Lo que se va anotando durante el turno en curso (solo el de la conversación principal). */
const turno = {
  evidencias: [] as Evidencia[],
  escritos: [] as string[], // texto que Claude escribe en archivos con Write / Edit
}

const COLOR = { verificada: 'success', sin_verificar: 'warning', sospechosa: 'error' } as const
const ETIQUETA = { verificada: 'VERIFICADA', sin_verificar: 'SIN VERIFICAR', sospechosa: 'SOSPECHOSA' } as const

/** Quita del evento los campos que no son argumentos de la herramienta. */
function argumentos(e: Record<string, unknown>): Record<string, unknown> {
  const { tool: _t, tool_use_id: _id, agentId: _a, requestMeta: _m, ...resto } = e
  return resto
}

/** Texto que Claude escribe en un archivo (Write, Edit, MultiEdit). */
function textoEscrito(e: Record<string, unknown>): string {
  const herramienta = String(e.tool)
  if (herramienta === 'Write' && typeof e.content === 'string') return e.content
  if (herramienta === 'Edit' && typeof e.new_string === 'string') return e.new_string
  if (herramienta === 'MultiEdit' && Array.isArray(e.edits)) {
    return e.edits.map(x => (x && typeof x === 'object' && 'new_string' in x ? String((x as { new_string: unknown }).new_string) : '')).join('\n')
  }
  return ''
}

/** Analiza el turno que acaba de terminar y actualiza la banda. */
async function analizarTurno($: Motor, respuesta: string): Promise<void> {
  await actualizarHoy($)
  const textos: string[] = [respuesta]

  // Todos los textos del asistente de este turno (no solo el último mensaje).
  try {
    const mensajes = await $.session.messages()
    if (Array.isArray(mensajes)) {
      const delTurno: string[] = []
      for (let i = mensajes.length - 1; i >= 0; i--) {
        const m = mensajes[i]!
        if (m.role === 'assistant') {
          if (m.text.trim()) delTurno.unshift(m.text)
        } else if (m.text.trim() && !(m.toolResults && m.toolResults.length > 0)) {
          break // llegamos al mensaje del usuario que abrió el turno
        }
      }
      for (const t of delTurno) if (!textos.includes(t)) textos.push(t)
    }
  } catch {
    // si no se puede leer la conversación, basta con e.answer
  }
  if (estado.revisor.analizarArchivosEscritos) textos.push(...turno.escritos)

  const citas = extraerCitas(textos.join('\n\n'), estado.revisor, estado.hoy)
  const revisadas = revisarCitas(citas, turno.evidencias, estado.revisor)
  estado.citas = {
    revisadas,
    resumen: resumir(revisadas),
    hora: horaMadrid(await $.clock.now()),
    consultas: turno.evidencias.length,
  }
  redibujar($)
}

/** Envía a Claude la petición de verificar las citas ámbar y rojas. */
async function pedirVerificacion($: Motor): Promise<void> {
  const revisadas = estado.citas?.revisadas ?? []
  if (!revisadas.some(c => c.estado !== 'verificada')) {
    $.ui.toast('No hay citas pendientes de verificar.')
    return
  }
  // Una sola vez: una doble pulsación (o el botón de la banda y el del panel a
  // la vez) mandaba la petición repetida.
  const enviado = await enviarUnaVez($, peticionVerificacion(revisadas, estado.revisor))
  if (enviado === 'repetido') return
  if (enviado === 'enviado') $.ui.toast('Petición de verificación enviada a Claude.')
  else $.ui.toast(`No se pudo enviar la petición (${enviado.fallo}). Usa «Copiar petición».`)
}

/** Copia la petición; si el portapapeles no está disponible, la deja escrita en el prompt. */
async function copiarPeticion($: Motor, superficie: string): Promise<void> {
  const texto = peticionVerificacion(estado.citas?.revisadas ?? [], estado.revisor)
  try {
    const copia = await $.ui.copy({ text: texto, surface: superficie as 'terminal' })
    if (copia.isCopied) {
      $.ui.toast('Petición copiada al portapapeles.')
      return
    }
  } catch {
    // seguimos con el plan B
  }
  await $.prompt.fill({ text: texto, mode: 'replace' })
  $.ui.toast('No hay portapapeles aquí: he dejado la petición escrita en el cuadro de texto.')
}

// ── Manejadores que llama register.tsx (ninguno lanza errores) ──────────────

/** MOD 2 · Al iniciar la sesión: registra /citas. */
export async function iniciarRevisorCitas($: Motor): Promise<void> {
  try {
    await $.command.register({ name: 'citas', description: 'Abre el panel del revisor de citas legales («/citas cerrar» lo cierra)', argumentHint: '[cerrar]', immediate: true })
  } catch (error) {
    anotarError(`Mod 2: ${String(error).slice(0, 100)}`)
  }
}

/** MOD 2 · Empieza un turno de la conversación principal: registro en blanco. */
export function empezarTurnoCitas(e: TurnStartInput): void {
  if (e.agentId !== undefined) return
  turno.evidencias = []
  turno.escritos = []
}

/**
 * MOD 2 · Observa una herramienta YA ejecutada (register.tsx la ha dejado pasar
 * con next(e) sin cambios). También cuenta lo que hagan los subagentes del turno.
 */
export function anotarHerramientaCitas(e: ToolCallInput, resultado: ToolCallResult): void {
  try {
    if (resultado.deny !== undefined) return
    const datos = e as unknown as Record<string, unknown>
    const nombre = String(e.tool)
    if (esHerramientaVerificacion(nombre, estado.revisor)) {
      const salida =
        typeof resultado.text === 'string'
          ? resultado.text
          : typeof resultado.result === 'string'
            ? resultado.result
            : JSON.stringify(resultado.result ?? '')
      turno.evidencias.push(crearEvidencia(nombre, argumentos(datos), salida))
      if (turno.evidencias.length > 200) turno.evidencias.shift()
    } else {
      const escrito = textoEscrito(datos)
      if (escrito) turno.escritos.push(escrito.slice(0, 200_000))
    }
  } catch {
    // un fallo al anotar no afecta a nada
  }
}

/** MOD 2 · Termina un turno de la conversación principal: se analizan las citas. */
export async function terminarTurnoCitas($: Motor, e: TurnCompleteInput): Promise<void> {
  try {
    if (e.agentId === undefined) await analizarTurno($, e.answer ?? '')
  } catch (error) {
    anotarError(`Mod 2: ${String(error).slice(0, 100)}`)
  }
}

/** MOD 2 · Comando /citas y su panel (hooks con filtro propio). */
export function registrarHooksRevisorCitas(on: On): void {
  on('command.run', { command: 'citas' }, async ($, e) => {
    // /citas siempre ABRE el panel (y lo pone delante); /citas cerrar lo cierra.
    if (/^cerrar$/i.test((e.args ?? '').trim())) {
      if (await panelAbierto($, PANEL_CITAS)) await $.ui.close({ id: PANEL_CITAS })
      return { text: 'Panel de citas cerrado.' }
    }
    await abrirPanel($, PANEL_CITAS, 'Revisor de citas', true)
    return {}
  }).catch(() => ({ text: 'mods-abogados: no se pudo abrir el panel de citas.' }))

  // ── Panel /citas ──────────────────────────────────────────────────────────
  on('ui.render', { component: 'Pane', requestId: PANEL_CITAS }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const ancho = Math.max(30, e.props.bodyColumns)
    const acento = acentoODefecto()
    const acentoHex = colorAcento()
    const analisis = estado.citas
    const cliente = estado.clienteActivo && estado.activos.colorCliente ? ` · Cliente: ${estado.clienteActivo.nombre}` : ''

    const orden = { sospechosa: 0, sin_verificar: 1, verificada: 2 }
    const lista = [...(analisis?.revisadas ?? [])].sort((a, b) => orden[a.estado] - orden[b.estado])
    const pendientes = lista.filter(c => c.estado !== 'verificada').length

    const fila = (c: CitaRevisada) => (
      <Box flexDirection="column">
        <Box flexDirection="row" columnGap={1}>
          <Text color={COLOR[c.estado]} bold>
            ●
          </Text>
          <Box width={15}>
            <Text color={COLOR[c.estado]} bold>
              {ETIQUETA[c.estado]}
            </Text>
          </Box>
          <Text bold wrap="truncate-end">
            {c.texto}
          </Text>
        </Box>
        <Text dimColor wrap="wrap">
          {'    ↳ '}
          {c.motivo}
        </Text>
      </Box>
    )

    return (
      <Box flexDirection="column">
        <Text backgroundColor={acento} color={acentoHex ? textoSobre(acentoHex) : 'inverseText'} bold wrap="truncate-end">
          {` §  REVISOR DE CITAS${cliente} `.padEnd(ancho, ' ')}
        </Text>
        <Text dimColor wrap="wrap">
          No comprueba el Derecho: dice si cada cita sale de una consulta real hecha en esta misma respuesta.
        </Text>
        <Box flexDirection="row" columnGap={2} flexWrap="wrap">
          <Text color="success">● Verificada: sale en una consulta</Text>
          <Text color="warning">● Sin verificar: nada la respalda</Text>
          <Text color="error">● Sospechosa: formato imposible</Text>
        </Box>
        <Text> </Text>
        {!analisis && <Text dimColor>Todavía no hay ninguna respuesta analizada en esta sesión.</Text>}
        {analisis && lista.length === 0 && <Text dimColor>La última respuesta ({analisis.hora}) no contiene citas legales.</Text>}
        {analisis && lista.length > 0 && (
          <Text bold color={acento}>
            Respuesta de las {analisis.hora} · {lista.length} {lista.length === 1 ? 'cita' : 'citas'} · {analisis.consultas}{' '}
            {analisis.consultas === 1 ? 'consulta hecha' : 'consultas hechas'}
          </Text>
        )}
        {lista.map(c => fila(c))}
        <Text> </Text>
        {pendientes > 0 && (
          <Box flexDirection="row" columnGap={2}>
            <Button key="pedir-verificacion" label={conAtajo('Pedir verificación', 'v', e.surface)} hotkey="v" variant="primary" onPress={() => void pedirVerificacion($)} />
            <Button key="copiar-peticion" label={conAtajo('Copiar petición', 'c', e.surface)} hotkey="c" onPress={press => void copiarPeticion($, press.surface)} />
          </Box>
        )}
        {pendientes > 0 && (
          <Text dimColor wrap="wrap">
            «Pedir verificación» pide a Claude que compruebe {pendientes === 1 ? 'esa cita' : `esas ${pendientes} citas`} en la legislación y la jurisprudencia.
          </Text>
        )}
      </Box>
    )
  }).catch(($, e, next) => next(e))
}

/**
 * Pastilla del Mod 2 en la banda: cuántas citas faltan por verificar (color de
 * la peor) o cuántas están verificadas. El detalle está en el panel /citas.
 * `nivel`: 0, «§ 3 citas por verificar»; 1, «§ 3 por verificar»; 2, «§ 3».
 */
export function chipCitas($: Motor, tabla: ReturnType<Motor['ui']['resolve']>, nivel: 0 | 1 | 2): (Pastilla & { pendientes: number }) | null {
  try {
    const analisis = estado.citas
    if (!analisis || analisis.revisadas.length === 0) return null
    const { Text } = tabla
    const r = analisis.resumen
    const pendientes = r.sinVerificar + r.sospechosas
    const peor = peorEstado(r)
    const texto =
      pendientes > 0
        ? nivel === 0
          ? `§ ${pendientes} ${pendientes === 1 ? 'cita' : 'citas'} por verificar`
          : nivel === 1
            ? `§ ${pendientes} por verificar`
            : `§ ${pendientes} ${pendientes === 1 ? 'cita' : 'citas'}`
        : nivel === 0
          ? `§ ${r.verificadas} ${r.verificadas === 1 ? 'cita verificada' : 'citas verificadas'}`
          : `§ ${r.verificadas} ✓`
    const color = pendientes > 0 && peor ? COLOR[peor] : 'success'
    // La misma pastilla que las demás (antes iba en una caja aparte y bajaba de línea).
    const nodo = pulsable(
      tabla,
      'banda-citas',
      'Ver las citas',
      () => void abrirPanel($, PANEL_CITAS, 'Revisor de citas', true),
      <Text color={color} bold={pendientes > 0} dimColor={pendientes === 0} wrap="truncate-end">
        {texto}
      </Text>,
    )
    return { nodo, ancho: texto.length + 1, pendientes }
  } catch {
    return null
  }
}

/** Botón «Pedir verificación» de la banda: solo cuando hay citas pendientes y sitio. */
export function botonVerificarCitas($: Motor, tabla: ReturnType<Motor['ui']['resolve']>): Pastilla | null {
  try {
    const r = estado.citas?.resumen
    if (!r || r.sinVerificar + r.sospechosas === 0) return null
    const { Button } = tabla
    return {
      nodo: <Button key="citas-verificar" label="Pedir verificación" plain dimColor onPress={() => void pedirVerificacion($)} />,
      ancho: 20,
    }
  } catch {
    return null
  }
}
