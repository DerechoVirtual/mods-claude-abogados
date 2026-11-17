// ─────────────────────────────────────────────────────────────────────────────
// estado.ts · Lo que comparten los cuatro mods
//
// Los cuatro mods viven en el mismo plugin, así que comparten este módulo:
//   · los plazos (Mod 1 los edita, Mod 3 los muestra),
//   · el cliente activo y su color de ACENTO (Mod 4 lo fija, Mods 1, 2 y 3 lo usan),
//   · la configuración leída de config/*.json.
//
// ARCHIVOS QUE SE TOCAN (todos dentro de la carpeta del plugin):
//   config/festivos.json, config/computo.json, config/revisor.json,
//   config/clientes.json (lectura; /cliente-nuevo añade clientes),
//   config/cupo.json, config/masc.json y config/postulacion.json (lectura),
//   data/plazos.json (lectura y escritura),
//   data/cupo.json (cuenta del cupo) y data/fichas.json (fichas de expediente).
// El cliente activo NO va a un archivo: es de cada sesión ($.state, hooks/sesion.ts).
// Nada más, salvo el Mod 9 (apagado por defecto): escribe la copia anonimizada
// junto al escrito y llama al conector de Anonimizator que tenga el abogado.
// ─────────────────────────────────────────────────────────────────────────────

import type { EngineInterface, RenderChildren } from 'claude-code'
import {
  calcularTodos,
  fechaEnZona,
  REGLAS_POR_DEFECTO,
  JURISDICCIONES,
  type Festivo,
  type Plazo,
  type PlazoCalculado,
  type ReglasComputo,
  type Jurisdiccion,
} from './plazos'
import type { CitaRevisada, ConfigRevisor, ResumenCitas } from './citas'
import { CUPO_POR_DEFECTO, registroVacio, type ConfigCupo, type RegistroCupo } from './cupo'
import { aprenderNombres, type EscritoTerminado } from './escritos'
import { normalizarConfigSiguientes, type ConfigSiguientes, type Contexto, type Opcion } from './siguientes'
import { MASC_POR_DEFECTO, POSTULACION_POR_DEFECTO, type ConfigMasc, type ConfigPostulacion, type Ficha } from './expediente'
import { colorPorNombre } from './colores'

/** El `$` que recibe cada hook. */
export type Motor = EngineInterface

/** Un cliente de config/clientes.json. */
export type Cliente = {
  nombre: string
  expediente?: string
  asunto?: string // materia en pocas palabras («Divorcio contencioso», «Despido c. …»)
  jurisdiccion?: string // civil, familia, laboral, penal, contencioso, extranjería…
  carpeta?: string // opcional: para el aviso de expediente cruzado
  color?: string // «#RRGGBB»; si falta, se calcula a partir del nombre
}

export type AvisoCruzado = {
  clienteActivo: string
  otroCliente: string
  herramienta: string
  ruta: string
}

export type AnalisisCitas = {
  revisadas: CitaRevisada[]
  resumen: ResumenCitas
  hora: string // «HH:MM»
  consultas: number // llamadas a herramientas de verificación en el turno
}

/** Mods activados en /config (opciones del plugin). */
export type Activos = {
  plazos: boolean
  citas: boolean
  cuentaAtras: boolean
  colorCliente: boolean
  cupo: boolean
  contrario: boolean
  masc: boolean
  procurador: boolean
  anonimizar: boolean
  siguientes: boolean
}

/** Mod 10: el panel de siguientes pasos del último escrito terminado. */
export type EstadoSiguientes = {
  escrito: EscritoTerminado
  md: string | null
  contexto: Contexto
  ids: string[]
  clave: string
  opciones: Opcion[]
  origen: 'calculando' | 'claude' | 'tabla'
}

