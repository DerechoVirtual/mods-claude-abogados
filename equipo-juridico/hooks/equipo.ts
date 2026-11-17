// Lógica pura del equipo jurídico: de qué oficio es cada tarea, qué persona
// del oficio la lleva y cómo se cuenta lo que hace. No toca la sesión ni el
// disco, así que las pruebas la importan directamente.

import type { Accion, ConfigEquipo, EstadoTarea, Genero, Oficio, Persona, Tarea } from '../types'
import { sinNombreDelante } from './llano'

/** Lo que se sabe de una tarea cuando se lanza. */
export type DatosTarea = {
  /** La descripción corta que Claude dio a la tarea («Investigar…»). */
  descripcion: string
  /** El encargo completo que recibe el subagente (solo se mira el principio). */
  prompt?: string
  /** El tipo de subagente (general-purpose, Explore, …:redactor-seccion…). */
  tipo?: string
}

/** El resultado de clasificar una tarea. */
export type Reparto = {
  oficio: Oficio
  /** Índice de la acción del oficio que mejor encaja. */
  accion: number
  /** Puntos que sacó el oficio elegido (0 = no encajaba: va al de por defecto). */
  puntos: number
  /** «Sección 03 — Fundamento de fondo: …» si la tarea es una sección de un escrito. */
  seccion?: string
  /** Id de la persona, si la descripción la nombra delante («Elena: revisar las citas»). */
  persona?: string
}

// Pesos del reparto: la descripción manda; el primer verbo de la descripción
// decide los empates («Revisar el escrito» es de estilo, no del que redacta);
// el tipo de subagente ayuda; el encargo completo solo desempata.
const PESO_DESCRIPCION = 3
const PESO_PRIMER_VERBO = 2
const PESO_TIPO = 2
const PESO_PROMPT = 1
const MAX_COINCIDENCIAS_PROMPT = 3
const TIPO_EXACTO = 6
const LARGO_PROMPT = 1200

// ---------------------------------------------------------------------------
// Texto
// ---------------------------------------------------------------------------

/**
 * Pasa un texto a minúsculas sin tildes y con un espacio delante de cada
 * palabra, para buscar raíces de palabra: « investigar jurisprudencia ».
 */
