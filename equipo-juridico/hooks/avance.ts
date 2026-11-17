// Barra de avance del escrito: cuándo se pide redactar un escrito judicial y
// qué porcentaje del TRABAJO TOTAL lleva hecho, desde que se empieza a
// investigar hasta que se entrega el Word completo (0, 5, 10… 100 %).
//
// Es UNA sola barra para todo el flujo: nunca «el 40 % de la investigación»,
// siempre «el 40 % de toda la demanda», y aparte en qué paso está ahora.
// Pesos con la skill redaccion-rapida:
//   ·  0– 5 % arranque (estado de Jurisprudenciator, escrito.py iniciar)
//   ·  5–15 % consultas propias y caso.md con el plan
//   · 15–20 % lanzamiento del equipo de redactores
//   · 20–75 % secciones: palabras escritas frente a la extensión de cada
//              encargo y trabajo de cada redactor
//   · 75–90 % escrito.py ensamblar y corrección de sus errores
//   · 90–97 % lectura de coherencia y reensamblado
//   · 100 %   solo cuando el Word final existe y Claude lo entrega
// Si Claude redacta sin subagentes: investigación (5–35 %), borrador
// (40–75 %), verificación de citas (80 %) y Word (95 %).
// Todo sale de lo observable (herramientas, archivos y sus palabras, los
// redactores y el Bash con escrito.py); el porcentaje nunca retrocede.

import type { Redaccion, Tarea } from '../types'
import { contiene, normalizar } from './equipo'
import { conTildes } from './llano'

/** Raíces de verbo que piden redactar algo. */
const VERBOS = ['redact', 'escrib', 'elabor', 'prepar', 'haz', 'hacer', 'draft', 'necesito', 'quiero']

/** Raíces de los escritos judiciales y extrajudiciales que cuentan. */
const ESCRITOS = [
  'demanda', 'contestacion', 'recurso', 'apelacion', 'casacion', 'reposicion', 'suplicacion', 'querella', 'denuncia',
  'escrito', 'alegaciones', 'oposicion', 'conclusiones', 'incidente', 'solicitud', 'reclamacion', 'burofax',
  'requerimiento', 'papeleta', 'monitorio', 'impugnacion', 'medidas cautelares', 'recurso de alzada',
]

/**
 * Otros documentos de despacho que no encienden la barra por sí solos (una
 * «carta» puede ser de ventas), pero que dan título al escrito cuando lo que
 * se carga es una skill de redactar («Carta al cliente», no «Redaccion rapida»).
 */
const OTROS_DOCUMENTOS = ['carta', 'contrato', 'dictamen', 'informe', 'minuta', 'acta', 'convenio', 'poder', 'hoja de encargo', 'nota']

/** Cuántas palabras puede haber entre el verbo y el escrito («redacta YA una demanda…»). */
const DISTANCIA = 8

/** Palabras que enlazan las partes de un título: «recurso DE apelación», «contestación A LA demanda». */
const ENLACES = new Set(['de', 'del', 'a', 'al', 'la', 'el', 'los', 'las', 'por', 'sobre'])
/** Palabras que pueden ir pegadas a otra sin enlace: «juicio VERBAL», «escrito JUDICIAL». */
const ADJETIVOS = new Set([
  'verbal', 'ordinario', 'monitorio', 'cambiario', 'civil', 'penal', 'laboral', 'social', 'mercantil', 'judicial', 'extrajudicial',
  'cautelares', 'cautelar', 'provisionales', 'ejecutiva', 'ejecutivo', 'colectivo', 'colectiva', 'extraordinario', 'previa', 'previas',
  'compartida', 'improcedente', 'nulo', 'objetivo', 'disciplinario', 'contencioso', 'administrativo', 'administrativa', 'hipotecaria',
  'contencioso administrativo', 'contenciosa', 'voluntaria', 'arbitral', 'concursal', 'tributaria', 'patrimonial',
])
/** Como mucho, tantas palabras con significado detrás del tipo de escrito. */
const MAX_PALABRAS_TITULO = 3
const LARGO_TITULO = 46

type Palabra = { cruda: string; norma: string }

