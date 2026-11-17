// La oficina en pixel art isométrico (app de escritorio).
//
// El fondo (assets/oficina-isometrica.webp) se generó con gpt-image-2.5-flare
// en calidad low, SIN personas ni texto: despacho del director a la izquierda,
// 8 puestos en dos filas, puerta abajo y pizarra. Encima, el mod dibuja en SVG
// (nunca pintado en la imagen):
//   · cada persona en su silla, con SU personaje (assets/personajes.json: una
//     imagen por persona, también generada con gpt-image-2.5-flare). Cada una
//     es distinta: María, Clara, Elena y Carmen son mujeres; Juan, Luis,
//     Alberto y Pablo, hombres. Los sentados se ven de espaldas en su silla,
//     el director de frente en su sillón y el abogado contrario de pie ante la
//     puerta. Cada uno entra por la puerta y camina hasta su puesto la primera
//     vez; mientras trabaja se balancea y su monitor brilla;
//   · su etiqueta flotante, encima de la cabeza: su cara, su nombre y su
//     estado con su color (TRABAJANDO verde, ESPERANDO amarillo, TERMINÓ ✓
//     cian, ERROR rojo parpadeando);
//   · la ventana de CHAT: el director pregunta y la persona contesta con su
//     última frase real, cada uno con su cara;
//   · el TABLERO DE CONTROL: personas trabajando, escrito en curso, avance
//     TOTAL del escrito y estado.
// Las animaciones son SMIL: se mueven solas, sin redibujar.
//
// Lo que pasa si falta algo: sin fondo, se dibuja una oficina sencilla; sin
// las imágenes de los personajes, se dibujan aquí mismo (distintos por género,
// peinado y ropa: nunca todos iguales). Y como el dibujo no puede pasar de
// 131.072 caracteres, si con todo no cabe se quitan por este orden: las caras
// de quien ya descansa, las del chat, las demás caras y, por último, las
// imágenes de los cuerpos (lo que se quita se dibuja aquí).

import type { Genero } from '../types'
import { recortar } from './llano'
import { escaparXml, partirTexto } from './oficina'
import type { Puesto } from './oficina'

export const ANCHO_ESCENA = 768
export const ALTO_ESCENA = 512
/** El tope de caracteres de un Svg en la app, con un pequeño margen. */
export const TOPE_SVG = 131_072
const MARGEN_TOPE = 256

type Punto = { x: number; y: number }

/** Las sillas de los 8 puestos en el fondo (coordenadas de la imagen de 768 × 512). */
export const ASIENTOS: readonly Punto[] = [
  { x: 367, y: 167 },
  { x: 455, y: 197 },
  { x: 544, y: 227 },
  { x: 632, y: 257 },
  { x: 287, y: 265 },
  { x: 377, y: 305 },
  { x: 467, y: 335 },
  { x: 557, y: 367 },
]
/** Si hay más de 8 personas, las demás se quedan de pie junto a la pizarra. */
const DE_PIE: readonly Punto[] = [
  { x: 205, y: 335 },
  { x: 228, y: 348 },
  { x: 251, y: 361 },
]
const SILLON_DIRECTOR: Punto = { x: 122, y: 131 }
const PUERTA: Punto = { x: 312, y: 405 }
/** El abogado contrario no se sienta: se planta delante de la puerta. */
const SITIO_RIVAL: Punto = { x: 312, y: 425 }
/** Lo que tarda alguien en ir de la puerta a su silla. */
const PASEO_MS = 3000

const FUENTE = "'Courier New', Consolas, 'Lucida Console', monospace"
const VERDE = '#4ade80'
const AMARILLO = '#facc15'
const CIAN = '#22d3ee'
const ROJO = '#f87171'
const GRIS = '#94a3b8'
/** Gris claro: se lee bien sobre el fondo oscuro de una etiqueta (quien ya descansa). */
const GRIS_CLARO = '#cbd5e1'
const BLANCO = '#f1f5f9'

/** Tamaño de un personaje dibujado aquí respecto a su dibujo base. */
const ESCALA_DIBUJO = 1.3
/** Lado de la cara en la etiqueta y en el chat, cuando el archivo de personajes no lo dice. */
const LADO_CARA = 18
const LADO_CARA_CHAT = 14
/**
 * Alto de una etiqueta: menos que el desnivel entre dos sillas vecinas de la
 * misma fila (28 píxeles), para que dos etiquetas seguidas nunca se pisen.
 */
const ALTO_ETIQUETA = 26

/** Una persona de la escena: su puesto y lo que hace. */
export type PersonaEscena = Puesto

/** El diálogo de la ventana de chat. `id` es el de quien contesta (para su cara). */
export type Chat = { director: string; pregunta: string; quien: string; respuesta: string; id?: string; genero?: Genero }

/** El tablero de control. */
export type Tablero = {
  trabajando: number
  /** Título del escrito en curso, si se está redactando uno. */
  escrito?: string
  /** Avance TOTAL del escrito (0-100), si lo hay. */
  porcentaje?: number
  estado: 'OPERATIVO' | 'EN ESPERA' | 'ESCRITO ENTREGADO'
}

/**
 * Las imágenes de los personajes (assets/personajes.json), ya comprobadas:
 * cada una es un data URI de imagen (WebP o PNG). `cuerpos` y `caras` van por
 * id de persona; «mujer» y «hombre» sirven para quien se añada al equipo sin
 * imagen propia, y «director» para quien dirige.
 */
export type Personajes = {
  /**
   * Cómo se dibuja un cuerpo, en píxeles de la escena: su tamaño y qué punto
   * de la imagen (el centro de la base de la silla, o los pies) cae en el sitio.
   */
  cuerpo: { ancho: number; alto: number; anclaX: number; anclaY: number }
  /** Lado de una cara en la etiqueta, en píxeles de la escena. */
  cara: { lado: number }
  cuerpos: Readonly<Record<string, string>>
  caras: Readonly<Record<string, string>>
  /** Dónde va cada cuerpo en el fondo: la base de cada silla, el sillón del director y el sitio del contrario. */
  sitios: { asientos: readonly Punto[]; director: Punto; rival: Punto }
}

