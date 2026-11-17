// ─────────────────────────────────────────────────────────────────────────────
// citas.ts · Detección y semáforo de citas legales (funciones PURAS)
//
// HONESTIDAD DEL DISEÑO: este código NO sabe Derecho. No comprueba si una
// sentencia dice lo que Claude afirma. Solo comprueba TRAZABILIDAD:
//   · VERDE  → la cita aparece en el resultado (o en la consulta) de una
//              herramienta de verificación que Claude usó EN ESTE MISMO TURNO.
//   · ÁMBAR  → el formato es plausible, pero ninguna consulta del turno la
//              respalda: es texto escrito por el modelo.
//   · ROJO   → el formato es imposible o sospechoso (año futuro, fecha que no
//              existe, artículo fuera del rango de la norma, ECLI mal formado…).
// ─────────────────────────────────────────────────────────────────────────────

import { normalizarParaBuscar, escaparRegex } from './texto'
import { esFechaValida, MESES } from './plazos'

/** Una norma conocida (config/revisor.json). */
export type Ley = {
  clave: string // «CC», «LEC»…
  nombre: string // «Código Civil»
  alias: string[] // formas de citarla
  numeros?: string[] // «1/2000», «LO 10/1995»… (número oficial)
  maxArticulo?: number // último artículo (rango conocido; orientativo)
}

/** Configuración del revisor (config/revisor.json). */
export type ConfigRevisor = {
  /** Nombres o patrones de herramientas que cuentan como verificación. «/regex/» o texto contenido. */
  herramientasVerificacion: string[]
  /** Herramientas que NUNCA cuentan aunque encajen con un patrón. */
  excluirHerramientas: string[]
  /** Analizar también el texto que Claude escribe en archivos (Write/Edit) durante el turno. */
  analizarArchivosEscritos: boolean
  leyes: Ley[]
}

export type TipoCita = 'articulo' | 'resolucion' | 'ecli' | 'recurso' | 'cendoj'

/** Una cita encontrada en el texto. */
export type Cita = {
  clave: string // para no repetir la misma cita
  tipo: TipoCita
  texto: string // tal como aparece
  inicio: number
  fin: number
  // Artículos
  articulo?: string // «1902», «197 bis»
  numeroArticulo?: number
  ley?: string // clave de la norma («CC») o «Ley 35/2015»
  leyNombre?: string
  sinNorma?: boolean
  /** Sin norma propia: la última norma citada justo antes (solo una pista para verificar). */
  normaCercana?: string
  // Resoluciones
  organo?: string // STS, SAP, STC…
  tribunal?: string // TS, TC, AP, AN, TSJ, TJUE, JUZGADO
  numero?: string
  anio?: number
  fecha?: string // «AAAA-MM-DD» tal como se escribió (puede no existir)
  lugar?: string
  ecli?: string
  incompleta?: boolean
  /** Motivo por el que el formato es imposible o sospechoso (→ rojo). */
  problema?: string
}

export type EstadoCita = 'verificada' | 'sin_verificar' | 'sospechosa'

export type CitaRevisada = Cita & {
  estado: EstadoCita
  motivo: string
  herramienta?: string // de qué consulta salió el respaldo
}

/** Lo que devolvió UNA llamada a una herramienta de verificación del turno. */
export type Evidencia = {
  herramienta: string // nombre corto (buscar_por_cita…)
  texto: string // entrada + resultado, ya normalizados
}

export type ResumenCitas = { verificadas: number; sinVerificar: number; sospechosas: number }

// ── Herramientas de verificación ────────────────────────────────────────────

/** «mcp__servidor__buscar_por_cita» → «buscar_por_cita». */
export function nombreCorto(herramienta: string): string {
  const partes = herramienta.split('__')
  return partes[partes.length - 1] || herramienta
}

function encaja(nombre: string, patron: string): boolean {
  const p = patron.trim()
  if (!p) return false
  const regex = /^\/(.+)\/([a-z]*)$/.exec(p)
  if (regex) {
    try {
      return new RegExp(regex[1]!, regex[2]!.includes('i') ? regex[2] : regex[2] + 'i').test(nombre)
    } catch {
      return false
    }
  }
  return nombre.toLowerCase().includes(p.toLowerCase())
}

/** ¿Esta herramienta cuenta como consulta de verificación? */
export function esHerramientaVerificacion(nombre: string, config: ConfigRevisor): boolean {
  if (config.excluirHerramientas.some(p => encaja(nombre, p))) return false
  return config.herramientasVerificacion.some(p => encaja(nombre, p))
}