/** Lo que la banda dice del Mod 9 (solo recuentos, nunca un dato personal). */
export type AvisoAnonimizar = {
  tipo: 'trabajando' | 'hecha' | 'error' | 'sin-conector' | 'sin-texto'
  texto: string
  /** Versión de pocas palabras, para cuando la línea de acción ya está ocupada. */
  corto?: string
  copiaMd?: string
  docx?: string
  turnos: number
}

/** Una pastilla de la banda y lo que ocupa (columnas), para repartir el ancho. */
export type Pastilla = { nodo: RenderChildren; ancho: number }

/** Escrito terminado que espera el botón «Que lo ataque el contrario». */
export type EscritoListo = EscritoTerminado & { turnos: number }

export const REVISOR_POR_DEFECTO: ConfigRevisor = {
  herramientasVerificacion: ['buscar_articulo', 'buscar_sentencias', 'buscar_por_cita', 'leer_sentencias', 'leer_boe', 'buscar_boe', 'verificar'],
  excluirHerramientas: [],
  analizarArchivosEscritos: true,
  leyes: [],
}

export const estado = {
  activos: { plazos: true, citas: true, cuentaAtras: true, colorCliente: true, cupo: true, contrario: true, masc: true, procurador: true, anonimizar: false, siguientes: true } as Activos,
  raiz: '', // carpeta del plugin, con «/»
  cwd: '', // carpeta de la sesión
  interactiva: false,
  hoy: fechaEnZona(Date.now()),
  festivos: [] as Festivo[],
  reglas: REGLAS_POR_DEFECTO as ReglasComputo,
  revisor: REVISOR_POR_DEFECTO,
  plazos: [] as Plazo[],
  papelera: [] as Plazo[],
  calculados: [] as PlazoCalculado[],
  firmaPlazos: '', // para saber si alguien editó data/plazos.json a mano
  clientes: [] as Cliente[],
  clienteActivo: null as Cliente | null,
  avisoCruzado: null as AvisoCruzado | null,
  citas: null as AnalisisCitas | null,
  avisoPanel: null as string | null, // un panel no cupo en la ventana
  superficie: 'terminal' as string, // la que dibuja la banda ahora (terminal, desktop…)
  sesionJuridica: false, // ¿se trabaja en algo jurídico en esta sesión? Si no, la banda no sale (hooks/sesion.ts)
  configCupo: CUPO_POR_DEFECTO as ConfigCupo,
  cupo: registroVacio(fechaEnZona(Date.now()), CUPO_POR_DEFECTO) as RegistroCupo, // copia en memoria de data/cupo.json
  escritoListo: null as EscritoListo | null, // botón del contrario visible
  ultimoEscrito: null as EscritoTerminado | null, // para /contrario aunque se haya ocultado el botón
  fichas: {} as Record<string, Ficha>, // data/fichas.json (Mods 7 y 8)
  reglasMasc: MASC_POR_DEFECTO as ConfigMasc,
  reglasPostulacion: POSTULACION_POR_DEFECTO as ConfigPostulacion,
  demandaEnCurso: null as { cliente: string; ruta: string } | null, // Claude escribe una demanda de este cliente
  anonimizacion: null as AvisoAnonimizar | null, // Mod 9: lo último que pasó con la copia anonimizada
  configSiguientes: normalizarConfigSiguientes({}) as ConfigSiguientes, // config/siguientes.json (Mod 10)
  siguientes: null as EstadoSiguientes | null, // Mod 10: panel del último escrito terminado
  ultimoObjetivoAnonimizar: null as { nombre: string; md: string | null; docx: string | null } | null,
  errores: [] as string[], // problemas al leer la configuración
}

// ── Rutas y archivos ────────────────────────────────────────────────────────

export function ruta(relativa: string): string {
  return `${estado.raiz}/${relativa}`
}

