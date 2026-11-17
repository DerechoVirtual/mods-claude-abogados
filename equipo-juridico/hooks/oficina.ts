// La oficina del despacho: quién está, qué hace y cómo se dibuja.
//
// La oficina empieza vacía. Cada persona entra cuando le llega su primera
// tarea y se sienta en su puesto, por orden de llegada. Mientras trabaja, su
// puesto se ilumina; al terminar sale un ✓ y, pasado un rato sin trabajo, se
// queda «descansando» (atenuada). Encima de cada puesto, un bocadillo con su
// última frase (sacada de hechos reales, ver frases.ts).
//
// En la app de escritorio se dibuja como un SVG con animaciones SMIL (el halo
// que late y los puntos que «teclean» se mueven solos, sin redibujar). En la
// terminal, el panel la dibuja con cajas de texto (register.tsx).

import type { ConfigEquipo, EstadoTarea, Genero, Tarea } from '../types'
import { accionDe, duracion, fraseSinNombre, personaDe } from './equipo'

/** Tras este tiempo sin trabajo, una persona pasa a «descansando». */
export const DESCANSO_MS = 3 * 60 * 1000
/** Durante este tiempo tras entrar, su puesto aparece con animación. */
const ENTRADA_MS = 5000

export type EstadoPuesto = 'trabajando' | 'terminado' | 'descansando' | 'fallo'

/** Un puesto de la oficina, listo para dibujar. */
export type Puesto = {
  id: string
  nombre: string
  inicial: string
  oficio: string
  emoji: string
  color: string
  estado: EstadoPuesto
  /** «está redactando un fundamento de fondo», «lleva 4 tareas…», «ha cerrado la súplica». */
  actividad: string
  /** Su última frase, si ha dicho algo. */
  bocadillo?: string
  /** Medida honesta: «520/600 palabras» o «7 pasos · 1 min 20 s». */
  indicador: string
  /** Tareas en curso. */
  enCurso: number
  /** Ha entrado hace un momento (para animar su llegada). */
  recienEntrado: boolean
  /** Su silla en la oficina isométrica: siempre la misma (su orden en el equipo). */
  asiento: number
  /** Trabaja, pero Claude Code dice que su agente está esperando o en pausa. */
  esperando: boolean
  /** Milisegundos desde que entró (para que su paseo hasta la silla no se reinicie). */
  msDesdeEntrada: number
  /** Es el abogado de la parte contraria: espera de pie en la puerta, no se sienta. */
  rival: boolean
  /** «f» o «m»: su personaje en la oficina. */
  genero: Genero
}