/** Prepara la evidencia de una llamada: lo pedido y lo devuelto, normalizado. */
export function crearEvidencia(herramienta: string, entrada: unknown, resultado: string): Evidencia {
  let textoEntrada = ''
  try {
    textoEntrada = typeof entrada === 'string' ? entrada : JSON.stringify(entrada ?? '')
  } catch {
    textoEntrada = ''
  }
  // Tope de tamaño para no llenar la memoria con resultados enormes.
  const bruto = (textoEntrada + '\n' + resultado).slice(0, 400_000)
  return { herramienta: nombreCorto(herramienta), texto: ' ' + normalizarParaBuscar(bruto) + ' ' }
}

// ── Tribunales ──────────────────────────────────────────────────────────────

/** Siglas de resolución → tribunal. */
const ORGANOS: Record<string, string> = {
  STS: 'TS', SSTS: 'TS', ATS: 'TS',
  STC: 'TC', SSTC: 'TC', ATC: 'TC',
  SAP: 'AP', SSAP: 'AP', AAP: 'AP',
  SAN: 'AN', AAN: 'AN',
  STSJ: 'TSJ', SSTSJ: 'TSJ', ATSJ: 'TSJ',
  STJUE: 'TJUE', ATJUE: 'TJUE',
  SJPI: 'JUZGADO', SJM: 'JUZGADO', SJS: 'JUZGADO', SJCA: 'JUZGADO', SJP: 'JUZGADO', SJVM: 'JUZGADO',
  AJPI: 'JUZGADO', AJM: 'JUZGADO',
}

/** Cómo puede aparecer cada tribunal en el resultado de una consulta (texto normalizado). */
const HUELLA_TRIBUNAL: Record<string, RegExp> = {
  TS: /\b(ts|sts|ssts|ats|tribunal supremo)\b/,
  TC: /\b(tc|stc|sstc|atc|tribunal constitucional)\b/,
  AP: /\b(ap[a-z]{0,3}|sap|ssap|aap|audiencia provincial)\b/,
  AN: /\b(an|san|aan|audiencia nacional)\b/,
  TSJ: /\b(tsj[a-z]{0,5}|stsj|atsj|tribunal superior de justicia)\b/,
  TJUE: /\b(tjue|stjue|tribunal de justicia|ecli eu c|ecli eu t)\b/,
  JUZGADO: /\b(juzgado|jpi|sjpi|jm|sjm|js|sjs|jca|sjca|jp|sjp|ji)\b/,
}

const NOMBRE_LARGO: Array<[RegExp, string, string]> = [
  [/^Tribunal Supremo/, 'TS', 'S'],
  [/^Tribunal Constitucional/, 'TC', 'S'],
  [/^Audiencia Provincial/, 'AP', 'S'],
  [/^Audiencia Nacional/, 'AN', 'S'],
  [/^Tribunal Superior de Justicia/, 'TSJ', 'S'],
  [/^Tribunal de Justicia de la Uni[oó]n Europea/, 'TJUE', 'S'],
]

// ── Expresiones regulares tolerantes ───────────────────────────────────────

const PATRON_MES =
  '(?:[Ee]nero|[Ff]ebrero|[Mm]arzo|[Aa]bril|[Mm]ayo|[Jj]unio|[Jj]ulio|[Aa]gosto|[Ss]ept?iembre|[Oo]ctubre|[Nn]oviembre|[Dd]iciembre)'