export function normalizar(texto: string): string {
  const limpio = String(texto ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
  return limpio === '' ? ' ' : ` ${limpio} `
}

/** ¿Aparece la raíz (o frase) al principio de alguna palabra del texto normalizado? */
export function contiene(textoNormalizado: string, clave: string): boolean {
  const c = normalizar(clave).trim()
  return c !== '' && textoNormalizado.includes(` ${c}`)
}

/** Cuántas claves distintas aparecen en el texto. */
function coincidencias(textoNormalizado: string, claves: readonly string[]): number {
  let n = 0
  for (const clave of new Set(claves)) {
    if (contiene(textoNormalizado, clave)) n += 1
  }
  return n
}

/**
 * Detecta una sección de escrito al estilo de la skill redaccion-rapida:
 * «Sección 03 — Fundamento de fondo: responsabilidad extracontractual…».
 */
export function detectarSeccion(texto: string | undefined): string | undefined {
  if (typeof texto !== 'string' || texto === '') return undefined
  const m = /secci[oó]n\s+(\d{1,2})\s*[—–-]+\s*([^\n]{1,200})/i.exec(texto.slice(0, 2000))
  if (m === null) return undefined
  const numero = (m[1] ?? '').padStart(2, '0')
  const resto = (m[2] ?? '').replace(/\s*Extensi[oó]n:.*$/i, '').trim().slice(0, 140)
  return `Sección ${numero} — ${resto}`
}

// ---------------------------------------------------------------------------
// Reparto
// ---------------------------------------------------------------------------

/** Todas las claves de un oficio: las suyas y las de sus acciones. */
function clavesDe(oficio: Oficio): string[] {
  return [...oficio.claves, ...oficio.acciones.flatMap(a => a.claves)]
}

/** ¿El tipo de subagente es uno de los suyos? «*:redactor-seccion» vale para cualquier plugin. */
function tipoCoincide(lista: readonly string[], tipo: string): boolean {
  if (tipo === '') return false
  const t = tipo.toLowerCase()
  return lista.some(x => {
    const y = x.toLowerCase()
    return y.startsWith('*') ? t.endsWith(y.slice(1)) : t === y
  })
}

/** ¿Es una sección de un escrito (redaccion-rapida)? */
function esSeccion(tipo: string, seccion: string | undefined): boolean {
  return seccion !== undefined || /redactor-seccion$/i.test(tipo)
}

/**
 * ¿La descripción pide que ataquen nuestro escrito desde la otra parte?
 * Hace falta la otra parte («contraria», «adversario», «abogado del diablo»)
 * Y un ataque («atacar», «grietas», «debilidades», «puntos débiles»): así
 * «Preparar recurso para atacar la sentencia» o «Contestación a la demanda de
 * la parte contraria» siguen siendo nuestros (de Luis).
 */
function esAtaqueDeLaContraria(descripcionNormalizada: string): boolean {
  if (descripcionNormalizada.includes('abogado del diablo')) return true
  const otraParte = ['contrari', 'adversari', 'otra parte'].some(c => descripcionNormalizada.includes(c))
  const ataque = ['atac', 'ataque', 'grieta', 'debilidad', 'puntos debiles'].some(c => descripcionNormalizada.includes(c))
  return otraParte && ataque
}

/**
 * Decide de qué oficio es una tarea y con qué acción. Es determinista: la
 * misma tarea con el mismo equipo da siempre el mismo oficio.
 */
export function asignar(config: ConfigEquipo, datos: DatosTarea): Reparto {
  const tipoCrudo = String(datos.tipo ?? '').trim()
  const prompt = String(datos.prompt ?? '')
  const seccion = detectarSeccion(datos.descripcion) ?? detectarSeccion(prompt)
  const seccionDeEscrito = esSeccion(tipoCrudo, seccion)

  // En una sección de escrito solo compiten los oficios que redactan secciones.
  const redactores = config.oficios.filter(o => o.redactaSecciones)
  const candidatos = seccionDeEscrito && redactores.length > 0 ? redactores : config.oficios

  // Si la descripción nombra delante a alguien del equipo («Elena: revisar la
  // coherencia», «Juan — comprobar las citas»), la tarea es suya: Claude ya ha
  // dicho a quién se la encarga y en pantalla no puede salir otro nombre.
  const nombrada = sinNombreDelante(
    datos.descripcion,
    config.oficios.flatMap(o => o.personas.map(x => x.nombre)),
  )
  const descripcion = nombrada.texto

  const d = normalizar(seccion !== undefined ? `${seccion} ${descripcion}` : descripcion)
  const primerVerbo = normalizar(normalizar(descripcion).trim().split(' ')[0] ?? '')
  const t = normalizar(tipoCrudo)
  const p = normalizar(prompt.slice(0, LARGO_PROMPT))

  if (nombrada.nombre !== undefined) {
    for (const oficio of config.oficios) {
      const persona = oficio.personas.find(x => x.nombre === nombrada.nombre)
      if (persona !== undefined) {
        return { oficio, accion: elegirAccion(oficio, d, t, p), puntos: TIPO_EXACTO, persona: persona.id, ...(seccion !== undefined ? { seccion } : {}) }
      }
    }
  }

  let mejor: { oficio: Oficio; total: number; enDescripcion: number } | undefined
  for (const oficio of candidatos) {
    const claves = clavesDe(oficio)
    const enDescripcion = coincidencias(d, claves)
    const verbo = primerVerbo !== ' ' && coincidencias(primerVerbo, claves) > 0 ? 1 : 0
    const total =
      enDescripcion * PESO_DESCRIPCION +
      verbo * PESO_PRIMER_VERBO +
      coincidencias(t, claves) * PESO_TIPO +
      Math.min(MAX_COINCIDENCIAS_PROMPT, coincidencias(p, claves)) * PESO_PROMPT +
      (tipoCoincide(oficio.tiposDeSubagente, tipoCrudo) ? TIPO_EXACTO : 0)
    // Empate: gana quien más coincide en la descripción; si sigue, el que va
    // antes en la lista del equipo (por eso el reparto no depende del azar).
    if (mejor === undefined || total > mejor.total || (total === mejor.total && enDescripcion > mejor.enDescripcion)) {
      mejor = { oficio, total, enDescripcion }
    }
  }

  const conSeccion = seccion !== undefined ? { seccion } : {}
  // Un ataque de la parte contraria es SIEMPRE del abogado contrario, aunque el
  // encargo hable de «demanda», «escrito» o «fundamentos» (claves de Luis).
  const rival = config.oficios.find(o => o.rival === true)
  if (rival !== undefined && !seccionDeEscrito && esAtaqueDeLaContraria(d)) {
    return { oficio: rival, accion: elegirAccion(rival, d, t, p), puntos: Math.max(mejor?.total ?? 0, TIPO_EXACTO), ...conSeccion }
  }
  if (mejor === undefined || mejor.total === 0) {
    // No encaja con nadie: al oficio por defecto (o al de secciones), con su acción genérica.
    const oficio = oficioDe(config, seccionDeEscrito ? config.porDefectoSeccion : config.porDefecto)
    return { oficio, accion: elegirAccion(oficio, d, t, p), puntos: 0, ...conSeccion }
  }
  return { oficio: mejor.oficio, accion: elegirAccion(mejor.oficio, d, t, p), puntos: mejor.total, ...conSeccion }
}

/**
 * La acción que describe la tarea: se miran las acciones EN ORDEN y gana la
 * primera cuyas claves salen en la descripción (luego en el tipo, luego en el
 * encargo). Por eso en el JSON las concretas («la contestación») van arriba y
 * la genérica (sin claves) al final. Si ninguna encaja, la genérica.
 */
function elegirAccion(oficio: Oficio, d: string, t: string, p: string): number {
  for (const texto of [d, t, p]) {
    const i = oficio.acciones.findIndex(a => a.claves.length > 0 && coincidencias(texto, a.claves) > 0)
    if (i >= 0) return i
  }
  const generica = oficio.acciones.findIndex(a => a.claves.length === 0)
  return generica >= 0 ? generica : 0
}

/**
 * Qué persona del oficio se queda una tarea nueva: la primera del grupo que
 * no tiene nada entre manos; si todas están ocupadas, la que menos tareas
 * lleva (en empate, la que va antes). Así 4 secciones de fondo a la vez son
 * Luis, Andrés, Javier y Raúl, no cuatro veces Luis.
 */
export function elegirPersona(oficio: Oficio, tareas: readonly Tarea[]): Persona {
  const carga = new Map<string, number>(oficio.personas.map(p => [p.id, 0]))
  for (const t of tareas) {
    if (t.estado === 'trabajando' && t.oficio === oficio.id && carga.has(t.persona)) {
      carga.set(t.persona, (carga.get(t.persona) ?? 0) + 1)
    }
  }
  let elegida = oficio.personas[0] as Persona
  let menor = Number.POSITIVE_INFINITY
  for (const persona of oficio.personas) {
    const n = carga.get(persona.id) ?? 0
    if (n < menor) {
      elegida = persona
      menor = n
    }
  }
  return elegida
}

// ---------------------------------------------------------------------------
// Búsquedas a prueba de equipos editados a mitad de sesión
// ---------------------------------------------------------------------------

/** El oficio por su id, o el de por defecto, o el primero. */
export function oficioDe(config: ConfigEquipo, id: string): Oficio {
  return (
    config.oficios.find(o => o.id === id) ??
    config.oficios.find(o => o.id === config.porDefecto) ??
    (config.oficios[0] as Oficio)
  )
}

/** La persona de una tarea y su oficio, aunque el equipo haya cambiado. */
export function personaDe(config: ConfigEquipo, oficioId: string, personaId: string): { oficio: Oficio; persona: Persona } {
  const oficio = oficioDe(config, oficioId)
  const enSuOficio = oficio.personas.find(p => p.id === personaId)
  if (enSuOficio !== undefined) return { oficio, persona: enSuOficio }
  for (const otro of config.oficios) {
    const p = otro.personas.find(x => x.id === personaId)
    if (p !== undefined) return { oficio: otro, persona: p }
  }
  return { oficio, persona: oficio.personas[0] as Persona }
}

/** La acción de una tarea, a prueba de equipos editados. */
export function accionDe(oficio: Oficio, indice: number): Accion {
  return (
    oficio.acciones[indice] ??
    oficio.acciones[0] ?? { claves: [], gerundio: 'trabajando', participio: 'ha terminado' }
  )
}

// ---------------------------------------------------------------------------
// Frases
// ---------------------------------------------------------------------------

/** Lo que hace, sin el nombre: «está redactando la contestación», «ha terminado el borrador». */
export function fraseSinNombre(accion: Accion, estado: EstadoTarea): string {
  switch (estado) {
    case 'trabajando':
      return `está ${accion.gerundio}`
    case 'terminada':
      return accion.participio
    case 'fallida':
      return 'no ha podido terminar'
    case 'detenida':
      return 'ha parado'
  }
}

/** Frase natural del estado de una tarea: «Luis está redactando la contestación». */
export function frase(persona: Persona, accion: Accion, estado: EstadoTarea): string {
  return `${persona.nombre} ${fraseSinNombre(accion, estado)}`
}

/** «sección 03» a partir de «Sección 03 — …», para las filas cortas. */
export function seccionCorta(seccion: string | undefined): string | undefined {
  const m = seccion === undefined ? null : /Secci[oó]n (\d{2})/.exec(seccion)
  return m === null ? undefined : `sección ${m[1]}`
}

/** Duración legible: «45 s», «2 min 10 s», «1 h 5 min». */
export function duracion(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000))
  if (s < 60) return `${s} s`
  const min = Math.floor(s / 60)
  if (min < 60) return s % 60 === 0 || min >= 10 ? `${min} min` : `${min} min ${s % 60} s`
  const h = Math.floor(min / 60)
  return min % 60 === 0 ? `${h} h` : `${h} h ${min % 60} min`
}