/** Lee un JSON del plugin. Si falta o está roto, devuelve `porDefecto` y lo anota. */
export async function leerJson<T>($: Motor, relativa: string, porDefecto: T): Promise<T> {
  try {
    if (!(await $.fs.exists(ruta(relativa)))) return porDefecto
    const texto = await $.fs.read(ruta(relativa))
    return JSON.parse(typeof texto === 'string' ? texto : '') as T
  } catch (error) {
    anotarError(`No se pudo leer ${relativa}: ${String(error).slice(0, 120)}`)
    return porDefecto
  }
}

/** Escribe un JSON del plugin con sangría (para que se pueda editar a mano). */
export async function escribirJson($: Motor, relativa: string, valor: unknown): Promise<boolean> {
  try {
    await $.fs.write(ruta(relativa), JSON.stringify(valor, null, 2) + '\n')
    return true
  } catch (error) {
    anotarError(`No se pudo guardar ${relativa}: ${String(error).slice(0, 120)}`)
    return false
  }
}

export function anotarError(texto: string): void {
  estado.errores = [...estado.errores.filter(e => e !== texto), texto].slice(-5)
}

// ── Configuración ───────────────────────────────────────────────────────────

/** Lee config/festivos.json, config/computo.json, config/revisor.json y config/clientes.json. */
export async function cargarConfiguracion($: Motor): Promise<void> {
  estado.errores = []

  const festivos = await leerJson<{ festivos?: Festivo[] }>($, 'config/festivos.json', {})
  estado.festivos = (festivos.festivos ?? []).filter(f => typeof f?.fecha === 'string' && typeof f?.nombre === 'string')

  const computo = await leerJson<Partial<ReglasComputo>>($, 'config/computo.json', {})
  const jurisdicciones = { ...REGLAS_POR_DEFECTO.jurisdicciones }
  for (const j of JURISDICCIONES) {
    const r = computo.jurisdicciones?.[j as Jurisdiccion]
    if (r) jurisdicciones[j] = { agostoInhabil: r.agostoInhabil !== false, navidadInhabil: r.navidadInhabil !== false, nota: r.nota }
  }
  estado.reglas = {
    jurisdicciones,
    lexnet15h: computo.lexnet15h === true,
    umbrales: {
      verdeMasDe: Number(computo.umbrales?.verdeMasDe ?? REGLAS_POR_DEFECTO.umbrales.verdeMasDe),
      ambarDesde: Number(computo.umbrales?.ambarDesde ?? REGLAS_POR_DEFECTO.umbrales.ambarDesde),
    },
  }

  const revisor = await leerJson<Partial<ConfigRevisor>>($, 'config/revisor.json', {})
  estado.revisor = {
    herramientasVerificacion: revisor.herramientasVerificacion ?? REVISOR_POR_DEFECTO.herramientasVerificacion,
    excluirHerramientas: revisor.excluirHerramientas ?? [],
    analizarArchivosEscritos: revisor.analizarArchivosEscritos !== false,
    leyes: (revisor.leyes ?? []).filter(l => l && typeof l.clave === 'string' && Array.isArray(l.alias)),
  }

  await cargarClientes($)
}

export async function cargarClientes($: Motor): Promise<void> {
  const datos = await leerJson<{ clientes?: Cliente[] }>($, 'config/clientes.json', {})
  estado.clientes = (datos.clientes ?? [])
    .filter(c => c && typeof c.nombre === 'string' && c.nombre.trim())
    .map(c => ({ ...c, color: c.color ?? colorPorNombre(c.nombre) }))
  // Los nombres de los clientes, con sus tildes, para escribir bien los títulos de los escritos.
  aprenderNombres(estado.clientes.flatMap(c => [c.nombre, c.asunto ?? '']))
}

// ── Plazos (compartidos por los Mods 1 y 3) ─────────────────────────────────

type ArchivoPlazos = { _nota?: string; plazos?: Plazo[]; papelera?: Plazo[] }