/** Lo que va detrás de «STS», «SAP Madrid»…: lugar, sección, número y fecha. */
const RESTO_RESOLUCION = new RegExp(
  '^' +
    // Lugar: «Madrid», «de Sevilla», «Las Palmas» (nunca «Núm», «Sala»…)
    '(?:\\s+(?:de\\s+|del\\s+)?(?!(?:N[uú]m|Sala|Secc?|Pleno|Rec)\\b)(?<lugar>[A-ZÁÉÍÓÚÑ][a-záéíóúñü]+(?:[ -](?:de |del |la |las )?[A-ZÁÉÍÓÚÑ][a-záéíóúñü]+){0,2}))?' +
    // «(Sala 1.ª)», «(Pleno)»
    '(?:\\s*\\((?<sala>[^)]{1,40})\\))?' +
    // «, sec. 14.ª», «Sección 3.ª»
    '(?:\\s*,?\\s*(?:[Ss]ecci[oó]n|[Ss]ecc?\\.)\\s*(?<seccion>\\d{1,2})\\s*\\.?\\s*[ªa]?\\.?)?' +
    // «, Sala 1.ª» o «Sala de lo Civil»
    '(?:\\s*,?\\s*[Ss]ala\\s+(?:\\d{1,2}\\s*\\.?\\s*[ªa]|de\\s+lo\\s+[A-Za-záéíóú-]+))?' +
    // «123/2020», «n.º 123/2020»
    '(?:\\s*,?\\s*(?:n\\.?\\s*[º°o]\\.?|[Nn][uú]m\\.?|[Nn]º)?\\s*(?<num>\\d{1,6})\\s*\\/\\s*(?<anio>\\d{4}))?' +
    // «de 12 de marzo de 2020» o «de 12/03/2020»
    '(?:\\s*,?\\s*(?:de\\s+)?(?:fecha\\s+)?(?:(?<dia>\\d{1,2})\\s+de\\s+(?<mes>' +
    PATRON_MES +
    ')\\s+(?:de\\s+|del\\s+)?(?<anioF>\\d{4})|(?<dd>\\d{1,2})[/.\\-](?<mm>\\d{1,2})[/.\\-](?<yy>\\d{4})))?',
  'u',
)

const RE_SIGLAS_RESOLUCION = new RegExp(`\\b(${Object.keys(ORGANOS).sort((a, b) => b.length - a.length).join('|')})\\b`, 'gu')
const RE_NOMBRE_RESOLUCION =
  /\b(Sentencia|Auto)\s+(?:del?\s+|de\s+la\s+)(Tribunal Supremo|Tribunal Constitucional|Audiencia Provincial|Audiencia Nacional|Tribunal Superior de Justicia|Tribunal de Justicia de la Uni[oó]n Europea)/gu
const RE_ARTICULO =
  /\b(?:[Aa]rt[ií]culos?|[Aa]rts?\.)\s*((?:\d{1,4}(?:\s*(?:bis|ter|qu[aá]ter|quinquies|sexies|septies|octies))?(?:\.\d{1,3})*\s*(?:(?:,|y|e|a|al)\s*(?=\d))?\s*)+)(\s*y\s*(?:ss|sigs?|siguientes)\.?)?/gu
const RE_ECLI = /\bECLI:[A-Za-z0-9:.]+/gu
const RE_RECURSO =
  /\b(?:[Rr]ec\.|[Rr]ecurso)(?:\s+(?:de\s+)?(?:[Cc]asaci[oó]n|[Aa]pelaci[oó]n|[Ss]uplicaci[oó]n|[Aa]mparo|[Qq]ueja|[Rr]evisi[oó]n|[Rr]eposici[oó]n|contencioso-administrativo)(?:\s+(?:para\s+la\s+unificaci[oó]n\s+de\s+doctrina|ordinario|por\s+infracci[oó]n\s+procesal))?)?(?:\s+(?:n\.?\s*[º°o]\.?|[Nn][uú]m\.?|[Nn]º))?\s*(\d{1,6})\s*[/-]\s*(\d{4})/gu
const RE_CENDOJ = /\b(?:[Ii]d(?:entificador)?\.?\s*)?CENDOJ\s*:?\s*(\d{4,30})/gu
const RE_ROJ = /\bROJ\s*:?\s*([A-Z]{2,5}(?:\s+[A-Z]{1,3})?)\s+(\d{1,6})\s*\/\s*(\d{4})/gu
const RE_LEY_GENERICA =
  /^(?<tipo>Ley\s+Org[aá]nica|Ley|L\.?\s?O\.?|Real\s+Decreto\s+Legislativo|Real\s+Decreto-[Ll]ey|Real\s+Decreto|R\.?\s?D\.?\s?Leg\.?|R\.?\s?D\.?\s?-?\s?[Ll](?:ey)?|R\.?\s?D\.?|Decreto\s+Legislativo|Decreto)\s*(?:n\.?\s*[º°o]\.?\s*)?(?<num>\d{1,4})\s*\/\s*(?<anio>\d{4})/u

/** Patrón tolerante a mayúsculas y tildes para un nombre largo («Código Civil»). */
function patronTolerante(alias: string): string {
  const variantes: Record<string, string> = { a: 'aáAÁ', e: 'eéEÉ', i: 'iíIÍ', o: 'oóOÓ', u: 'uúüUÚÜ', n: 'nñNÑ' }
  let salida = ''
  for (const c of alias) {
    if (/\s/.test(c)) {
      salida += '\\s+'
      continue
    }
    const base = c.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    if (variantes[base]) salida += `[${variantes[base]}]`
    else if (/[a-z]/.test(base)) salida += `[${base}${base.toUpperCase()}]`
    else salida += escaparRegex(c)
  }
  return salida
}

