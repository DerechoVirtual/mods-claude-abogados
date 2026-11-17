// Lenguaje llano: todo lo que el mod enseña a un abogado pasa por aquí para
// que no asome jerga de ordenador (orden de Carlos, 9/11/2026: «nada de bash,
// scripts ni nombres de archivo»).
//
//   · un archivo se nombra como lo diría una persona: «02-encabezamiento-y-
//     hechos.md» es «encabezamiento y hechos»; «CONTESTACION-DEMANDA-DIVORCIO-
//     Ibanez-Cortes.md» es «la contestación»;
//   · una norma con el nombre largo se dice corta y sin cortar palabras:
//     «Decreto Legislativo 1/2011 Código del Derecho Foral de Aragón» es
//     «Código del Derecho Foral de Aragón»;
//   · una descripción «Elena: revisar la coherencia» se enseña sin el «Elena:».

/** Palabras que no se dejan colgando justo antes de los puntos suspensivos. */
const SUELTAS = new Set(['de', 'del', 'la', 'el', 'los', 'las', 'a', 'al', 'en', 'y', 'o', 'por', 'para', 'con', 'que', 'un', 'una', 'su', 'sus'])

/**
 * Corta un texto por una palabra entera y añade «…», sin pasar de `largo`
 * caracteres. Nunca corta a mitad de palabra (salvo que la primera ya no
 * quepa) ni deja colgando un «de», «la», «y»…
 */
export function recortar(texto: string, largo: number): string {
  const una = texto.replace(/\s+/g, ' ').trim()
  if (una.length <= largo) return una
  const palabras = una.split(' ')
  const dentro: string[] = []
  let usado = 0
  for (const palabra of palabras) {
    const mas = (dentro.length > 0 ? 1 : 0) + palabra.length
    if (usado + mas + 1 > largo) break
    dentro.push(palabra)
    usado += mas
  }
  while (dentro.length > 1 && SUELTAS.has((dentro[dentro.length - 1] as string).toLowerCase())) dentro.pop()
  if (dentro.length === 0) return `${una.slice(0, Math.max(1, largo - 1))}…`
  return `${dentro.join(' ').replace(/[\s,;:·(«"'-]+$/, '')}…`
}

/** Tildes que se pierden en los nombres de archivo («contestacion» → «contestación»). */
const TILDES: ReadonlyArray<readonly [RegExp, string]> = [
  [/([cs])ion\b/g, '$1ión'],
  [/\bindice\b/g, 'índice'],
  [/\bcronologia\b/g, 'cronología'],
  [/\bsuplica\b/g, 'súplica'],
  [/\botrosies\b/g, 'otrosíes'],
  [/\bjuridic([oa]s?)\b/g, 'jurídic$1'],
  [/\beconomic([oa]s?)\b/g, 'económic$1'],
  [/\bcuantia\b/g, 'cuantía'],
  [/\bcalculo(s?)\b/g, 'cálculo$1'],
  [/\bnumero\b/g, 'número'],
  [/\banalisis\b/g, 'análisis'],
  [/\bprestamo\b/g, 'préstamo'],
  [/\bjuridiccion\b/g, 'jurisdicción'],
  [/\bdano(s?)\b/g, 'daño$1'],
  [/\bsenalamiento\b/g, 'señalamiento'],
  [/\bespana\b/gi, 'España'],
  [/\bcompania\b/g, 'compañía'],
  [/\bpequen([oa]s?)\b/g, 'pequeñ$1'],
]

/** Pone las tildes habituales a un texto que viene sin ellas (un nombre de archivo). */
export function conTildes(texto: string): string {
  let t = texto
  for (const [patron, cambio] of TILDES) t = t.replace(patron, cambio)
  return t
}

/** Los escritos que se reconocen por su nombre, con su artículo. */
const ESCRITOS_CON_ARTICULO: ReadonlyArray<readonly [RegExp, string]> = [
  [/\bcontestaci[oó]n\b/i, 'la contestación'],
  [/\breconvenci[oó]n\b/i, 'la reconvención'],
  [/\bdemanda\b/i, 'la demanda'],
  [/\bquerella\b/i, 'la querella'],
  [/\bdenuncia\b/i, 'la denuncia'],
  [/\brecurso\b/i, 'el recurso'],
  [/\bapelaci[oó]n\b/i, 'el recurso de apelación'],
  [/\bburofax\b/i, 'el burofax'],
  [/\bpapeleta\b/i, 'la papeleta'],
  [/\balegaciones\b/i, 'las alegaciones'],
  [/\bconclusiones\b/i, 'las conclusiones'],
  [/\bescrito\b/i, 'el escrito'],
]

/** El nombre de un archivo sin carpetas ni extensión, con palabras: «encabezamiento y hechos». */
export function nombreDocumento(ruta: string): string {
  const archivo = ruta.replace(/\\/g, '/').split('/').filter(Boolean).pop() ?? ruta
  const sinExtension = archivo.replace(/\.[A-Za-z0-9]{1,5}$/, '')
  const palabras = sinExtension
    .replace(/^\d{1,3}[\s._-]+/, '') // «02-», «3_», «01.»
    .replace(/[-_]+/g, ' ')
    .replace(/\b20\d{6}\b/g, ' ') // fechas pegadas: 20261109
    .replace(/\s+/g, ' ')
    .trim()
  if (palabras === '') return 'documento'
  // Las palabras TODO EN MAYÚSCULAS pasan a minúsculas; los nombres propios se respetan.
  const natural = palabras
    .split(' ')
    .map(p => (p.length > 1 && p === p.toUpperCase() && /[A-ZÁÉÍÓÚÑ]/.test(p) ? p.toLowerCase() : p))
    .join(' ')
  return recortar(conTildes(natural), 48)
}

