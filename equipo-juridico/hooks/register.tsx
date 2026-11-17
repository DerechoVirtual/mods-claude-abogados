// Mod «equipo-juridico» para Claude Code.
//
// Cuando Claude lanza subagentes o flujos (Workflow), el trabajo lo hace un
// EQUIPO JURÍDICO de 8 personas (una por oficio): María la secretaria, Juan el
// buscador de jurisprudencia, Luis el picapleitos, Clara (hechos), Alberto
// (procesal), Elena (revisión), Pablo (procura) y Carmen (cuentas). La
// OFICINA empieza vacía: cada persona entra al recibir su primera tarea y, si
// hay más tareas que personas, la misma persona lleva varias.
//
// Dónde se ve:
//   · el PANEL «Equipo jurídico» (/equipo), con dos vistas: OFICINA (en la app
//     de escritorio, una escena animada en SVG; en la terminal, puestos de
//     texto) y LISTA. Al pulsar a una persona se abre su FICHA: cada tarea con
//     su avance honesto (palabras escritas frente a las pedidas, herramientas,
//     archivos, tiempo, estado), la cronología en directo y lo que va diciendo;
//     «Ver más» la despliega entera;
//   · la FILA de cada llamada a Agent y a Workflow en la conversación;
//   · el SPINNER, la BANDA encima del prompt (UNA sola fila, que se retira
//     sola cuando termina el equipo) y los AVISOS;
//   · la BARRA del escrito cuando se pide redactar uno (avance.ts).
//
// Lo que dicen las personas sale de hechos reales observados en lo que
// devuelven las herramientas (frases.ts), nunca inventados.
//
// Lo que NO puede cambiar: el panel «Tareas en segundo plano» de la app de
// escritorio no es un sitio redibujable de la API de mods.
//
// Reglas que sigue el código:
//   · solo OBSERVA: nunca bloquea ni modifica una llamada, un subagente, un
//     prompt o un turno (siempre devuelve exactamente lo que contestó `next`);
//     las anotaciones van en segundo plano, sin hacer esperar a nadie;
//   · todo es local: ni red, ni modelos, ni procesos;
//   · cada paso va dentro de try/catch: si algo falla, Claude Code sigue
//     dibujando lo suyo.

import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Actividad, Archivo, ConfigEquipo, EstadoTarea, Frase, Hallazgos, Oficio, Persona, Redaccion, Tarea } from '../types'
import {
  accionDe,
  archivoDe,
  asignar,
  duracion,
  elegirPersona,
  enCursoPorPersona,
  frase,
  fraseSinNombre,
  metaDeFlujo,
  personaDe,
  resumen,
  rutaCorta,
  seccionCorta,
  tiempoDe,
  validarConfig,
} from './equipo'
import { EQUIPO_POR_DEFECTO } from './equipo-por-defecto'
import {
  anotarHerramienta,
  barra,
  calcularAvance,
  completarRedaccion,
  esSkillDeEscrito,
  faseEntregado,
  hayEscrito,
  nuevaRedaccion,
  pideEscrito,
  sinSenalesDeEscrito,
  tituloDeDocumento,
  tituloDeSkill,
} from './avance'
import { documentoEnFrase, sinNombreDelante } from './llano'
import { presupuestoDeLaBanda, textoDeLaBanda } from './banda'
import { contarPalabras, decir, esGrande, extensionPedida, hechoDeHerramienta } from './frases'
import type { Hecho } from './frases'
import { oficinaSvg, oficinaTexto, puestosDe } from './oficina'
import type { Puesto } from './oficina'
import { escenaSvg, escenaTexto, leerPersonajes, preguntaDelDirector } from './escena'
import { encargoResumido, estadoLegible, informeLimpio, narrar, resultadoDe } from './narrativa'
import type { Chat, Personajes, Tablero } from './escena'

const PANEL = 'equipo-juridico'
const TITULO = 'Equipo jurídico'
/** Una redacción sin señales durante este tiempo se olvida. */
const OLVIDO_MS = 30 * 60 * 1000
const MAX_TAREAS = 150
const MAX_ENCARGOS = 50
const MAX_ACTIVIDAD = 25
const MAX_ARCHIVOS = 15
const MAX_FRASES = 12
const LARGO_ENCARGO = 500
const LARGO_RESUMEN = 600
const LATIDO_MS = 3000
/** Como mucho un aviso emergente de «gran momento» cada tanto. */
const ENTRE_AVISOS_MS = 12_000
/** Las entradas a la oficina que llegan juntas salen en un solo aviso. */
const ESPERA_ENTRADAS_MS = 1200
/** Cuando todo el equipo ha terminado, la banda se retira sola pasado este tiempo. */
const RETIRADA_MS = 60_000

// ---------------------------------------------------------------------------
// Estado compartido entre hooks ($.state: sobrevive a las recargas del mod).
// Si cambia la forma de un valor, se cambia su etiqueta `shape` y lo antiguo
// se descarta en vez de romper.
// ---------------------------------------------------------------------------

const tareasA = atom({ plugin: 'equipo-juridico', key: 'tareas' } as const, [], { shape: 'tareas-3' })
const configA = atom({ plugin: 'equipo-juridico', key: 'config' } as const, EQUIPO_POR_DEFECTO, {
  shape: 'config-3',
})
const encargosA = atom({ plugin: 'equipo-juridico', key: 'encargos' } as const, [], { shape: 'encargos-1' })
const relojA = atom({ plugin: 'equipo-juridico', key: 'reloj' } as const, 0)
const bandaOcultaA = atom({ plugin: 'equipo-juridico', key: 'bandaOculta' } as const, false)
const retiradaA = atom({ plugin: 'equipo-juridico', key: 'retirada' } as const, 0)
const panelAutoAbiertoA = atom({ plugin: 'equipo-juridico', key: 'panelAutoAbierto' } as const, false)
const seleccionA = atom({ plugin: 'equipo-juridico', key: 'seleccion' } as const, '')
const fichaAmpliadaA = atom({ plugin: 'equipo-juridico', key: 'fichaAmpliada' } as const, false)
const vistaA = atom({ plugin: 'equipo-juridico', key: 'vista' } as const, 'oficina', { shape: 'vista-1' })
// Misma etiqueta que la versión anterior: lo guardado se completa con
// completarRedaccion() en vez de descartarse (una demanda en marcha no pierde su barra).
const redaccionA = atom({ plugin: 'equipo-juridico', key: 'redaccion' } as const, null, { shape: 'redaccion-1' })

// Lo de los avisos emergentes vive en el módulo: si el mod se recarga, se
// pierde sin más (solo afecta a cuándo puede salir el siguiente aviso).
let ultimoAvisoGrande = 0
/** El fondo de la oficina isométrica (data URI), leído de assets/ al empezar la sesión. */
let fondoOficina: string | undefined
/** Las imágenes de los personajes (assets/personajes.json), leídas al empezar la sesión. */
let personajes: Personajes | undefined
let entradasPendientes: string[] = []
let entradasProgramadas = false
/**
 * Las anotaciones de la barra del escrito van en fila, una detrás de otra (no
 * se pisan entre sí), y el fin del turno espera a que acaben: así el envío del
 * documento final siempre cuenta antes de decidir si el escrito está entregado.
 */
let colaDeLaBarra: Promise<void> = Promise.resolve()
/** El último documento que pidió la persona («Carta al cliente»), para titular la barra si la enciende una skill. */
let ultimoPedido: { titulo: string; hora: number } | undefined
/** Un pedido vale como título durante este tiempo. */
const PEDIDO_VALE_MS = 10 * 60 * 1000
/** Mensajes que no escribe la persona: ni encienden ni retiran la barra. */
const ORIGENES_AJENOS = new Set(['task-notification', 'scheduled-trigger', 'peer', 'peer-send-message', 'projects-relay', 'channel'])

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

/** Mensaje de un error cualquiera, corto. */
function mensajeDe(err: unknown): string {
  return (err instanceof Error ? err.message : String(err)).slice(0, 200)
}

/** Línea en el registro de depuración (claude --debug); nunca en la conversación. */
function depurar($: EngineInterface, texto: string): void {
  try {
    $.ui.log(`equipo-juridico: ${texto}`, { to: 'debug' })
  } catch {
    // Sin registro no pasa nada.
  }
}

/** Lee config/equipo.json; si no se puede, usa el equipo de reserva. */
async function cargarConfig($: EngineInterface): Promise<{ config: ConfigEquipo; aviso?: string }> {
  const ruta = `${$.plugin.root}/config/equipo.json`
  try {
    const texto = await $.fs.read(ruta)
    const resultado = validarConfig(JSON.parse(texto))
    if (!resultado.ok) {
      depurar($, `config/equipo.json no vale: ${resultado.error}`)
      return { config: EQUIPO_POR_DEFECTO, aviso: `la lista del equipo tiene un error (${resultado.error}); uso el equipo de siempre` }
    }
    const aviso = resultado.avisos.length > 0 ? resultado.avisos.join('; ') : undefined
    return aviso === undefined ? { config: resultado.config } : { config: resultado.config, aviso }
  } catch (err) {
    depurar($, `no pude leer config/equipo.json: ${mensajeDe(err)}`)
    return { config: EQUIPO_POR_DEFECTO, aviso: 'no he podido leer la lista del equipo; uso el equipo de siempre' }
  }
}

/** Estado de una tarea según cómo terminó el turno del subagente. */
function estadoPorMotivo(motivo: string): EstadoTarea {
  if (motivo === 'answer') return 'terminada'
  if (motivo === 'aborted') return 'detenida'
  return 'fallida'
}

/** Estado según la palabra de `$.agent.list()` o de un aviso de tarea. */
function estadoPorPalabra(palabra: string | undefined): EstadoTarea | undefined {
  if (palabra === 'completed') return 'terminada'
  if (palabra === 'failed') return 'fallida'
  if (palabra === 'killed') return 'detenida'
  return undefined
}

/** Icono de cada estado (emojis de un solo carácter, se ven igual en todas partes). */
function iconoDe(estado: EstadoTarea): string {
  switch (estado) {
    case 'trabajando':
      return '⏳'
    case 'terminada':
      return '✅'
    case 'fallida':
      return '❌'
    case 'detenida':
      return '✋'
  }
}

/** Icono de un puesto de la oficina. */
function iconoPuesto(p: Puesto): string {
  return p.estado === 'trabajando' ? '⏳' : p.estado === 'terminado' ? '✅' : p.estado === 'fallo' ? '❌' : '💤'
}

/** Icono de una herramienta en la ficha. */
function iconoActividad(a: Actividad): string {
  return a.estado === 'en curso' ? '⏳' : a.estado === 'error' ? '❌' : '✓'
}

/** Avatar: el emoji del oficio, o la inicial entre corchetes si hay poco sitio. */
function avatar(oficio: Oficio, persona: Persona, estrecho: boolean): string {
  return estrecho ? `[${persona.inicial}]` : oficio.emoji
}

/** Quita de la entrada de una herramienta los campos del sobre (tool, ids). */
function argumentosDe(e: object): Record<string, unknown> {
  const { tool: _t, tool_use_id: _id, agentId: _a, ...args } = e as Record<string, unknown>
  return args
}

/** Un número pequeño y estable a partir de un texto (para variar las frases). */
function semilla(texto: string): number {
  let n = 0
  for (const c of texto) n = (n * 31 + c.charCodeAt(0)) % 997
  return n
}

