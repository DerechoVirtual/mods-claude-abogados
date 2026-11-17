// ─────────────────────────────────────────────────────────────────────────────
// MOD 6 · «Que lo ataque el contrario»
//
// Cuando Claude TERMINA un escrito (el ensamblador da "ok" sin errores, o
// entrega un Word o PDF de demanda, recurso, contestación…), aparece en la
// banda una sola línea:
//   ⚔ Escrito terminado: «Demanda de desahucio…»   [Que lo ataque el contrario]  Ahora no
// Al pulsarlo, se pide a Claude que un subagente haga de abogado de la otra
// parte y saque los puntos débiles, ordenados por riesgo y con cómo reforzarlos.
// No modifica el escrito. Sus búsquedas en Jurisprudenciator gastan cupo.
//
// Antes de terminar el escrito no aparece nada: la línea se arma al acabar el
// turno en que se terminó, se oculta al empezar otro ensamblado (bucle de
// correcciones), al pulsar cualquiera de los dos botones o tras dos turnos más.
// /contrario lo pide a mano para el último escrito terminado.
// ─────────────────────────────────────────────────────────────────────────────

import type { On, ToolCallInput, ToolCallResult, TurnCompleteInput, TurnStartInput } from 'claude-code'
import { detectarEscritoTerminado, esEnsamblado, peticionAtaque, type EscritoTerminado } from './lib/escritos'
import { anotarError, enviarUnaVez, estado, redibujar, type Motor } from './lib/estado'
import { carpetaRedaccionDeSeccion } from './lib/anonimizar'
import { recortar } from './lib/texto'

/** Escrito terminado en el turno en curso (se muestra al acabar el turno). */
let delTurno: EscritoTerminado | null = null

/** Turnos de la conversación principal que el botón sigue visible sin usarse. */
const TURNOS_VISIBLE = 2

function textoDelResultado(resultado: ToolCallResult): string {
  if (typeof resultado.text === 'string') return resultado.text
  if (typeof resultado.result === 'string') return resultado.result
  try {
    return JSON.stringify(resultado.result ?? '')
  } catch {
    return ''
  }
}

// ── Manejadores que llama register.tsx (ninguno lanza errores) ──────────────

/** MOD 6 · Al iniciar la sesión: registra /contrario. */
export async function iniciarContrario($: Motor): Promise<void> {
  try {
    await $.command.register({
      name: 'contrario',
      description: 'Pide que un subagente ataque el último escrito terminado como lo haría la parte contraria',
      immediate: true,
    })
  } catch (error) {
    anotarError(`Mod 6: ${String(error).slice(0, 100)}`)
  }
}

/** ¿Esta llamada escribe una sección de una redacción? (señal de que hay otro escrito en marcha) */
export function escribeSeccion(e: Record<string, unknown>): boolean {
  const herramienta = String(e.tool)
  if (herramienta !== 'Write' && herramienta !== 'Edit' && herramienta !== 'MultiEdit') return false
  return typeof e.file_path === 'string' && carpetaRedaccionDeSeccion(e.file_path) !== null
}

/**
 * MOD 6 · Antes de una llamada: un nuevo ensamblado, o una sección que se
 * vuelve a escribir, ocultan el botón: se está corrigiendo ese escrito o ya se
 * redacta el siguiente, y «Escrito terminado» ya no es verdad.
 */
export function antesDeHerramientaContrario($: Motor, e: ToolCallInput): void {
  try {
    const datos = e as unknown as Record<string, unknown>
    if (estado.escritoListo && (esEnsamblado(datos) || escribeSeccion(datos))) {
      estado.escritoListo = null
      redibujar($)
    }
  } catch {
    // nada
  }
}

/** MOD 6 · Después de una llamada: ¿ha quedado terminado un escrito? */
export function despuesDeHerramientaContrario(e: ToolCallInput, resultado: ToolCallResult): void {
  try {
    if (resultado.deny !== undefined) return
    const escrito = detectarEscritoTerminado(e as unknown as Record<string, unknown>, textoDelResultado(resultado), resultado.isError === true)
    if (escrito) delTurno = escrito
  } catch {
    // nada
  }
}

