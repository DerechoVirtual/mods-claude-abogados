// ─────────────────────────────────────────────────────────────────────────────
// register.tsx · Punto de entrada del plugin «mods-abogados»
//
// La documentación de mods admite UN solo módulo por plugin (hooks.json →
// "modules": ["./register.tsx"]) y no deja registrar dos veces el mismo
// evento sin filtro. Por eso este archivo:
//   1. lee las opciones del plugin (/plugin) para saber qué mods están activos,
//   2. carga una vez la configuración y los plazos al empezar la sesión,
//   3. registra UNA vez session.start, tool.call, turn.start y turn.complete y
//      llama a los manejadores de cada mod activo (un archivo por mod),
//   4. registra los hooks con filtro de cada mod (comandos, paneles…),
//   5. dibuja la BANDA encima del prompt que comparten los mods.
//
// SOLO EN SESIONES JURÍDICAS (hooks/sesion.ts): en una sesión de marketing o de
// cualquier otra cosa no sale ni el cliente, ni su color, ni la banda.
//
// LA BANDA NO SE LLENA: como mucho DOS filas de este plugin, y ninguna se parte
// ni se sale por la derecha (Carlos, 09/11/2026: «no quiero agobio»).
//   · Fila de estado: pastillas cortas (cliente, avisos de la ficha —MASC y
//     procurador—, el plazo más urgente DEL CLIENTE ACTIVO, citas pendientes,
//     copia anonimizada y cupo, este último solo cuando queda poco). Cada
//     pastilla tiene tres tamaños; si no caben todas, se encogen las menos
//     importantes y, si aun así no caben, se quitan. Nunca bajan de línea.
//   · Fila de acción, solo cuando hay algo que hacer: «Siguientes pasos» o el
//     botón del contrario con un escrito terminado; si no, el aviso de
//     Anonimizator con su botón; si no, cómo ver un panel que no cupo.
//   El aviso de expediente cruzado sustituye a la pastilla del cliente.
//
// GARANTÍA: ningún mod bloquea ni modifica llamadas a herramientas. El hook
// de tool.call pasa SIEMPRE el evento original a next(e) y devuelve su
// resultado tal cual. Cada manejador captura sus propios errores.
// Todo es local salvo el Mod 9 (apagado por defecto), que usa el conector de
// Anonimizator que el abogado tenga en Claude, y la ordenación de «Siguientes
// pasos», que hace una consulta breve a Claude por escrito.
// ─────────────────────────────────────────────────────────────────────────────

import type { Register, RenderChildren } from 'claude-code'
import { iniciarPanelPlazos, registrarHooksPanelPlazos } from './plazos-panel'
import { esHerramientaPlazosEscrito, iniciarPlazosEscrito, recibirPlazosEscrito, registrarHooksPlazosEscrito } from './plazos-escrito'
import {
  anotarHerramientaCitas,
  botonVerificarCitas,
  chipCitas,
  empezarTurnoCitas,
  iniciarRevisorCitas,
  registrarHooksRevisorCitas,
  terminarTurnoCitas,
} from './revisor-citas'
import { chipPlazo, iniciarCuentaAtras, terminarTurnoCuentaAtras } from './cuenta-atras'
import { chipCliente, iniciarColorCliente, registrarHooksColorCliente, vigilarHerramientaCliente } from './color-cliente'
import { antesDeHerramientaCupo, chipCupo, despuesDeHerramientaCupo, iniciarCupo, registrarHooksCupo } from './cupo'
import {
  antesDeHerramientaContrario,
  despuesDeHerramientaContrario,
  empezarTurnoContrario,
  filaContrario,
  iniciarContrario,
  registrarHooksContrario,
  terminarTurnoContrario,
} from './contrario'
import { chipFicha, iniciarFicha, registrarHooksFicha, vigilarDemanda } from './ficha'
import {
  despuesDeHerramientaAnonimizar,
  empezarTurnoAnonimizar,
  iniciarAnonimizar,
  registrarHooksAnonimizar,
  segmentoAnonimizar,
  terminarTurnoAnonimizar,
} from './anonimizar'
import {
  despuesDeHerramientaSiguientes,
  empezarTurnoSiguientes,
  filaSiguientes,
  iniciarSiguientes,
  registrarHooksSiguientes,
  retirarSiEmpiezaOtro,
  terminarTurnoSiguientes,
} from './siguientes'
import { COMANDOS_DEL_PLUGIN, esLlamadaJuridica, iniciarSesion, marcarJuridica } from './sesion'
import { actualizarHoy, anotarError, cargarConfiguracion, cargarPlazos, estado, olvidarEnvios, redibujar, type Motor, type Pastilla } from './lib/estado'