/** Una sigla corta («CC», «LECrim») se busca tal cual; un nombre largo, tolerante. */
function patronAlias(alias: string): string {
  const esSigla = !/\s/.test(alias) && alias.length <= 8
  return esSigla ? escaparRegex(alias) : patronTolerante(alias)
}

/** Construye (una vez por configuración) el buscador de la norma que va tras «art. X». */
function crearBuscadorNorma(leyes: readonly Ley[]) {
  const alias: Array<{ patron: string; ley: Ley }> = []
  for (const ley of leyes) for (const a of ley.alias) alias.push({ patron: patronAlias(a), ley })
  alias.sort((x, y) => y.patron.length - x.patron.length)
  const alternativas = alias.map((a, i) => `(?<a${i}>${a.patron})(?![\\p{L}\\d])`).join('|')
  const previo =
    '^[\\s,]*(?:\\([^)]{0,30}\\)\\s*)?(?:(?:apartado|ap\\.|p[aá]rrafo|n[uú]mero|n[uú]m\\.|letra|inciso)\\s*[\\w.ºª)]+[\\s,]*)*' +
    '(?:(?:del|de\\s+la|de\\s+los|de\\s+las|de\\s+el|de)\\s+)?(?:(?:vigente|actual|citad[ao])\\s+)?'
  const conAlias = alternativas ? new RegExp(previo + '(?:' + alternativas + ')', 'u') : null
  const generico = new RegExp(previo + '(?=\\S)', 'u')

  return (ventana: string): { ley: Ley | null; clave: string; nombre: string; numero?: string; anio?: number } | null => {
    if (conAlias) {
      const m = conAlias.exec(ventana)
      if (m && m.groups) {
        for (const [nombre, valor] of Object.entries(m.groups)) {
          if (valor !== undefined && nombre.startsWith('a')) {
            const ley = alias[Number(nombre.slice(1))]!.ley
            return { ley, clave: ley.clave, nombre: ley.nombre }
          }
        }
      }
    }
    const pre = generico.exec(ventana)
    if (!pre) return null
    const resto = ventana.slice(pre[0].length)
    const g = RE_LEY_GENERICA.exec(resto)
    if (!g || !g.groups) return null
    const numero = `${Number(g.groups.num)}/${g.groups.anio}`
    const tipo = /org|^l\.?\s?o/i.test(g.groups.tipo!) ? 'LO' : /leg/i.test(g.groups.tipo!) ? 'RDLeg' : /decreto|^r/i.test(g.groups.tipo!) ? 'RD' : 'Ley'
    // ¿Es una norma conocida citada por su número? («Ley 1/2000» = LEC)
    const conocida = leyes.find(l => (l.numeros ?? []).some(n => n.replace(/^\D+/, '') === numero))
    if (conocida) return { ley: conocida, clave: conocida.clave, nombre: conocida.nombre, numero, anio: Number(g.groups.anio) }
    return { ley: null, clave: `${tipo} ${numero}`, nombre: `${tipo} ${numero}`, numero, anio: Number(g.groups.anio) }
  }
}

// ── Extracción ──────────────────────────────────────────────────────────────

/**
 * Busca todas las citas de un texto. `hoy` («AAAA-MM-DD») sirve para marcar
 * como sospechosos los años y las fechas futuras.
 */