/** MOD 6 · Empieza un turno de la conversación principal. */
export function empezarTurnoContrario($: Motor, e: TurnStartInput): void {
  try {
    if (e.agentId !== undefined) return
    delTurno = null
    if (estado.escritoListo) {
      estado.escritoListo = { ...estado.escritoListo, turnos: estado.escritoListo.turnos + 1 }
      if (estado.escritoListo.turnos > TURNOS_VISIBLE) {
        estado.escritoListo = null
        redibujar($)
      }
    }
  } catch {
    // nada
  }
}

/** MOD 6 · Acaba un turno de la conversación principal: si terminó un escrito, aparece el botón. */
export function terminarTurnoContrario($: Motor, e: TurnCompleteInput): void {
  try {
    if (e.agentId !== undefined || !delTurno) return
    estado.escritoListo = { ...delTurno, turnos: 0 }
    estado.ultimoEscrito = delTurno
    delTurno = null
    redibujar($)
  } catch {
    // nada
  }
}

/** Envía a Claude la petición de ataque (también desde el panel «Siguientes pasos»). */
export async function atacarEscrito($: Motor, escrito: EscritoTerminado): Promise<boolean> {
  estado.escritoListo = null
  redibujar($)
  const enviado = await enviarUnaVez($, peticionAtaque(escrito))
  if (enviado === 'repetido') return true // ya estaba pedido (doble pulsación)
  if (enviado !== 'enviado') {
    $.ui.toast(`No se pudo enviar (${enviado.fallo}). Escribe /contrario cuando Claude termine.`)
    return false
  }
  $.ui.toast('El abogado contrario ya está leyendo el escrito.')
  return true
}

/**
 * MOD 6 · Comando /contrario (hook con filtro propio).
 * Un comando no puede enviar mensajes a Claude mientras se ejecuta, así que
 * deja la petición escrita en el cuadro de escritura: basta pulsar Intro.
 */
export function registrarHooksContrario(on: On): void {
  on('command.run', { command: 'contrario' }, async $ => {
    const escrito = estado.escritoListo ?? estado.ultimoEscrito
    if (!escrito) return { text: 'Todavía no hay ningún escrito terminado en esta sesión. El botón aparece al terminar uno.' }
    const relleno = await $.prompt.fill({ text: peticionAtaque(escrito) })
    if (!relleno.isFilled) return { text: 'No se pudo preparar la petición. Pulsa «Que lo ataque el contrario» en la banda.' }
    estado.escritoListo = null
    redibujar($)
    return { text: `Petición del contrario preparada para «${escrito.nombre}»: pulsa Intro para enviarla.` }
  }).catch(() => ({ text: 'mods-abogados: no se pudo preparar el ataque del contrario.' }))
}

/**
 * Fila de la banda: solo con un escrito terminado. El texto se encoge (y se
 * corta con «…») y los botones no: nunca se salen por la derecha.
 */
export function filaContrario($: Motor, tabla: ReturnType<Motor['ui']['resolve']>, ancho: number) {
  try {
    const escrito = estado.escritoListo
    if (!escrito) return null
    const { Box, Text, Button } = tabla
    // Lo que ocupan los dos botones: en el terminal el principal va entre
    // corchetes; en la app de escritorio la letra es más estrecha que una columna.
    const sitio = ancho - (estado.superficie === 'terminal' ? 41 : 35)
    const texto = sitio >= 34 ? `⚔ Escrito terminado: «${recortar(escrito.nombre, sitio - 24)}»` : sitio >= 18 ? '⚔ Escrito terminado' : '⚔ Listo'
    return (
      <Box flexDirection="row" columnGap={1}>
        <Box flexShrink={1} minWidth={0}>
          <Text color="claude" bold wrap="truncate-end">
            {texto}
          </Text>
        </Box>
        <Box flexShrink={0} flexDirection="row" columnGap={1}>
          <Button key="contrario-atacar" label="Que lo ataque el contrario" variant="primary" onPress={() => void atacarEscrito($, escrito)} />
          <Button
            key="contrario-ahora-no"
            label="Ahora no"
            plain
            dimColor
            onPress={() => {
              estado.escritoListo = null
              redibujar($)
            }}
          />
        </Box>
      </Box>
    )
  } catch {
    return null
  }
}