/** Añade una frase dicha por la persona de una tarea, sin repetir la anterior. */
function conFrase(config: ConfigEquipo, t: Tarea, hecho: Hecho, ahora: number): { tarea: Tarea; dicho: string } {
  const { oficio, persona } = personaDe(config, t.oficio, t.persona)
  const frases = t.frases ?? []
  const anterior = frases[frases.length - 1]?.texto
  const texto = decir(hecho, persona, oficio, config.tono, frases.length + semilla(persona.id + t.id), anterior)
  if (texto === '') return { tarea: t, dicho: '' }
  const nueva: Frase = { texto, hora: ahora, grande: esGrande(hecho) }
  return { tarea: { ...t, frases: [...frases, nueva].slice(-MAX_FRASES) }, dicho: texto }
}

/** Un aviso emergente de «gran momento», como mucho uno cada ENTRE_AVISOS_MS. */
async function avisoGrande($: EngineInterface, texto: string): Promise<void> {
  const config = await read($, configA)
  if (!config.avisosEmergentes || texto === '') return
  const ahora = await $.clock.now()
  if (ahora >= ultimoAvisoGrande && ahora - ultimoAvisoGrande < ENTRE_AVISOS_MS) return
  ultimoAvisoGrande = ahora
  $.ui.toast(texto, { timeoutMs: 6000 })
}

/** Apunta que alguien entra en la oficina; las entradas juntas salen en un solo aviso. */
function avisoEntrada($: EngineInterface, quien: string, avisosEmergentes: boolean): void {
  if (!avisosEmergentes) return
  entradasPendientes.push(quien)
  if (entradasProgramadas) return
  entradasProgramadas = true
  $.clock.after(ESPERA_ENTRADAS_MS, () => {
    const quienes = entradasPendientes
    entradasPendientes = []
    entradasProgramadas = false
    if (quienes.length === 0) return
    const lista = quienes.length === 1 ? (quienes[0] as string) : `${quienes.slice(0, -1).join(', ')} y ${quienes[quienes.length - 1]}`
    try {
      $.ui.toast(quienes.length === 1 ? `${lista} entra en la oficina` : `Entran en la oficina: ${lista}`, { timeoutMs: 5000 })
    } catch (err) {
      depurar($, `aviso de entrada: ${mensajeDe(err)}`)
    }
  })
}

/** Cierra (marca como acabada) la tarea de un subagente, con su frase de fin. */
async function cerrarTarea($: EngineInterface, id: string, estado: EstadoTarea, respuesta?: string): Promise<void> {
  const [config, ahora] = await Promise.all([read($, configA), $.clock.now()])
  const resumenRespuesta = typeof respuesta === 'string' && respuesta.trim() !== '' ? respuesta.trim().slice(0, LARGO_RESUMEN) : undefined
  let dicho = ''
  let grande = false
  let quien = ''
  await update($, tareasA, lista =>
    lista.map(t => {
      if (t.id !== id || t.estado !== 'trabajando') return t
      const cerrada: Tarea = { ...t, estado, fin: ahora, ...(resumenRespuesta !== undefined ? { resumen: resumenRespuesta } : {}) }
      const hecho: Hecho =
        estado === 'terminada'
          ? {
              tipo: 'termina',
              descripcion: t.descripcion,
              tiempo: duracion(ahora - t.inicio),
              busquedas: t.busquedas ?? 0,
              citas: t.citas ?? 0,
              archivos: t.archivos.length,
              palabras: t.palabras ?? 0,
            }
          : { tipo: 'falla', descripcion: t.descripcion }
      const r = conFrase(config, cerrada, hecho, ahora)
      dicho = r.dicho
      grande = esGrande(hecho)
      const { oficio, persona } = personaDe(config, t.oficio, t.persona)
      quien = `${oficio.emoji} ${persona.nombre}`
      return r.tarea
    }),
  )
  if (grande && dicho !== '') await avisoGrande($, `${quien}: ${dicho}`)
  if (!(await read($, tareasA)).some(t => t.estado === 'trabajando')) programarRetirada($)
}

/**
 * Lo que sale en la banda: quien trabaja y lo que terminó después del último
 * mensaje de la persona; si ya no trabaja nadie, solo durante un minuto.
 */
function tareasDeLaBanda(tareas: readonly Tarea[], retirada: number, ahora: number): Tarea[] {
  const vivas = tareas.filter(t => t.estado === 'trabajando' || (t.fin ?? 0) > retirada)
  if (vivas.some(t => t.estado === 'trabajando')) return vivas
  const ultimoFin = Math.max(0, ...vivas.map(t => t.fin ?? 0))
  return ahora - ultimoFin < RETIRADA_MS ? vivas : []
}

/**
 * ¿Sale el escrito en la banda? En curso, sí. Entregado, solo un minuto. Y si
 * el turno terminó sin entregarlo y sin nadie trabajando (en pausa), tampoco
 * se queda colgado: un minuto y fuera, hasta que se vuelva a trabajar en él.
 */
function escritoEnBanda(red: Redaccion, retirada: number, ahora: number): boolean {
  if (red.terminado) {
    const fin = red.fin ?? red.ultimo
    return fin >= retirada && ahora - fin < RETIRADA_MS
  }
  if (red.pausa !== undefined) return red.pausa >= retirada && ahora - red.pausa < RETIRADA_MS
  return true
}

/** Los nombres de todas las personas del equipo (para reconocer «Elena: revisar…»). */
function nombresDe(config: ConfigEquipo): string[] {
  return config.oficios.flatMap(o => o.personas.map(p => p.nombre))
}

/** La descripción de una tarea como se enseña: sin el nombre de quien la lleva delante. */
function descripcionLimpia(config: ConfigEquipo, descripcion: string): string {
  return sinNombreDelante(descripcion, nombresDe(config)).texto
}

/** Las tareas del despacho: las del abogado contrario no cuentan para el avance del escrito. */
function delDespacho(config: ConfigEquipo, tareas: readonly Tarea[]): Tarea[] {
  return tareas.filter(t => personaDe(config, t.oficio, t.persona).oficio.rival !== true)
}

/** ¿Repite la frase la descripción de la tarea? (en la fila ya se lee justo encima). */
function repiteDescripcion(frase: string, descripcion: string): boolean {
  return descripcion.length >= 6 && frase.toLowerCase().includes(descripcion.toLowerCase())
}