export function extraerCitas(textoOriginal: string, config: ConfigRevisor, hoy: string): Cita[] {
  const texto = textoOriginal.normalize('NFC')
  const anioActual = Number(hoy.slice(0, 4))
  const buscarNorma = crearBuscadorNorma(config.leyes)
  const encontradas: Cita[] = []

  // 1) Artículos: «art. 24 CE», «artículo 1902 del Código Civil», «arts. 399 y ss. LEC»
  for (const m of texto.matchAll(RE_ARTICULO)) {
    const inicio = m.index ?? 0
    const finNumeros = inicio + m[0].length
    const norma = buscarNorma(texto.slice(finNumeros, finNumeros + 100))
    let fin = finNumeros
    if (norma) {
      // Avanza el final de la cita hasta el nombre de la norma, para mostrarla entera.
      const ventana = texto.slice(finNumeros, finNumeros + 100)
      const pos = buscarFinNorma(ventana, norma.nombre, norma.clave, norma.ley)
      fin = finNumeros + pos
    }
    // «art. 7.3» es el artículo 7, apartado 3 (no los artículos 7 y 3): los
    // apartados («.3», «.1.1») se leen con su artículo y no cuentan aparte.
    const numeros = [...m[1]!.matchAll(/(\d{1,4})(?:\s*(bis|ter|qu[aá]ter|quinquies|sexies|septies|octies))?((?:\.\d{1,3})*)/gu)]
    const variosArticulos = numeros.length > 1
    for (const n of numeros) {
      const numero = Number(n[1])
      const articulo = n[2] ? `${numero} ${n[2].toLowerCase()}` : String(numero)
      // Con varios artículos en la misma cita («arts. 23 y 31 LEC»), cada uno con su texto.
      const propio = `art. ${articulo}${n[3] ?? ''}${norma ? ' ' + norma.clave : ''}`
      const cita: Cita = {
        clave: `art|${norma?.clave ?? '?'}|${articulo}`,
        tipo: 'articulo',
        texto: variosArticulos ? propio : texto.slice(inicio, fin).trim().replace(/[,;:]$/, ''),
        inicio,
        fin,
        articulo,
        numeroArticulo: numero,
        ...(norma ? { ley: norma.clave, leyNombre: norma.nombre } : { sinNorma: true }),
      }
      if (numero === 0) cita.problema = 'No existe el artículo 0'
      const max = norma?.ley?.maxArticulo
      if (max && numero > max) cita.problema = `${norma!.nombre}: solo tiene ${max} artículos (rango configurado)`
      if (norma?.anio && norma.anio > anioActual) cita.problema = `Norma de un año futuro (${norma.anio})`
      encontradas.push(cita)
    }
  }

  // 2) Resoluciones por sigla: «STS 123/2020», «SAP Madrid, sec. 14.ª, de 5 de mayo de 2021»
  for (const m of texto.matchAll(RE_SIGLAS_RESOLUCION)) {
    const organo = m[1]!
    const cita = leerResolucion(texto, m.index ?? 0, organo.length, organo, ORGANOS[organo] ?? '?', anioActual, hoy)
    if (cita) encontradas.push(cita)
  }
  // …y por nombre: «Sentencia del Tribunal Supremo de 12 de marzo de 2020»
  for (const m of texto.matchAll(RE_NOMBRE_RESOLUCION)) {
    const largo = NOMBRE_LARGO.find(([re]) => re.test(m[2]!))
    if (!largo) continue
    const organo = (m[1] === 'Auto' ? 'A' : 'S') + largo[1]
    const cita = leerResolucion(texto, m.index ?? 0, m[0].length, organo, largo[1], anioActual, hoy)
    if (cita) encontradas.push(cita)
  }

  // 3) ECLI: «ECLI:ES:TS:2020:1234»
  for (const m of texto.matchAll(RE_ECLI)) {
    const bruto = m[0].replace(/[.:]+$/, '')
    const ecli = bruto.toUpperCase()
    const cita: Cita = {
      clave: `ecli|${ecli}`,
      tipo: 'ecli',
      texto: bruto,
      inicio: m.index ?? 0,
      fin: (m.index ?? 0) + bruto.length,
      ecli,
    }
    const forma = /^ECLI:([A-Z]{2}|EU):([A-Z0-9]{1,7}):(\d{4}):([A-Z0-9.]{1,25})$/.exec(ecli)
    if (!forma) cita.problema = 'ECLI mal formado (debe ser ECLI:ES:TRIBUNAL:AÑO:NÚMERO)'
    else {
      const anio = Number(forma[3])
      if (anio > anioActual) cita.problema = `ECLI con año futuro (${anio})`
      else if (anio < 1900) cita.problema = `ECLI con año imposible (${anio})`
      cita.anio = anio
    }
    encontradas.push(cita)
  }

  // 4) Números de recurso: «rec. 1234/2019», «recurso de casación n.º 1234/2019»
  for (const m of texto.matchAll(RE_RECURSO)) {
    const anio = Number(m[2])
    const cita: Cita = {
      clave: `rec|${Number(m[1])}/${anio}`,
      tipo: 'recurso',
      texto: m[0].trim(),
      inicio: m.index ?? 0,
      fin: (m.index ?? 0) + m[0].length,
      numero: String(Number(m[1])),
      anio,
    }
    if (anio > anioActual) cita.problema = `Recurso de un año futuro (${anio})`
    else if (anio < 1900) cita.problema = `Año imposible (${anio})`
    encontradas.push(cita)
  }

  // 5) Referencias CENDOJ: «ROJ: STS 4786/2014», «Id Cendoj: 28079110012014100123»
  for (const m of texto.matchAll(RE_ROJ)) {
    const organo = m[1]!.split(/\s+/)[0]!
    const anio = Number(m[3])
    const cita: Cita = {
      clave: `roj|${m[1]}|${Number(m[2])}/${anio}`,
      tipo: 'cendoj',
      texto: m[0].trim(),
      inicio: m.index ?? 0,
      fin: (m.index ?? 0) + m[0].length,
      organo,
      tribunal: ORGANOS[organo] ?? (organo.startsWith('AP') ? 'AP' : organo.startsWith('TSJ') ? 'TSJ' : '?'),
      numero: String(Number(m[2])),
      anio,
    }
    if (anio > anioActual) cita.problema = `ROJ de un año futuro (${anio})`
    encontradas.push(cita)
  }
  for (const m of texto.matchAll(RE_CENDOJ)) {
    const id = m[1]!
    const cita: Cita = {
      clave: `cendoj|${id}`,
      tipo: 'cendoj',
      texto: m[0].trim(),
      inicio: m.index ?? 0,
      fin: (m.index ?? 0) + m[0].length,
      numero: id,
    }
    if (id.length !== 20) cita.problema = `El identificador CENDOJ tiene ${id.length} dígitos (son 20)`
    encontradas.push(cita)
  }

  return apuntarNormaCercana(quitarSolapadasYRepetidas(encontradas))
}