/** Los puestos ocupados, por orden de llegada. */
export function puestosDe(config: ConfigEquipo, tareas: readonly Tarea[], ahora: number): Puesto[] {
  const orden = config.oficios.flatMap(o => o.personas.map(p => p.id))
  const porPersona = new Map<string, { tareas: Tarea[]; entrada: number }>()
  for (const t of tareas) {
    const { persona } = personaDe(config, t.oficio, t.persona)
    const g = porPersona.get(persona.id) ?? { tareas: [], entrada: t.inicio }
    g.tareas.push(t)
    g.entrada = Math.min(g.entrada, t.inicio)
    porPersona.set(persona.id, g)
  }
  return [...porPersona.entries()]
    .sort((a, b) => a[1].entrada - b[1].entrada)
    .map(([, { tareas: suyas, entrada }]) => {
      const primera = suyas[0] as Tarea
      const { oficio, persona } = personaDe(config, primera.oficio, primera.persona)
      const activas = suyas.filter(t => t.estado === 'trabajando')
      const ultima = (activas[activas.length - 1] ?? suyas[suyas.length - 1]) as Tarea
      const finUltimo = Math.max(...suyas.map(t => t.fin ?? t.inicio))
      const estado: EstadoPuesto =
        activas.length > 0 ? 'trabajando' : ultima.estado === 'fallida' ? 'fallo' : ahora - finUltimo > DESCANSO_MS ? 'descansando' : 'terminado'
      const accion = accionDe(oficio, ultima.accion)
      const actividad =
        estado === 'descansando'
          ? 'descansando'
          : activas.length > 1
            ? `lleva ${activas.length} tareas · ${accion.gerundio}`
            : fraseSinNombre(accion, (activas.length > 0 ? 'trabajando' : ultima.estado) as EstadoTarea)
      const frases = suyas.flatMap(t => t.frases ?? []).sort((a, b) => a.hora - b.hora)
      const bocadillo = frases[frases.length - 1]?.texto
      // Medida honesta: palabras escritas frente a las pedidas (sumando sus
      // tareas con extensión); si no hay, pasos dados y tiempo.
      const conExtension = (activas.length > 0 ? activas : suyas).filter(t => t.extension !== undefined)
      const pedidas = conExtension.reduce((n, t) => n + (t.extension ?? 0), 0)
      const escritas = conExtension.reduce((n, t) => n + (t.palabras ?? 0), 0)
      const pasos = (activas.length > 0 ? activas : [ultima]).reduce((n, t) => n + t.herramientas, 0)
      const indicador =
        pedidas > 0 && escritas > 0
          ? `${escritas}/${pedidas} palabras`
          : `${pasos > 0 ? `${pasos} ${pasos === 1 ? 'paso' : 'pasos'} · ` : ''}${duracion((ultima.fin ?? ahora) - ultima.inicio)}`
      return {
        id: persona.id,
        nombre: persona.nombre,
        inicial: persona.inicial,
        oficio: oficio.oficio,
        emoji: oficio.emoji,
        color: oficio.color,
        estado,
        actividad,
        ...(bocadillo !== undefined ? { bocadillo } : {}),
        indicador,
        enCurso: activas.length,
        recienEntrado: ahora - entrada < ENTRADA_MS,
        asiento: Math.max(0, orden.indexOf(persona.id)),
        esperando: activas.length > 0 && activas.every(t => ['waiting', 'idle', 'pending'].includes(t.estadoAgente ?? '')),
        msDesdeEntrada: Math.max(0, ahora - entrada),
        rival: oficio.rival === true,
        genero: persona.genero,
      }
    })
}

// ---------------------------------------------------------------------------
// SVG (app de escritorio)
// ---------------------------------------------------------------------------

/** Escapa un texto para meterlo en XML. */
export function escaparXml(texto: string): string {
  return texto.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')
}