/** Tiempo que lleva (o llevó) una tarea. */
export function tiempoDe(tarea: Tarea, ahora: number): string {
  return duracion((tarea.fin ?? ahora) - tarea.inicio)
}

/** Las personas con tareas en curso, la que más lleva primero. */
export function enCursoPorPersona(
  config: ConfigEquipo,
  tareas: readonly Tarea[],
): Array<{ oficio: Oficio; persona: Persona; tareas: Tarea[] }> {
  const grupos = new Map<string, { oficio: Oficio; persona: Persona; tareas: Tarea[] }>()
  for (const tarea of tareas) {
    if (tarea.estado !== 'trabajando') continue
    const { oficio, persona } = personaDe(config, tarea.oficio, tarea.persona)
    const grupo = grupos.get(persona.id) ?? { oficio, persona, tareas: [] }
    grupo.tareas.push(tarea)
    grupos.set(persona.id, grupo)
  }
  return [...grupos.values()].sort((a, b) => b.tareas.length - a.tareas.length)
}

/**
 * Resumen de una línea. Con pocas personas: «Luis redactando el borrador ·
 * Juan buscando jurisprudencia · 2 terminadas». Con muchas (10, 15, 20…), por
 * oficio: «12 trabajando · Redacción de fondo ×4 · Documentación: Supremo ×3 ·
 * 3 terminadas».
 */