/** Las palabras de un texto, tal como están y normalizadas (sin tildes ni signos). */
function trocear(texto: string): Palabra[] {
  return texto
    .split(/\s+/)
    .filter(Boolean)
    .map(cruda => ({ cruda, norma: normalizar(cruda).trim() }))
    .filter(p => p.norma !== '')
}

/** ¿Empieza en la palabra `i` alguno de estos documentos? («medidas cautelares» ocupa dos palabras). */
function empiezaDocumento(palabras: readonly Palabra[], i: number, raices: readonly string[]): boolean {
  return raices.some(raiz => {
    const partes = raiz.split(' ')
    return partes.every((parte, k) => (palabras[i + k]?.norma ?? '').startsWith(parte))
  })
}

/**
 * El título limpio y corto del escrito que empieza en la palabra `i`: el tipo
 * y, como mucho, su apellido («Recurso de apelación», «Demanda de juicio
 * verbal», «Contestación a la demanda de divorcio»). Se para en cuanto la
 * frase deja de nombrar el escrito: «…en tan solo un minuto», «…contra la
 * sentencia», «…donde los ocho empleados», un nombre propio, una coma o un punto.
 */
function construirTitulo(palabras: readonly Palabra[], i: number): string {
  const limpia = (p: Palabra): string => p.cruda.replace(/^[¿¡«"'(]+/, '').replace(/[.,;:!?»"')…]+$/, '')
  const partes: string[] = [limpia(palabras[i] as Palabra)]
  let conSignificado = 0
  let anteriorEsEnlace = false
  for (let j = i + 1; j < palabras.length && j <= i + 9; j += 1) {
    const p = palabras[j] as Palabra
    const anterior = palabras[j - 1] as Palabra
    // Una coma o un punto detrás de la palabra anterior cierran el título.
    if (/[.,;:!?)»]$/.test(anterior.cruda)) break
    const palabra = limpia(p)
    if (ENLACES.has(p.norma)) {
      partes.push(palabra.toLowerCase())
      anteriorEsEnlace = true
      continue
    }
    const esNombrePropio = /^[A-ZÁÉÍÓÚÑ]/.test(palabra)
    const admitida = anteriorEsEnlace ? /^[a-záéíóúüñ-]{3,}$/.test(palabra) : ADJETIVOS.has(p.norma)
    if (!admitida || esNombrePropio || PARAN_EL_TITULO.has(p.norma) || conSignificado >= MAX_PALABRAS_TITULO) break
    partes.push(palabra)
    conSignificado += 1
    anteriorEsEnlace = false
  }
  // Nunca termina en un enlace suelto («Demanda de»).
  while (partes.length > 1 && ENLACES.has(normalizar(partes[partes.length - 1] as string).trim())) partes.pop()
  let titulo = partes.join(' ')
  while (titulo.length > LARGO_TITULO && partes.length > 1) {
    partes.pop()
    while (partes.length > 1 && ENLACES.has(normalizar(partes[partes.length - 1] as string).trim())) partes.pop()
    titulo = partes.join(' ')
  }
  titulo = nombreDeDespacho(titulo)
  return titulo.charAt(0).toUpperCase() + titulo.slice(1)
}

/**
 * El nombre que se usa en un despacho, aunque al dictar se diga de otra forma:
 * «contestación de la demanda» es «Contestación a la demanda», y lo mismo la
 * oposición y la impugnación («oposición a la ejecución», «impugnación del recurso» se queda).
 */
export function nombreDeDespacho(titulo: string): string {
  return titulo
    .replace(/^(contestaci[oó]n|oposici[oó]n) de (la|el) /i, (_t, tipo: string, art: string) => `${tipo} ${art.toLowerCase() === 'el' ? 'al' : 'a la'} `)
    .replace(/^(contestaci[oó]n|oposici[oó]n) del /i, '$1 al ')
}

/** Palabras que nunca forman parte del nombre de un escrito. */
const PARAN_EL_TITULO = new Set([
  'en', 'para', 'que', 'con', 'donde', 'cuando', 'como', 'tan', 'muy', 'ya', 'ahora', 'hoy', 'contra', 'ante', 'y', 'e', 'o', 'u',
  'pero', 'porque', 'sin', 'un', 'una', 'unos', 'unas', 'este', 'esta', 'mi', 'tu', 'su', 'lo', 'le', 'me', 'te', 'se', 'es', 'mas',
  'completa', 'completo', 'entera', 'entero', 'rapido', 'rapida', 'urgente', 'nuevo', 'nueva', 'otro', 'otra', 'vamos', 'venga',
])

/** «he escrito», «has escrito»: ahí «escrito» es un verbo, no un documento. */
const AUXILIARES = new Set(['he', 'has', 'ha', 'hemos', 'han', 'habia', 'haber', 'hayas', 'haya'])

/** Busca, detrás de un verbo de pedir, el primer documento de la lista y devuelve su título. */
function tituloTrasVerbo(texto: string, raices: readonly string[]): string | undefined {
  const palabras = trocear(texto)
  for (let i = 0; i < palabras.length; i += 1) {
    if (!VERBOS.some(v => (palabras[i] as Palabra).norma.startsWith(v))) continue
    for (let j = i + 1; j < palabras.length && j <= i + DISTANCIA; j += 1) {
      if (!empiezaDocumento(palabras, j, raices)) continue
      if ((palabras[j] as Palabra).norma === 'escrito' && AUXILIARES.has((palabras[j - 1] as Palabra).norma)) continue
      return construirTitulo(palabras, j)
    }
  }
  return undefined
}

/**
 * Si el texto pide redactar un escrito judicial, devuelve su título limpio
 * («Demanda de reclamación de cantidad», «Recurso de apelación»); si no, undefined.
 */
export function pideEscrito(texto: string): string | undefined {
  return tituloTrasVerbo(texto, ESCRITOS)
}

/**
 * El título de cualquier documento de despacho que se pida («Carta al
 * cliente», «Contrato de arrendamiento»), aunque no sea un escrito judicial.
 * Solo sirve para dar nombre a la barra cuando la enciende una skill de redactar.
 */
export function tituloDeDocumento(texto: string): string | undefined {
  return tituloTrasVerbo(texto, [...ESCRITOS, ...OTROS_DOCUMENTOS])
}

/** Palabras del nombre de una skill que no nombran ningún escrito. */
const RELLENO_DE_SKILL = new Set(['redaccion', 'redactar', 'rapida', 'rapido', 'catalogo', 'espana', 'draft', 'intake'])

/**
 * El título que da una skill de redactar: «recurso-apelacion» → «Recurso de
 * apelación», «redactar-demanda-despido» → «Demanda de despido». Una skill
 * genérica («redaccion-rapida») no nombra ninguno: «Escrito».
 */
export function tituloDeSkill(nombre: string): string {
  const palabras = (nombre.split(':').pop() ?? nombre)
    .split(/[-_\s]+/)
    .filter(p => p !== '' && !RELLENO_DE_SKILL.has(normalizar(p).trim()))
    .map(p => conTildes(p.toLowerCase()))
  if (palabras.length === 0) return 'Escrito'
  const unidas: string[] = []
  palabras.forEach((p, i) => {
    const n = normalizar(p).trim()
    const previa = i > 0 ? normalizar(palabras[i - 1] as string).trim() : ''
    // «recurso apelación» → «recurso de apelación»; «medidas cautelares» se queda igual.
    if (i > 0 && !ENLACES.has(n) && !ENLACES.has(previa) && !ADJETIVOS.has(n) && n !== 'y') unidas.push('de')
    unidas.push(p)
  })
  const titulo = unidas.slice(0, 6).join(' ')
  return titulo.charAt(0).toUpperCase() + titulo.slice(1)
}

/** Skills que acompañan a la redacción pero no son redactar un escrito (estilo, perfil, triaje…). */
const NO_SON_DE_ESCRITO = ['estilo', 'perfil', 'verific', 'revision', 'triage', 'intake', 'briefing', 'status', 'customize', 'cronologia', 'cuadro', 'subsuncion', 'interrogatorio', 'conservacion', 'received']

/** ¿Es una skill de redactar escritos (redaccion-rapida, recurso-apelacion, redactar-demanda…)? */
export function esSkillDeEscrito(nombre: string): boolean {
  const n = normalizar(nombre)
  if (NO_SON_DE_ESCRITO.some(x => contiene(n, x))) return false
  return contiene(n, 'redact') || contiene(n, 'redaccion') || ESCRITOS.some(e => contiene(n, e))
}

/** Una redacción recién pedida. */
export function nuevaRedaccion(titulo: string, ahora: number): Redaccion {
  return {
    titulo,
    inicio: ahora,
    ultimo: ahora,
    porcentaje: 0,
    fase: 'preparando el encargo',
    herramientas: 0,
    investigaciones: 0,
    skill: false,
    casoMd: false,
    arranque: false,
    borrador: 0,
    ensamblados: 0,
    ensamblesOk: 0,
    correcciones: 0,
    coherencia: false,
    retoques: 0,
    verificado: false,
    docx: false,
    terminado: false,
  }
}

/**
 * Completa una redacción guardada por una versión anterior del mod (le faltan
 * campos), para que una demanda en marcha no pierda su barra al recargar.
 */
export function completarRedaccion(r: Redaccion): Redaccion {
  const antigua = r as Redaccion & { ensamblado?: boolean }
  const base = nuevaRedaccion(typeof r.titulo === 'string' ? r.titulo : 'Escrito', typeof r.inicio === 'number' ? r.inicio : 0)
  const completa: Redaccion = { ...base, ...r }
  for (const clave of ['arranque', 'coherencia', 'casoMd', 'skill', 'verificado', 'docx', 'terminado'] as const) {
    if (typeof completa[clave] !== 'boolean') completa[clave] = false
  }
  for (const clave of ['ensamblados', 'ensamblesOk', 'correcciones', 'retoques', 'borrador', 'herramientas', 'investigaciones', 'porcentaje'] as const) {
    if (typeof completa[clave] !== 'number' || Number.isNaN(completa[clave])) completa[clave] = 0
  }
  if (antigua.ensamblado === true && completa.ensamblados === 0) completa.ensamblados = 1
  return completa
}

const INVESTIGACION = new Set(['buscar_sentencias', 'leer_sentencias', 'buscar_articulo', 'buscar_por_cita', 'buscar_boe', 'leer_boe', 'buscar_convenio', 'leer_convenio'])

/**
 * Apunta lo que delata una herramienta de la conversación principal. Devuelve
 * la redacción actualizada (sin tocar la original). `ok` dice si salió bien.
 */
export function anotarHerramienta(r: Redaccion, herramienta: string, args: Record<string, unknown>, ok: boolean, ahora: number): Redaccion {
  const corto = herramienta.includes('__') ? (herramienta.split('__').pop() ?? herramienta) : herramienta
  const ruta = typeof args.file_path === 'string' ? args.file_path.replace(/\\/g, '/') : ''
  const orden = typeof args.command === 'string' ? args.command : ''
  const n: Redaccion = { ...r, herramientas: r.herramientas + 1, ultimo: ahora }
  if (INVESTIGACION.has(corto)) n.investigaciones += 1
  if (corto === 'estado') n.arranque = true
  if (corto === 'verificar_escrito') n.verificado = true
  if (corto === 'Skill' && typeof args.skill === 'string' && esSkillDeEscrito(args.skill)) n.skill = true

  if ((corto === 'Bash' || corto === 'PowerShell') && orden !== '') {
    if (/escrito\.py/i.test(orden) && /\biniciar\b/i.test(orden)) n.arranque = true
    // El ensamblado cuenta aunque avise de errores (código 2): el escrito ya
    // está entero. Si sale bien, deja escrito el Word.
    if (/ensambl/i.test(orden)) {
      n.ensamblados += 1
      if (ok) {
        n.ensamblesOk += 1
        n.docx = true
      }
    } else if (ok && /\.docx/i.test(orden)) n.docx = true
    // El escrito también puede salir en PDF, por otra vía que el ensamblador.
    // Solo cuenta con la redacción ya avanzada y si la orden GENERA un PDF:
    // leer los PDF del expediente al principio no es entregar nada.
    else if (ok && r.porcentaje >= 40 && /\.pdf/i.test(orden) && GENERA_PDF.test(orden)) n.pdf = true
  } else if (ok && corto === 'SendUserFile') {
    // Claude envía a la persona el documento terminado: es la entrega.
    const archivos = Array.isArray(args.files) ? args.files.filter((f): f is string => typeof f === 'string') : []
    if (archivos.some(f => /\.docx?$/i.test(f))) n.docx = true
    else if (archivos.some(f => /\.pdf$/i.test(f))) n.pdf = true
  } else if (ok && corto === 'Read' && /(^|\/)escrito\.md$/i.test(ruta) && n.ensamblesOk > 0) {
    n.coherencia = true
  } else if (ok && (corto === 'Write' || corto === 'Edit' || corto === 'MultiEdit') && ruta !== '') {
    if (/(^|\/)caso\.md$/i.test(ruta)) n.casoMd = true
    else if (/\.docx$/i.test(ruta)) n.docx = true
    else if (/(^|\/)fuentes\//i.test(ruta)) {
      // Las fuentes no son el escrito.
    } else if (/\.(md|txt|rtf)$/i.test(ruta)) {
      if (n.ensamblesOk > 0) n.retoques += 1
      else if (n.ensamblados > 0) n.correcciones += 1
      else n.borrador += 1
    }
  }
  // Si este paso es trabajo del escrito (algo ha cambiado además del contador
  // de pasos), la redacción deja de estar en pausa y vuelve a la banda.
  if (n.pausa !== undefined && SENALES.some(clave => n[clave] !== r[clave])) delete n.pausa
  return n
}

/** Órdenes que dejan hecho un PDF (convertir, generar, exportar, imprimir a PDF…). */
const GENERA_PDF = /pandoc|typst|weasyprint|wkhtmltopdf|libreoffice|soffice|docx2pdf|chrome|msedge|print-to-pdf|reportlab|fpdf|to_?pdf|pdf_?(out|gen|build)|gener|build|render|export|convert|maquet|montar|crear|--salida|--output|\s-o\s|\s>\s/i

/** Lo que delata que se sigue trabajando en el escrito (no una pregunta suelta). */
const SENALES = [
  'investigaciones', 'skill', 'casoMd', 'arranque', 'borrador', 'ensamblados', 'ensamblesOk', 'correcciones', 'coherencia', 'retoques', 'verificado', 'docx', 'pdf',
] as const satisfies ReadonlyArray<keyof Redaccion>

/** Las partes del escrito que reparte el equipo: secciones si las hay; si no, cualquier subagente. */
export function partesDe(r: Redaccion, tareas: readonly Tarea[]): { partes: Tarea[]; sonSecciones: boolean } {
  const posteriores = tareas.filter(t => t.inicio >= r.inicio)
  const secciones = posteriores.filter(t => t.seccion !== undefined || /redactor-seccion$/i.test(t.tipo))
  return secciones.length > 0 ? { partes: secciones, sonSecciones: true } : { partes: posteriores, sonSecciones: false }
}

/**
 * Cuánto lleva una sección (0 a 1): entera si ha terminado; si no, sobre todo
 * las palabras escritas frente a las pedidas, y algo por el trabajo hecho
 * (unas 8 herramientas por redactor). Nunca llega a 1 sin terminar.
 */
export function progresoParte(t: Tarea): number {
  if (t.estado !== 'trabajando') return 1
  const pasos = Math.min(1, t.herramientas / 8)
  if (t.extension !== undefined && t.extension > 0) {
    return Math.min(0.95, 0.25 * pasos + 0.75 * Math.min(1, (t.palabras ?? 0) / t.extension))
  }
  return Math.min(0.9, pasos)
}

export type Avance = { porcentaje: number; fase: string; total: number; hechas: number }

/** El porcentaje del trabajo total (múltiplo de 5) y el paso actual en palabras. */
export function calcularAvance(r: Redaccion, tareas: readonly Tarea[]): Avance {
  const { partes, sonSecciones } = partesDe(r, tareas)
  const total = partes.length
  const hechas = partes.filter(t => t.estado !== 'trabajando').length
  if (r.terminado) return { porcentaje: 100, fase: faseEntregado(r), total, hechas }

  let p = 0
  let fase = 'preparando el encargo'
  const sube = (valor: number, texto: string): void => {
    if (valor >= p) {
      p = valor
      fase = texto
    }
  }
  if (r.herramientas > 0 || total > 0) sube(2, 'preparando el encargo')
  if (r.skill) sube(3, 'preparando el encargo')
  if (r.arranque) sube(5, 'preparando la mesa de trabajo')

  const conEquipo = total > 0 || r.casoMd
  if (conEquipo) {
    if (r.investigaciones > 0) sube(5 + Math.min(5, r.investigaciones * 2), 'consultas previas del caso')
    if (r.casoMd) sube(15, 'plan del escrito listo')
    if (total > 0) {
      // Las secciones pesan según la extensión pedida a cada una (si todas la tienen).
      const pesos = partes.map(t => t.extension ?? 0)
      const conPeso = pesos.every(w => w > 0)
      const suma = conPeso ? pesos.reduce((a, b) => a + b, 0) : total
      const hecho = partes.reduce((s, t, i) => s + progresoParte(t) * (conPeso ? (pesos[i] as number) : 1), 0)
      // «el equipo redacta · 2 de 5 partes hechas»; con todas hechas, lo que
      // queda es del que une el escrito, no del equipo.
      const que =
        hechas === total
          ? 'el equipo ha terminado sus partes; uniendo el escrito'
          : sonSecciones
            ? `el equipo redacta las secciones · ${hechas} de ${total} hechas`
            : `el equipo redacta · ${hechas} de ${total} ${total === 1 ? 'parte hecha' : 'partes hechas'}`
      sube(20 + (55 * hecho) / suma, que)
    }
  } else {
    if (r.investigaciones > 0) sube(5 + Math.min(30, r.investigaciones * 4), 'investigando jurisprudencia y normativa')
    if (r.borrador > 0) sube(40 + Math.min(35, (r.borrador - 1) * 5), 'redactando el borrador')
    if (r.verificado) sube(Math.max(p, 80), 'verificando las citas')
  }
  // El documento final ya existe (por la vía que sea): solo falta entregarlo.
  if (r.docx && r.ensamblados === 0) sube(95, 'Word escrito, a punto de entregar')
  else if (r.pdf === true && r.ensamblados === 0) sube(95, 'PDF listo, a punto de entregar')

  if (r.ensamblados > 0 && r.ensamblesOk === 0) {
    sube(Math.max(p, 75 + Math.min(13, r.correcciones * 3)), r.correcciones > 0 ? 'corrigiendo los fallos del montaje' : 'montando el Word')
  }
  if (r.ensamblesOk > 0) sube(90, 'Word montado; repaso de coherencia')
  if (r.coherencia) sube(92, 'leyendo la coherencia del escrito')
  if (r.retoques > 0) sube(92 + Math.min(3, r.retoques), 'corrigiendo tras la lectura')
  if (r.ensamblesOk >= 2 && r.retoques > 0) sube(97, 'Word montado de nuevo; últimos repasos')

  return { porcentaje: Math.min(95, Math.floor(p / 5) * 5), fase, total, hechas }
}

/** ¿Se puede dar por terminado al acabar el turno principal? Solo si existe el documento final (Word o PDF). */
export function hayEscrito(r: Redaccion, _tareas: readonly Tarea[]): boolean {
  return r.docx || r.pdf === true
}

/** Cómo se dice que está entregado: «Word entregado» o «PDF entregado». */
export function faseEntregado(r: Redaccion): string {
  return r.pdf === true && !r.docx ? 'PDF entregado' : 'Word entregado'
}

/**
 * ¿Era una falsa alarma? El turno acabó sin escrito, sin skill de redactar,
 * sin arranque, sin plan y sin equipo: probablemente era una pregunta.
 */
export function sinSenalesDeEscrito(r: Redaccion, tareas: readonly Tarea[]): boolean {
  return (
    !r.skill &&
    !r.arranque &&
    !r.casoMd &&
    r.borrador === 0 &&
    r.ensamblados === 0 &&
    !r.docx &&
    partesDe(r, tareas).partes.length === 0
  )
}

/** La barra: «██████░░░░░░» con `ancho` casillas. */
export function barra(porcentaje: number, ancho: number): { llena: string; vacia: string } {
  const casillas = Math.max(4, Math.round(ancho))
  const llenas = Math.max(0, Math.min(casillas, Math.round((porcentaje / 100) * casillas)))
  return { llena: '█'.repeat(llenas), vacia: '░'.repeat(casillas - llenas) }
}