/** Posición (dentro de la ventana) donde termina el nombre de la norma. */
function buscarFinNorma(ventana: string, nombre: string, clave: string, ley: Ley | null): number {
  const candidatos = [...(ley?.alias ?? []), nombre, clave, ...(ley?.numeros ?? [])]
  let mejor = 0
  for (const c of candidatos) {
    const re = new RegExp(patronAlias(c), 'u')
    const m = re.exec(ventana)
    if (m && m.index < 60) mejor = Math.max(mejor, m.index + m[0].length)
  }
  if (mejor === 0) {
    const g = /(?:Ley|LO|L\.O\.|Real\s+Decreto[\w\s-]*?|RD\w*)\s*(?:n\.?\s*[º°o]\.?\s*)?\d{1,4}\s*\/\s*\d{4}/u.exec(ventana)
    if (g && g.index < 60) mejor = g.index + g[0].length
  }
  return mejor
}

/** Lee una resolución a partir de su sigla o nombre. */
function leerResolucion(
  texto: string,
  inicio: number,
  largoCabecera: number,
  organo: string,
  tribunal: string,
  anioActual: number,
  hoy: string,
): Cita | null {
  const tras = texto.slice(inicio + largoCabecera, inicio + largoCabecera + 140)
  const r = RESTO_RESOLUCION.exec(tras)
  const g = r?.groups ?? {}
  const tieneNumero = g.num !== undefined
  let fecha: string | undefined
  let fechaInexistente = false
  if (g.dia && g.mes && g.anioF) {
    const mes = MESES.indexOf(g.mes.toLowerCase().replace('setiembre', 'septiembre')) + 1
    fecha = `${g.anioF}-${String(mes).padStart(2, '0')}-${String(Number(g.dia)).padStart(2, '0')}`
  } else if (g.dd && g.mm && g.yy) {
    fecha = `${g.yy}-${String(Number(g.mm)).padStart(2, '0')}-${String(Number(g.dd)).padStart(2, '0')}`
  }
  if (fecha && !esFechaValida(fecha)) fechaInexistente = true

  // Una sigla sola («la STS») no es una cita comprobable: se ignora.
  if (!tieneNumero && !fecha) return null

  const largo = largoCabecera + (r ? r[0].length : 0)
  const textoCita = texto.slice(inicio, inicio + largo).trim().replace(/[,;:]$/, '')
  const cita: Cita = {
    clave: `res|${tribunal}|${organo}|${tieneNumero ? Number(g.num) + '/' + g.anio : ''}|${fecha ?? ''}`,
    tipo: 'resolucion',
    texto: textoCita,
    inicio,
    fin: inicio + largo,
    organo,
    tribunal,
    ...(g.lugar ? { lugar: g.lugar } : {}),
    ...(tieneNumero ? { numero: String(Number(g.num)), anio: Number(g.anio) } : {}),
    ...(fecha ? { fecha } : {}),
  }

  // Comprobaciones de formato imposible o sospechoso (→ rojo)
  const anioNumero = tieneNumero ? Number(g.anio) : undefined
  const anioFecha = fecha ? Number(fecha.slice(0, 4)) : undefined
  if (fechaInexistente) cita.problema = `Fecha que no existe (${g.dia ?? g.dd} de ${g.mes ?? g.mm} de ${g.anioF ?? g.yy})`
  else if (fecha && fecha > hoy) cita.problema = 'Fecha futura'
  else if (anioNumero !== undefined && anioNumero > anioActual) cita.problema = `Año futuro (${anioNumero})`
  else if ((anioNumero ?? anioFecha ?? 2000) < 1900) cita.problema = 'Año imposible'
  else if (tribunal === 'TC' && (anioNumero ?? anioFecha ?? 2000) < 1981) {
    cita.problema = 'El Tribunal Constitucional no dictó sentencias antes de 1981'
  } else if (anioNumero !== undefined && anioFecha !== undefined && anioNumero !== anioFecha && tribunal !== 'JUZGADO') {
    cita.problema = `El año del número (${anioNumero}) no coincide con el de la fecha (${anioFecha})`
  }
  return cita
}