export function resumen(config: ConfigEquipo, tareas: readonly Tarea[], corto = false): string {
  const personas = enCursoPorPersona(config, tareas)
  const activas = tareas.filter(t => t.estado === 'trabajando').length
  const hechas = tareas.length - activas
  const textoHechas = `${hechas} ${hechas === 1 ? 'terminada' : 'terminadas'}`
  if (personas.length === 0) {
    return hechas > 0 ? `todo el equipo ha terminado · ${hechas} ${hechas === 1 ? 'tarea hecha' : 'tareas hechas'}` : ''
  }
  let partes: string[]
  if (personas.length <= 3) {
    partes = personas.map(({ oficio, persona, tareas: suyas }) => {
      const accion = accionDe(oficio, (suyas[suyas.length - 1] as Tarea).accion)
      const texto = corto ? `${persona.nombre} ${accion.gerundio.split(' ')[0] ?? ''}` : `${persona.nombre} ${accion.gerundio}`
      return suyas.length > 1 ? `${texto} ×${suyas.length}` : texto
    })
  } else {
    // Muchas a la vez: quién y cuántas lleva cada uno («Luis ×4 · Juan ×2 · Clara»).
    partes = [
      `${activas} trabajando`,
      ...personas.map(({ oficio, persona, tareas: suyas }) => {
        const quien = corto ? oficio.emoji : persona.nombre
        return suyas.length > 1 ? `${quien} ×${suyas.length}` : quien
      }),
    ]
  }
  if (hechas > 0) partes.push(textoHechas)
  return partes.join(' · ')
}

// ---------------------------------------------------------------------------
// Herramientas que usa cada subagente (solo se observan)
// ---------------------------------------------------------------------------