/** Un color seguro para un atributo SVG (hex o nombre); si no, gris. */
function colorSeguro(color: string): string {
  return /^(#[0-9a-fA-F]{3,8}|[a-zA-Z]{3,20})$/.test(color) ? color : '#64748b'
}

/** Parte un texto en líneas de como mucho `ancho` caracteres; corta con «…». */
export function partirTexto(texto: string, ancho: number, maxLineas: number): string[] {
  const palabras = texto
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
    .map(p => (p.length > ancho ? `${p.slice(0, ancho - 1)}…` : p))
  const lineas: string[] = []
  let actual = ''
  for (const palabra of palabras) {
    const candidata = actual === '' ? palabra : `${actual} ${palabra}`
    if (candidata.length <= ancho) {
      actual = candidata
      continue
    }
    lineas.push(actual)
    actual = palabra
    if (lineas.length === maxLineas) {
      // No cabe todo: la última línea acaba en «…», sin cortar una palabra a medias.
      let ultima = lineas[maxLineas - 1] as string
      if (ultima.length >= ancho && ultima.includes(' ')) ultima = ultima.replace(/\s+\S*$/, '')
      else if (ultima.length >= ancho) ultima = ultima.slice(0, ancho - 1)
      lineas[maxLineas - 1] = `${ultima.replace(/[\s,;:·(«"'-]+$/, '')}…`
      return lineas
    }
  }
  if (actual !== '') lineas.push(actual)
  return lineas
}

const ANCHO = 184
const ALTO = 226
const GRIS = '#8b98a9'

/** Un puesto: bocadillo, persona, mesa con portátil y rótulos. */
function puestoSvg(p: Puesto, x: number, y: number): string {
  const c = colorSeguro(p.color)
  const cx = x + ANCHO / 2
  const trabajando = p.estado === 'trabajando'
  const opacidad = p.estado === 'descansando' ? 0.45 : 1
  const partes: string[] = []

  // Llegada: aparece deslizándose (solo los primeros segundos, para que no se repita en cada redibujo).
  const llegada = p.recienEntrado
    ? `<animate attributeName="opacity" from="0" to="${opacidad}" dur="0.9s" fill="freeze"/><animateTransform attributeName="transform" type="translate" from="0 24" to="0 0" dur="0.9s" fill="freeze"/>`
    : ''

  // Bocadillo con su última frase.
  const lineas = partirTexto(p.bocadillo ?? '', 27, 3)
  if (lineas.length > 0) {
    const alto = 12 + lineas.length * 13
    partes.push(
      `<rect x="${x + 8}" y="${y + 6}" width="${ANCHO - 16}" height="${alto}" rx="10" fill="#ffffff" stroke="${c}" stroke-width="1.5"/>`,
      `<path d="M ${cx - 7} ${y + 5 + alto} L ${cx} ${y + 14 + alto} L ${cx + 7} ${y + 5 + alto} Z" fill="#ffffff" stroke="${c}" stroke-width="1.5"/>`,
      `<rect x="${cx - 6}" y="${y + 3 + alto}" width="12" height="3" fill="#ffffff"/>`,
      ...lineas.map(
        (l, i) => `<text x="${cx}" y="${y + 21 + i * 13}" text-anchor="middle" font-size="10.5" fill="#1f2937">${escaparXml(l)}</text>`,
      ),
    )
  }

  // Halo que late mientras trabaja.
  if (trabajando) {
    partes.push(
      `<circle cx="${cx}" cy="${y + 96}" r="34" fill="${c}" fill-opacity="0.18"><animate attributeName="fill-opacity" values="0.10;0.38;0.10" dur="1.6s" repeatCount="indefinite"/><animate attributeName="r" values="31;36;31" dur="1.6s" repeatCount="indefinite"/></circle>`,
    )
  }
  // La persona.
  partes.push(
    `<circle cx="${cx}" cy="${y + 96}" r="25" fill="${c}" fill-opacity="${trabajando ? 0.9 : 0.55}"/>`,
    `<text x="${cx}" y="${y + 104}" text-anchor="middle" font-size="22">${escaparXml(p.emoji)}</text>`,
  )
  // Su marca de estado.
  if (p.estado === 'terminado') {
    partes.push(
      `<circle cx="${cx + 21}" cy="${y + 77}" r="9" fill="#16a34a"/><text x="${cx + 21}" y="${y + 81}" text-anchor="middle" font-size="11" fill="#ffffff" font-weight="700">✓</text>`,
    )
  } else if (p.estado === 'fallo') {
    partes.push(
      `<circle cx="${cx + 21}" cy="${y + 77}" r="9" fill="#dc2626"/><text x="${cx + 21}" y="${y + 81}" text-anchor="middle" font-size="11" fill="#ffffff" font-weight="700">!</text>`,
    )
  } else if (p.estado === 'descansando') {
    partes.push(`<text x="${cx + 24}" y="${y + 80}" text-anchor="middle" font-size="13">💤</text>`)
  } else if (p.enCurso > 1) {
    partes.push(
      `<circle cx="${cx + 21}" cy="${y + 77}" r="9" fill="${c}"/><text x="${cx + 21}" y="${y + 81}" text-anchor="middle" font-size="10" fill="#ffffff" font-weight="700">${p.enCurso}</text>`,
    )
  }
  // La mesa y el portátil; la pantalla brilla y «teclea» mientras trabaja.
  partes.push(
    `<rect x="${x + 26}" y="${y + 126}" width="${ANCHO - 52}" height="12" rx="3" fill="#a16207" fill-opacity="0.55"/>`,
    `<rect x="${cx + 30}" y="${y + 108}" width="34" height="19" rx="2" fill="#1f2937"/>`,
  )
  if (trabajando) {
    partes.push(
      `<rect x="${cx + 32}" y="${y + 110}" width="30" height="15" rx="1" fill="${c}" fill-opacity="0.5"><animate attributeName="fill-opacity" values="0.3;0.7;0.3" dur="2.2s" repeatCount="indefinite"/></rect>`,
      ...[0, 1, 2].map(
        i =>
          `<circle cx="${cx + 39 + i * 8}" cy="${y + 118}" r="2" fill="#ffffff"><animate attributeName="opacity" values="0.2;1;0.2" dur="1.2s" begin="${(i * 0.2).toFixed(1)}s" repeatCount="indefinite"/></circle>`,
      ),
    )
  }
  // Rótulos.
  partes.push(
    `<text x="${cx}" y="${y + 160}" text-anchor="middle" font-size="14" font-weight="700" fill="${c}">${escaparXml(p.nombre)}</text>`,
    `<text x="${cx}" y="${y + 175}" text-anchor="middle" font-size="10" fill="${GRIS}">${escaparXml(p.oficio)}</text>`,
    ...partirTexto(p.actividad, 32, 2).map(
      (l, i) => `<text x="${cx}" y="${y + 191 + i * 12}" text-anchor="middle" font-size="10" fill="${GRIS}">${escaparXml(l)}</text>`,
    ),
    `<text x="${cx}" y="${y + 218}" text-anchor="middle" font-size="9" fill="${GRIS}" fill-opacity="0.85">${escaparXml(p.indicador)}</text>`,
  )

  return `<g opacity="${opacidad}">${llegada}${partes.join('')}</g>`
}

/** La oficina vacía. */
function oficinaVacia(): string {
  const mesas = [0, 1, 2]
    .map(i => `<rect x="${40 + i * 110}" y="78" width="80" height="10" rx="3" fill="#a16207" fill-opacity="0.25"/>`)
    .join('')
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 120" font-family="system-ui, -apple-system, 'Segoe UI', sans-serif">` +
    `<rect x="2" y="2" width="396" height="116" rx="14" fill="#94a3b8" fill-opacity="0.08" stroke="#94a3b8" stroke-opacity="0.25"/>` +
    `<text x="200" y="34" text-anchor="middle" font-size="15" font-weight="700" fill="${GRIS}">La oficina está vacía</text>` +
    `<text x="200" y="54" text-anchor="middle" font-size="11" fill="${GRIS}">Cuando Claude reparta tareas, irá entrando el equipo.</text>` +
    `${mesas}</svg>`
  )
}