export type DatosEscena = {
  personas: readonly PersonaEscena[]
  director: string
  /** Si quien dirige es una mujer («f») o un hombre («m», por defecto). */
  generoDirector?: Genero
  chat?: Chat
  tablero: Tablero
  /** El fondo como data URI (data:image/jpeg;base64,…); sin él, oficina sencilla. */
  fondo?: string
  /** Las imágenes de los personajes; sin ellas, se dibujan aquí. */
  personajes?: Personajes
}

/** Lo máximo que puede pesar una imagen de personaje (en caracteres de base64). */
const MAX_IMAGEN = 24_000

/** Las bases de las sillas en el fondo (donde va el ancla de cada cuerpo), si el archivo no las trae. */
const SITIOS_DE_SERIE: Personajes['sitios'] = {
  asientos: [
    { x: 366, y: 177 },
    { x: 457, y: 205 },
    { x: 545, y: 234 },
    { x: 634, y: 262 },
    { x: 289, y: 281 },
    { x: 377, y: 314 },
    { x: 467, y: 346 },
    { x: 556, y: 378 },
  ],
  director: { x: 127, y: 150 },
  rival: { x: 330, y: 441 },
}

/**
 * Comprueba el contenido de assets/personajes.json y lo deja listo para
 * dibujar. Solo pasan imágenes WebP o PNG en base64 limpio (nada que pueda
 * colar código en el dibujo). Devuelve undefined si no hay ninguna válida.
 */
export function leerPersonajes(crudo: unknown): Personajes | undefined {
  if (typeof crudo !== 'object' || crudo === null) return undefined
  const raiz = crudo as Record<string, unknown>
  const objeto = (v: unknown): Record<string, unknown> => (typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : {})
  const numero = (v: unknown, min: number, max: number): number | undefined => (typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? v : undefined)
  const punto = (v: unknown): Punto | undefined => {
    if (!Array.isArray(v)) return undefined
    const x = numero(v[0], 0, ANCHO_ESCENA)
    const y = numero(v[1], 0, ALTO_ESCENA)
    return x === undefined || y === undefined ? undefined : { x, y }
  }
  const imagenes = (v: unknown): Record<string, string> => {
    const salida: Record<string, string> = {}
    for (const [clave, valor] of Object.entries(objeto(v))) {
      if (typeof valor !== 'string' || !/^[a-z0-9_-]{1,40}$/.test(clave)) continue
      const base64 = valor.replace(/^data:image\/(png|webp);base64,/, '')
      if (base64.length < 60 || base64.length > MAX_IMAGEN || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) continue
      // Un WebP en base64 empieza por «UklGR» (RIFF) y un PNG por «iVBORw0KGgo».
      const tipo = base64.startsWith('UklGR') ? 'webp' : base64.startsWith('iVBORw0KGgo') ? 'png' : undefined
      if (tipo !== undefined) salida[clave] = `data:image/${tipo};base64,${base64}`
    }
    return salida
  }
  const cuerpos = imagenes(raiz.cuerpos)
  const caras = imagenes(raiz.caras)
  if (Object.keys(cuerpos).length === 0 && Object.keys(caras).length === 0) return undefined

  // Tamaño del cuerpo en la escena: el que diga el archivo; si no, 36 de ancho con su proporción.
  const c = objeto(raiz.cuerpo)
  const proporcion = (numero(c.alto, 1, 2048) ?? 80) / (numero(c.ancho, 1, 2048) ?? 64)
  const ancho = numero(c.dibujarAncho, 8, 200) ?? 36
  const alto = numero(c.dibujarAlto, 8, 260) ?? Math.round(ancho * proporcion)
  const ancla = Array.isArray(c.ancla) ? c.ancla : []
  const anclaX = numero(ancla[0], 0, ancho) ?? ancho / 2
  const anclaY = numero(ancla[1], 0, alto) ?? alto
  const lado = numero(objeto(raiz.cara).dibujarLado, 8, 40) ?? LADO_CARA

  const sitiosCrudos = objeto(raiz.sitios)
  const asientos = (Array.isArray(sitiosCrudos.asientos) ? sitiosCrudos.asientos : []).map(punto)
  const sitios: Personajes['sitios'] = {
    asientos: SITIOS_DE_SERIE.asientos.map((deSerie, i) => asientos[i] ?? deSerie),
    director: punto(sitiosCrudos.director) ?? SITIOS_DE_SERIE.director,
    rival: punto(sitiosCrudos.rival) ?? SITIOS_DE_SERIE.rival,
  }
  return { cuerpo: { ancho, alto, anclaX, anclaY }, cara: { lado }, cuerpos, caras, sitios }
}

/** Dónde se sienta cada persona: su silla, o de pie junto a la pizarra. */
function sitio(asiento: number): Punto {
  return ASIENTOS[asiento] ?? DE_PIE[(asiento - ASIENTOS.length) % DE_PIE.length] ?? (DE_PIE[0] as Punto)
}