type Tabla = ReturnType<Motor['ui']['resolve']>
type Nivel = 0 | 1 | 2

/** Carga común: carpeta del plugin, fecha de hoy, configuración y plazos. */
async function cargaComun($: Motor, cwd: string, interactiva: boolean): Promise<void> {
  try {
    estado.raiz = $.plugin.root.replace(/\\/g, '/').replace(/\/$/, '')
    estado.cwd = cwd
    estado.interactiva = interactiva
    olvidarEnvios()
    await actualizarHoy($)
    await cargarConfiguracion($)
    await cargarPlazos($)
  } catch (error) {
    anotarError(`Carga inicial: ${String(error).slice(0, 120)}`)
  }
}

/**
 * Columnas que de verdad caben en una fila: las que da Claude Code menos un
 * pequeño margen, para que nada llegue al borde (en la app de escritorio las
 * pastillas con fondo llevan un poco de relleno).
 */
function anchoUtil(columnas: number, superficie: string): number {
  return Math.max(24, columnas - (superficie === 'terminal' ? 1 : 3))
}

/**
 * Fila de estado: UNA fila de pastillas que nunca baja de línea. Cada pastilla
 * tiene tres tamaños (0, entero; 2, mínimo). Se empieza con todas enteras y,
 * mientras no quepan, se encoge la menos importante que aún pueda encogerse;
 * si con todas al mínimo siguen sin caber, se quita la menos importante.
 * Importancia: cliente (o el aviso de expediente cruzado), avisos de la ficha,
 * plazo, citas, copia anonimizada y cupo.
 */
function filaEstado($: Motor, tabla: Tabla, ancho: number, conAnonimizar: boolean) {
  const { Box } = tabla
  const activos = estado.activos
  // De más a menos importante.
  const cliente = { nivel: 0 as Nivel, hacer: (n: Nivel) => (activos.colorCliente ? chipCliente($, tabla, n) : null) }
  const ficha = { nivel: 0 as Nivel, hacer: (n: Nivel) => (activos.masc || activos.procurador ? chipFicha($, tabla, n) : null) }
  const plazo = { nivel: 0 as Nivel, hacer: (n: Nivel) => (activos.cuentaAtras ? chipPlazo($, tabla, n) : null) }
  const citas = { nivel: 0 as Nivel, hacer: (n: Nivel) => (activos.citas ? chipCitas($, tabla, n) : null) }
  const anonimizar = { nivel: 0 as Nivel, hacer: (_n: Nivel) => (conAnonimizar && activos.anonimizar ? segmentoAnonimizar($, tabla, false) : null) }
  const cupo = { nivel: 0 as Nivel, hacer: (n: Nivel) => (activos.cupo ? chipCupo($, tabla, n) : null) }
  let presentes = [cliente, ficha, plazo, citas, anonimizar, cupo].filter(p => p.hacer(0) !== null)
  if (presentes.length === 0) return null
  const medir = () => presentes.map(p => p.hacer(p.nivel)).filter((p): p is Pastilla => p !== null)
  const ocupado = (lista: Pastilla[]) => lista.reduce((s, p) => s + p.ancho + 1, 0)
  // Si no caben, se encoge primero lo que menos se echa de menos (el número de
  // expediente, el asunto del plazo…) y solo al final lo que deja una pastilla
  // casi en clave. Si con todo al mínimo siguen sin caber, se quita la última.
  const pasos: Array<[typeof cliente, Nivel]> = [
    [cliente, 1],
    [plazo, 1],
    [ficha, 1],
    [cupo, 1],
    [citas, 1],
    [cliente, 2],
    [ficha, 2],
    [plazo, 2],
    [citas, 2],
  ]
  for (const [pieza, nivel] of pasos) {
    if (ocupado(medir()) <= ancho) break
    if (presentes.includes(pieza)) pieza.nivel = nivel
  }
  while (presentes.length > 1 && ocupado(medir()) > ancho) presentes = presentes.slice(0, -1)
  // Si al quitar alguna ha quedado sitio, las que siguen recuperan tamaño
  // (primero lo último que se encogió): no se desperdicia la fila.
  for (const [pieza, nivel] of [...pasos].reverse()) {
    if (!presentes.includes(pieza) || pieza.nivel !== nivel) continue
    pieza.nivel = (nivel - 1) as Nivel
    if (ocupado(medir()) > ancho) pieza.nivel = nivel
  }
  const pastillas = medir()
  // Con sitio de sobra, el botón «Pedir verificación» junto a las citas.
  const verificar = activos.citas && presentes.includes(citas) && citas.nivel === 0 ? botonVerificarCitas($, tabla) : null
  const nodos = pastillas.map(p => p.nodo)
  if (verificar && ocupado(pastillas) + verificar.ancho <= ancho) nodos.push(verificar.nodo)
  return (
    <Box flexDirection="row" columnGap={1} overflow="hidden">
      {nodos}
    </Box>
  )
}