/**
 * Cómo se nombra un documento dentro de una frase: «la sección 02», «la
 * contestación» (si el archivo es el escrito mismo) o «encabezamiento y
 * hechos» entre comillas.
 */
export function documentoEnFrase(ruta: string): string {
  const limpia = ruta.replace(/\\/g, '/')
  const seccion = /secciones\/(\d{1,2})[^/]*\.md$/i.exec(limpia)
  if (seccion !== null) return `la sección ${(seccion[1] ?? '').padStart(2, '0')}`
  if (/(^|\/)caso\.md$/i.test(limpia)) return 'el plan del escrito'
  if (/(^|\/)escrito\.md$/i.test(limpia)) return 'el escrito'
  if (/(^|\/)fuentes\//i.test(limpia)) return 'las fuentes'
  const nombre = nombreDocumento(limpia)
  const archivo = limpia.split('/').pop() ?? limpia
  // Un archivo sin número delante cuyo nombre empieza por el tipo de escrito es el escrito entero.
  if (!/^\d/.test(archivo)) {
    const primera = nombre.split(' ')[0] ?? ''
    for (const [patron, conArticulo] of ESCRITOS_CON_ARTICULO) {
      if (patron.test(primera)) return conArticulo
    }
  }
  return `«${nombre}»`
}

/** Siglas de las leyes que todo abogado conoce por sus siglas. */
const SIGLAS: ReadonlyArray<readonly [RegExp, string]> = [
  [/enjuiciamiento civil/i, 'LEC'],
  [/enjuiciamiento criminal/i, 'LECrim'],
  [/^c[oó]digo civil$/i, 'CC'],
  [/^c[oó]digo penal$/i, 'CP'],
  [/^c[oó]digo de comercio$/i, 'CCom'],
  [/constituci[oó]n espa[nñ]ola/i, 'CE'],
  [/estatuto de los trabajadores/i, 'ET'],
  [/arrendamientos urbanos/i, 'LAU'],
  [/propiedad horizontal/i, 'LPH'],
  [/org[aá]nica del poder judicial/i, 'LOPJ'],
  [/reguladora de la jurisdicci[oó]n social/i, 'LRJS'],
  [/jurisdicci[oó]n contencioso/i, 'LJCA'],
  [/ley general tributaria/i, 'LGT'],
  [/sociedades de capital/i, 'LSC'],
]

/** Cómo se abrevia el rango de una norma delante de su número. */
const RANGOS: ReadonlyArray<readonly [RegExp, string]> = [
  [/^real decreto legislativo/i, 'RDLeg'],
  [/^real decreto[- ]ley/i, 'RDL'],
  [/^real decreto/i, 'RD'],
  [/^decreto legislativo/i, 'DLeg'],
  [/^decreto[- ]ley/i, 'DL'],
  [/^ley org[aá]nica/i, 'LO'],
  [/^ley/i, 'Ley'],
  [/^decreto/i, 'Decreto'],
]

/**
 * El nombre de una norma, corto y sin cortar palabras: sus siglas si las
 * tiene, su nombre propio («Código del Derecho Foral de Aragón») si lo lleva
 * detrás del número, o el rango abreviado con su número («LO 1/2025»).
 */
export function nombreLey(ley: string, largo = 40): string {
  const una = ley.replace(/\s+/g, ' ').trim()
  for (const [patron, siglas] of SIGLAS) {
    if (patron.test(una)) return siglas
  }
  if (una.length <= 12) return una
  const numero = /\b(\d{1,4}\/\d{4})\b/.exec(una)
  if (numero !== null) {
    // Lo que va detrás del número suele ser el nombre propio de la norma.
    const detras = una
      .slice(numero.index + numero[0].length)
      .replace(/^[\s,.:;–—-]*(de \d{1,2} de [a-z]+,?\s*)?/i, '')
      .replace(/^(por (el|la) que se aprueba (el|la)\s*|del?\s+)/i, '')
      .trim()
    const propio = /^(c[oó]digo|estatuto|texto refundido|reglamento|ley)\b/i.test(detras)
    if (propio && detras.length <= largo) return detras
    for (const [patron, corto] of RANGOS) {
      if (patron.test(una)) return `${corto} ${numero[1]}`
    }
  }
  return recortar(una, largo)
}

/**
 * La descripción de una tarea sin el nombre de quien la lleva delante
 * («Elena: revisar la coherencia» → «Revisar la coherencia»). Devuelve también
 * el nombre encontrado, si es de alguien del equipo.
 */
export function sinNombreDelante(descripcion: string, nombres: readonly string[]): { texto: string; nombre?: string } {
  const limpia = descripcion.replace(/\s+/g, ' ').trim()
  const m = /^([A-Za-zÁÉÍÓÚÜÑáéíóúüñ]{2,20})\s*(?::|—|–|-|,)\s+(\S.*)$/.exec(limpia)
  if (m === null) return { texto: limpia }
  const sinTildes = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  const nombre = nombres.find(n => sinTildes(n) === sinTildes(m[1] ?? ''))
  if (nombre === undefined) return { texto: limpia }
  const resto = (m[2] ?? '').trim()
  return { texto: resto.charAt(0).toUpperCase() + resto.slice(1), nombre }
}