/** Lee data/plazos.json. Devuelve true si ha cambiado desde la última lectura. */
export async function cargarPlazos($: Motor): Promise<boolean> {
  const datos = await leerJson<ArchivoPlazos>($, 'data/plazos.json', {})
  const plazos = (datos.plazos ?? [])
    .filter(p => p && typeof p.id === 'string' && typeof p.notificacion === 'string')
    // Los ejemplos generados antes de la v1.6.0 apuntaban el despido de Pérez como de López:
    // se corrige al leerlo, para que no salga como plazo de López (queda bien al guardar).
    .map(p => (p.id.startsWith('ejemplo-') && /^Pérez\b/.test(p.asunto ?? '') && p.cliente === 'López' ? { ...p, cliente: 'Pérez' } : p))
  const firma = JSON.stringify(plazos)
  const cambio = firma !== estado.firmaPlazos
  estado.plazos = plazos
  estado.papelera = datos.papelera ?? []
  estado.firmaPlazos = firma
  recalcular()
  return cambio
}

/** Guarda data/plazos.json (los borrados quedan en «papelera», nunca se pierden). */
export async function guardarPlazos($: Motor): Promise<boolean> {
  const ok = await escribirJson($, 'data/plazos.json', {
    _nota: 'Datos FICTICIOS de ejemplo. Lo editan /plazo-nuevo y /plazo-borrar; los borrados se guardan en «papelera».',
    plazos: estado.plazos,
    papelera: estado.papelera.slice(-50),
  })
  estado.firmaPlazos = JSON.stringify(estado.plazos)
  recalcular()
  return ok
}

/** Vuelve a calcular vencimientos y colores con la fecha de hoy. */
export function recalcular(): void {
  try {
    estado.calculados = calcularTodos(estado.plazos, estado.hoy, estado.festivos, estado.reglas)
  } catch (error) {
    anotarError(`Error al calcular plazos: ${String(error).slice(0, 120)}`)
  }
}

/** Actualiza «hoy» (hora de Madrid). Devuelve true si ha cambiado el día. */
export async function actualizarHoy($: Motor): Promise<boolean> {
  try {
    const hoy = fechaEnZona(await $.clock.now())
    if (hoy !== estado.hoy) {
      estado.hoy = hoy
      recalcular()
      return true
    }
  } catch {
    // sin reloj: se queda la fecha anterior
  }
  return false
}

// ── Cliente activo y color de acento (Mod 4 → Mods 1, 2 y 3) ────────────────

/** Color de acento del cliente activo, o null si no hay (interfaz neutra). */
export function colorAcento(): string | null {
  if (!estado.activos.colorCliente || !estado.clienteActivo) return null
  return estado.clienteActivo.color ?? colorPorNombre(estado.clienteActivo.nombre)
}

/** Acento para dibujar: el del cliente o el color de Claude Code. */
export function acentoODefecto(): string {
  return colorAcento() ?? 'claude'
}

// ── Utilidades de interfaz ──────────────────────────────────────────────────

/** Pide redibujar paneles y banda. */
export function redibujar($: Motor): void {
  try {
    $.ui.invalidate('ui.render')
  } catch {
    // nada que hacer
  }
}

/**
 * Abre un panel. Si la ventana es demasiado estrecha y el panel queda en
 * espera, lo anota para que la banda avise de cómo ampliarla.
 */
export async function abrirPanel($: Motor, id: string, titulo: string, conFoco: boolean): Promise<boolean> {
  try {
    const opciones = conFoco ? { id, title: titulo, focus: true as const } : { id, title: titulo }
    const abierto = await $.ui.open(opciones)
    if (abierto.isPlaced) {
      estado.avisoPanel = null
      return true
    }
    estado.avisoPanel = `El panel «${titulo}» no cabe: amplía la ventana (mín. 110 columnas) o usa pantalla completa.`
    $.ui.toast(estado.avisoPanel)
    redibujar($)
    return false
  } catch (error) {
    anotarError(`No se pudo abrir el panel ${titulo}: ${String(error).slice(0, 100)}`)
    return false
  }
}