/** Los documentos de una tarea, nombrados en llano y sin repetir: «la contestación, «índice»». */
function documentosDe(t: Tarea): string[] {
  return [...new Set(t.archivos.filter(a => !/(^|\/)fuentes\//i.test(a.ruta)).map(a => documentoEnFrase(a.ruta)))]
}

/**
 * Pasado el minuto, mueve el reloj para que la banda se vuelva a dibujar y,
 * como ya no queda nada que contar, desaparezca sola.
 */
function programarRetirada($: EngineInterface): void {
  try {
    $.clock.after(RETIRADA_MS + 1000, () => {
      void $.clock
        .now()
        .then(ahora => update($, relojA, () => ahora))
        .catch(err => depurar($, `retirada de la banda: ${mensajeDe(err)}`))
    })
  } catch (err) {
    depurar($, `retirada de la banda: ${mensajeDe(err)}`)
  }
}

/** Hallazgos vacíos. */
function sinHallazgos(): Hallazgos {
  return { expediente: false, sentencias: [], leidas: [], normas: [], redactado: [] }
}

/** Añade sin repetir y con tope. */
function conUno(lista: readonly string[], valor: string, tope: number): string[] {
  return [...lista.filter(x => x !== valor), valor].slice(-tope)
}

/** Apunta lo redactado en una sección («la sección 01: 667 palabras»), sustituyendo la cifra anterior. */
function anotarRedactado(h: Hallazgos | undefined, ruta: string, palabras: number): Hallazgos {
  const base = h ?? sinHallazgos()
  const m = /secciones\/(\d{1,2})[^/]*\.md$/i.exec(ruta.replace(/\\/g, '/'))
  if (m === null || palabras <= 0) return base
  const nombre = `la sección ${(m[1] ?? '').padStart(2, '0')}`
  return { ...base, redactado: [...base.redactado.filter(x => !x.startsWith(`${nombre}:`)), `${nombre}: ${palabras} palabras`].slice(-6) }
}

/** Suma a los hallazgos de una tarea lo que ha dado de sí un paso. */
function sumarHallazgo(h: Hallazgos | undefined, hecho: Hecho | undefined): Hallazgos | undefined {
  if (hecho === undefined) return h
  const base = h ?? sinHallazgos()
  switch (hecho.tipo) {
    case 'expediente':
      return { ...base, expediente: true }
    case 'sentencias':
      return {
        ...base,
        sentencias: hecho.citas.reduce((l, c) => conUno(l, `${c.id}${c.tribunal !== '' ? ` ${c.tribunal}` : ''}`, 8), base.sentencias),
      }
    case 'lectura':
      return { ...base, leidas: conUno(base.leidas, hecho.cita, 6) }
    case 'articulo': {
      const vigencia = hecho.vigencia === 'vigente' ? 'vigente' : hecho.vigencia === 'derogado' ? 'derogado' : 'consultado'
      return { ...base, normas: conUno(base.normas, `art. ${hecho.articulo} ${hecho.ley} (${vigencia})`, 8) }
    }
    case 'verificacion':
      return { ...base, verificacion: hecho.limpio ? 'citas comprobadas: todo correcto' : 'la verificación marca citas que revisar' }
    case 'archivo':
      return hecho.edicion || hecho.fuentes ? base : anotarRedactado(base, hecho.ruta, hecho.palabras)
    default:
      return h
  }
}

/**
 * Apunta (o marca como acabada) una herramienta en la ficha de su subagente y,
 * al acabar, lo que se ha sacado de ella: frase, búsquedas, resoluciones,
 * archivos con su tamaño y sus palabras. Es un «upsert»: si el fin llega antes
 * que el inicio, la entrada se crea ya acabada y el inicio tardío no la pisa.
 */
async function apuntarActividad(
  $: EngineInterface,
  agente: string,
  id: string,
  herramienta: string,
  args: Record<string, unknown>,
  estado: Actividad['estado'],
  textoResultado = '',
): Promise<void> {
  const tareas = await read($, tareasA)
  if (!tareas.some(t => t.id === agente)) return
  const [config, ahora] = await Promise.all([read($, configA), $.clock.now()])
  const acabada = estado !== 'en curso'
  const hecho = acabada ? hechoDeHerramienta(herramienta, args, estado === 'hecha', textoResultado) : undefined
  const ruta = estado === 'hecha' ? archivoDe(herramienta, args) : undefined
  const contenido = typeof args.content === 'string' ? args.content : undefined
  const corto = herramienta.includes('__') ? (herramienta.split('__').pop() ?? herramienta) : herramienta
  const resultado = acabada ? resultadoDe(hecho, estado === 'hecha') : undefined
  let dicho = ''
  let quien = ''

  await update($, tareasA, lista =>
    lista.map(t => {
      if (t.id !== agente) return t
      const previa = t.actividad.find(a => a.id === id)
      if (previa !== undefined && !acabada) return t
      const actividad =
        previa === undefined
          ? [...t.actividad, { id, texto: narrar(herramienta, args), estado, hora: ahora, ...(resultado !== undefined ? { resultado } : {}) }].slice(-MAX_ACTIVIDAD)
          : t.actividad.map(a => (a.id === id ? { ...a, estado, ...(resultado !== undefined ? { resultado } : {}) } : a))
      let nueva: Tarea = { ...t, actividad, herramientas: previa === undefined ? t.herramientas + 1 : t.herramientas }
      if (!acabada) return nueva
      nueva.hallazgos = sumarHallazgo(nueva.hallazgos, hecho)

      if (corto === 'buscar_sentencias' || corto === 'buscar_por_cita') nueva.busquedas = (nueva.busquedas ?? 0) + 1
      if (hecho?.tipo === 'sentencias') nueva.citas = (nueva.citas ?? 0) + hecho.citas.length
      if (ruta !== undefined) {
        const corta = rutaCorta(ruta)
        const conocido = nueva.archivos.find(a => a.ruta === corta)
        const archivo: Archivo =
          contenido !== undefined
            ? { ruta: corta, bytes: contenido.length, palabras: contarPalabras(contenido) }
            : (conocido ?? { ruta: corta, bytes: 0, palabras: 0 })
        nueva.archivos = [...nueva.archivos.filter(a => a.ruta !== corta), archivo].slice(-MAX_ARCHIVOS)
        if (contenido !== undefined && !/(^|\/)fuentes\//i.test(ruta.replace(/\\/g, '/'))) nueva.palabras = archivo.palabras
      }
      // «Estudia el expediente» solo se comenta la primera vez.
      const yaLoHabiaEstudiado = hecho?.tipo === 'expediente' && t.hallazgos?.expediente === true
      if (hecho !== undefined && !yaLoHabiaEstudiado) {
        const r = conFrase(config, nueva, hecho, ahora)
        nueva = r.tarea
        if (esGrande(hecho)) {
          dicho = r.dicho
          const { oficio, persona } = personaDe(config, t.oficio, t.persona)
          quien = `${oficio.emoji} ${persona.nombre}`
        }
      }
      return nueva
    }),
  )

  if (!acabada) return
  if (dicho !== '') await avisoGrande($, `${quien}: ${dicho}`)
  // Tras un Edit de una sección, se vuelven a contar sus palabras (en segundo plano).
  if (ruta !== undefined && contenido === undefined && /\.md$/i.test(ruta) && /secciones[\\/]/i.test(ruta)) {
    await recontarArchivo($, agente, ruta)
  }
  await refrescarAvance($)
}

/** Vuelve a leer un archivo de sección (solo .md de secciones/) y apunta su tamaño y palabras. */
async function recontarArchivo($: EngineInterface, agente: string, ruta: string): Promise<void> {
  try {
    const texto = await $.fs.read(ruta)
    const corta = rutaCorta(ruta)
    const archivo: Archivo = { ruta: corta, bytes: texto.length, palabras: contarPalabras(texto) }
    await update($, tareasA, lista =>
      lista.map(t =>
        t.id === agente
          ? {
              ...t,
              palabras: archivo.palabras,
              archivos: [...t.archivos.filter(a => a.ruta !== corta), archivo].slice(-MAX_ARCHIVOS),
              hallazgos: anotarRedactado(t.hallazgos, ruta, archivo.palabras),
            }
          : t,
      ),
    )
  } catch (err) {
    depurar($, `recontar ${ruta}: ${mensajeDe(err)}`)
  }
}

/** Abre o cierra el panel. Devuelve la frase para la persona. */
async function alternarPanel($: EngineInterface, forzar?: 'abrir' | 'cerrar'): Promise<string> {
  const abierto = (await $.ui.panes()).some(p => p.id === PANEL)
  if (forzar === 'cerrar' || (forzar === undefined && abierto)) {
    if (abierto) await $.ui.close({ id: PANEL })
    return 'Panel del equipo jurídico cerrado. Vuelve a abrirlo con /equipo.'
  }
  // `focus`: si ya estaba abierto detrás de otro panel, se pone delante.
  const r = await $.ui.open({ id: PANEL, title: TITULO, focus: true })
  return r.isPlaced
    ? 'Panel del equipo jurídico abierto. Pulsa a una persona para ver qué está haciendo.'
    : `Panel del equipo jurídico abierto; se mostrará cuando haya sitio en la pantalla (${r.reason}).`
}

/**
 * Recalcula el porcentaje del escrito con lo que se sabe ahora (señales de la
 * conversación y trabajo del equipo). El porcentaje nunca baja.
 */
async function refrescarAvance($: EngineInterface): Promise<void> {
  const red = await leerRedaccion($)
  if (red === null || red.terminado) return
  const av = calcularAvance(red, delDespacho(await read($, configA), await read($, tareasA)))
  if (av.porcentaje === red.porcentaje && av.fase === red.fase) return
  await update($, redaccionA, r =>
    r === null || r.terminado
      ? r
      : { ...completarRedaccion(r), porcentaje: Math.max(r.porcentaje, av.porcentaje), fase: av.porcentaje >= r.porcentaje ? av.fase : r.fase },
  )
}

/** La redacción guardada, completada si la guardó una versión anterior del mod. */
async function leerRedaccion($: EngineInterface): Promise<Redaccion | null> {
  const red = await read($, redaccionA)
  return red === null ? null : completarRedaccion(red)
}

/** Apunta una herramienta de la conversación principal en la barra del escrito, si la hay. */
async function anotarEnBarra($: EngineInterface, herramienta: string, args: Record<string, unknown>, ok: boolean): Promise<void> {
  const red = await leerRedaccion($)
  if (red === null || red.terminado) return
  const ahora = await $.clock.now()
  await update($, redaccionA, x => (x === null || x.terminado ? x : anotarHerramienta(completarRedaccion(x), herramienta, args, ok, ahora)))
  await refrescarAvance($)
}

/**
 * Lo que dibuja la barra del escrito, ajustado al ancho: el título, el
 * porcentaje del TRABAJO TOTAL y, aparte, el paso actual
 * («📝 Demanda de reclamación ████░░░░ 40 % · ahora: redactando las secciones (3 de 6)»).
 */
function partesAvance(red: Redaccion, ancho: number, ahora: number) {
  const casillas = ancho >= 100 ? 20 : ancho >= 60 ? 14 : 10
  const { llena, vacia } = barra(red.porcentaje, casillas)
  const largo = ancho >= 100 ? 48 : 30
  const titulo = ancho < 60 ? 'Escrito' : red.titulo.length > largo ? `${red.titulo.slice(0, largo - 1)}…` : red.titulo
  const detalle = red.terminado ? `${faseEntregado(red)} en ${duracion((red.fin ?? ahora) - red.inicio)}` : `ahora: ${red.fase}`
  return { icono: red.terminado ? '✅' : '📝', titulo, llena, vacia, porcentaje: `${red.porcentaje} %`, detalle }
}

/** Lee el fondo de la oficina (assets/oficina-isometrica.webp) como data URI. */
async function cargarFondo($: EngineInterface): Promise<void> {
  try {
    const { base64 } = await $.fs.read(`${$.plugin.root}/assets/oficina-isometrica.webp`, { as: 'bytes' })
    fondoOficina = typeof base64 === 'string' && base64.length > 1000 ? `data:image/webp;base64,${base64}` : undefined
  } catch (err) {
    fondoOficina = undefined
    depurar($, `sin fondo de oficina (se dibuja una sencilla): ${mensajeDe(err)}`)
  }
}

/**
 * Lee las imágenes de los personajes (assets/personajes.json). Si no están o
 * no valen, la oficina dibuja ella misma a cada persona.
 */
async function cargarPersonajes($: EngineInterface): Promise<void> {
  try {
    personajes = leerPersonajes(JSON.parse(await $.fs.read(`${$.plugin.root}/assets/personajes.json`)))
    if (personajes === undefined) depurar($, 'personajes.json no trae ninguna imagen válida: se dibujan en la oficina')
  } catch (err) {
    personajes = undefined
    depurar($, `sin imágenes de personajes (se dibujan en la oficina): ${mensajeDe(err)}`)
  }
}

/**
 * La ventana de chat (el director pregunta; contesta quien habló el último,
 * con su última frase real) y el tablero de control de la oficina.
 */
function chatYTablero(config: ConfigEquipo, tareas: readonly Tarea[], red: Redaccion | null, puestos: readonly Puesto[]): { chat?: Chat; tablero: Tablero } {
  const ultima = tareas
    .flatMap(t => (t.frases ?? []).map(f => ({ f, t })))
    .sort((a, b) => a.f.hora - b.f.hora)
    .pop()
  const trabajando = puestos.filter(p => p.estado === 'trabajando').length
  const tablero: Tablero = {
    trabajando,
    ...(red !== null ? { escrito: red.titulo, porcentaje: red.porcentaje } : {}),
    estado: red?.terminado === true ? 'ESCRITO ENTREGADO' : trabajando > 0 ? 'OPERATIVO' : 'EN ESPERA',
  }
  if (ultima === undefined) return { tablero }
  const { oficio, persona } = personaDe(config, ultima.t.oficio, ultima.t.persona)
  const chat: Chat = {
    director: config.director,
    pregunta: preguntaDelDirector(
      persona.nombre,
      // Al contrario se le pregunta por nuestro escrito aunque ya esté entregado (es cuando lo ataca).
      red !== null && (!red.terminado || oficio.rival === true) ? red.titulo : undefined,
      ultima.t.descripcion,
      oficio.rival === true,
    ),
    quien: persona.nombre,
    respuesta: ultima.f.texto,
    id: persona.id,
    genero: persona.genero,
  }
  return { chat, tablero }
}

/**
 * Abre el panel directamente en la ficha COMPLETA de una persona: es lo que
 * promete el botón «Ver más» de la conversación. Si el panel ya enseñaba esa
 * ficha recogida, se ve cómo se despliega.
 *
 * Con `focus` el panel se pone DELANTE. Sin él, si el panel ya estaba abierto
 * detrás de otro (en escritorio el lateral tiene pestañas: otros mods, el
 * navegador, archivos…), la ficha cambiaba por detrás y «Ver más» parecía no
 * hacer nada. El aviso confirma la pulsación aunque la app no ceda el foco.
 */
async function abrirFicha($: EngineInterface, idPersona: string, nombre?: string): Promise<void> {
  try {
    await update($, seleccionA, () => idPersona)
    await update($, fichaAmpliadaA, () => true)
    const r = await $.ui.open({ id: PANEL, title: TITULO, focus: true })
    if (!r.isPlaced) depurar($, `abrir ficha: el panel no se ha podido mostrar (${r.reason})`)
    if (nombre !== undefined) {
      try {
        $.ui.toast(`Ficha de ${nombre} abierta en el panel «${TITULO}»`)
      } catch {
        // Sin aviso no pasa nada: la ficha ya está elegida.
      }
    }
  } catch (err) {
    depurar($, `abrir ficha: ${mensajeDe(err)}`)
  }
}

/** Texto de /equipo ayuda: las personas, sus oficios y sus palabras. */
function textoAyuda(config: ConfigEquipo, raiz: string): string {
  // El abogado contrario no es del despacho: no cuenta.
  const personas = config.oficios.filter(o => o.rival !== true).reduce((n, o) => n + o.personas.length, 0)
  // A qué se dedica cada persona, dicho con lo que se le ve hacer.
  const lineas = config.oficios.map(o => {
    const tareas = [...new Set(o.acciones.map(x => x.gerundio).filter(g => g !== 'trabajando'))].slice(0, 3)
    return `  ${o.emoji} ${o.personas.map(p => p.nombre).join(', ')} (${o.oficio})${tareas.length > 0 ? `: ${tareas.join(', ')}…` : ''}`
  })
  return [
    `Equipo jurídico: ${personas} personas. La oficina empieza vacía: cada una entra cuando le llega su primera tarea; si hay más tareas que personas, la misma persona lleva varias.`,
    ...lineas,
    `  Lo que no encaja con nadie va a ${config.oficios.find(o => o.id === config.porDefecto)?.personas[0]?.nombre ?? config.porDefecto}. Si Claude nombra a alguien al encargar la tarea («Elena: revisar las citas»), es suya.`,
    `  Tono de las frases: ${config.tono}. Avisos emergentes: ${config.avisosEmergentes ? 'sí' : 'no'}.`,
    '',
    'Comandos: /equipo (abre o cierra el panel; pulsa a una persona para ver su ficha) · /equipo oficina · /equipo lista · /equipo recargar · /equipo limpiar · /equipo ayuda',
    `Para cambiar nombres, oficios o el tono: el archivo «equipo.json» de la carpeta ${raiz.includes('\\') ? `${raiz}\\config` : `${raiz}/config`}. Después, /equipo recargar.`,
  ].join('\n')
}

/**
 * Cada pocos segundos, mientras alguien trabaja: avanza el reloj (tiempos y
 * animación de la terminal), apunta el estado de cada agente según Claude
 * Code y cierra las tareas que `$.agent.list()` ya da por acabadas aunque se
 * perdiera su fin de turno.
 */
async function latido($: EngineInterface): Promise<void> {
  try {
    const tareas = await read($, tareasA)
    const activas = tareas.filter(t => t.estado === 'trabajando')
    if (activas.length === 0) return
    const ahora = await $.clock.now()
    await update($, relojA, () => ahora)

    // Los agentes de un flujo no salen en $.agent.list(): solo se miran los sueltos.
    if (!activas.some(t => t.flujo === undefined)) return
    const estados = new Map<string, string>()
    for (const agente of await $.agent.list()) estados.set(agente.id, agente.status)
    if (estados.size === 0) return
    const cambia = activas.some(t => estados.has(t.id) && (estados.get(t.id) !== t.estadoAgente || estadoPorPalabra(estados.get(t.id)) !== undefined))
    if (!cambia) return
    await update($, tareasA, lista =>
      lista.map(t => {
        const palabra = t.estado === 'trabajando' && t.flujo === undefined ? estados.get(t.id) : undefined
        if (palabra === undefined) return t
        const cierre = estadoPorPalabra(palabra)
        return cierre === undefined ? { ...t, estadoAgente: palabra } : { ...t, estado: cierre, fin: ahora, estadoAgente: palabra }
      }),
    )
    if (!(await read($, tareasA)).some(t => t.estado === 'trabajando')) programarRetirada($)
  } catch (err) {
    depurar($, `latido: ${mensajeDe(err)}`)
  }
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

export const register: Register = on => {
  // Al empezar la sesión (y tras cada recarga del mod): equipo, comando y latido.
  on('session.start', async ($, e, next) => {
    try {
      const { config, aviso } = await cargarConfig($)
      await update($, configA, () => config)
      if (aviso !== undefined) $.ui.toast(`Equipo jurídico: ${aviso}`, { timeoutMs: 8000 })
      const personas = config.oficios.reduce((n, o) => n + o.personas.length, 0)
      depurar($, `equipo cargado: ${personas} personas, tono ${config.tono}`)
      await cargarFondo($)
      await cargarPersonajes($)
    } catch (err) {
      depurar($, `no se pudo cargar el equipo: ${mensajeDe(err)}`)
    }
    try {
      await $.command.register({
        name: 'equipo',
        description: 'Abre o cierra el panel del equipo jurídico (también: oficina, lista, recargar, limpiar, ayuda)',
        argumentHint: '[oficina|lista|abrir|cerrar|recargar|limpiar|ayuda]',
      })
    } catch (err) {
      depurar($, `no se pudo registrar /equipo: ${mensajeDe(err)}`)
    }
    try {
      $.clock.every(LATIDO_MS, () => {
        void latido($)
      })
    } catch (err) {
      depurar($, `no se pudo poner el latido: ${mensajeDe(err)}`)
    }
    return next(e)
  })

  // Un subagente va a empezar (Agent o un agent() de un Workflow): se decide
  // su oficio y su persona, que entra en la oficina si aún no estaba. Se deja
  // empezar tal cual.
  on('agent.spawn', async ($, e, next) => {
    const r = await next(e)
    if (r.deny !== undefined) return r
    try {
      const config = await read($, configA)
      const ahora = await $.clock.now()

      // Un subagente que vuelve a trabajar (SendMessage) conserva a su persona.
      if (e.resume !== undefined) {
        const previo = e.resume.agentId
        const tareas = await read($, tareasA)
        if (tareas.some(t => t.id === previo)) {
          await update($, tareasA, lista =>
            lista.map(t => {
              if (t.id !== previo) return t
              const { fin: _fin, resumen: _resumen, ...resto } = t
              return { ...resto, estado: 'trabajando' as const }
            }),
          )
          depurar($, `reanuda ${previo}`)
          return r
        }
      }

      // Si no trabajaba nadie, empieza una tanda nueva: lo terminado antes ya
      // no vuelve a la banda (la oficina y el panel lo siguen mostrando).
      if (!(await read($, tareasA)).some(t => t.estado === 'trabajando')) await update($, retiradaA, () => ahora)

      const id = r.agentId ?? `${e.tool_use_id}#${e.workflow?.agentIndex ?? 'x'}`
      const reparto = asignar(config, { descripcion: e.description, prompt: e.prompt, tipo: e.subagentType })
      const extension = extensionPedida(e.prompt)
      // «Elena: revisar la coherencia» se guarda como «Revisar la coherencia».
      const descripcion = descripcionLimpia(config, e.description || 'tarea').slice(0, 200) || 'tarea'
      // Alguien del despacho se pone con el escrito: si estaba en pausa, vuelve a la banda.
      if (reparto.oficio.rival !== true) {
        await update($, redaccionA, x => {
          if (x === null || x.terminado || x.pausa === undefined) return x
          const { pausa: _pausa, ...resto } = x
          return { ...resto, ultimo: ahora }
        })
      }
      let elegida = ''
      let entra = false
      await update($, tareasA, lista => {
        // La misma tarea mantiene siempre a la misma persona.
        const previa = lista.find(t => t.id === id)
        const persona = previa !== undefined ? previa.persona : (reparto.persona ?? elegirPersona(reparto.oficio, lista).id)
        elegida = persona
        entra = !lista.some(t => t.persona === persona)
        const base: Tarea = {
          id,
          toolUseId: e.tool_use_id,
          oficio: previa?.oficio ?? reparto.oficio.id,
          persona,
          accion: previa?.accion ?? reparto.accion,
          descripcion,
          ...(reparto.seccion !== undefined ? { seccion: reparto.seccion } : {}),
          encargo: e.prompt.slice(0, LARGO_ENCARGO),
          ...(extension !== undefined ? { extension } : {}),
          tipo: e.subagentType,
          ...(e.workflow !== undefined ? { flujo: e.workflow.runId } : {}),
          estado: 'trabajando',
          inicio: previa?.inicio ?? ahora,
          actividad: previa?.actividad ?? [],
          herramientas: previa?.herramientas ?? 0,
          busquedas: previa?.busquedas ?? 0,
          citas: previa?.citas ?? 0,
          archivos: previa?.archivos ?? [],
          frases: previa?.frases ?? [],
        }
        const tarea = previa === undefined ? conFrase(config, base, { tipo: 'empieza', descripcion: base.descripcion }, ahora).tarea : base
        return [...lista.filter(t => t.id !== id), tarea].slice(-MAX_TAREAS)
      })
      await update($, bandaOcultaA, () => false)
      await update($, relojA, () => ahora)
      await refrescarAvance($)
      const { oficio, persona } = personaDe(config, reparto.oficio.id, elegida)
      if (entra) avisoEntrada($, `${oficio.emoji} ${persona.nombre}`, config.avisosEmergentes)
      depurar(
        $,
        `alta ${id} -> ${persona.nombre} (${oficio.grupo}, ${reparto.puntos} puntos) «${descripcion}» tipo=${e.subagentType}${reparto.seccion !== undefined ? ` ${reparto.seccion}` : ''}${extension !== undefined ? ` ${extension} palabras` : ''}${e.workflow ? ` flujo=${e.workflow.runId}#${e.workflow.agentIndex}` : ''}`,
      )

      // La primera vez que alguien se pone a trabajar, se abre el panel.
      if (config.abrirPanelAlEmpezar && !(await read($, panelAutoAbiertoA))) {
        await update($, panelAutoAbiertoA, () => true)
        void $.ui.open({ id: PANEL, title: TITULO }).catch(err => depurar($, `abrir panel: ${mensajeDe(err)}`))
      }
    } catch (err) {
      depurar($, `agent.spawn: ${mensajeDe(err)}`)
    }
    return r
  }).catch(($, e, next) => next(e))

  // Un turno de un subagente empieza (por ejemplo, un compañero que despierta).
  on('turn.start', async ($, e, next) => {
    const r = await next(e)
    if (e.agentId === undefined) return r
    try {
      const id = e.agentId
      const tareas = await read($, tareasA)
      if (tareas.some(t => t.id === id && t.estado !== 'trabajando')) {
        await update($, tareasA, lista =>
          lista.map(t => {
            if (t.id !== id) return t
            const { fin: _fin, ...resto } = t
            return { ...resto, estado: 'trabajando' as const }
          }),
        )
      }
    } catch (err) {
      depurar($, `turn.start: ${mensajeDe(err)}`)
    }
    return r
  })

  // El turno de un subagente termina: su persona ha acabado (o ha parado) y lo
  // cuenta. El turno principal: si había un escrito pedido, la barra llega al 100 %.
  on('turn.complete', async ($, e, next) => {
    const r = await next(e)
    try {
      if (e.agentId !== undefined) {
        await cerrarTarea($, e.agentId, estadoPorMotivo(e.reason), e.answer)
        await refrescarAvance($)
        depurar($, `fin ${e.agentId} (${e.reason})`)
      } else {
        // Antes de decidir, que termine de apuntarse lo último que hizo Claude.
        await colaDeLaBarra
        const [red, tareas] = await Promise.all([leerRedaccion($), read($, tareasA)])
        const ahora = await $.clock.now()
        if (red !== null && !red.terminado && e.reason === 'answer' && hayEscrito(red, tareas)) {
          await update($, redaccionA, x =>
            x === null || x.terminado ? x : { ...completarRedaccion(x), terminado: true, porcentaje: 100, fase: faseEntregado(red), fin: ahora, ultimo: ahora },
          )
          await avisoGrande($, `✅ ${red.titulo}: terminado y entregado`)
          programarRetirada($)
          depurar($, `escrito terminado: ${red.titulo}`)
        } else if (red !== null && !red.terminado && e.reason === 'answer' && sinSenalesDeEscrito(red, tareas)) {
          // Era una pregunta, no un encargo: la barra se retira.
          await update($, redaccionA, () => null)
          depurar($, `barra retirada (sin escrito): ${red.titulo}`)
        } else if (red !== null && !red.terminado) {
          await refrescarAvance($)
          // Claude ha dejado de trabajar sin entregar el escrito. Si tampoco
          // trabaja nadie del despacho, la barra no se queda colgada: pasa a
          // «en pausa» y se retira al minuto; vuelve sola si se sigue con él.
          if (!delDespacho(await read($, configA), tareas).some(t => t.estado === 'trabajando')) {
            await update($, redaccionA, x => (x === null || x.terminado || x.pausa !== undefined ? x : { ...completarRedaccion(x), pausa: ahora }))
            programarRetirada($)
            depurar($, `barra en pausa: ${red.titulo}`)
          }
        }
      }
    } catch (err) {
      depurar($, `turn.complete: ${mensajeDe(err)}`)
    }
    return r
  })

  // Se envía un prompt: si pide redactar un escrito judicial, empieza la barra
  // de avance. El prompt sigue exactamente igual.
  on('prompt.submit', async ($, e, next) => {
    const r = await next(e)
    if (r.drop !== undefined || e.isMeta === true || e.command !== undefined) return r
    // Los avisos de tareas, los mensajes de otras sesiones y los programados
    // no los escribe la persona: no piden escritos ni retiran nada.
    if (ORIGENES_AJENOS.has(e.origin?.kind ?? '')) return r
    try {
      const ahora = await $.clock.now()
      // Un mensaje nuevo retira de la banda lo que ya había terminado.
      await update($, retiradaA, () => ahora)
      const titulo = pideEscrito(e.text)
      const documento = titulo ?? tituloDeDocumento(e.text)
      ultimoPedido = documento !== undefined ? { titulo: documento, hora: ahora } : undefined
      if (titulo !== undefined) {
        await update($, redaccionA, () => nuevaRedaccion(titulo, ahora))
        await update($, bandaOcultaA, () => false)
        depurar($, `escrito pedido: ${titulo}`)
      } else {
        // Un escrito ya terminado (o abandonado hace rato) deja de mostrarse.
        await update($, redaccionA, x => (x !== null && (x.terminado || ahora - x.ultimo > OLVIDO_MS) ? null : x))
      }
    } catch (err) {
      depurar($, `prompt.submit: ${mensajeDe(err)}`)
    }
    return r
  }).catch(($, e, next) => next(e))

  // Se carga una skill de redactar escritos (redaccion-rapida, recurso-apelacion…):
  // cuenta como avance y, si no había barra, la empieza.
  on('skill.prompt', async ($, e, next) => {
    const r = await next(e)
    try {
      if (esSkillDeEscrito(e.skill)) {
        const ahora = await $.clock.now()
        // El título sale de lo que pidió la persona («Carta al cliente»); si
        // no lo dijo, del nombre de la skill («Recurso de apelación»).
        const pedido = ultimoPedido !== undefined && ahora - ultimoPedido.hora < PEDIDO_VALE_MS ? ultimoPedido.titulo : undefined
        await update($, redaccionA, x => {
          if (x === null || x.terminado) return { ...nuevaRedaccion(pedido ?? tituloDeSkill(e.skill), ahora), skill: true }
          const { pausa: _pausa, ...resto } = completarRedaccion(x)
          return { ...resto, skill: true, ultimo: ahora }
        })
        await update($, bandaOcultaA, () => false)
        await refrescarAvance($)
      }
    } catch (err) {
      depurar($, `skill.prompt: ${mensajeDe(err)}`)
    }
    return r
  }).catch(($, e, next) => next(e))

  // Cada herramienta: la de un subagente se apunta en su ficha (y lo que saca,
  // en su frase); la de la conversación principal cuenta para la barra. La
  // herramienta NUNCA espera al mod: solo se espera a `next`; lo demás va en
  // segundo plano.
  on('tool.call', async ($, e, next) => {
    const agente = e.agentId
    const herramienta = String(e.tool)
    const args = argumentosDe(e)
    const idLlamada = e.tool_use_id

    if (agente === undefined) {
      const r = await next(e)
      const ok = r.deny === undefined && r.isError !== true
      colaDeLaBarra = colaDeLaBarra.then(() => anotarEnBarra($, herramienta, args, ok)).catch(err => depurar($, `barra: ${mensajeDe(err)}`))
      return r
    }

    void apuntarActividad($, agente, idLlamada, herramienta, args, 'en curso').catch(err =>
      depurar($, `herramienta (inicio): ${mensajeDe(err)}`),
    )
    const r = await next(e)
    const fallo = r.deny !== undefined || r.isError === true
    const texto = typeof r.text === 'string' ? r.text : ''
    void apuntarActividad($, agente, idLlamada, herramienta, args, fallo ? 'error' : 'hecha', texto).catch(err =>
      depurar($, `herramienta (fin): ${mensajeDe(err)}`),
    )
    return r
  }).catch(($, e, next) => next(e))

  // Un encargo grande (Workflow): se apunta su nombre para el panel. La
  // llamada sigue exactamente igual.
  on('tool.call', { tool: 'Workflow' }, async ($, e, next) => {
    try {
      const meta = metaDeFlujo(e.script, e.name)
      const ahora = await $.clock.now()
      await update($, encargosA, lista =>
        [
          ...lista.filter(x => x.toolUseId !== e.tool_use_id),
          { toolUseId: e.tool_use_id, nombre: meta.nombre, descripcion: meta.descripcion, inicio: ahora },
        ].slice(-MAX_ENCARGOS),
      )
    } catch (err) {
      depurar($, `Workflow: ${mensajeDe(err)}`)
    }
    return next(e)
  }).catch(($, e, next) => next(e))

  // /clear empieza de cero también para el equipo: la oficina se vacía.
  on('session.end', async ($, e, next) => {
    if (e.reason === 'clear') {
      try {
        await update($, tareasA, () => [])
        await update($, encargosA, () => [])
        await update($, bandaOcultaA, () => false)
        await update($, seleccionA, () => '')
        await update($, redaccionA, () => null)
      } catch (err) {
        depurar($, `session.end: ${mensajeDe(err)}`)
      }
    }
    return next(e)
  })

  // /equipo [oficina|lista|abrir|cerrar|recargar|limpiar|ayuda]
  on('command.run', { command: 'equipo' }, async ($, e) => {
    try {
      const orden = e.args.trim().toLowerCase()
      if (orden === 'recargar') {
        const { config, aviso } = await cargarConfig($)
        await update($, configA, () => config)
        // También se vuelven a leer el fondo y los personajes de la oficina.
        await cargarFondo($)
        await cargarPersonajes($)
        const nombres = config.oficios.flatMap(o => o.personas.map(p => `${p.nombre} (${o.oficio})`)).join(', ')
        return { text: `Equipo recargado (tono ${config.tono}): ${nombres}.${aviso !== undefined ? `\nAviso: ${aviso}.` : ''}` }
      }
      if (orden === 'limpiar') {
        await update($, tareasA, lista => lista.filter(t => t.estado === 'trabajando'))
        await update($, encargosA, () => [])
        await update($, redaccionA, x => (x !== null && x.terminado ? null : x))
        return { text: 'Quitadas del panel las tareas terminadas.' }
      }
      if (orden === 'ayuda' || orden === 'help') {
        return { text: textoAyuda(await read($, configA), $.plugin.root) }
      }
      // «oficina» y «lista» (también «ver la oficina», «Lista.»…) SIEMPRE abren
      // el panel (o lo dejan abierto) en esa vista; nunca lo cierran.
      const vista = /\boficina\b/.test(orden) ? 'oficina' : /\blista\b/.test(orden) ? 'lista' : undefined
      if (vista !== undefined) {
        await update($, vistaA, () => vista)
        await update($, seleccionA, () => '')
        const texto = await alternarPanel($, 'abrir')
        return { text: `${texto} Vista: ${vista === 'oficina' ? 'Oficina' : 'Lista'}.` }
      }
      // Solo «/equipo» a secas alterna, y solo «cerrar» cierra; cualquier otra cosa abre.
      if (orden === 'cerrar') return { text: await alternarPanel($, 'cerrar') }
      if (orden === '') return { text: await alternarPanel($) }
      return { text: await alternarPanel($, 'abrir') }
    } catch (err) {
      return { text: `Equipo jurídico: algo ha fallado (${mensajeDe(err)}).` }
    }
  })

  // ---------------------------------------------------------------------------
  // Dibujo
  // ---------------------------------------------------------------------------

  // El PANEL «Equipo jurídico»: la oficina o la lista y, si se ha pulsado a
  // alguien, su ficha.
  on('ui.render', { component: 'Pane', requestId: PANEL }, async ($, e, next) => {
    try {
      const { Box, Text, Button } = $.ui.resolve(e)
      const [config, tareas, encargos, seleccion, red, vista, ampliada, reloj] = await Promise.all([
        read($, configA),
        read($, tareasA),
        read($, encargosA),
        read($, seleccionA),
        read($, redaccionA),
        read($, vistaA),
        read($, fichaAmpliadaA),
        read($, relojA), // suscribe el panel al reloj: el tiempo avanza solo
      ])
      const ahora = await $.clock.now()
      const ancho = e.props.bodyColumns
      const estrecho = ancho < 44
      const escritorio = e.surface === 'desktop' || e.surface === 'vscode'
      // Cada ficha se abre recogida: «Ver más» la despliega.
      const verFicha = (id: string) => async () => {
        await update($, fichaAmpliadaA, () => false)
        await update($, seleccionA, () => id)
      }

      // Cada tarea con su persona y su oficio ya resueltos.
      const conPersona = tareas.map(t => ({ t, ...personaDe(config, t.oficio, t.persona) }))
      const trabajando = tareas.filter(t => t.estado === 'trabajando').length
      const hechas = tareas.length - trabajando
      const nombreEncargo = (toolUseId: string): string | undefined => encargos.find(x => x.toolUseId === toolUseId)?.nombre

      // ---- Ficha de una persona ---------------------------------------------
      const elegida =
        seleccion !== ''
          ? (conPersona.find(x => x.persona.id === seleccion) ??
            config.oficios.flatMap(o => o.personas.map(persona => ({ oficio: o, persona }))).find(x => x.persona.id === seleccion))
          : undefined
      if (elegida !== undefined) {
        const { oficio, persona } = elegida
        const suyas = conPersona.filter(x => x.persona.id === persona.id).map(x => x.t).reverse()
        const activas = suyas.filter(t => t.estado === 'trabajando')
        const ultima = activas[0] ?? suyas[0]
        const estadoGeneral =
          ultima === undefined
            ? `${persona.nombre} está disponible.`
            : `${frase(persona, accionDe(oficio, ultima.accion), ultima.estado)}${activas.length > 1 ? ` (lleva ${activas.length} tareas a la vez)` : ''}.`
        const volver = async () => {
          await update($, seleccionA, () => '')
          await update($, fichaAmpliadaA, () => false)
        }
        // «Ver más» y «Ver menos» PONEN un valor fijo en vez de darle la vuelta:
        // si la app entrega la pulsación dos veces (o la ficha está abierta en
        // dos sitios), el resultado es el mismo y no se queda como estaba. Cada
        // uno lleva su propia clave para que el botón nativo del escritorio se
        // dibuje de nuevo con su texto.
        const verMas = () => update($, fichaAmpliadaA, () => true)
        const verMenos = () => update($, fichaAmpliadaA, () => false)
        const marco = estrecho ? {} : { borderStyle: 'round' as const, borderColor: oficio.color, paddingX: 1 }
        const feed = suyas
          .flatMap(t => t.frases ?? [])
          .sort((a, b) => b.hora - a.hora)
          .slice(0, ampliada ? MAX_FRASES : 4)
        const maxTareas = ampliada ? 10 : 4
        const maxPasos = ampliada ? MAX_ACTIVIDAD : 4
        // Lo primero que cambia al pulsar «Ver más», arriba del todo.
        const pasosTotales = suyas.reduce((n, t) => n + t.herramientas, 0)
        const documentos = new Set(suyas.flatMap(t => t.archivos.map(a => a.ruta))).size
        const fichaCompleta = [
          `${suyas.length} ${suyas.length === 1 ? 'tarea' : 'tareas'}`,
          `${pasosTotales} ${pasosTotales === 1 ? 'paso dado' : 'pasos dados'}`,
          `${documentos} ${documentos === 1 ? 'documento preparado' : 'documentos preparados'}`,
        ].join(' · ')

        return (
          <Box flexDirection="column">
            <Box flexDirection="row" gap={1} flexWrap="wrap">
              <Button key="volver" label="← Volver al equipo" onPress={volver} />
              {suyas.length > 0 &&
                (ampliada ? (
                  <Button key="ver-menos" label="Ver menos" onPress={verMenos} />
                ) : (
                  <Button key="ver-mas" label="Ver más" onPress={verMas} />
                ))}
            </Box>
            <Text wrap="truncate-end">
              <Text color={oficio.color} weight="semibold">
                {avatar(oficio, persona, estrecho)} {persona.nombre}
              </Text>
              <Text dimColor>
                {' · '}
                {oficio.oficio} · {oficio.grupo}
              </Text>
            </Text>
            <Text wrap="wrap">{estadoGeneral}</Text>
            {ampliada && suyas.length > 0 && (
              <Text wrap="wrap">
                📋 <Text weight="semibold">Ficha completa:</Text> {fichaCompleta}. Debajo, las instrucciones que recibió y lo que ha preparado.
              </Text>
            )}
            {feed.length > 0 && (
              <Box flexDirection="column">
                <Text weight="semibold">💬 En directo</Text>
                {feed.map(f => (
                  <Text wrap="wrap">
                    {f.grande ? '⭐ ' : '  '}«{f.texto}»<Text dimColor> · hace {duracion(ahora - f.hora)}</Text>
                  </Text>
                ))}
                <Text dimColor wrap="wrap">
                  Las frases celebran lo que van encontrando las búsquedas; no son una valoración jurídica de la sentencia.
                </Text>
              </Box>
            )}
            {suyas.length === 0 && <Text dimColor>No ha llevado ninguna tarea en esta sesión.</Text>}
            {suyas.slice(0, maxTareas).map((t, i) => {
              const flujo = t.flujo !== undefined ? nombreEncargo(t.toolUseId) : undefined
              const pasos = t.actividad.slice(-maxPasos)
              const ocultos = t.herramientas - pasos.length
              // «Ahora mismo» solo si hay un paso en marcha: el último ya hecho está en el diario, justo debajo.
              const ahoraMismo = t.estado === 'trabajando' ? t.actividad.filter(a => a.estado === 'en curso').pop() : undefined
              const pct = t.extension !== undefined && (t.palabras ?? 0) > 0 ? Math.min(100, Math.round(((t.palabras ?? 0) / t.extension) * 100)) : undefined
              // Lo que ha conseguido, contado como en un despacho.
              const hallazgo = t.hallazgos
              const conseguido: string[] = [
                ...(hallazgo?.expediente === true ? ['Ha estudiado el expediente del caso'] : []),
                ...(hallazgo !== undefined && hallazgo.sentencias.length > 0 ? [`Jurisprudencia encontrada: ${hallazgo.sentencias.join(', ')}`] : []),
                ...(hallazgo !== undefined && hallazgo.leidas.length > 0 ? [`Sentencias leídas a fondo: ${hallazgo.leidas.join(', ')}`] : []),
                ...(hallazgo !== undefined && hallazgo.normas.length > 0 ? [`Normas comprobadas: ${hallazgo.normas.join(', ')}`] : []),
                ...(hallazgo !== undefined && hallazgo.redactado.length > 0 ? [`Ha redactado ${hallazgo.redactado.join('; ')}`] : []),
                ...(hallazgo?.verificacion !== undefined ? [`${hallazgo.verificacion.charAt(0).toUpperCase()}${hallazgo.verificacion.slice(1)}`] : []),
              ]
              const ritmo = [
                `lleva ${tiempoDe(t, ahora)}`,
                `${t.herramientas} ${t.herramientas === 1 ? 'paso dado' : 'pasos dados'}`,
                ...((t.busquedas ?? 0) > 0 ? [`${t.busquedas} ${t.busquedas === 1 ? 'búsqueda' : 'búsquedas'} de jurisprudencia`] : []),
                estadoLegible(t.estadoAgente, t.estado === 'trabajando'),
              ].join(' · ')
              const informe = t.resumen === undefined ? undefined : informeLimpio(t.resumen)
              const informeVisible = informe === undefined ? undefined : ampliada || informe.length <= 320 ? informe : `${informe.slice(0, 319)}…`
              const titulo = t.seccion !== undefined ? t.seccion.replace(/\.$/, '') : `«${t.descripcion}»`
              return (
                <Box key={`tarea-${i}`} flexDirection="column" {...marco}>
                  <Text wrap="wrap">
                    {iconoDe(t.estado)} <Text weight="semibold">{titulo}</Text>
                    <Text dimColor>
                      {' · '}
                      {fraseSinNombre(accionDe(oficio, t.accion), t.estado)}
                    </Text>
                  </Text>
                  {/* El encargo solo se repite si añade algo al título de arriba (la extensión pedida). */}
                  {t.extension !== undefined && (
                    <Text wrap="wrap">
                      🎯 <Text weight="semibold">Su encargo:</Text> {encargoResumido(t.descripcion, t.seccion, t.extension)}
                    </Text>
                  )}
                  {/* Lo que añade «Ver más», justo debajo del encargo para que se vea al momento. */}
                  {ampliada && t.encargo !== '' && (
                    <Text wrap="wrap">
                      📨 <Text weight="semibold">Instrucciones que recibió:</Text> «{t.encargo}»
                    </Text>
                  )}
                  {ampliada && t.archivos.length > 0 && (
                    <Text wrap="wrap">
                      📂 <Text weight="semibold">Documentos que ha preparado:</Text>{' '}
                      {t.archivos.map(a => `${documentoEnFrase(a.ruta)}${a.palabras > 0 ? ` (${a.palabras} palabras)` : ''}`).join(', ')}
                    </Text>
                  )}
                  {ampliada && flujo !== undefined && <Text dimColor>Forma parte del encargo «{flujo}».</Text>}
                  {pct !== undefined && t.extension !== undefined && (
                    <Text wrap="truncate-end">
                      📈 <Text weight="semibold">Avance (orientativo):</Text> <Text color="success">{barra(pct, 12).llena}</Text>
                      <Text dimColor>{barra(pct, 12).vacia}</Text> {t.palabras} de {t.extension} palabras ({pct} %)
                    </Text>
                  )}
                  {conseguido.length > 0 && <Text weight="semibold">⚖️ Lo que ha conseguido:</Text>}
                  {conseguido.map(c => (
                    <Text wrap="wrap">
                      {'  • '}
                      {c}
                    </Text>
                  ))}
                  {ahoraMismo !== undefined && (
                    <Text wrap="wrap">
                      👉 <Text weight="semibold">Ahora mismo:</Text> {ahoraMismo.texto}
                    </Text>
                  )}
                  <Text dimColor wrap="wrap">
                    ⏱ {ritmo}
                  </Text>
                  {pasos.length > 0 && <Text weight="semibold">📒 Diario de trabajo:</Text>}
                  {pasos.map(a => (
                    <Text wrap="wrap" dimColor={a.estado !== 'en curso'}>
                      {'  '}
                      {iconoActividad(a)} {a.texto}
                      {a.resultado !== undefined ? ` → ${a.resultado}` : ''}
                    </Text>
                  ))}
                  {ocultos > 0 && <Text dimColor>{`  … y ${ocultos} pasos anteriores${ampliada ? '' : ' (Ver más)'}`}</Text>}
                  {informeVisible !== undefined && (
                    <Text wrap="wrap">
                      📝 <Text weight="semibold">Su informe:</Text> «{informeVisible}»
                    </Text>
                  )}
                </Box>
              )
            })}
            {suyas.length > maxTareas && <Text dimColor>{`… y ${suyas.length - maxTareas} tareas más${ampliada ? '' : ' (Ver más)'}`}</Text>}
            {suyas.length > 1 && <Button key="volver-abajo" label="← Volver" onPress={volver} />}
          </Box>
        )
      }

      // ---- Cabecera común: resumen, barra del escrito, encargo y pestañas ----
      const encargoVivo = [...encargos]
        .reverse()
        .find(x => tareas.some(t => t.toolUseId === x.toolUseId && t.estado === 'trabajando'))
      const avance = red !== null ? partesAvance(red, ancho, ahora) : undefined
      const cabecera = (
        <Box flexDirection="column">
          <Text wrap="truncate-end">
            <Text weight="semibold">{estrecho ? 'Equipo' : `👥 ${TITULO}`}</Text>
            <Text dimColor>
              {' · '}
              {trabajando} {trabajando === 1 ? 'tarea en marcha' : 'tareas en marcha'} · {hechas} {hechas === 1 ? 'terminada' : 'terminadas'}
            </Text>
          </Text>
          {avance !== undefined && (
            <Text wrap="wrap">
              {avance.icono} <Text weight="semibold">{avance.titulo}</Text> <Text color="success">{avance.llena}</Text>
              <Text dimColor>{avance.vacia}</Text> <Text weight="semibold">{avance.porcentaje}</Text>
              <Text dimColor> · {avance.detalle}</Text>
            </Text>
          )}
          {encargoVivo !== undefined && (
            <Text dimColor wrap="truncate-end">
              Encargo «{encargoVivo.nombre}»{encargoVivo.descripcion !== '' ? `: ${encargoVivo.descripcion}` : ''}
            </Text>
          )}
          <Box flexDirection="row" gap={1}>
            <Button
              key="vista-oficina"
              label="🏢 Oficina"
              {...(vista === 'oficina' ? { variant: 'primary' as const } : {})}
              onPress={() => update($, vistaA, () => 'oficina')}
            />
            <Button
              key="vista-lista"
              label="☰ Lista"
              {...(vista === 'lista' ? { variant: 'primary' as const } : {})}
              onPress={() => update($, vistaA, () => 'lista')}
            />
          </Box>
        </Box>
      )
      const pie = (
        <Box flexDirection="row" gap={1}>
          <Button key="limpiar" label="Limpiar terminadas" onPress={() => update($, tareasA, lista => lista.filter(t => t.estado === 'trabajando'))} />
          <Button key="cerrar" label="Cerrar" role="dismiss" onPress={() => $.ui.close({ id: PANEL })} />
        </Box>
      )

      // ---- Vista OFICINA ------------------------------------------------------
      if (vista === 'oficina') {
        const puestos = puestosDe(config, tareas, ahora)
        const pista = puestos.length > 0 ? <Text dimColor>Pulsa a una persona para ver qué está haciendo.</Text> : undefined

        const { chat, tablero } = chatYTablero(config, tareas, red, puestos)

        if (e.surface === 'desktop' || e.surface === 'vscode') {
          // Escritorio: con sitio, la oficina isométrica en pixel art (fondo
          // generado + personas, etiquetas, chat y tablero en SVG); en un panel
          // estrecho, la oficina compacta. Debajo, un botón por persona.
          const { Svg } = $.ui.resolve(e)
          const datos = {
            personas: puestos,
            director: config.director,
            generoDirector: config.generoDirector,
            tablero,
            ...(chat !== undefined ? { chat } : {}),
            ...(fondoOficina !== undefined ? { fondo: fondoOficina } : {}),
            ...(personajes !== undefined ? { personajes } : {}),
          }
          const escena =
            ancho >= 36 ? (
              <Svg source={escenaSvg(datos)} alt={escenaTexto(datos)} />
            ) : (
              <Svg source={oficinaSvg(puestos, 2)} alt={oficinaTexto(puestos)} />
            )
          return (
            <Box flexDirection="column">
              {cabecera}
              {escena}
              {pista}
              <Box flexDirection="row" gap={1} flexWrap="wrap">
                {puestos.map(p => (
                  <Button key={`persona-${p.id}`} label={`${iconoPuesto(p)} ${p.emoji} ${p.nombre}`} onPress={verFicha(p.id)} />
                ))}
              </Box>
              {pie}
            </Box>
          )
        }

        // Terminal: un puesto de texto por persona; los puntos «teclean» con el latido.
        const puntos = ['·  ', '·· ', '···'][Math.floor(reloj / LATIDO_MS) % 3] ?? '···'
        return (
          <Box flexDirection="column">
            {cabecera}
            <Text wrap="truncate-end">
              <Text weight="semibold">Tablero:</Text> {tablero.trabajando} {tablero.trabajando === 1 ? 'persona trabajando' : 'personas trabajando'}
              {tablero.porcentaje !== undefined ? ` · escrito ${tablero.porcentaje} % del total` : ''} ·{' '}
              <Text color={tablero.estado === 'OPERATIVO' ? 'success' : tablero.estado === 'EN ESPERA' ? 'warning' : 'suggestion'}>{tablero.estado}</Text>
            </Text>
            {chat !== undefined && (
              <Text wrap="wrap">
                💬 <Text weight="semibold">{chat.director}:</Text> {chat.pregunta} <Text weight="semibold">{chat.quien}:</Text> {chat.respuesta}
              </Text>
            )}
            {puestos.length === 0 && (
              <Text dimColor wrap="wrap">
                La oficina está vacía. Cuando Claude reparta tareas, irá entrando el equipo.
              </Text>
            )}
            {pista}
            <Box flexDirection="row" flexWrap="wrap" gap={1}>
              {puestos.map(p => {
                const borde = p.estado === 'trabajando' ? { borderColor: p.color } : p.estado === 'terminado' ? { borderColor: 'success' } : { borderDimColor: true }
                const etiqueta = `${iconoPuesto(p)} ${p.nombre}`
                return (
                  <Box
                    key={`puesto-${p.id}`}
                    flexDirection="column"
                    borderStyle="round"
                    {...borde}
                    paddingX={1}
                    width={estrecho ? Math.max(20, ancho - 2) : 32}
                  >
                    <Button key={`persona-${p.id}`} plain label={etiqueta} onPress={verFicha(p.id)}>
                      {estrecho ? `[${p.inicial}]` : p.emoji}{' '}
                      <Text color={p.color} weight="semibold">
                        {p.nombre}
                      </Text>{' '}
                      {iconoPuesto(p)}
                      {p.estado === 'trabajando' ? ` ${puntos}` : ''}
                    </Button>
                    <Text dimColor wrap="truncate-end">
                      {p.oficio}
                    </Text>
                    <Text wrap="truncate-end" dimColor={p.estado === 'descansando'}>
                      {p.actividad}
                    </Text>
                    {p.bocadillo !== undefined && (
                      <Text wrap="truncate-end" italic>
                        💬 {p.bocadillo}
                      </Text>
                    )}
                    <Text dimColor wrap="truncate-end">
                      {p.indicador}
                    </Text>
                  </Box>
                )
              })}
            </Box>
            {pie}
          </Box>
        )
      }

      // ---- Vista LISTA --------------------------------------------------------
      const grupos = config.oficios
        .map(oficio => {
          const delOficio = conPersona.filter(x => x.oficio.id === oficio.id)
          const personas = oficio.personas
            .map(persona => {
              const suyas = delOficio.filter(x => x.persona.id === persona.id).map(x => x.t)
              return { persona, activas: suyas.filter(t => t.estado === 'trabajando'), hechas: suyas.filter(t => t.estado !== 'trabajando') }
            })
            .filter(x => x.activas.length + x.hechas.length > 0)
            .sort((a, b) => b.activas.length - a.activas.length)
          const activas = personas.reduce((n, x) => n + x.activas.length, 0)
          const terminadas = personas.reduce((n, x) => n + x.hechas.length, 0)
          return { oficio, personas, activas, terminadas }
        })
        .filter(g => g.personas.length > 0)
        .sort((a, b) => b.activas - a.activas)
      const libres = config.oficios.filter(o => o.rival !== true && !grupos.some(g => g.oficio.id === o.id))

      return (
        <Box flexDirection="column">
          {cabecera}
          {tareas.length === 0 ? (
            <Text dimColor wrap="wrap">
              Nadie está trabajando todavía. Cuando Claude lance tareas en segundo plano, aquí verás quién lleva cada una.
            </Text>
          ) : (
            <Text dimColor wrap="wrap">
              Pulsa a una persona para ver qué está haciendo.
            </Text>
          )}
          {grupos.map(({ oficio, personas, activas, terminadas }) => (
            <Box key={`oficio-${oficio.id}`} flexDirection="column">
              <Text wrap="truncate-end">
                <Text color={oficio.color} weight="semibold">
                  {estrecho ? '' : `${oficio.emoji} `}
                  {oficio.grupo}
                </Text>
                <Text dimColor>
                  {activas > 0 ? ` · ${activas} trabajando` : ''}
                  {terminadas > 0 ? ` · ${terminadas} ${terminadas === 1 ? 'terminada' : 'terminadas'}` : ''}
                </Text>
              </Text>
              {personas.map(({ persona, activas: suyas, hechas: suyasHechas }) => {
                const ultima = (suyas[suyas.length - 1] ?? suyasHechas[suyasHechas.length - 1]) as Tarea
                const estado: EstadoTarea = suyas.length > 0 ? 'trabajando' : ultima.estado
                const accion = accionDe(oficio, ultima.accion)
                const seccion = seccionCorta(ultima.seccion)
                const detalle = [
                  fraseSinNombre(accion, estado),
                  ...(seccion !== undefined ? [seccion] : []),
                  ...(suyas.length > 1 ? [`lleva ${suyas.length} tareas`] : []),
                  tiempoDe(ultima, ahora),
                  ...(suyas.length > 0 && suyasHechas.length > 0 ? [`✓${suyasHechas.length}`] : []),
                ].join(' · ')
                const etiqueta = `${iconoDe(estado)} ${persona.nombre} — ${detalle}`
                return escritorio ? (
                  <Button key={`persona-${persona.id}`} label={etiqueta} onPress={verFicha(persona.id)} />
                ) : (
                  <Button key={`persona-${persona.id}`} plain label={etiqueta} onPress={verFicha(persona.id)}>
                    {'  '}
                    {iconoDe(estado)}{' '}
                    <Text color={oficio.color} weight="semibold">
                      {persona.nombre}
                    </Text>
                    <Text dimColor> — {detalle}</Text>
                  </Button>
                )
              })}
            </Box>
          ))}
          {tareas.length > 0 && libres.length > 0 && (
            <Text dimColor wrap="wrap">
              Aún no han entrado: {libres.flatMap(o => o.personas.map(p => p.nombre)).join(', ')}.
            </Text>
          )}
          {pie}
        </Box>
      )
    } catch (err) {
      depurar($, `panel: ${mensajeDe(err)}`)
      return next(e)
    }
  })

  // La BANDA encima del prompt: UNA sola fila, para no agobiar (orden de
  // Carlos, 9/11/2026). Lleva la barra del escrito y cuánta gente trabaja; el
  // paso actual y la última frase solo entran si caben (banda.ts decide con un
  // presupuesto de caracteres). El detalle por persona está en el panel («Ver
  // equipo»). Cuando termina todo el equipo, se retira sola al minuto o al
  // escribir el siguiente mensaje. No repite lo que ya enseña mods-abogados
  // (cliente, plazos, citas, cupo).
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    let texto: ReturnType<typeof textoDeLaBanda> | undefined
    const estrecho = e.props.bodyColumns < 60
    const presupuesto = presupuestoDeLaBanda(e.props.bodyColumns, e.surface !== 'terminal')
    try {
      const [config, tareas, oculta, red, retirada] = await Promise.all([
        read($, configA),
        read($, tareasA),
        read($, bandaOcultaA),
        leerRedaccion($),
        read($, retiradaA),
        read($, relojA), // suscribe la banda al reloj: así se retira sola
      ])
      const ahora = await $.clock.now()
      if (!oculta) {
        const vivas = tareasDeLaBanda(tareas, retirada, ahora)
        const conEscrito = red !== null && escritoEnBanda(red, retirada, ahora)
        if (vivas.length > 0 || conEscrito) {
          const activas = vivas.filter(t => t.estado === 'trabajando')
          // La frase divertida, solo mientras alguien trabaja.
          const ultima = activas
            .flatMap(t => (t.frases ?? []).map(f => ({ f, t })))
            .sort((a, b) => a.f.hora - b.f.hora)
            .pop()
          texto = textoDeLaBanda(
            {
              ...(conEscrito && red !== null ? { red } : {}),
              trabajando: new Set(activas.map(t => t.persona)).size,
              hechas: vivas.length - activas.length,
              quienes: enCursoPorPersona(config, vivas).map(g => ({
                nombre: g.persona.nombre,
                haciendo: accionDe(g.oficio, (g.tareas[g.tareas.length - 1] as Tarea).accion).gerundio,
                tareas: g.tareas.length,
              })),
              ...(ultima !== undefined ? { frase: { quien: personaDe(config, ultima.t.oficio, ultima.t.persona).persona.nombre, texto: ultima.f.texto } } : {}),
              ahora,
            },
            presupuesto,
          )
        }
      }
    } catch (err) {
      depurar($, `banda: ${mensajeDe(err)}`)
    }
    if (texto === undefined) return next(e)

    const { Box, Text, Button } = $.ui.resolve(e)
    // Un solo Text que se recorta por el final si aun así no cabe (nunca salta
    // de línea), y a su lado los botones, que no se encogen.
    const mia = (
      <Box flexDirection="row" gap={1}>
        <Box flexShrink={1} flexGrow={1}>
          {texto.soloEquipo !== undefined ? (
            <Text wrap="truncate-end">{texto.soloEquipo}</Text>
          ) : (
            <Text wrap="truncate-end">
              {texto.icono} <Text weight="semibold">{texto.titulo}</Text> <Text color="success">{texto.llena}</Text>
              <Text dimColor>{texto.vacia}</Text> <Text weight="semibold">{texto.porcentaje}</Text>
              <Text dimColor>{texto.resto}</Text>
            </Text>
          )}
        </Box>
        <Box flexShrink={0} flexDirection="row" gap={1}>
          <Button key="ver" label={estrecho ? 'Panel' : 'Ver equipo'} onPress={() => alternarPanel($, 'abrir')} />
          <Button key="ocultar" label="Ocultar" role="dismiss" onPress={() => update($, bandaOcultaA, () => true)} />
        </Box>
      </Box>
    )
    // Si otro mod también dibuja la banda, se apilan en vez de taparse.
    try {
      const debajo = await next(e)
      if (debajo !== null && debajo !== undefined && typeof debajo === 'object' && 'type' in debajo) {
        return (
          <Box flexDirection="column">
            {mia}
            {debajo}
          </Box>
        )
      }
    } catch (err) {
      depurar($, `banda (otros): ${mensajeDe(err)}`)
    }
    return mia
  })

  // El SPINNER: dice quién está trabajando («María está ordenando el expediente…»).
  on('ui.render', { component: 'Spinner' }, async ($, e, next) => {
    let mensaje: string | undefined
    try {
      if (e.props.message === null) {
        const [config, tareas, red] = await Promise.all([read($, configA), read($, tareasA), read($, redaccionA)])
        const activas = tareas.filter(t => t.estado === 'trabajando')
        // El spinner de un subagente (su id) habla de su persona; el principal, del último que empezó.
        const propia = activas.find(t => t.id === e.requestId)
        const tarea = propia ?? activas[activas.length - 1]
        if (tarea !== undefined) {
          const { oficio, persona } = personaDe(config, tarea.oficio, tarea.persona)
          mensaje = frase(persona, accionDe(oficio, tarea.accion), 'trabajando')
          if (propia === undefined && activas.length > 1) {
            const otros = enCursoPorPersona(config, activas).length - 1
            mensaje += otros > 0 ? ` (y ${otros} ${otros === 1 ? 'compañero más' : 'compañeros más'})` : ` (lleva ${activas.length} tareas)`
          }
        }
        // Con un escrito en marcha, el spinner dice también cuánto lleva.
        if (red !== null && !red.terminado) {
          mensaje =
            mensaje !== undefined
              ? `${mensaje} · escrito: ${red.porcentaje} % del total`
              : `Escrito: ${red.porcentaje} % del total · ahora: ${red.fase}`
        }
      }
    } catch (err) {
      depurar($, `spinner: ${mensajeDe(err)}`)
      mensaje = undefined
    }
    return mensaje === undefined ? next(e) : next({ ...e, props: { ...e.props, message: mensaje } })
  })

  // La FILA de cada llamada a Agent: «Luis (picapleitos) está redactando un fundamento de fondo…».
  on('ui.render', { component: 'ToolUse', props: { tool: 'Agent' } }, async ($, e, next) => {
    if (e.props.isExpanded === true) return next(e) // ctrl+o: se ve todo, como siempre
    try {
      const { Box, Text, Button } = $.ui.resolve(e)
      const [config, tareas] = await Promise.all([read($, configA), read($, tareasA)])
      const ahora = await $.clock.now()
      const entrada = (typeof e.props.input === 'object' && e.props.input !== null ? e.props.input : {}) as {
        description?: unknown
        prompt?: unknown
        subagent_type?: unknown
      }
      const descripcionCruda = typeof entrada.description === 'string' ? entrada.description : 'tarea'
      // «Elena: revisar la coherencia» se enseña como «Revisar la coherencia» (el nombre ya va delante).
      const descripcion = descripcionLimpia(config, descripcionCruda)
      const tarea = [...tareas].reverse().find(t => t.toolUseId === e.props.tool_use_id && t.flujo === undefined)
      let oficio: Oficio
      let persona: Persona
      let indiceAccion: number
      let seccion: string | undefined
      if (tarea !== undefined) {
        ;({ oficio, persona } = personaDe(config, tarea.oficio, tarea.persona))
        indiceAccion = tarea.accion
        seccion = tarea.seccion
      } else {
        // Aún no consta su lanzamiento: se calcula igual que se hará al lanzarla
        // (con una persona por oficio, el nombre no cambia después).
        const reparto = asignar(config, {
          descripcion: descripcionCruda,
          prompt: typeof entrada.prompt === 'string' ? entrada.prompt : '',
          tipo: typeof entrada.subagent_type === 'string' ? entrada.subagent_type : '',
        })
        oficio = reparto.oficio
        persona = reparto.oficio.personas.find(x => x.id === reparto.persona) ?? elegirPersona(reparto.oficio, tareas)
        indiceAccion = reparto.accion
        seccion = reparto.seccion
      }
      const accion = accionDe(oficio, indiceAccion)
      const estado: EstadoTarea = e.props.isInterrupted
        ? 'detenida'
        : e.props.isErrored
          ? 'fallida'
          : (tarea?.estado ?? (e.props.isRunning ? 'trabajando' : 'terminada'))
      const enSegundoPlano = estado === 'trabajando' && !e.props.isRunning
      const estrecho = (e.viewport?.columns ?? 100) < 60
      const cola =
        estado === 'trabajando'
          ? enSegundoPlano
            ? ' (en segundo plano)…'
            : '…'
          : tarea !== undefined
            ? ` · ${tiempoDe(tarea, ahora)}`
            : ''
      // La última frase que no repita lo que ya se lee en la línea de encima. Si
      // la fila dice que ha fallado o parado y la tarea aún no lo ha contado,
      // no se enseña una frase alegre de antes.
      const cuadra = tarea === undefined || estado === tarea.estado
      const ultimaFrase = cuadra ? [...(tarea?.frases ?? [])].reverse().find(f => !repiteDescripcion(f.texto, descripcion))?.texto : undefined
      const ultimoPaso = tarea?.actividad[tarea.actividad.length - 1]
      const idPersona = persona.id
      // El tiempo no se dice dos veces: si la frase ya lo cuenta («Hecho en 1 min 26 s»), sobra detrás del estado.
      const colaVisible = ultimaFrase !== undefined && cola.startsWith(' · ') && ultimaFrase.includes(cola.slice(3)) ? '' : cola

      return (
        <Box flexDirection="column">
          <Box flexDirection="row" gap={1}>
            <Text wrap="truncate-end">
              {iconoDe(estado)} {avatar(oficio, persona, estrecho)}{' '}
              <Text color={oficio.color} weight="semibold">
                {persona.nombre}
              </Text>
              {estrecho ? '' : <Text dimColor> ({oficio.oficio})</Text>} {fraseSinNombre(accion, estado)}
              {colaVisible}
            </Text>
            {tarea !== undefined && <Button key="ver-ficha" label="Ver más" onPress={() => abrirFicha($, idPersona, persona.nombre)} />}
          </Box>
          <Text dimColor wrap="truncate-end">
            {'   «'}
            {descripcion}»{seccion !== undefined ? ` · ${seccion}` : ''}
          </Text>
          {ultimaFrase !== undefined ? (
            <Text wrap="truncate-end" italic>
              {'   💬 '}
              {ultimaFrase}
            </Text>
          ) : (
            estado === 'trabajando' &&
            ultimoPaso !== undefined && (
              <Text dimColor wrap="truncate-end">
                {'   '}
                {iconoActividad(ultimoPaso)} {ultimoPaso.texto}
              </Text>
            )
          )}
        </Box>
      )
    } catch (err) {
      depurar($, `fila Agent: ${mensajeDe(err)}`)
      return next(e)
    }
  })

  // La FILA de cada Workflow: el encargo y quién está con él.
  on('ui.render', { component: 'ToolUse', props: { tool: 'Workflow' } }, async ($, e, next) => {
    if (e.props.isExpanded === true) return next(e)
    try {
      const { Box, Text } = $.ui.resolve(e)
      const [config, tareas, encargos] = await Promise.all([read($, configA), read($, tareasA), read($, encargosA)])
      const entrada = (typeof e.props.input === 'object' && e.props.input !== null ? e.props.input : {}) as {
        script?: unknown
        name?: unknown
      }
      const encargo = encargos.find(x => x.toolUseId === e.props.tool_use_id)
      const meta = encargo ?? metaDeFlujo(entrada.script, entrada.name)
      const suyas = tareas.filter(t => t.toolUseId === e.props.tool_use_id && t.flujo !== undefined)
      const linea =
        suyas.length > 0
          ? resumen(config, suyas, (e.viewport?.columns ?? 100) < 60)
          : e.props.isRunning
            ? 'el equipo se está repartiendo el trabajo…'
            : 'encargo entregado al equipo'
      return (
        <Box flexDirection="column">
          <Text wrap="truncate-end">
            {'👥 '}
            <Text weight="semibold">Encargo para el equipo:</Text> «{meta.nombre}»
            {meta.descripcion !== '' ? <Text dimColor> — {meta.descripcion}</Text> : ''}
          </Text>
          <Text dimColor wrap="truncate-end">
            {'   '}
            {linea}
          </Text>
        </Box>
      )
    } catch (err) {
      depurar($, `fila Workflow: ${mensajeDe(err)}`)
      return next(e)
    }
  })

  // El AVISO de «tarea terminada» que llega a la conversación.
  on('ui.render', { component: 'UserMessage', props: { origin: { kind: 'task-notification' } } }, async ($, e, next) => {
    const aviso = e.props.task
    if (e.props.isExpanded || aviso === undefined) return next(e)
    const dibujo = await (async () => {
      const { Box, Text, Button } = $.ui.resolve(e)
      const [config, tareas, encargos] = await Promise.all([read($, configA), read($, tareasA), read($, encargosA)])

      const tarea = aviso.id !== undefined ? tareas.find(t => t.id === aviso.id) : undefined
      if (tarea !== undefined) {
        const { oficio, persona } = personaDe(config, tarea.oficio, tarea.persona)
        const estado = estadoPorPalabra(aviso.status) ?? (tarea.estado === 'trabajando' ? 'terminada' : tarea.estado)
        const tiempo =
          aviso.durationMs !== undefined ? duracion(aviso.durationMs) : tarea.fin !== undefined ? duracion(tarea.fin - tarea.inicio) : ''
        const idPersona = persona.id
        const ultimaFrase = [...(tarea.frases ?? [])].reverse().find(f => !repiteDescripcion(f.texto, tarea.descripcion))?.texto
        const documentos = documentosDe(tarea)
        const tiempoVisible = tiempo !== '' && !(ultimaFrase ?? '').includes(tiempo) ? tiempo : ''
        return (
          <Box flexDirection="column">
            <Box flexDirection="row" gap={1}>
              <Text wrap="truncate-end">
                {iconoDe(estado)} {oficio.emoji}{' '}
                <Text color={oficio.color} weight="semibold">
                  {persona.nombre}
                </Text>
                <Text dimColor> ({oficio.oficio})</Text> {fraseSinNombre(accionDe(oficio, tarea.accion), estado)}
                {tiempoVisible !== '' ? <Text dimColor> · {tiempoVisible}</Text> : ''}
              </Text>
              <Button key="ver-ficha" label="Ver más" onPress={() => abrirFicha($, idPersona, persona.nombre)} />
            </Box>
            <Text dimColor wrap="truncate-end">
              {'   «'}
              {tarea.descripcion}»{documentos.length > 0 ? ` · ha preparado ${documentos.slice(0, 3).join(', ')}` : ''}
            </Text>
            {ultimaFrase !== undefined && (
              <Text wrap="truncate-end" italic>
                {'   💬 '}
                {ultimaFrase}
              </Text>
            )}
          </Box>
        )
      }

      // El aviso de un flujo entero (Workflow) que ha terminado.
      const encargo = aviso.toolUseId !== undefined ? encargos.find(x => x.toolUseId === aviso.toolUseId) : undefined
      if (encargo !== undefined) {
        const suyas = tareas.filter(t => t.toolUseId === encargo.toolUseId)
        const estado = estadoPorPalabra(aviso.status) ?? 'terminada'
        const personas = new Set(suyas.map(t => t.persona)).size
        return (
          <Text wrap="truncate-end">
            {iconoDe(estado)} 👥 <Text weight="semibold">El equipo</Text>{' '}
            {estado === 'terminada' ? 'ha terminado' : estado === 'fallida' ? 'no ha podido terminar' : 'ha parado'} el encargo «
            {encargo.nombre}»{suyas.length > 0 ? ` (${suyas.length} tareas, ${personas} ${personas === 1 ? 'persona' : 'personas'})` : ''}
            {aviso.durationMs !== undefined ? <Text dimColor> · {duracion(aviso.durationMs)}</Text> : ''}
          </Text>
        )
      }
      return undefined // no es una tarea del equipo: Claude Code lo dibuja como siempre
    })().catch(err => {
      depurar($, `aviso: ${mensajeDe(err)}`)
      return undefined
    })
    return dibujo ?? next(e)
  })
}