/**
 * Fila de acción: solo cuando hay algo que hacer, y una sola cosa cada vez.
 * Si la ocupa «Siguientes pasos» o el contrario, el aviso de Anonimizator pasa
 * a la fila de estado como pastilla corta (devuelve `anonimizarArriba`).
 */
function filaAccion($: Motor, tabla: Tabla, ancho: number): { nodo: RenderChildren | null; anonimizarArriba: boolean } {
  // Con «Siguientes pasos», el botón del contrario va dentro de su panel: una sola fila.
  const siguientes = estado.activos.siguientes ? filaSiguientes($, tabla, ancho) : null
  const contrario = !siguientes && estado.activos.contrario ? filaContrario($, tabla, ancho) : null
  const principal = siguientes ?? contrario
  if (principal) return { nodo: principal, anonimizarArriba: true }
  const anonimizar = estado.activos.anonimizar ? segmentoAnonimizar($, tabla, true) : null
  if (anonimizar) return { nodo: anonimizar.nodo, anonimizarArriba: false }
  if (estado.avisoPanel) {
    const { Text } = tabla
    return {
      nodo: (
        <Text color="warning" wrap="truncate-end">
          ↔ {estado.avisoPanel}
        </Text>
      ),
      anonimizarArriba: false,
    }
  }
  return { nodo: null, anonimizarArriba: false }
}

