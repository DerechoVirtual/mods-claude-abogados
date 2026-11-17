// ─────────────────────────────────────────────────────────────────────────────
// colores.ts · Paleta de colores de cliente (funciones PURAS)
//
// Colores bien diferenciados que se leen sobre fondo oscuro y claro. Se han
// dejado fuera el verde, el ámbar y el rojo puros: son los colores de ESTADO
// (plazo en verde, ámbar, rojo) y deben seguir mandando.
// ─────────────────────────────────────────────────────────────────────────────

import { sinTildes } from './texto'

export type ColorPaleta = { nombre: string; hex: string }

export const PALETA: readonly ColorPaleta[] = [
  { nombre: 'azul', hex: '#2F6FED' },
  { nombre: 'violeta', hex: '#7C4DDB' },
  { nombre: 'cian', hex: '#0E9AB3' },
  { nombre: 'magenta', hex: '#C2389E' },
  { nombre: 'índigo', hex: '#4F46C8' },
  { nombre: 'turquesa', hex: '#0F7C70' },
  { nombre: 'granate', hex: '#A3214A' },
  { nombre: 'celeste', hex: '#3E8ED0' },
  { nombre: 'ciruela', hex: '#8E3B8C' },
  { nombre: 'pizarra', hex: '#4A6380' },
]

/** Número estable a partir de un texto (el mismo nombre da siempre el mismo número). */
export function huella(texto: string): number {
  let h = 2166136261
  for (const c of sinTildes(texto).trim()) {
    h ^= c.codePointAt(0) ?? 0
    h = Math.imul(h, 16777619) >>> 0
  }
  return h >>> 0
}

/** Color estable para un nombre de cliente. */
export function colorPorNombre(nombre: string): string {
  return PALETA[huella(nombre) % PALETA.length]!.hex
}

/**
 * Color para un cliente NUEVO: el suyo por nombre, salvo que ya lo tenga uno
 * de los clientes recientes; entonces el siguiente libre de la paleta.
 */
export function colorParaNuevo(nombre: string, coloresRecientes: readonly string[]): string {
  const usados = new Set(coloresRecientes.map(c => c.toUpperCase()))
  const inicio = huella(nombre) % PALETA.length
  for (let i = 0; i < PALETA.length; i++) {
    const candidato = PALETA[(inicio + i) % PALETA.length]!.hex
    if (!usados.has(candidato.toUpperCase())) return candidato
  }
  return PALETA[inicio]!.hex
}

/** Acepta «#2F6FED», «2f6fed», «#26f» o un nombre de la paleta («violeta»). */
export function leerColor(texto: string): string | null {
  const t = texto.trim()
  const dePaleta = PALETA.find(c => sinTildes(c.nombre) === sinTildes(t))
  if (dePaleta) return dePaleta.hex
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(t)
  if (!m) return null
  let hex = m[1]!
  if (hex.length === 3) hex = hex.split('').map(c => c + c).join('')
  return '#' + hex.toUpperCase()
}

/** Luminancia relativa (WCAG) de un color #RRGGBB. */
export function luminancia(hex: string): number {
  const limpio = hex.replace('#', '')
  const canal = (i: number) => {
    const v = parseInt(limpio.slice(i, i + 2), 16) / 255
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * canal(0) + 0.7152 * canal(2) + 0.0722 * canal(4)
}

/** Contraste WCAG entre dos colores (1 a 21). */
export function contraste(a: string, b: string): number {
  const la = luminancia(a)
  const lb = luminancia(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

/** Texto blanco o casi negro, el que más contraste dé sobre el color de fondo. */
export function textoSobre(fondo: string): string {
  return contraste(fondo, '#FFFFFF') >= contraste(fondo, '#111111') ? '#FFFFFF' : '#111111'
}

/** Nombre de la paleta para un hex (o el propio hex). */
export function nombreColor(hex: string): string {
  return PALETA.find(c => c.hex.toUpperCase() === hex.toUpperCase())?.nombre ?? hex
}