/** La oficina entera en SVG: un puesto por persona, hasta 4 por fila. */
export function oficinaSvg(puestos: readonly Puesto[], columnas = 4): string {
  if (puestos.length === 0) return oficinaVacia()
  const cols = Math.max(1, Math.min(columnas, puestos.length))
  const filas = Math.ceil(puestos.length / cols)
  const w = cols * ANCHO + 16
  const h = filas * ALTO + 16
  const cuerpo = puestos.map((p, i) => puestoSvg(p, 8 + (i % cols) * ANCHO, 8 + Math.floor(i / cols) * ALTO)).join('')
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" font-family="system-ui, -apple-system, 'Segoe UI', sans-serif">` +
    `<rect x="2" y="2" width="${w - 4}" height="${h - 4}" rx="14" fill="#94a3b8" fill-opacity="0.08" stroke="#94a3b8" stroke-opacity="0.25"/>` +
    `${cuerpo}</svg>`
  )
}

/** Descripción en texto de la oficina (el `alt` del SVG). */
export function oficinaTexto(puestos: readonly Puesto[]): string {
  if (puestos.length === 0) return 'La oficina está vacía.'
  return puestos.map(p => `${p.nombre} (${p.oficio}): ${p.actividad}${p.bocadillo !== undefined ? `. «${p.bocadillo}»` : ''}`).join(' · ')
}
