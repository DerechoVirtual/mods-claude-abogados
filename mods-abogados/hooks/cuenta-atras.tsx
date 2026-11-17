// ─────────────────────────────────────────────────────────────────────────────
// MOD 3 · Cuenta atrás de plazo
//
// Una línea fija encima del cuadro de escritura con el plazo más próximo:
//   ⏳ García c. Aseguradora Ficticia · 3 días hábiles · vie 14/11  +2 más
// Verde con más de 5 días hábiles, ámbar de 2 a 5, rojo con 1 o el mismo día,
// y destacado en rojo (fondo rojo) si está vencido.
//
// Lee data/plazos.json (el mismo archivo del Mod 1) y usa las mismas
// funciones de hooks/lib/plazos.ts. Se recalcula al iniciar la sesión, al
// cambiar un plazo, al terminar cada turno y cada minuto (para que el cambio
// de día se vea sin reiniciar). Si hay plazos en rojo o vencidos al empezar,
// muestra además un aviso emergente.
// ─────────────────────────────────────────────────────────────────────────────

import type { SessionStartInput, TurnCompleteInput } from 'claude-code'
import { aNumero, fechaCorta, type PlazoCalculado } from './lib/plazos'
import { actualizarHoy, anotarError, cargarPlazos, esDelCliente, estado, redibujar, type Motor, type Pastilla } from './lib/estado'
import { recortar } from './lib/texto'
import { abrirPanelPlazos } from './plazos-panel'
import { pulsable } from './pastilla'

/**
 * Sin cliente activo, un plazo vencido solo ocupa la banda estos días naturales
 * (sigue en el panel): un ejemplo vencido hace un mes no es un aviso, es ruido.
 */
const DIAS_VENCIDO_EN_BANDA = 7

const COLOR = { verde: 'success', ambar: 'warning', rojo: 'error', vencido: 'error' } as const

/**
 * Plazos que compiten por la banda, el más urgente primero.
 *   · Con cliente activo: SOLO los suyos (si no tiene, la banda no enseña
 *     ninguno: el plazo vencido de otro cliente confunde más que ayuda).
 *   · Sin cliente activo: los de todo el despacho, sin los vencidos de hace
 *     más de una semana.
 * El panel /plazos los enseña siempre todos.
 */
export function plazosParaBanda(): PlazoCalculado[] {
  const hoy = aNumero(estado.hoy)
  const validos = estado.calculados.filter(p => p.estado !== null && p.fin !== null)
  const cliente = estado.activos.colorCliente ? estado.clienteActivo : null
  const lista = cliente
    ? validos.filter(p => esDelCliente(p, cliente))
    : validos.filter(p => !(p.estado === 'vencido' && hoy - aNumero(p.fin!) > DIAS_VENCIDO_EN_BANDA))
  return [...lista].sort((a, b) => (a.fin ?? '').localeCompare(b.fin ?? ''))
}

function textoDias(p: PlazoCalculado): string {
  if (p.restantes === null) return ''
  if (p.restantes < 0) return 'VENCIDO'
  if (p.restantes === 0) return 'vence HOY'
  return p.restantes === 1 ? '1 día hábil' : `${p.restantes} días hábiles`
}

/** Recalcula: nueva fecha (cambio de día) y cambios en data/plazos.json hechos a mano. */
async function refrescar($: Motor): Promise<void> {
  try {
    const cambioDia = await actualizarHoy($)
    const cambioArchivo = await cargarPlazos($)
    if (cambioDia || cambioArchivo) redibujar($)
  } catch {
    // se intentará en el siguiente minuto
  }
}

// ── Manejadores que llama register.tsx (ninguno lanza errores) ──────────────

/** MOD 3 · Al iniciar la sesión: temporizador de un minuto y aviso si hay plazos en rojo. */
export async function iniciarCuentaAtras($: Motor, e: SessionStartInput): Promise<void> {
  try {
    // Temporizador de un minuto, solo con una persona delante (no en `claude -p`).
    if (e.isInteractive) $.clock.every(60_000, () => void refrescar($))

    // Aviso emergente si al empezar hay plazos en rojo o vencidos (solo en una sesión jurídica).
    const urgentes = plazosParaBanda().filter(p => p.estado === 'rojo' || p.estado === 'vencido')
    if (estado.sesionJuridica && urgentes.length > 0) {
      const primero = urgentes[0]!
      $.ui.toast(
        `⏳ ${urgentes.length === 1 ? 'Un plazo' : urgentes.length + ' plazos'} en rojo o vencido: ${primero.asunto} · ${primero.tipo} · ${textoDias(primero)}`,
        { timeoutMs: 9000 },
      )
    }
  } catch (error) {
    anotarError(`Mod 3: ${String(error).slice(0, 100)}`)
  }
}

/** MOD 3 · Al terminar cada turno de la conversación principal. */
export async function terminarTurnoCuentaAtras($: Motor, e: TurnCompleteInput): Promise<void> {
  if (e.agentId === undefined) await refrescar($)
}

/**
 * Pastilla del Mod 3 en la banda: el plazo más urgente (la compone register.tsx).
 * `nivel` dice cuánto sitio hay: 0, todo (asunto, días y fecha); 1, los días y
 * la fecha; 2, solo los días, que es lo que no se puede perder.
 */
export function chipPlazo($: Motor, tabla: ReturnType<Motor['ui']['resolve']>, nivel: 0 | 1 | 2): Pastilla | null {
  try {
    const lista = plazosParaBanda()
    if (lista.length === 0) return null // sin plazos no ocupa sitio
    const { Text } = tabla
    const p = lista[0]!
    const mas = lista.length - 1
    const estadoP = p.estado ?? 'verde'
    const vencido = p.estado === 'vencido'
    const dias = textoDias(p)
    // Con cliente activo el asunto sobra (todos son suyos): mejor el tipo de escrito.
    const conCliente = estado.activos.colorCliente && estado.clienteActivo !== null
    const que = recortar(conCliente ? p.tipo : p.asunto, 34)
    const texto =
      nivel === 0 ? `⏳ ${que} · ${dias} · ${fechaCorta(p.fin!)}` : nivel === 1 ? `⏳ ${dias} · ${recortar(que, 20)}` : `⏳ ${vencido ? 'VENCIDO' : p.restantes === 0 ? 'HOY' : p.restantes === 1 ? '1 día' : p.restantes + ' días'}`
    const resto = mas > 0 && nivel < 2 ? ` +${mas} más` : ''
    const partes = [
      vencido ? (
        <Text backgroundColor="error" color="inverseText" bold wrap="truncate-end">
          {` ${texto} `}
        </Text>
      ) : (
        <Text color={COLOR[estadoP]} bold={estadoP !== 'verde'} wrap="truncate-end">
          {texto}
        </Text>
      ),
      resto ? <Text dimColor>{resto}</Text> : null,
    ].filter(x => x !== null)
    const nodo = pulsable(
      tabla,
      'banda-plazo',
      'Abrir el panel de plazos',
      () => {
        if (estado.activos.plazos) void abrirPanelPlazos($, 'plazos', true)
        else $.ui.toast('El panel de plazos está desactivado en los ajustes del plugin.')
      },
      partes,
    )
    return { nodo, ancho: texto.length + resto.length + (vencido ? 2 : 0) + 1 }
  } catch {
    return null
  }
}