/**
 * A un artículo citado sin norma («el art. 10.4») le apunta la última norma
 * citada justo antes (hasta 400 caracteres), como PISTA para quien verifique:
 * el semáforo no cambia, porque no se puede asegurar que sea esa.
 */
function apuntarNormaCercana(citas: Cita[]): Cita[] {
  const conNorma = citas.filter(c => c.tipo === 'articulo' && c.leyNombre).sort((a, b) => a.inicio - b.inicio)
  return citas.map(c => {
    if (c.tipo !== 'articulo' || !c.sinNorma) return c
    const anterior = [...conNorma].reverse().find(o => o.inicio < c.inicio && c.inicio - o.fin <= 400)
    return anterior?.leyNombre ? { ...c, normaCercana: anterior.leyNombre } : c
  })
}

/** Quita citas metidas dentro de otra más larga (p. ej. «STS 4786/2014» dentro de su ROJ) y repetidas. */
function quitarSolapadasYRepetidas(citas: Cita[]): Cita[] {
  const ordenadas = [...citas].sort((a, b) => a.inicio - b.inicio || b.fin - b.inicio - (a.fin - a.inicio))
  const salida: Cita[] = []
  const vistas = new Set<string>()
  for (const c of ordenadas) {
    const contenida = salida.some(
      o => o !== c && o.tipo !== 'articulo' && c.tipo !== 'articulo' && o.inicio <= c.inicio && o.fin >= c.fin && o.tipo !== c.tipo,
    )
    if (contenida) continue
    if (vistas.has(c.clave)) continue
    vistas.add(c.clave)
    salida.push(c)
  }
  return salida
}

// ── Semáforo ────────────────────────────────────────────────────────────────

function huellaFecha(fecha: string): RegExp {
  const [anio, mes, dia] = fecha.split('-').map(Number) as [number, number, number]
  const nombreMes = MESES[mes - 1] ?? 'x'
  return new RegExp(
    `\\b0?${dia}\\s+(?:de\\s+)?(?:${nombreMes}|0?${mes})\\s+(?:de\\s+|del\\s+)?${anio}\\b|\\b${anio}\\s+0?${mes}\\s+0?${dia}\\b`,
  )
}

/** ¿Esta evidencia respalda esta cita? */
export function respalda(cita: Cita, evidencia: Evidencia, config: ConfigRevisor): boolean {
  const t = evidencia.texto
  switch (cita.tipo) {
    case 'articulo': {
      const num = normalizarParaBuscar(cita.articulo ?? '')
      if (!num) return false
      const articulo = new RegExp(`\\b(?:articulos?|arts?)\\s+${escaparRegex(num)}\\b`)
      if (!articulo.test(t)) return false
      if (cita.sinNorma || !cita.ley) return true
      const ley = config.leyes.find(l => l.clave === cita.ley)
      const formas = ley ? [ley.clave, ley.nombre, ...ley.alias, ...(ley.numeros ?? [])] : [cita.ley]
      return formas.some(f => {
        const n = normalizarParaBuscar(f.replace(/^(ley|lo|rd|rdleg)\s+/i, ''))
        return n.length > 0 && new RegExp(`\\b${escaparRegex(n)}\\b`).test(t)
      })
    }
    case 'resolucion':
    case 'cendoj': {
      if (cita.tipo === 'cendoj' && !cita.anio) {
        return cita.numero ? t.includes(` ${cita.numero} `) : false
      }
      const huella = HUELLA_TRIBUNAL[cita.tribunal ?? '']
      if (huella && !huella.test(t)) return false
      if (cita.numero && cita.anio && new RegExp(`\\b${cita.numero}\\s+${cita.anio}\\b`).test(t)) return true
      if (cita.fecha && esFechaValida(cita.fecha) && huellaFecha(cita.fecha).test(t)) return true
      return false
    }
    case 'ecli':
      return t.includes(' ' + normalizarParaBuscar(cita.ecli ?? '') + ' ')
    case 'recurso':
      return new RegExp(`\\b${cita.numero}\\s+${cita.anio}\\b`).test(t)
  }
}