/** Un color seguro para un atributo SVG (hex o nombre); si no, gris. */
function colorSeguro(color: string): string {
  return /^(#[0-9a-fA-F]{3,8}|[a-zA-Z]{3,20})$/.test(color) ? color : GRIS
}

/** «el», «la», «los» o «las» delante de la primera palabra de un escrito. */
function articulo(palabra: string): 'el' | 'la' | 'los' | 'las' {
  if (/(ciones|siones|as)$/i.test(palabra)) return 'las'
  if (/(os|es)$/i.test(palabra)) return 'los'
  return /(a|ión|ion|ud)$/i.test(palabra) ? 'la' : 'el'
}

/**
 * Lo que pregunta el director a una persona: por el escrito en curso
 * («Luis, ¿cómo va la demanda?», «¿cómo van las alegaciones?») o por su tarea
 * («¿cómo va «Sección 04»?»).
 */
export function preguntaDelDirector(nombre: string, tituloEscrito?: string, descripcion?: string, rival = false): string {
  const primera = ((tituloEscrito ?? '').trim().split(/\s+/)[0] ?? '').toLowerCase()
  if (rival) {
    // Al abogado de la parte contraria se le pregunta qué le ve a lo nuestro.
    const palabra = primera || 'escrito'
    const art = articulo(palabra)
    const posesivo = art === 'la' ? 'nuestra' : art === 'las' ? 'nuestras' : art === 'los' ? 'nuestros' : 'nuestro'
    const verbo = art === 'las' || art === 'los' ? 'parecen' : 'parece'
    return `${nombre}, ¿qué te ${verbo} ${posesivo} ${palabra}?`
  }
  if (primera !== '') {
    const art = articulo(primera)
    return `${nombre}, ¿cómo ${art === 'las' || art === 'los' ? 'van' : 'va'} ${art} ${primera}?`
  }
  if (descripcion !== undefined && descripcion.trim() !== '') return `${nombre}, ¿cómo va «${recortar(descripcion, 26)}»?`
  return `${nombre}, ¿cómo va eso?`
}

// ---------------------------------------------------------------------------
// Personajes dibujados aquí (cuando no hay imágenes): cada uno, distinto
// ---------------------------------------------------------------------------

type Peinado = 'corto' | 'melena' | 'media' | 'mono' | 'calvo'
type Aspecto = { piel: string; pelo: string; ropa: string; peinado: Peinado; gafas?: boolean; barba?: boolean }

/** El aspecto de las personas del equipo de serie. */
const ASPECTOS: Readonly<Record<string, Aspecto>> = {
  maria: { piel: '#f1c27d', pelo: '#5b3a1e', ropa: '#d4559c', peinado: 'melena' },
  juan: { piel: '#e0ac69', pelo: '#1f2937', ropa: '#1e293b', peinado: 'corto', gafas: true },
  luis: { piel: '#f1c27d', pelo: '#4a2f17', ropa: '#1e3a8a', peinado: 'corto' },
  clara: { piel: '#ffdbac', pelo: '#d9a441', ropa: '#0f766e', peinado: 'media' },
  alberto: { piel: '#e0ac69', pelo: '#9ca3af', ropa: '#374151', peinado: 'calvo', barba: true },
  elena: { piel: '#f1c27d', pelo: '#111827', ropa: '#b45309', peinado: 'mono', gafas: true },
  pablo: { piel: '#c68642', pelo: '#111827', ropa: '#312e81', peinado: 'corto' },
  carmen: { piel: '#ffdbac', pelo: '#9a3412', ropa: '#0e7490', peinado: 'melena' },
  rufino: { piel: '#e0ac69', pelo: '#0b0b0b', ropa: '#18181b', peinado: 'corto', barba: true },
}
const PIELES = ['#f1c27d', '#e0ac69', '#ffdbac', '#c68642']
const PELOS = ['#3b2a1a', '#111827', '#5b3a1e', '#9a3412', '#d9a441', '#6b7280']
const ROPA_MUJER = ['#be185d', '#0f766e', '#7c3aed', '#b45309', '#0e7490']
const ROPA_HOMBRE = ['#1e293b', '#1e3a8a', '#374151', '#312e81', '#14532d']
const PEINADOS_MUJER: readonly Peinado[] = ['melena', 'media', 'mono']
const PEINADOS_HOMBRE: readonly Peinado[] = ['corto', 'corto', 'calvo']

/** El aspecto de alguien: el suyo si es del equipo de serie; si no, uno propio según su género y su nombre. */
function aspectoDe(id: string, genero: Genero): Aspecto {
  const fijo = ASPECTOS[id]
  // El aspecto de serie solo vale si coincide con su género (por si en el JSON «luis» pasa a ser Luisa).
  if (fijo !== undefined && (genero === 'f') === (fijo.peinado === 'melena' || fijo.peinado === 'media' || fijo.peinado === 'mono')) return fijo
  let n = 7
  for (const c of id) n = (n * 31 + c.charCodeAt(0)) % 9973
  const de = <T>(lista: readonly T[], salto: number): T => lista[(n + salto) % lista.length] as T
  return genero === 'f'
    ? { piel: de(PIELES, 0), pelo: de(PELOS, 1), ropa: de(ROPA_MUJER, 2), peinado: de(PEINADOS_MUJER, 3), gafas: n % 4 === 0 }
    : { piel: de(PIELES, 0), pelo: de(PELOS, 1), ropa: de(ROPA_HOMBRE, 2), peinado: de(PEINADOS_HOMBRE, 3), gafas: n % 4 === 0, barba: n % 3 === 0 }
}

/**
 * Un personaje dibujado en pixel art con los pies en (x, y). Las mujeres
 * llevan melena, media melena o moño y blusa de color; los hombres, pelo corto
 * (o calva y barba), traje y corbata del color de su oficio. Sentado teclea si
 * trabaja; `dePie`, con las piernas a la vista.
 */
function personajeDibujado(x: number, y: number, a: Aspecto, genero: Genero, acento: string, trabajando: boolean, dePie: boolean): string {
  const r = (px: number, py: number, w: number, h: number, fill: string, extra = '') =>
    `<rect x="${x + px}" y="${y + py}" width="${w}" height="${h}" fill="${fill}"${extra}/>`
  const tecleo = (retraso: string) =>
    trabajando ? `<animate attributeName="y" values="${y - 6};${y - 5};${y - 6}" dur="0.35s" begin="${retraso}" repeatCount="indefinite"/>` : ''
  const mujer = genero === 'f'
  const piezas: string[] = [`<ellipse cx="${x}" cy="${y + 2}" rx="9" ry="3" fill="#000" fill-opacity="0.3"/>`]
  // Piernas: sentado, recogidas; de pie, enteras y con zapatos.
  if (dePie) piezas.push(r(-5, -6, 4, 7, '#111827'), r(1, -6, 4, 7, '#111827'), r(-6, 0, 5, 2, '#000'), r(1, 0, 5, 2, '#000'))
  else piezas.push(r(-6, -4, 12, 5, mujer ? '#334155' : '#111827'))
  const alza = dePie ? -3 : 0
  // Cuerpo y brazos.
  piezas.push(r(-7, -17 + alza, 14, 13, a.ropa), r(-9, -15 + alza, 3, 9, a.ropa), r(6, -15 + alza, 3, 9, a.ropa))
  if (mujer) {
    // Escote y un pañuelo del color de su oficio.
    piezas.push(r(-2, -17 + alza, 4, 3, a.piel), r(-3, -14 + alza, 6, 2, acento))
  } else {
    // Camisa blanca y corbata del color de su oficio.
    piezas.push(r(-2.5, -17 + alza, 5, 5, '#f8fafc'), r(-1, -17 + alza, 2, 9, acento))
  }
  // Manos (teclean si trabaja).
  piezas.push(
    `<rect x="${x - 9}" y="${y - 6 + alza}" width="3" height="2" fill="${a.piel}">${tecleo('0s')}</rect>`,
    `<rect x="${x + 6}" y="${y - 6 + alza}" width="3" height="2" fill="${a.piel}">${tecleo('0.17s')}</rect>`,
  )
  // Pelo por detrás (melena), cabeza, pelo por delante.
  if (a.peinado === 'melena') piezas.push(r(-7, -29 + alza, 14, 15, a.pelo))
  if (a.peinado === 'media') piezas.push(r(-7, -29 + alza, 14, 11, a.pelo))
  piezas.push(r(-5, -26 + alza, 10, 9, a.piel))
  if (a.peinado === 'calvo') piezas.push(r(-5, -27 + alza, 2, 4, a.pelo), r(3, -27 + alza, 2, 4, a.pelo), r(-4, -28 + alza, 8, 2, a.piel))
  else piezas.push(r(-5, -30 + alza, 10, 4, a.pelo))
  if (a.peinado === 'mono') piezas.push(r(-2, -33 + alza, 4, 3, a.pelo), r(-6, -28 + alza, 1.5, 5, a.pelo), r(4.5, -28 + alza, 1.5, 5, a.pelo))
  if (a.peinado === 'melena' || a.peinado === 'media') piezas.push(r(-5, -27 + alza, 3, 2, a.pelo))
  // Ojos, gafas, barba o boca.
  piezas.push(r(-3, -23 + alza, 1.5, 1.5, '#111827'), r(1.5, -23 + alza, 1.5, 1.5, '#111827'))
  if (a.gafas === true) piezas.push(`<rect x="${x - 4}" y="${y - 24 + alza}" width="8" height="3.5" fill="none" stroke="#0f172a" stroke-width="0.8"/>`)
  if (a.barba === true) piezas.push(r(-5, -20 + alza, 10, 3, a.pelo), r(-1.5, -19.5 + alza, 3, 1, a.piel))
  else piezas.push(r(-1.5, -19.5 + alza, 3, 1, mujer ? '#be123c' : '#92400e'))
  return piezas.join('')
}

/** La cara de alguien dibujada aquí, en un cuadro de `lado` píxeles con esquina en (x, y). */
function caraDibujada(x: number, y: number, lado: number, a: Aspecto, genero: Genero): string {
  const u = lado / 12
  const r = (px: number, py: number, w: number, h: number, fill: string) =>
    `<rect x="${(x + px * u).toFixed(1)}" y="${(y + py * u).toFixed(1)}" width="${(w * u).toFixed(1)}" height="${(h * u).toFixed(1)}" fill="${fill}"/>`
  const piezas: string[] = [r(0, 0, 12, 12, '#1e293b')]
  if (a.peinado === 'melena') piezas.push(r(1, 1, 10, 11, a.pelo))
  if (a.peinado === 'media') piezas.push(r(1, 1, 10, 9, a.pelo))
  piezas.push(r(2.5, 3, 7, 7, a.piel), r(4.5, 10, 3, 2, a.piel))
  if (a.peinado === 'calvo') piezas.push(r(2.5, 3, 1.2, 3, a.pelo), r(8.3, 3, 1.2, 3, a.pelo))
  else piezas.push(r(2.5, 1.5, 7, 2.5, a.pelo))
  if (a.peinado === 'mono') piezas.push(r(5, 0, 2, 1.8, a.pelo))
  if (a.peinado === 'melena' || a.peinado === 'media') piezas.push(r(2.5, 3.5, 2, 1.5, a.pelo))
  piezas.push(r(4, 5.5, 1.2, 1.2, '#111827'), r(6.8, 5.5, 1.2, 1.2, '#111827'))
  if (a.gafas === true) piezas.push(r(3.4, 5, 5.2, 0.5, '#0f172a'), r(3.4, 7, 5.2, 0.5, '#0f172a'))
  if (a.barba === true) piezas.push(r(2.5, 8, 7, 2, a.pelo))
  else piezas.push(r(5, 8.3, 2, 0.7, genero === 'f' ? '#be123c' : '#92400e'))
  return piezas.join('')
}

// ---------------------------------------------------------------------------
// Piezas
// ---------------------------------------------------------------------------

/** Qué se dibuja con imágenes y qué no (se va recortando si el dibujo no cabe en el tope). */
type Nivel = { cuerpos: boolean; carasEtiqueta: 'todas' | 'activas' | 'ninguna'; carasChat: boolean }

/** La imagen de `mapa` para una persona: la suya o la genérica de su género. */
function imagenDe(mapa: Readonly<Record<string, string>> | undefined, id: string, genero: Genero): string | undefined {
  if (mapa === undefined) return undefined
  return mapa[id] ?? mapa[genero === 'f' ? 'mujer' : 'hombre']
}

/** Una imagen en su sitio (el mismo elemento que el fondo, que la app ya dibuja). */
function imagen(href: string, x: number, y: number, ancho: number, alto: number, dentro = ''): string {
  const n = (v: number): string => String(Math.round(v * 10) / 10)
  const atributos = `href="${href}" x="${n(x)}" y="${n(y)}" width="${n(ancho)}" height="${n(alto)}"`
  return dentro === '' ? `<image ${atributos}/>` : `<image ${atributos}>${dentro}</image>`
}

/** ¿Se dibuja el cuerpo de esta persona con su imagen? */
function conImagenDeCuerpo(d: DatosEscena, nivel: Nivel, id: string, genero: Genero): boolean {
  return nivel.cuerpos && imagenDe(d.personajes?.cuerpos, id, genero) !== undefined
}

/**
 * El punto de alguien en la oficina. Con su imagen, la base de su silla (el
 * ancla de la imagen); dibujado aquí, sus pies.
 */
function puntoDe(d: DatosEscena, nivel: Nivel, quien: { id: string; genero: Genero; asiento?: number; rival?: boolean; director?: boolean }): Punto {
  const sitios = conImagenDeCuerpo(d, nivel, quien.id, quien.genero) ? d.personajes?.sitios : undefined
  if (quien.director === true) return sitios?.director ?? SILLON_DIRECTOR
  if (quien.rival === true) return sitios?.rival ?? SITIO_RIVAL
  const asiento = quien.asiento ?? 0
  return sitios?.asientos[asiento] ?? sitio(asiento)
}

/** Cuánto sube la cabeza de alguien por encima de su punto (para poner encima su etiqueta). */
function altoDe(d: DatosEscena, nivel: Nivel, id: string, genero: Genero): number {
  return conImagenDeCuerpo(d, nivel, id, genero) && d.personajes !== undefined ? d.personajes.cuerpo.anclaY : 42
}

/**
 * El cuerpo de alguien en su punto (x, y): su imagen si la hay (se balancea
 * suavemente mientras trabaja); si no, dibujado aquí.
 */
function cuerpo(
  d: DatosEscena,
  nivel: Nivel,
  id: string,
  genero: Genero,
  x: number,
  y: number,
  opciones: { acento: string; trabajando: boolean; dePie: boolean; opacidad: number },
): string {
  const href = nivel.cuerpos ? imagenDe(d.personajes?.cuerpos, id, genero) : undefined
  const opacidad = opciones.opacidad < 1 ? ` opacity="${opciones.opacidad}"` : ''
  if (href !== undefined && d.personajes !== undefined) {
    const c = d.personajes.cuerpo
    const balanceo = opciones.trabajando
      ? '<animateTransform attributeName="transform" type="translate" values="0 0;0 -1.2;0 0" dur="1.1s" repeatCount="indefinite"/>'
      : ''
    return `<g${opacidad}>${imagen(href, x - c.anclaX, y - c.anclaY, c.ancho, c.alto, balanceo)}</g>`
  }
  return `<g transform="translate(${x} ${y}) scale(${ESCALA_DIBUJO}) translate(${-x} ${-y})"${opacidad}>${personajeDibujado(x, y, aspectoDe(id, genero), genero, opciones.acento, opciones.trabajando, opciones.dePie)}</g>`
}

/** La cara de alguien en un cuadro de `lado` píxeles: su imagen si la hay; si no, dibujada. */
function cara(d: DatosEscena, conImagen: boolean, id: string, genero: Genero, x: number, y: number, lado: number): string {
  const href = conImagen ? imagenDe(d.personajes?.caras, id, genero) : undefined
  return href !== undefined ? imagen(href, x, y, lado, lado) : caraDibujada(x, y, lado, aspectoDe(id, genero), genero)
}

/**
 * El brillo verde del monitor del puesto `asiento` mientras su persona
 * trabaja: justo encima de la pantalla que hay pintada en el fondo (que está
 * en perspectiva), y por debajo del cuerpo en el orden de dibujo.
 */
function monitor(asiento: number): string {
  const silla = SITIOS_DE_SERIE.asientos[asiento]
  if (silla === undefined) return ''
  // Las cuatro esquinas de la pantalla respecto a la base de la silla.
  const esquinas: ReadonlyArray<readonly [number, number]> = [
    [6, -60],
    [27.5, -53],
    [27, -40],
    [5.5, -46.5],
  ]
  const puntos = esquinas.map(([dx, dy]) => `${silla.x + dx},${silla.y + dy}`).join(' ')
  return `<polygon points="${puntos}" fill="#4ade80" fill-opacity="0.2"><animate attributeName="fill-opacity" values="0.05;0.45;0.05" dur="1.8s" repeatCount="indefinite"/></polygon>`
}

/** Texto del estado de una persona y su color. */
function estadoDe(p: PersonaEscena): { texto: string; color: string; parpadea: boolean } {
  if (p.estado === 'fallo') return { texto: '[ ERROR ]', color: ROJO, parpadea: true }
  if (p.rival) {
    // El abogado contrario: rojo siempre; parpadea mientras busca grietas.
    if (p.estado === 'trabajando') return { texto: '⚔ ATACANDO', color: ROJO, parpadea: true }
    return { texto: 'ATAQUE LISTO', color: ROJO, parpadea: false }
  }
  // «TERMINÓ» vale igual para Elena que para Luis (ni «terminado» ni «terminada») y ocupa poco.
  if (p.estado === 'terminado') return { texto: 'TERMINÓ ✓', color: CIAN, parpadea: false }
  if (p.estado === 'descansando') return { texto: 'TERMINÓ ✓', color: GRIS_CLARO, parpadea: false }
  if (p.esperando) return { texto: 'ESPERANDO', color: AMARILLO, parpadea: false }
  return { texto: 'TRABAJANDO', color: VERDE, parpadea: false }
}

/**
 * La etiqueta flotante de alguien: su cara a la izquierda y, a su lado, su
 * nombre (y cuántas tareas lleva) y su estado. `ancla` dice qué punto cae en
 * `cx`: el centro (lo normal) o el borde izquierdo (la del director, que va a
 * su derecha). `apagada`: quien ya descansa lleva el nombre en gris claro en
 * vez de amarillo, pero se lee igual.
 */
function etiqueta(
  cx: number,
  abajo: number,
  nombre: string,
  estado: { texto: string; color: string; parpadea: boolean },
  tareas: number,
  opciones: { ancla?: 'centro' | 'izquierda'; apagada?: boolean; cara?: (x: number, y: number) => string; ladoCara?: number } = {},
): string {
  const titulo = `${nombre.toUpperCase()}${tareas > 1 ? ` ×${tareas}` : ''}`
  // Con la letra de ancho fijo, cada carácter ocupa 0,6 de su tamaño. Un
  // nombre muy largo encoge la letra para que la etiqueta no crezca sin fin.
  const letraTitulo = titulo.length > 12 ? Math.max(9, Math.floor((90 / titulo.length / 0.6) * 10) / 10) : 12
  const letraEstado = 9.5
  const anchoTexto = Math.max(titulo.length * letraTitulo * 0.6, estado.texto.length * letraEstado * 0.6)
  const conCara = opciones.cara !== undefined
  const ladoCara = opciones.ladoCara ?? LADO_CARA
  const hueco = conCara ? 4 + ladoCara + 5 : 6
  const ancho = hueco + anchoTexto + 6
  const izquierda = opciones.ancla === 'izquierda' ? cx : cx - ancho / 2
  const x = Math.round(Math.min(ANCHO_ESCENA - ancho - 2, Math.max(2, izquierda)) * 10) / 10
  const y = Math.max(2, abajo - ALTO_ETIQUETA)
  const centro = (x + hueco + anchoTexto / 2).toFixed(1)
  const parpadeo = estado.parpadea ? '<animate attributeName="opacity" values="1;0.25;1" dur="0.9s" repeatCount="indefinite"/>' : ''
  return (
    `<g>` +
    `<rect x="${x}" y="${y}" width="${ancho.toFixed(1)}" height="${ALTO_ETIQUETA}" rx="3" fill="#0b1220" fill-opacity="0.93" stroke="${estado.color}" stroke-width="${opciones.apagada === true ? 0.8 : 1.2}"/>` +
    (opciones.cara !== undefined ? opciones.cara(x + 4, y + (ALTO_ETIQUETA - ladoCara) / 2) : '') +
    `<text x="${centro}" y="${y + 11.5}" text-anchor="middle" font-size="${letraTitulo}" font-weight="700" fill="${opciones.apagada === true ? GRIS_CLARO : AMARILLO}">${escaparXml(titulo)}</text>` +
    `<text x="${centro}" y="${y + 22}" text-anchor="middle" font-size="${letraEstado}" font-weight="700" fill="${estado.color}">${parpadeo}${escaparXml(estado.texto)}</text>` +
    `</g>`
  )
}

/**
 * Una persona en la escena, en dos capas: su cuerpo (con el brillo de su
 * monitor debajo) y su etiqueta. Se dibujan primero todos los cuerpos y luego
 * todas las etiquetas, para que ningún cuerpo tape el nombre de otro. La
 * primera vez entra caminando desde la puerta, con su etiqueta encima.
 */
function personaEnEscena(d: DatosEscena, nivel: Nivel, p: PersonaEscena): { y: number; cuerpo: string; etiqueta: string } {
  const { x, y } = puntoDe(d, nivel, p)
  // El contrario y quien no tiene silla están de pie: ni teclean ni tienen monitor.
  const dePie = p.rival || p.asiento >= ASIENTOS.length
  const trabajando = p.estado === 'trabajando' && !p.esperando
  // Quien ya descansa: se atenúa su personaje, NO su etiqueta (tiene que leerse).
  const descansa = p.estado === 'descansando'
  // Entrada: va de la puerta a su silla. El `begin` negativo retoma el paseo
  // donde iba si la escena se redibuja a mitad (no vuelve a empezar).
  const paseo =
    p.msDesdeEntrada < PASEO_MS
      ? `<animateMotion dur="${PASEO_MS / 1000}s" begin="-${(p.msDesdeEntrada / 1000).toFixed(2)}s" fill="freeze" path="M ${PUERTA.x - x} ${PUERTA.y - y} L 0 0"/>`
      : ''
  const suCuerpo = cuerpo(d, nivel, p.id, p.genero, x, y, { acento: colorSeguro(p.color), trabajando: trabajando && !dePie, dePie, opacidad: descansa ? 0.6 : 1 })
  const conCara = nivel.carasEtiqueta === 'todas' || (nivel.carasEtiqueta === 'activas' && !descansa)
  const lado = d.personajes?.cara.lado ?? LADO_CARA
  const suEtiqueta = etiqueta(x, y - altoDe(d, nivel, p.id, p.genero) - 1, p.nombre, estadoDe(p), p.enCurso, {
    apagada: descansa,
    ladoCara: lado,
    cara: (cx, cy) => cara(d, conCara, p.id, p.genero, cx, cy, lado),
  })
  return {
    y,
    cuerpo: `${trabajando && !dePie ? monitor(p.asiento) : ''}<g>${paseo}${suCuerpo}</g>`,
    etiqueta: paseo === '' ? suEtiqueta : `<g>${paseo}${suEtiqueta}</g>`,
  }
}

/** Quien dirige el despacho, en su sillón. */
function director(d: DatosEscena, nivel: Nivel): string {
  const genero = d.generoDirector ?? 'm'
  const { x, y } = puntoDe(d, nivel, { id: 'director', genero, director: true })
  const titulo = `${genero === 'f' ? 'Directora' : 'Director'} ${d.director}`
  const conImagen = conImagenDeCuerpo(d, nivel, 'director', genero)
  // Su etiqueta va a su derecha, a la altura de la cabeza (encima la taparía
  // la ventana de chat), y sin cara: su personaje está justo al lado.
  const derecha = conImagen && d.personajes !== undefined ? d.personajes.cuerpo.ancho - d.personajes.cuerpo.anclaX + 2 : 20
  const abajo = conImagen ? y - altoDe(d, nivel, 'director', genero) + ALTO_ETIQUETA + 12 : y + 4
  return (
    cuerpo(d, nivel, 'director', genero, x, y, { acento: AMARILLO, trabajando: false, dePie: false, opacidad: 1 }) +
    etiqueta(x + derecha, abajo, titulo, { texto: 'SUPERVISANDO', color: '#e2e8f0', parpadea: false }, 1, { ancla: 'izquierda' })
  )
}

/** La ventana de chat (arriba a la izquierda): pregunta el director y contesta quien habló el último. */
function ventanaChat(d: DatosEscena, nivel: Nivel): string {
  const chat = d.chat
  const x = 5
  const y = 4
  const ancho = 400
  const letra = 11
  const salto = 14
  const margen = 8 + LADO_CARA_CHAT + 4
  // Caben 53 caracteres por línea junto a la cara (con holgura: la letra real
  // es algo más ancha que la teórica); la primera lleva delante el nombre.
  const porLinea = 53
  // Cada texto se parte contando con que su primera línea lleva el nombre delante.
  const conNombre = (nombre: string, texto: string, maxLineas: number): string[] => {
    const relleno = `${'·'.repeat(nombre.length + 1)} `
    return partirTexto(`${relleno}${texto}`, porLinea, maxLineas).map((l, i) => (i === 0 ? l.slice(relleno.length) : l))
  }
  const lineasPregunta = chat === undefined ? ['¿Quién se pone con esto?'] : conNombre(d.director, chat.pregunta, 1)
  const quien = chat?.quien ?? ''
  // Entre la pregunta y la respuesta, cuatro líneas como mucho: justo debajo
  // están la cabeza del director y las etiquetas de la primera fila.
  const lineasRespuesta =
    chat === undefined ? ['La oficina está vacía. Entran cuando hay trabajo.'] : conNombre(quien, chat.respuesta, 4 - lineasPregunta.length)
  const alto = Math.round(17 + salto * (lineasPregunta.length + lineasRespuesta.length) + 6)
  const filas: string[] = []
  let yy = y + 17 + salto - 3
  filas.push(
    cara(d, nivel.carasChat, 'director', d.generoDirector ?? 'm', x + 8, yy - LADO_CARA_CHAT + 3, LADO_CARA_CHAT),
    `<text x="${x + margen}" y="${yy}" font-size="${letra}"><tspan fill="${AMARILLO}" font-weight="700">${escaparXml(d.director)}:</tspan><tspan fill="${BLANCO}"> ${escaparXml(lineasPregunta[0] ?? '')}</tspan></text>`,
  )
  lineasPregunta.slice(1).forEach(l => {
    yy += salto
    filas.push(`<text x="${x + margen}" y="${yy}" font-size="${letra}" fill="${BLANCO}">${escaparXml(l)}</text>`)
  })
  lineasRespuesta.forEach((l, i) => {
    yy += salto
    if (chat === undefined) {
      // Con la oficina vacía no contesta nadie: la línea va sola, en gris.
      filas.push(`<text x="${x + margen}" y="${yy}" font-size="${letra}" fill="${GRIS_CLARO}">${escaparXml(l)}</text>`)
    } else if (i === 0) {
      if (chat.id !== undefined) filas.push(cara(d, nivel.carasChat, chat.id, chat.genero ?? 'm', x + 8, yy - LADO_CARA_CHAT + 3, LADO_CARA_CHAT))
      filas.push(
        `<text x="${x + margen}" y="${yy}" font-size="${letra}"><tspan fill="${VERDE}" font-weight="700">${escaparXml(quien)}:</tspan><tspan fill="${BLANCO}"> ${escaparXml(l)}</tspan></text>`,
      )
    } else {
      filas.push(`<text x="${x + margen}" y="${yy}" font-size="${letra}" fill="${BLANCO}">${escaparXml(l)}</text>`)
    }
  })
  return (
    `<g>` +
    `<rect x="${x}" y="${y}" width="${ancho}" height="${alto}" rx="4" fill="#0f172a" fill-opacity="0.94" stroke="#38bdf8" stroke-width="1.2"/>` +
    `<rect x="${x}" y="${y}" width="${ancho}" height="16" rx="4" fill="#1e3a5f"/>` +
    `<text x="${x + 8}" y="${y + 12}" font-size="10.5" font-weight="700" fill="#e2e8f0">CHAT DEL DESPACHO</text>` +
    `<circle cx="${x + ancho - 12}" cy="${y + 8}" r="3" fill="${VERDE}"><animate attributeName="opacity" values="1;0.3;1" dur="1.4s" repeatCount="indefinite"/></circle>` +
    filas.join('') +
    `</g>`
  )
}

/** El tablero de control (abajo a la derecha). */
function tableroControl(t: Tablero): string {
  const ancho = 262
  const alto = 104
  const x = ANCHO_ESCENA - ancho - 6
  const y = ALTO_ESCENA - alto - 6
  const letra = 11
  const colorEstado = t.estado === 'OPERATIVO' ? VERDE : t.estado === 'EN ESPERA' ? AMARILLO : CIAN
  // El título del escrito, cortado por una palabra entera.
  const escrito = t.escrito === undefined ? 'ninguno en curso' : recortar(t.escrito, 28)
  const casillas = 12
  const llenas = t.porcentaje === undefined ? 0 : Math.round((t.porcentaje / 100) * casillas)
  const barraSvg = Array.from(
    { length: casillas },
    (_, i) => `<rect x="${x + 106 + i * 9}" y="${y + 60}" width="8" height="9" fill="${i < llenas ? VERDE : '#334155'}"/>`,
  ).join('')
  return (
    `<g>` +
    `<rect x="${x}" y="${y}" width="${ancho}" height="${alto}" rx="4" fill="#0b1220" fill-opacity="0.94" stroke="${CIAN}" stroke-width="1.5"/>` +
    `<text x="${x + 8}" y="${y + 17}" font-size="12" font-weight="700" fill="${CIAN}">TABLERO DE CONTROL</text>` +
    `<text x="${x + 8}" y="${y + 35}" font-size="${letra}" fill="${BLANCO}">PERSONAS TRABAJANDO: <tspan fill="${AMARILLO}" font-weight="700">${t.trabajando}</tspan></text>` +
    `<text x="${x + 8}" y="${y + 52}" font-size="${letra}" fill="${BLANCO}">ESCRITO: ${escaparXml(escrito)}</text>` +
    `<text x="${x + 8}" y="${y + 69}" font-size="${letra}" fill="${BLANCO}">AVANCE TOTAL:</text>` +
    barraSvg +
    `<text x="${x + 220}" y="${y + 69}" font-size="${letra}" font-weight="700" fill="${BLANCO}">${t.porcentaje === undefined ? '—' : `${t.porcentaje} %`}</text>` +
    `<text x="${x + 8}" y="${y + 90}" font-size="${letra}" fill="${BLANCO}">ESTADO: <tspan fill="${colorEstado}" font-weight="700">${t.estado}</tspan></text>` +
    `</g>`
  )
}

/** La oficina sencilla, si no hay fondo: suelo isométrico y mesas en su sitio. */
function fondoSencillo(): string {
  const suelo = `<polygon points="20,190 360,40 760,250 420,470" fill="#cbd5e1" stroke="#7dd3c0" stroke-width="3"/>`
  const despacho = `<polygon points="20,190 150,130 270,190 140,250" fill="#1e3a8a" fill-opacity="0.8"/>`
  const mesas = ASIENTOS.map(a => `<rect x="${a.x + 2}" y="${a.y - 30}" width="30" height="14" fill="#c2410c"/>`).join('')
  return `<rect width="${ANCHO_ESCENA}" height="${ALTO_ESCENA}" fill="#0b1f4d"/>${suelo}${despacho}${mesas}`
}

/** La escena con un nivel de imágenes dado. */
function montar(d: DatosEscena, nivel: Nivel, conFondo: boolean): string {
  const fondo =
    conFondo && d.fondo !== undefined && /^data:image\/(webp|jpeg|png);base64,[A-Za-z0-9+/=]+$/.test(d.fondo)
      ? `<image href="${d.fondo}" x="0" y="0" width="${ANCHO_ESCENA}" height="${ALTO_ESCENA}"/>`
      : fondoSencillo()
  // Primero los de la fila de atrás, para que los de delante los tapen bien;
  // y todas las etiquetas después de todos los cuerpos.
  const personas = d.personas.map(p => personaEnEscena(d, nivel, p)).sort((a, b) => a.y - b.y)
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${ANCHO_ESCENA} ${ALTO_ESCENA}" font-family="${FUENTE}" shape-rendering="crispEdges">` +
    fondo +
    director(d, nivel) +
    personas.map(p => p.cuerpo).join('') +
    personas.map(p => p.etiqueta).join('') +
    ventanaChat(d, nivel) +
    tableroControl(d.tablero) +
    `</svg>`
  )
}