export const register: Register = (on, options) => {
  // 1) Qué mods están activos (opciones del plugin; todos activos por defecto).
  const opcion = (clave: string) => {
    const valor = (options as Record<string, unknown> | undefined)?.[clave]
    return valor !== false && valor !== 'false'
  }
  estado.activos = {
    plazos: opcion('mod_plazos'),
    citas: opcion('mod_citas'),
    cuentaAtras: opcion('mod_cuenta_atras'),
    colorCliente: opcion('mod_color_cliente'),
    cupo: opcion('mod_cupo'),
    contrario: opcion('mod_contrario'),
    masc: opcion('mod_masc'),
    procurador: opcion('mod_procurador'),
    // El Mod 9 viene APAGADO: solo se activa si el abogado lo enciende en /plugin.
    siguientes: opcion('mod_siguientes'),
    anonimizar: ['true', true].includes((options as Record<string, unknown> | undefined)?.['mod_anonimizar'] as string | boolean),
  }
  const activos = estado.activos

  // 2) Inicio de sesión: carga común y, después, cada mod.
  on('session.start', async ($, e, next) => {
    await cargaComun($, e.cwd, e.isInteractive)
    await iniciarSesion($) // ¿sesión jurídica? (antes que los mods: decide qué se ve)
    if (activos.plazos) {
      await iniciarPanelPlazos($)
      await iniciarPlazosEscrito($)
    }
    if (activos.citas) await iniciarRevisorCitas($)
    // El cliente, antes que la cuenta atrás: su aviso de plazos solo cuenta los del cliente activo.
    if (activos.colorCliente) await iniciarColorCliente($)
    if (activos.cuentaAtras) await iniciarCuentaAtras($, e)
    if (activos.cupo) await iniciarCupo($)
    if (activos.contrario) await iniciarContrario($)
    if (activos.masc || activos.procurador) await iniciarFicha($)
    if (activos.anonimizar) await iniciarAnonimizar($)
    if (activos.siguientes) await iniciarSiguientes($)
    return next(e)
  }).catch(($, e, next) => next(e))

  // 3) Herramientas (también las de los subagentes): los mods OBSERVAN antes y
  //    después; la llamada no se toca y su resultado vuelve tal cual.
  on('tool.call', async ($, e, next) => {
    // La herramienta PROPIA del plugin (los plazos de un escrito) la contesta su hook con
    // filtro; esto es solo una red por si Claude Code la listara con otro prefijo. Las
    // llamadas a cualquier otra herramienta no se tocan nunca.
    if (activos.plazos && esHerramientaPlazosEscrito(String(e.tool)) && String(e.tool) !== 'mcp__mods-abogados__plazos_del_escrito') {
      return recibirPlazosEscrito($, e as unknown as Record<string, unknown>)
    }
    if (!estado.sesionJuridica && esLlamadaJuridica(e as unknown as Record<string, unknown>)) await marcarJuridica($)
    if (activos.colorCliente) vigilarHerramientaCliente($, e)
    if (activos.cupo) await antesDeHerramientaCupo($, e)
    if (activos.contrario) antesDeHerramientaContrario($, e)
    const resultado = await next(e) // el evento original, sin cambios
    if (activos.citas) anotarHerramientaCitas(e, resultado)
    if (activos.cupo) await despuesDeHerramientaCupo($, e, resultado)
    if (activos.contrario) despuesDeHerramientaContrario(e, resultado)
    if (activos.masc) vigilarDemanda($, e, resultado)
    if (activos.anonimizar) despuesDeHerramientaAnonimizar(e, resultado)
    if (activos.siguientes) {
      despuesDeHerramientaSiguientes(e, resultado)
      retirarSiEmpiezaOtro($)
    }
    return resultado // el resultado original, sin cambios
  }).catch(($, e, next) => next(e))

  on('turn.start', async ($, e, next) => {
    if (activos.citas) empezarTurnoCitas(e)
    if (activos.contrario) empezarTurnoContrario($, e)
    if (activos.anonimizar) empezarTurnoAnonimizar($, e)
    if (activos.siguientes) empezarTurnoSiguientes($, e)
    // Un mensaje nuevo de la persona limpia los avisos del turno anterior.
    if (e.agentId === undefined && (estado.avisoCruzado || estado.avisoPanel)) {
      estado.avisoCruzado = null
      estado.avisoPanel = null
      redibujar($)
    }
    return next(e)
  }).catch(($, e, next) => next(e))

  on('turn.complete', async ($, e, next) => {
    const resultado = await next(e)
    if (activos.citas) await terminarTurnoCitas($, e)
    if (activos.cuentaAtras) await terminarTurnoCuentaAtras($, e)
    if (activos.contrario) terminarTurnoContrario($, e)
    if (activos.anonimizar) terminarTurnoAnonimizar($, e)
    if (activos.siguientes) terminarTurnoSiguientes($, e)
    return resultado
  }).catch(($, e, next) => next(e))

  // Usar un comando del plugin ya es trabajo jurídico: desde ahí sale la banda.
  on('command.run', async ($, e, next) => {
    if (COMANDOS_DEL_PLUGIN.has(e.command)) await marcarJuridica($)
    return next(e)
  }).catch(($, e, next) => next(e))

  // 4) Hooks con filtro propio de cada mod (comandos, paneles, sitios de dibujo).
  //    El Mod 3 no tiene: solo dibuja su pastilla de la banda.
  if (activos.plazos) {
    registrarHooksPanelPlazos(on)
    registrarHooksPlazosEscrito(on)
  }
  if (activos.citas) registrarHooksRevisorCitas(on)
  if (activos.colorCliente) registrarHooksColorCliente(on)
  if (activos.cupo) registrarHooksCupo(on)
  if (activos.contrario) registrarHooksContrario(on)
  if (activos.masc || activos.procurador) registrarHooksFicha(on)
  if (activos.anonimizar) registrarHooksAnonimizar(on)
  if (activos.siguientes) registrarHooksSiguientes(on)

  // 5) La banda encima del prompt: como mucho dos filas de este plugin.
  //    Lo que dibujen otros mods se conserva debajo (await next(e)).
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const deOtros = await next(e)
    if (e.props.hasSurvey) return deOtros // una encuesta de Claude Code tiene prioridad
    if (!estado.sesionJuridica) return deOtros // sin clientes ni escritos, nada del despacho
    const tabla = $.ui.resolve(e)
    const { Box } = tabla
    estado.superficie = e.surface // las pastillas se dibujan distinto en la app de escritorio
    const ancho = anchoUtil(e.props.bodyColumns, e.surface)
    const accion = filaAccion($, tabla, ancho)
    const filas = [filaEstado($, tabla, ancho, accion.anonimizarArriba), accion.nodo].filter(f => f !== null)
    if (filas.length === 0) return deOtros
    return (
      <Box flexDirection="column">
        {filas}
        {deOtros}
      </Box>
    )
  }).catch(($, e, next) => next(e))
}