/** Las dos últimas partes de una ruta: «secciones/03-fondo.md». */
export function rutaCorta(ruta: string): string {
  const partes = ruta.split(/[\\/]+/).filter(Boolean)
  return partes.slice(-2).join('/')
}

function textoDe(v: unknown, largo = 70): string | undefined {
  if (typeof v !== 'string' || v.trim() === '') return undefined
  const una = v.replace(/\s+/g, ' ').trim()
  return una.length > largo ? `${una.slice(0, largo - 1)}…` : una
}

const ARCHIVO_ESCRITO = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit'])

/** El archivo que escribe o edita una llamada, si es de las que escriben. */
export function archivoDe(herramienta: string, entrada: unknown): string | undefined {
  if (!ARCHIVO_ESCRITO.has(herramienta) || typeof entrada !== 'object' || entrada === null) return undefined
  const e = entrada as Record<string, unknown>
  const ruta = e.file_path ?? e.notebook_path
  return typeof ruta === 'string' && ruta !== '' ? ruta : undefined
}

/**
 * Cómo se cuenta una llamada a una herramienta en la ficha de la persona:
 * «buscar_sentencias «responsabilidad extracontractual» (TS)»,
 * «Write secciones/03-fondo.md», «leer_sentencias STS 1234/2023».
 */
export function detalleHerramienta(herramienta: string, entrada: unknown): string {
  const nombre = herramienta.includes('__') ? (herramienta.split('__').pop() ?? herramienta) : herramienta
  const e = (typeof entrada === 'object' && entrada !== null ? entrada : {}) as Record<string, unknown>
  const corto = (s: string): string => (s.length > 110 ? `${s.slice(0, 109)}…` : s)

  if (ARCHIVO_ESCRITO.has(herramienta) || herramienta === 'Read') {
    const ruta = textoDe(e.file_path ?? e.notebook_path, 400)
    return corto(ruta === undefined ? nombre : `${nombre} ${rutaCorta(ruta)}`)
  }
  if (herramienta === 'Bash' || herramienta === 'PowerShell') return corto(`${nombre} ${textoDe(e.command, 60) ?? ''}`.trim())
  if (herramienta === 'Grep' || herramienta === 'Glob') return corto(`${nombre} «${textoDe(e.pattern, 50) ?? ''}»`)
  if (herramienta === 'WebSearch') return corto(`${nombre} «${textoDe(e.query, 60) ?? ''}»`)
  if (herramienta === 'WebFetch') return corto(`${nombre} ${textoDe(e.url, 70) ?? ''}`.trim())

  // Jurisprudenciator y otros conectores: lo que se busca, se lee o se verifica.
  if (nombre === 'buscar_sentencias') {
    const base = textoDe(e.base, 10)
    return corto(`${nombre} «${textoDe(e.consulta, 60) ?? ''}»${base !== undefined ? ` (${base})` : ''}`)
  }
  if (nombre === 'buscar_articulo') return corto(`${nombre} art. ${textoDe(e.articulo, 15) ?? '?'} ${textoDe(e.ley, 40) ?? ''}`.trim())
  if (nombre === 'leer_sentencias' || nombre === 'buscar_por_cita') return corto(`${nombre} ${textoDe(e.citas ?? e.cita, 70) ?? ''}`.trim())
  if (nombre === 'verificar_escrito') {
    const largo = typeof e.texto === 'string' ? e.texto.length : 0
    return `${nombre} (${largo} caracteres)`
  }
  const primero = Object.values(e).map(v => textoDe(v, 60)).find(v => v !== undefined)
  return corto(primero === undefined ? nombre : `${nombre} «${primero}»`)
}

// ---------------------------------------------------------------------------
// Validación de config/equipo.json
// ---------------------------------------------------------------------------

export type Validacion = { ok: true; config: ConfigEquipo; avisos: string[] } | { ok: false; error: string }

function texto(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined
}

function listaDeTextos(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim() !== '') : []
}

/**
 * El género de una persona: el que diga el JSON («f» o «m»; también «mujer»,
 * «hombre»). Si no lo dice, se deduce del nombre (acabado en «a» → mujer, con
 * las excepciones habituales), para que un equipo antiguo no salga todo igual.
 */