/** ¿Está abierto (registrado) este panel? */
export async function panelAbierto($: Motor, id: string): Promise<boolean> {
  try {
    return (await $.ui.panes()).some(p => p.id === id)
  } catch {
    return false
  }
}

/** Hora «HH:MM» en Madrid. */
export function horaMadrid(ms: number): string {
  try {
    return new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit' }).format(new Date(ms))
  } catch {
    const d = new Date(ms)
    return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`
  }
}

/** Minúsculas y sin tildes, para comparar nombres. */
function llano(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}

/**
 * ¿El plazo es de este cliente? Por el campo «cliente» del plazo (nombre o
 * expediente, sin tildes) y, si el plazo no dice de quién es, por su asunto
 * («García c. Aseguradora Ficticia» es de García).
 */
export function esDelCliente(plazo: Plazo, cliente: Cliente | null): boolean {
  if (!cliente) return false
  const nombre = llano(cliente.nombre)
  if (!nombre) return false
  if (plazo.cliente && plazo.cliente.trim()) {
    const a = llano(plazo.cliente)
    const exp = llano(cliente.expediente ?? '')
    return a === nombre || (exp !== '' && a === exp) || nombre.startsWith(a) || a.startsWith(nombre)
  }
  const asunto = ` ${llano(plazo.asunto).replace(/[^a-z0-9ñ]+/g, ' ')} `
  return asunto.includes(` ${nombre.replace(/[^a-z0-9ñ]+/g, ' ')} `)
}

// ── Etiquetas y envíos ──────────────────────────────────────────────────────

/**
 * Etiqueta de un botón con atajo. La app de escritorio ya dibuja la tecla en
 * una chapa junto al botón, así que allí va la etiqueta sola; en el terminal
 * se añade «(n)» para que se sepa qué tecla es.
 */
export function conAtajo(etiqueta: string, tecla: string, superficie: string): string {
  return superficie === 'terminal' ? `${etiqueta} (${tecla})` : etiqueta
}

/** Último mensaje enviado a Claude por el plugin (para no mandarlo dos veces). */
const ultimoEnvio = { texto: '', ms: 0, enCurso: false }

/** Al empezar una sesión no hay ningún envío reciente. */
export function olvidarEnvios(): void {
  ultimoEnvio.texto = ''
  ultimoEnvio.ms = 0
  ultimoEnvio.enCurso = false
}

/**
 * Envía un mensaje a Claude UNA sola vez: si llega la misma petición dos veces
 * seguidas (doble pulsación, o el botón dibujado en dos sitios), la segunda se
 * ignora. Devuelve 'enviado', 'repetido' o el motivo por el que no se pudo.
 */
export async function enviarUnaVez($: Motor, texto: string, comoUsuario = false): Promise<'enviado' | 'repetido' | { fallo: string }> {
  let ahora = Date.now()
  try {
    ahora = await $.clock.now()
  } catch {
    // sin reloj del motor: vale el del sistema
  }
  if (ultimoEnvio.enCurso || (ultimoEnvio.texto === texto && Math.abs(ahora - ultimoEnvio.ms) < 60_000)) return 'repetido'
  ultimoEnvio.enCurso = true
  ultimoEnvio.texto = texto
  ultimoEnvio.ms = ahora
  try {
    const enviado = await $.prompt.submit(comoUsuario ? { text: texto, asUser: true } : { text: texto })
    if (enviado && typeof enviado === 'object' && 'drop' in enviado && enviado.drop) {
      ultimoEnvio.texto = '' // no llegó: se puede volver a intentar
      return { fallo: String(enviado.drop) }
    }
    return 'enviado'
  } catch (error) {
    ultimoEnvio.texto = ''
    return { fallo: String(error).slice(0, 80) }
  } finally {
    ultimoEnvio.enCurso = false
  }
}
