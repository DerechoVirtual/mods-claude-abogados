// ─────────────────────────────────────────────────────────────────────────────
// texto.ts · Utilidades de texto compartidas (funciones PURAS)
// ─────────────────────────────────────────────────────────────────────────────

/** Minúsculas y sin tildes: «García» → «garcia». */
export function sinTildes(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

/**
 * Deja solo letras y números separados por un espacio:
 * «STS 123/2020, de 12-III» → «sts 123 2020 de 12 iii».
 * Sirve para comparar citas aunque cambien la puntuación o las tildes.
 */
export function normalizarParaBuscar(texto: string): string {
  return sinTildes(texto)
    .replace(/n\.?\s*[º°o]\.?\s*(?=\d)/g, ' ') // «n.º 12» → « 12»
    .replace(/[^a-z0-9ñ]+/g, ' ')
    .trim()
}

/** Escapa un texto para usarlo dentro de una expresión regular. */
export function escaparRegex(texto: string): string {
  return texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Recorta un texto a `max` caracteres con «…». */
export function recortar(texto: string, max: number): string {
  if (max <= 1) return texto.slice(0, Math.max(0, max))
  return texto.length > max ? texto.slice(0, max - 1) + '…' : texto
}

/** Rellena con espacios a la derecha hasta `ancho` (recortando si sobra). */
export function rellenar(texto: string, ancho: number): string {
  const t = recortar(texto, ancho)
  return t + ' '.repeat(Math.max(0, ancho - t.length))
}

/**
 * Ruta normalizada para comparar carpetas en Windows y en Mac/Linux:
 * minúsculas, barras «/», sin «./» ni barra final.
 */
export function normalizarRuta(ruta: string): string {
  let r = ruta.trim().replace(/^["']|["']$/g, '').replace(/\\/g, '/')
  r = r.replace(/\/\.\//g, '/').replace(/\/{2,}/g, '/')
  if (r.startsWith('./')) r = r.slice(2)
  r = r.replace(/\/$/, '')
  return r.toLowerCase()
}

/** ¿La ruta es absoluta (C:/…, /…, ~/…)? */
export function esRutaAbsoluta(ruta: string): boolean {
  return /^([a-z]:\/|\/|~\/)/i.test(ruta.replace(/\\/g, '/'))
}

/** Une una ruta relativa con una base. */
export function unirRuta(base: string, relativa: string): string {
  if (esRutaAbsoluta(relativa)) return normalizarRuta(relativa)
  return normalizarRuta(base.replace(/\\/g, '/').replace(/\/$/, '') + '/' + relativa)
}

/** ¿`ruta` está dentro de `carpeta`? (ambas ya normalizadas) */
export function estaDentro(ruta: string, carpeta: string): boolean {
  return ruta === carpeta || ruta.startsWith(carpeta + '/')
}