/** «buscar_articulo» → «una consulta de legislación» (el nombre de la herramienta no le dice nada a un abogado). */
export function consultaEnLlano(herramienta: string): string {
  if (/articulo|boe|ley|norma|convenio|ordenanza/i.test(herramienta)) return 'una consulta de legislación'
  if (/sentencia|cita|jurisprudencia|teac|hacienda/i.test(herramienta)) return 'una consulta de jurisprudencia'
  return 'una consulta'
}

/** Pone a cada cita su color: verificada, sin verificar o sospechosa. */
export function revisarCitas(citas: readonly Cita[], evidencias: readonly Evidencia[], config: ConfigRevisor): CitaRevisada[] {
  return citas.map(cita => {
    if (cita.problema) return { ...cita, estado: 'sospechosa', motivo: cita.problema }
    const prueba = evidencias.find(ev => respalda(cita, ev, config))
    if (prueba) {
      return { ...cita, estado: 'verificada', motivo: `Sale en ${consultaEnLlano(prueba.herramienta)} de esta respuesta`, herramienta: prueba.herramienta }
    }
    const motivo =
      evidencias.length === 0
        ? 'En esta respuesta no se consultó ninguna fuente: Claude la ha escrito de memoria'
        : 'No aparece en ninguna de las consultas de esta respuesta'
    return { ...cita, estado: 'sin_verificar', motivo: cita.sinNorma ? motivo + ' (no indica la norma)' : motivo }
  })
}

export function resumir(citas: readonly CitaRevisada[]): ResumenCitas {
  return {
    verificadas: citas.filter(c => c.estado === 'verificada').length,
    sinVerificar: citas.filter(c => c.estado === 'sin_verificar').length,
    sospechosas: citas.filter(c => c.estado === 'sospechosa').length,
  }
}

/** El peor estado manda el color de la banda. */
export function peorEstado(r: ResumenCitas): EstadoCita | null {
  if (r.sospechosas > 0) return 'sospechosa'
  if (r.sinVerificar > 0) return 'sin_verificar'
  if (r.verificadas > 0) return 'verificada'
  return null
}

/** Texto de la petición «Pedir verificación» para las citas sin respaldo (cada cita, una sola vez). */
export function peticionVerificacion(citas: readonly CitaRevisada[], config: ConfigRevisor): string {
  // Sin repetidas: por su clave y, además, por cómo se leen («art. 7.3 LO 1/2025» dos veces es una).
  const vistas = new Set<string>()
  const pendientes = citas.filter(c => {
    if (c.estado === 'verificada') return false
    const comoSeLee = normalizarParaBuscar(c.texto)
    if (vistas.has(c.clave) || vistas.has(comoSeLee)) return false
    vistas.add(c.clave)
    vistas.add(comoSeLee)
    return true
  })
  const ejemplos = config.herramientasVerificacion.filter(h => !h.startsWith('/')).slice(0, 4).join(', ')
  const lista = pendientes.map((c, i) => {
    const pista = c.sinNorma ? (c.normaCercana ? ` (no dice la norma; la última citada antes era ${c.normaCercana}: confírmalo)` : ' (no dice la norma: dedúcela del contexto)') : ''
    const sospecha = c.estado === 'sospechosa' ? ` (formato sospechoso: ${c.motivo})` : ''
    return `${i + 1}. ${c.texto}${pista}${sospecha}`
  })
  const cuantas = pendientes.length === 1 ? 'esta cita' : `estas ${pendientes.length} citas`
  return [
    `Verifica con tus herramientas de consulta de legislación y jurisprudencia (por ejemplo: ${ejemplos}) ${cuantas} de tu última respuesta que no ${pendientes.length === 1 ? 'tiene' : 'tienen'} respaldo en ninguna consulta.`,
    'Para cada una dime si existe, si el número, la fecha y el órgano son correctos y si dice lo que se afirmaba, indicando la fuente consultada. Si alguna no existe, dilo claramente y propón la correcta.',
    '',
    ...lista,
  ].join('\n')
}