export function generoDe(valor: unknown, nombre: string): Genero {
  const v = typeof valor === 'string' ? normalizar(valor).trim() : ''
  if (v === 'f' || v === 'mujer' || v === 'femenino' || v === 'ella') return 'f'
  if (v === 'm' || v === 'hombre' || v === 'masculino' || v === 'el') return 'm'
  const n = normalizar(nombre).trim().split(' ')[0] ?? ''
  const DE_MUJER = ['carmen', 'pilar', 'isabel', 'raquel', 'ines', 'beatriz', 'mercedes', 'dolores', 'rocio', 'consuelo', 'belen', 'esther', 'ester', 'ruth', 'judith', 'miriam', 'noemi', 'leonor', 'montserrat', 'nieves', 'luz', 'mar', 'sol', 'paz', 'cruz', 'irene', 'salome', 'maite', 'marisol', 'lourdes', 'soledad', 'trinidad', 'asuncion', 'concepcion', 'encarnacion']
  const DE_HOMBRE = ['luca', 'borja', 'josema', 'garcia', 'joshua', 'elia']
  if (DE_MUJER.includes(n)) return 'f'
  if (DE_HOMBRE.includes(n)) return 'm'
  return n.endsWith('a') ? 'f' : 'm'
}

function idDe(nombre: string): string {
  return normalizar(nombre).trim().replace(/ /g, '-') || 'x'
}

function acciones(v: unknown): Accion[] {
  const lista: Accion[] = Array.isArray(v)
    ? v
        .filter((a): a is Record<string, unknown> => typeof a === 'object' && a !== null)
        .map(a => ({
          claves: listaDeTextos(a.claves),
          gerundio: texto(a.gerundio) ?? 'trabajando',
          participio: texto(a.participio) ?? 'ha terminado',
        }))
    : []
  return lista.length > 0 ? lista : [{ claves: [], gerundio: 'trabajando', participio: 'ha terminado' }]
}

/**
 * Pasa el formato antiguo (`miembros`: una persona por oficio) al nuevo
 * (`oficios`, cada uno con sus `personas`), para no romper equipos ya editados.
 */
function deFormatoAntiguo(raiz: Record<string, unknown>): Record<string, unknown> {
  const miembros = Array.isArray(raiz.miembros) ? raiz.miembros : []
  return {
    ...raiz,
    oficios: miembros.map(m => {
      const r = (typeof m === 'object' && m !== null ? m : {}) as Record<string, unknown>
      return {
        ...r,
        grupo: r.grupo ?? r.oficio,
        personas: [{ id: r.id, nombre: r.nombre, inicial: r.inicial, muletillas: r.muletillas }],
      }
    }),
  }
}

/**
 * Comprueba el JSON del equipo y rellena lo que falte (iniciales, colores,
 * acción genérica…). Devuelve avisos para lo que se ha corregido.
 */