/**
 * De todo con imágenes a todo dibujado aquí: se baja un escalón cada vez que
 * el dibujo no cabe. Primero se quitan las caras de quien ya descansa.
 */
const NIVELES: readonly Nivel[] = [
  { cuerpos: true, carasEtiqueta: 'todas', carasChat: true },
  { cuerpos: true, carasEtiqueta: 'activas', carasChat: true },
  { cuerpos: true, carasEtiqueta: 'activas', carasChat: false },
  { cuerpos: true, carasEtiqueta: 'ninguna', carasChat: false },
  { cuerpos: false, carasEtiqueta: 'ninguna', carasChat: false },
]

/**
 * La escena entera en SVG (sin `width`: se ajusta a lo ancho del panel). Nunca
 * pasa del tope de la app: si con las imágenes de los personajes no cabe, se
 * quitan por orden las caras de quien descansa, las del chat, las demás caras
 * y los cuerpos (lo que se quita se dibuja aquí) y, en último caso, el fondo.
 */
export function escenaSvg(d: DatosEscena): string {
  for (const nivel of NIVELES) {
    const svg = montar(d, nivel, true)
    if (svg.length <= TOPE_SVG - MARGEN_TOPE) return svg
  }
  return montar(d, NIVELES[NIVELES.length - 1] as Nivel, false)
}

/** La escena en texto (el `alt` del SVG). */
export function escenaTexto(d: DatosEscena): string {
  const gente = d.personas.length === 0 ? 'la oficina está vacía' : d.personas.map(p => `${p.nombre}: ${estadoDe(p).texto.toLowerCase()}, ${p.actividad}`).join('; ')
  const chat = d.chat !== undefined ? ` Chat: ${d.director}: «${d.chat.pregunta}» ${d.chat.quien}: «${d.chat.respuesta}».` : ''
  const avance = d.tablero.porcentaje !== undefined ? ` Escrito al ${d.tablero.porcentaje} % del total.` : ''
  const quienDirige = `${(d.generoDirector ?? 'm') === 'f' ? 'la directora' : 'el director'} ${d.director}`
  return `Oficina del despacho, con ${quienDirige}. ${gente}.${chat}${avance} Estado: ${d.tablero.estado.toLowerCase()}.`
}