export function validarConfig(crudo: unknown): Validacion {
  if (typeof crudo !== 'object' || crudo === null) {
    return { ok: false, error: 'el archivo no contiene un objeto JSON' }
  }
  let raiz = crudo as Record<string, unknown>
  const avisos: string[] = []
  if (!Array.isArray(raiz.oficios) && Array.isArray(raiz.miembros)) {
    raiz = deFormatoAntiguo(raiz)
    avisos.push('formato antiguo («miembros»): cada miembro pasa a ser un oficio de una persona')
  }
  if (!Array.isArray(raiz.oficios) || raiz.oficios.length === 0) {
    return { ok: false, error: 'falta la lista «oficios» o está vacía' }
  }

  const oficios: Oficio[] = []
  const idsOficio = new Set<string>()
  const idsPersona = new Set<string>()
  raiz.oficios.forEach((o, i) => {
    if (typeof o !== 'object' || o === null) {
      avisos.push(`el oficio ${i + 1} no es un objeto y se ignora`)
      return
    }
    const r = o as Record<string, unknown>
    const nombreOficio = texto(r.oficio) ?? texto(r.grupo)
    if (nombreOficio === undefined) {
      avisos.push(`el oficio ${i + 1} no tiene «oficio» y se ignora`)
      return
    }
    let id = texto(r.id) ?? idDe(nombreOficio)
    if (idsOficio.has(id)) {
      id = `${id}-${i + 1}`
      avisos.push(`id de oficio repetido; pasa a ser «${id}»`)
    }
    idsOficio.add(id)

    const personas: Persona[] = []
    const lista = Array.isArray(r.personas) ? r.personas : []
    lista.forEach((p, j) => {
      const q = (typeof p === 'string' ? { nombre: p } : typeof p === 'object' && p !== null ? p : {}) as Record<string, unknown>
      const nombre = texto(q.nombre)
      if (nombre === undefined) {
        avisos.push(`una persona de «${nombreOficio}» no tiene nombre y se ignora`)
        return
      }
      let pid = texto(q.id) ?? idDe(nombre)
      if (idsPersona.has(pid)) {
        pid = `${pid}-${id}-${j + 1}`
        avisos.push(`hay dos personas con el id de ${nombre}; una pasa a ser «${pid}»`)
      }
      idsPersona.add(pid)
      personas.push({
        id: pid,
        nombre,
        inicial: (texto(q.inicial) ?? nombre).slice(0, 1).toUpperCase(),
        muletillas: listaDeTextos(q.muletillas),
        genero: generoDe(q.genero, nombre),
      })
    })
    if (personas.length === 0) {
      avisos.push(`«${nombreOficio}» no tiene personas y se ignora`)
      return
    }

    oficios.push({
      id,
      oficio: nombreOficio,
      grupo: texto(r.grupo) ?? nombreOficio,
      emoji: texto(r.emoji) ?? '👤',
      color: texto(r.color) ?? 'claude',
      claves: listaDeTextos(r.claves),
      tiposDeSubagente: listaDeTextos(r.tiposDeSubagente),
      redactaSecciones: r.redactaSecciones === true,
      acciones: acciones(r.acciones),
      personas,
      ...(r.rival === true ? { rival: true } : {}),
    })
  })
  if (oficios.length === 0) {
    return { ok: false, error: 'ningún oficio es válido' }
  }

  const primero = (oficios[0] as Oficio).id
  let porDefecto = texto(raiz.porDefecto) ?? primero
  if (!oficios.some(o => o.id === porDefecto)) {
    // En el formato antiguo «porDefecto» era el id de una persona, que también es el de su oficio.
    avisos.push(`«porDefecto» (${porDefecto}) no es un oficio del equipo; uso «${primero}»`)
    porDefecto = primero
  }
  let porDefectoSeccion = texto(raiz.porDefectoSeccion) ?? oficios.find(o => o.redactaSecciones)?.id ?? porDefecto
  if (!oficios.some(o => o.id === porDefectoSeccion)) {
    avisos.push(`«porDefectoSeccion» (${porDefectoSeccion}) no es un oficio del equipo; uso «${porDefecto}»`)
    porDefectoSeccion = porDefecto
  }
  const tono = raiz.tono === 'profesional' ? 'profesional' : 'informal'
  if (raiz.tono !== undefined && raiz.tono !== 'informal' && raiz.tono !== 'profesional') {
    avisos.push(`«tono» (${String(raiz.tono)}) no es «informal» ni «profesional»; uso «informal»`)
  }
  // El abogado contrario no es del despacho: no cuenta para las 7-8 personas.
  const personas = oficios.filter(o => o.rival !== true).reduce((n, o) => n + o.personas.length, 0)
  if (personas > 8) avisos.push(`hay ${personas} personas; la oficina está pensada para 7 u 8`)
  return {
    ok: true,
    avisos,
    config: {
      porDefecto,
      porDefectoSeccion,
      abrirPanelAlEmpezar: raiz.abrirPanelAlEmpezar !== false,
      tono,
      avisosEmergentes: raiz.avisosEmergentes !== false,
      director: (texto(raiz.director) ?? 'Carlos').slice(0, 30),
      generoDirector: generoDe(raiz.generoDirector, texto(raiz.director) ?? 'Carlos'),
      oficios,
    },
  }
}

/** Saca el nombre y la descripción del bloque `meta` de un guion de Workflow. */
export function metaDeFlujo(script: unknown, nombre: unknown): { nombre: string; descripcion: string } {
  const fuente = typeof script === 'string' ? script.slice(0, 4000) : ''
  const campo = (clave: string): string | undefined => {
    const m = new RegExp(`${clave}\\s*:\\s*(['"\`])((?:(?!\\1).){1,300})\\1`).exec(fuente)
    return m?.[2]
  }
  return {
    nombre: campo('name') ?? (typeof nombre === 'string' && nombre !== '' ? nombre : 'encargo'),
    descripcion: campo('description') ?? '',
  }
}
