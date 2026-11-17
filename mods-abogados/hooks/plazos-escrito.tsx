// ─────────────────────────────────────────────────────────────────────────────
// MOD 1 · Plazos del escrito (pestaña «Del escrito» del panel de plazos)
//
// Pedido de Carlos (09/11/2026): «poniendo el comando plazos, automáticamente
// se me abra una interfaz con todos los plazos clave que se encuentren en un
// escrito judicial, lo más visual posible».
//
//   /plazos                  abre el panel; si aún no hay ningún escrito
//                            analizado, pide a Claude que analice el más
//                            reciente de la conversación
//   /plazos <ruta>           analiza ese escrito (PDF, Word o texto)
//   /plazos-escrito [ruta]   lo mismo, con un nombre que no comparte con nadie
//
// Cómo funciona: el comando envía a Claude la petición de leer el escrito y
// sacar sus plazos; Claude los entrega llamando a la herramienta del plugin
// «plazos_del_escrito», y el panel los dibuja: el próximo vencimiento en
// grande, un recuento por colores, una línea de tiempo (en la app de
// escritorio) y una tarjeta por plazo, con su fundamento y la frase del
// escrito de la que sale. Cada plazo de días hábiles se puede guardar en «Mis
// plazos» con un botón.
//
// Las fechas las calcula Claude y el plugin las repasa con el calendario del
// despacho (festivos y reglas de la pestaña «Festivos»): si no coinciden, la
// tarjeta lo avisa. Es orientativo: decide el abogado.
// No toca ninguna llamada ajena: solo contesta a su propia herramienta.
// ─────────────────────────────────────────────────────────────────────────────

import type { On } from 'claude-code'
import type { InformePlazosEscrito, PlazoDelEscrito } from '../types'
import {
  aNumero,
  calcularPlazo,
  diaDeLaSemana,
  diasHabilesRestantes,
  esFechaValida,
  estadoPorDias,
  fechaCorta,
  fechaLarga,
  leerJurisdiccion,
  MESES,
  partesFecha,
  type EstadoPlazo,
  type Jurisdiccion,
} from './lib/plazos'
import { actualizarHoy, anotarError, conAtajo, enviarUnaVez, estado, horaMadrid, redibujar, type Motor } from './lib/estado'
import { recortar } from './lib/texto'
import { marcarJuridica } from './sesion'
// El panel de plazos dibuja esta pestaña y este módulo abre el panel y guarda
// plazos con lo que ya hay allí: se importan el uno al otro, y no pasa nada
// porque solo se usan dentro de funciones, nunca al cargar el archivo.
import { abrirPanelPlazos, anadirPlazo } from './plazos-panel'

type Tabla = ReturnType<Motor['ui']['resolve']>

export const HERRAMIENTA_PLAZOS = 'plazos_del_escrito'
const REF = { plugin: 'mods-abogados', key: 'plazosEscrito' } as const

/** Lo que enseña la pestaña «Del escrito». */
export const escrito = {
  fase: 'vacio' as 'vacio' | 'analizando' | 'listo',
  origen: '', // la ruta que se pidió analizar, si se dio
  informe: null as InformePlazosEscrito | null,
  guardados: new Set<number>(), // plazos de este informe ya pasados a «Mis plazos»
}

// ── Lectura segura de lo que entrega Claude ─────────────────────────────────

const texto = (v: unknown, max: number): string | undefined => (typeof v === 'string' && v.trim() ? recortar(v.trim().replace(/\s+/g, ' '), max) : undefined)
const fecha = (v: unknown): string | undefined => {
  const m = typeof v === 'string' ? /^(\d{4}-\d{2}-\d{2})/.exec(v.trim()) : null
  return m && esFechaValida(m[1]!) ? m[1]! : undefined
}

/** Deja el informe en lo que el panel sabe dibujar (nunca lanza errores). */
export function normalizarInforme(bruto: unknown, hora: string): InformePlazosEscrito {
  const d = (bruto && typeof bruto === 'object' ? bruto : {}) as Record<string, unknown>
  const lista = Array.isArray(d.plazos) ? d.plazos : []
  const plazos: PlazoDelEscrito[] = []
  for (const x of lista.slice(0, 30)) {
    if (!x || typeof x !== 'object') continue
    const p = x as Record<string, unknown>
    const titulo = texto(p.titulo, 80)
    if (!titulo) continue
    const dias = typeof p.dias === 'number' && Number.isFinite(p.dias) && p.dias > 0 && p.dias <= 3650 ? Math.round(p.dias) : undefined
    const computo = typeof p.computo === 'string' && ['hábiles', 'naturales', 'meses', 'fecha fija'].includes(p.computo) ? (p.computo as PlazoDelEscrito['computo']) : undefined
    plazos.push({
      titulo,
      accion: texto(p.accion, 220) ?? titulo,
      ...(dias !== undefined ? { dias } : {}),
      ...(computo ? { computo } : {}),
      ...(fecha(p.fecha_inicio) ? { fecha_inicio: fecha(p.fecha_inicio)! } : {}),
      ...(fecha(p.fecha_vencimiento) ? { fecha_vencimiento: fecha(p.fecha_vencimiento)! } : {}),
      ...(texto(p.fundamento, 90) ? { fundamento: texto(p.fundamento, 90)! } : {}),
      ...(texto(p.cita, 240) ? { cita: texto(p.cita, 240)! } : {}),
      ...(texto(p.parte, 60) ? { parte: texto(p.parte, 60)! } : {}),
    })
  }
  const avisos = (Array.isArray(d.avisos) ? d.avisos : []).map(a => texto(a, 220)).filter((a): a is string => a !== undefined).slice(0, 6)
  const jurisdiccion = typeof d.jurisdiccion === 'string' ? leerJurisdiccion(d.jurisdiccion) : null
  return {
    documento: texto(d.documento, 90) ?? 'Escrito judicial',
    ...(texto(d.procedimiento, 90) ? { procedimiento: texto(d.procedimiento, 90)! } : {}),
    ...(texto(d.organo, 90) ? { organo: texto(d.organo, 90)! } : {}),
    ...(jurisdiccion ? { jurisdiccion } : {}),
    ...(fecha(d.fecha_notificacion) ? { fecha_notificacion: fecha(d.fecha_notificacion)! } : {}),
    ...(texto(d.resumen, 300) ? { resumen: texto(d.resumen, 300)! } : {}),
    avisos,
    plazos,
    hora,
  }
}

// ── Cuánto queda y de qué color ─────────────────────────────────────────────

export type PlazoVisto = {
  p: PlazoDelEscrito
  indice: number
  restantes: number | null // días (hábiles si el plazo es de días hábiles) hasta el vencimiento
  habiles: boolean
  estado: EstadoPlazo | null // null: sin fecha
  /** Vencimiento según el calendario del despacho, si NO coincide con el de Claude. */
  segunDespacho?: string
  /** ¿Se puede guardar en «Mis plazos»? (días hábiles desde una fecha) */
  guardable: boolean
}

function jurisdiccionDe(informe: InformePlazosEscrito): Jurisdiccion {
  return informe.jurisdiccion ?? leerJurisdiccion(estado.clienteActivo?.jurisdiccion ?? '') ?? 'civil'
}

/** Calcula lo que falta para cada plazo y repasa las fechas con el calendario del despacho. */
export function verPlazos(informe: InformePlazosEscrito): PlazoVisto[] {
  const jur = jurisdiccionDe(informe)
  const vistos = informe.plazos.map((p, indice): PlazoVisto => {
    const habiles = p.computo === 'hábiles' || (p.computo === undefined && p.dias !== undefined)
    const guardable = habiles && p.dias !== undefined && p.dias <= 365 && p.fecha_inicio !== undefined
    let fin = p.fecha_vencimiento
    let segunDespacho: string | undefined
    if (guardable) {
      try {
        const c = calcularPlazo({ notificacion: p.fecha_inicio!, dias: p.dias!, jurisdiccion: jur }, estado.festivos, estado.reglas)
        const nuestro = c.finPresentacion ?? c.vencimiento
        if (!fin) fin = nuestro
        else if (fin !== nuestro) segunDespacho = nuestro
      } catch {
        // sin repaso: vale la fecha de Claude
      }
    }
    if (!fin) return { p, indice, restantes: null, habiles, estado: null, guardable }
    const restantes = habiles ? diasHabilesRestantes(estado.hoy, fin, jur, estado.festivos, estado.reglas) : aNumero(fin) - aNumero(estado.hoy)
    return {
      p: { ...p, fecha_vencimiento: fin },
      indice,
      restantes,
      habiles,
      estado: estadoPorDias(restantes, estado.reglas),
      ...(segunDespacho ? { segunDespacho } : {}),
      guardable,
    }
  })
  // Lo que vence antes, primero; lo que no tiene fecha, al final.
  return vistos.sort((a, b) => (a.p.fecha_vencimiento ?? '9999').localeCompare(b.p.fecha_vencimiento ?? '9999'))
}

/** «VENCIDO», «vence HOY», «queda 1 día hábil», «quedan 3 días hábiles», «quedan 12 días». */
export function cuantoQueda(v: PlazoVisto): string {
  if (v.restantes === null) return 'sin fecha'
  if (v.restantes < 0) return 'VENCIDO'
  if (v.restantes === 0) return 'vence HOY'
  const dias = v.habiles ? (v.restantes === 1 ? 'día hábil' : 'días hábiles') : v.restantes === 1 ? 'día' : 'días'
  return `${v.restantes === 1 ? 'queda' : 'quedan'} ${v.restantes} ${dias}`
}

/** La cuenta atrás en grande: la cifra y, debajo, en qué se mide. */
export function cuentaAtras(v: PlazoVisto): { cifra: string; unidad: string } {
  if (v.restantes === null) return { cifra: '—', unidad: 'sin fecha' }
  if (v.restantes < 0) return { cifra: 'VENCIDO', unidad: v.p.fecha_vencimiento ? `el ${fechaCorta(v.p.fecha_vencimiento)}` : '' }
  if (v.restantes === 0) return { cifra: 'HOY', unidad: 'vence hoy' }
  return { cifra: String(v.restantes), unidad: v.habiles ? (v.restantes === 1 ? 'día hábil' : 'días hábiles') : v.restantes === 1 ? 'día' : 'días' }
}

/** «Vence el», «Venció el» (si ya ha pasado) o «Señalado para el» (un día fijo: una vista, un juicio). */
export function verboDe(v: PlazoVisto): string {
  if (v.p.computo === 'fecha fija') return v.restantes !== null && v.restantes < 0 ? 'Estaba señalado para el' : 'Señalado para el'
  return v.restantes !== null && v.restantes < 0 ? 'Venció el' : 'Vence el'
}

const DIAS_ENTEROS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']

/** «viernes 13 de noviembre de 2026» */
export function fechaCompleta(fecha: string): string {
  const p = partesFecha(fecha)
  if (!p) return fecha
  return `${DIAS_ENTEROS[diaDeLaSemana(fecha)]} ${p.dia} de ${MESES[p.mes - 1]} de ${p.anio}`
}

const COLOR = { verde: 'success', ambar: 'warning', rojo: 'error', vencido: 'error' } as const
const NOMBRE = { vencido: ['vencido', 'vencidos'], rojo: ['urgente', 'urgentes'], ambar: ['esta semana', 'esta semana'], verde: ['con margen', 'con margen'] } as const

// ── El cartel (SVG, solo en la app de escritorio) ───────────────────────────
//
// Lo primero que vence, en grande, y debajo el calendario con todos los plazos.
// Es un dibujo con su propio fondo azul marino: se lee igual con la app en
// claro y en oscuro. Colores vivos por urgencia sobre ese fondo.

const TINTA = { verde: '#34D399', ambar: '#FBBF24', rojo: '#F87171', vencido: '#F87171' } as const
const FONDO_CIFRA = '#0B1730'

function escaparXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** Parte un texto en renglones de `ancho` letras como mucho (el último, con «…» si no cabe). */
export function renglones(texto: string, ancho: number, max: number): string[] {
  const salida: string[] = []
  let actual = ''
  for (const palabra of texto.split(/\s+/).filter(Boolean)) {
    if (!actual) actual = palabra
    else if ((actual + ' ' + palabra).length <= ancho) actual += ' ' + palabra
    else {
      salida.push(actual)
      actual = palabra
    }
  }
  if (actual) salida.push(actual)
  if (salida.length <= max) return salida.map(r => recortar(r, ancho))
  const cabe = salida.slice(0, max)
  cabe[max - 1] = recortar(cabe[max - 1]! + ' ' + salida.slice(max).join(' '), ancho)
  return cabe
}

export const ANCHO_CARTEL = 800

/** El cartel entero: devuelve el dibujo y su alto (depende de cuántos renglones hagan falta). */
export function cartelPlazos(informe: InformePlazosEscrito, vistos: readonly PlazoVisto[], hoy: string): { svg: string; alto: number } | null {
  const con = vistos.filter(v => v.p.fecha_vencimiento && v.estado)
  if (con.length === 0) return null
  const W = ANCHO_CARTEL
  const primero = con.find(v => (v.restantes ?? -1) >= 0) ?? con[0]!
  const tinta = TINTA[primero.estado!]
  const t = (x: number, y: number, texto: string, extra: string) => `<text x="${x}" y="${y}" ${extra}>${escaparXml(texto)}</text>`

  // ── Lo primero que vence ──
  const cuenta = cuentaAtras(primero)
  const cifraLarga = cuenta.cifra.length > 3
  const cuadro =
    `<rect x="24" y="24" width="140" height="116" rx="16" fill="${tinta}"/>` +
    t(94, cifraLarga ? 92 : 100, cuenta.cifra, `text-anchor="middle" font-size="${cifraLarga ? 24 : cuenta.cifra.length > 2 ? 46 : 64}" font-weight="800" fill="${FONDO_CIFRA}"`) +
    (cifraLarga ? '' : t(94, 126, cuenta.unidad, `text-anchor="middle" font-size="15" font-weight="700" fill="${FONDO_CIFRA}"`)) +
    (cifraLarga && cuenta.unidad ? t(94, 116, cuenta.unidad, `text-anchor="middle" font-size="14" font-weight="700" fill="${FONDO_CIFRA}"`) : '')
  const titulo = renglones(primero.p.titulo, 40, 2)
  const yFecha = titulo.length > 1 ? 122 : 98
  const pie = [primero.p.fundamento, primero.p.parte].filter(Boolean).join(' · ')
  const heroe =
    cuadro +
    t(186, 44, primero.estado === 'vencido' ? 'PLAZO VENCIDO' : 'LO PRIMERO QUE VENCE', `font-size="12" font-weight="700" letter-spacing="1.5" fill="${tinta}"`) +
    titulo.map((r, i) => t(186, 72 + i * 26, r, 'font-size="23" font-weight="700" fill="#FFFFFF"')).join('') +
    t(186, yFecha, `${verboDe(primero)} ${fechaCompleta(primero.p.fecha_vencimiento!)}`, 'font-size="15" font-weight="600" fill="#C7D2FE"') +
    (pie ? t(186, yFecha + 21, recortar(pie, 78), 'font-size="12" fill="#94A3B8"') : '')

  // ── Recuento por urgencia ──
  let xChip = 24
  const yChip = 162
  const chips = (['vencido', 'rojo', 'ambar', 'verde'] as const)
    .map(e => ({ e, n: vistos.filter(v => v.estado === e).length }))
    .filter(x => x.n > 0)
    .map(x => {
      const texto = `${x.n} ${NOMBRE[x.e][x.n === 1 ? 0 : 1]}`
      const ancho = Math.round(texto.length * 7.4) + 34
      const lleno = x.e === 'vencido'
      const chip =
        `<rect x="${xChip}" y="${yChip}" width="${ancho}" height="26" rx="13" fill="${lleno ? TINTA.vencido : 'none'}" stroke="${TINTA[x.e]}" stroke-width="1.5"/>` +
        `<circle cx="${xChip + 14}" cy="${yChip + 13}" r="4" fill="${lleno ? FONDO_CIFRA : TINTA[x.e]}"/>` +
        t(xChip + 24, yChip + 17.5, texto, `font-size="13" font-weight="700" fill="${lleno ? FONDO_CIFRA : TINTA[x.e]}"`)
      xChip += ancho + 10
      return chip
    })
    .join('')
  const sinFecha = vistos.filter(v => v.estado === null).length
  const chipSinFecha = sinFecha > 0 ? t(xChip + 4, yChip + 17.5, `${sinFecha} sin fecha`, 'font-size="13" fill="#94A3B8"') : ''

  // ── Calendario ──
  const dias = con.map(v => aNumero(v.p.fecha_vencimiento!) - aNumero(hoy))
  const min = Math.min(0, ...dias)
  const max = Math.max(7, ...dias)
  const x0 = 76
  const x1 = W - 76
  const xDe = (d: number) => x0 + ((d - min) / (max - min)) * (x1 - x0)
  // Cada etiqueta (el título en uno o dos renglones y, debajo, la fecha) va
  // arriba o abajo de la línea, alternando; si pisaría a otra de su lado, se
  // aleja un escalón (hasta tres): así ninguna se monta sobre otra ni se corta.
  type Lado = 'arriba' | 'abajo'
  const RENGLON = 15
  const PASO = 2 * RENGLON + 24 // lo que ocupa una etiqueta de dos renglones más su fecha
  const ocupado: Record<Lado, number[]> = { arriba: [-999, -999, -999], abajo: [-999, -999, -999] }
  // Plazos que vencen el mismo día o en días seguidos: sus puntos se separan lo
  // justo (18 px) para que se vean todos, sin salirse por la derecha.
  const equis: number[] = []
  con.forEach((v, i) => {
    const propia = xDe(aNumero(v.p.fecha_vencimiento!) - aNumero(hoy))
    equis.push(i === 0 ? propia : Math.max(propia, equis[i - 1]! + 18))
  })
  for (let i = equis.length - 1; i >= 0; i--) {
    const tope = i === equis.length - 1 ? x1 + 20 : equis[i + 1]! - 18
    if (equis[i]! > tope) equis[i] = tope
  }
  const etiquetas = con.map((v, i) => {
    const x = equis[i]!
    const lado: Lado = i % 2 === 0 ? 'arriba' : 'abajo'
    const lineas = renglones(v.p.titulo, 24, 2)
    const ancho = Math.max(...lineas.map(l => l.length), 9) * 6.9 + 10
    const ancla = x - ancho / 2 < 10 ? 'start' : x + ancho / 2 > W - 10 ? 'end' : 'middle'
    const izquierda = ancla === 'start' ? x - 8 : ancla === 'end' ? x + 8 - ancho : x - ancho / 2
    let escalon = ocupado[lado].findIndex(fin => izquierda >= fin + 8)
    if (escalon < 0) escalon = ocupado[lado].indexOf(Math.min(...ocupado[lado]))
    ocupado[lado][escalon] = izquierda + ancho
    return { v, x, lado, lineas, ancla, escalon, xt: ancla === 'start' ? x - 8 : ancla === 'end' ? x + 8 : x }
  })
  const escalonesArriba = Math.max(0, ...etiquetas.filter(e => e.lado === 'arriba').map(e => e.escalon)) + 1
  const escalonesAbajo = Math.max(0, ...etiquetas.filter(e => e.lado === 'abajo').map(e => e.escalon)) + 1
  const hayAbajo = etiquetas.some(e => e.lado === 'abajo')
  const arribaCalendario = 214
  const y = arribaCalendario + 30 + escalonesArriba * PASO + 10 // la línea del tiempo
  const yHoy = y + (hayAbajo ? 20 + escalonesAbajo * PASO : 26)
  const alto = yHoy + 36
  const xHoy = xDe(0)
  // Primero todas las líneas y después todos los textos (con un borde del color
  // del fondo): así ninguna línea corta una letra aunque pase por detrás.
  const BORDE = 'stroke="#15295C" stroke-width="5" stroke-linejoin="round" paint-order="stroke"'
  const palos = etiquetas
    .map(e => {
      const n = e.lineas.length
      const yFechaP = e.lado === 'arriba' ? y - 20 - e.escalon * PASO : y + 30 + e.escalon * PASO + n * RENGLON
      const yPalo = e.lado === 'arriba' ? yFechaP + 5 : yFechaP - n * RENGLON - 12
      return `<line x1="${e.x.toFixed(1)}" y1="${y}" x2="${e.x.toFixed(1)}" y2="${yPalo}" stroke="${TINTA[e.v.estado!]}" stroke-width="1.5" opacity="0.7"/>`
    })
    .join('')
  const puntos = etiquetas
    .map(e => {
      const color = TINTA[e.v.estado!]
      const n = e.lineas.length
      // Arriba: los renglones del título y, pegada a la línea, la fecha. Abajo: igual, hacia abajo.
      const yFechaP = e.lado === 'arriba' ? y - 20 - e.escalon * PASO : y + 30 + e.escalon * PASO + n * RENGLON
      const yPrimera = yFechaP - n * RENGLON
      const xt = Number(e.xt.toFixed(1))
      return (
        `<circle cx="${e.x.toFixed(1)}" cy="${y}" r="8" fill="${color}" stroke="${FONDO_CIFRA}" stroke-width="3"/>` +
        e.lineas.map((l, k) => t(xt, yPrimera + k * RENGLON, l, `text-anchor="${e.ancla}" font-size="13" font-weight="700" fill="#FFFFFF" ${BORDE}`)).join('') +
        t(xt, yFechaP, fechaCorta(e.v.p.fecha_vencimiento!), `text-anchor="${e.ancla}" font-size="12" font-weight="600" fill="${color}" ${BORDE}`)
      )
    })
    .join('')
  const calendario =
    `<line x1="24" y1="${arribaCalendario - 10}" x2="${W - 24}" y2="${arribaCalendario - 10}" stroke="#FFFFFF" stroke-opacity="0.12"/>` +
    t(24, arribaCalendario + 12, 'CALENDARIO', 'font-size="11" font-weight="700" letter-spacing="1.5" fill="#94A3B8"') +
    `<rect x="${x0 - 24}" y="${y - 3}" width="${x1 - x0 + 48}" height="6" rx="3" fill="#FFFFFF" fill-opacity="0.16"/>` +
    `<line x1="${xHoy.toFixed(1)}" y1="${y - 14}" x2="${xHoy.toFixed(1)}" y2="${yHoy}" stroke="#FFFFFF" stroke-width="1.5" stroke-dasharray="3 4" opacity="0.75"/>` +
    `<rect x="${(xHoy - 25).toFixed(1)}" y="${yHoy}" width="50" height="20" rx="10" fill="#FFFFFF"/>` +
    t(Number(xHoy.toFixed(1)), yHoy + 14.5, 'HOY', `text-anchor="middle" font-size="11" font-weight="800" fill="${FONDO_CIFRA}"`) +
    palos +
    puntos

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${alto}" width="${W}" height="${alto}" font-family="'Segoe UI', 'Helvetica Neue', Helvetica, Arial, sans-serif">` +
    `<defs><linearGradient id="fondo" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0F1E3D"/><stop offset="1" stop-color="#1A3572"/></linearGradient></defs>` +
    `<rect width="${W}" height="${alto}" rx="18" fill="url(#fondo)"/>` +
    heroe +
    chips +
    chipSinFecha +
    calendario +
    `</svg>`
  void informe
  return { svg, alto }
}

// ── La petición a Claude ────────────────────────────────────────────────────

/** Lo que el comando pide a Claude: leer el escrito y entregar sus plazos a la herramienta del plugin. */
export function peticionPlazosEscrito(origen: string, herramienta: string): string {
  const cual = origen
    ? `que está en: ${origen}`
    : 'más reciente de esta conversación (el archivo adjunto, la ruta que te haya dado o el texto pegado)'
  return [
    `Saca los plazos del escrito judicial ${cual} y enséñamelos en el panel de plazos.`,
    '',
    '1. Lee el escrito entero (si es PDF o Word, con la herramienta de lectura que corresponda).',
    '2. Apunta cada plazo o fecha que obligue a hacer algo: contestar, recurrir, subsanar, aportar documentos, pagar o consignar, comparecer, vistas y juicios señalados, proponer prueba, caducidad o prescripción.',
    '3. Para cada uno: un título corto, qué hay que hacer exactamente, a quién afecta, la duración y si son días hábiles o naturales, desde qué día se cuenta (AAAA-MM-DD), el día en que vence (AAAA-MM-DD), el artículo que lo fija y la frase literal del escrito de la que sale.',
    '   Cuenta desde la fecha de notificación; si el escrito no la dice, usa la del propio escrito y avísalo. Los días hábiles, sin sábados, domingos, festivos, agosto ni del 24 de diciembre al 6 de enero cuando la ley los excluye. Un señalamiento con día fijo va como «fecha fija».',
    `4. Entrega el resultado llamando a la herramienta ${herramienta}. No lo repitas en el chat: basta una línea diciendo que el panel está al día y cuál es el plazo que vence antes.`,
    '',
    'Si en la conversación no hay ningún escrito, no inventes nada: llama a la herramienta sin plazos y con un aviso que lo diga, y pídeme el escrito.',
  ].join('\n')
}

/** Lanza el análisis: abre el panel en «Del escrito» y, al acabar el comando, envía la petición. */
export async function analizarEscrito($: Motor, origen: string): Promise<string> {
  const limpio = origen.trim().replace(/^["'«]|["'»]$/g, '')
  escrito.fase = 'analizando'
  escrito.origen = limpio
  await marcarJuridica($)
  await abrirPanelPlazos($, 'escrito', true)
  const peticion = peticionPlazosEscrito(limpio, `mcp__${$.plugin.name}__${HERRAMIENTA_PLAZOS}`)
  const enviar = async () => {
    const r = await enviarUnaVez($, peticion)
    if (r === 'enviado' || r === 'repetido') return
    // Si Claude está ocupado y no admite el envío, la petición queda escrita: basta pulsar Intro.
    try {
      await $.prompt.fill({ text: peticion, mode: 'replace' })
      $.ui.toast('He dejado la petición escrita en el cuadro de texto: pulsa Intro para analizar el escrito.', { timeoutMs: 8000 })
    } catch {
      $.ui.toast('No se pudo pedir el análisis ahora. Vuelve a escribir /plazos cuando Claude termine.', { timeoutMs: 8000 })
    }
  }
  // Un comando no puede enviar mensajes mientras se ejecuta: se envía justo después.
  void Promise.resolve()
    .then(() => $.clock.after(80, () => void enviar()))
    .catch(() => void enviar())
  return limpio ? '⚖ Leyendo el escrito: sus plazos aparecerán en el panel.' : '⚖ Buscando los plazos del escrito de esta conversación: aparecerán en el panel.'
}

// ── Manejadores que llama register.tsx (ninguno lanza errores) ──────────────

/** Al iniciar la sesión: la herramienta, el comando /plazos-escrito y lo que ya se había analizado en esta sesión. */
export async function iniciarPlazosEscrito($: Motor): Promise<void> {
  // Sesión nueva (o plugin recargado): se empieza sin análisis; si esta sesión ya tenía uno, se recupera abajo.
  escrito.fase = 'vacio'
  escrito.origen = ''
  escrito.informe = null
  escrito.guardados = new Set()
  try {
    await $.command.register({
      name: 'plazos-escrito',
      description: 'Saca los plazos de un escrito judicial y los enseña en el panel (sin ruta: el escrito más reciente de la conversación)',
      argumentHint: '[ruta del escrito]',
    })
    await $.tool.register({
      name: HERRAMIENTA_PLAZOS,
      isDeferred: false,
      description:
        'Enseña en el panel «Plazos procesales» del despacho los plazos sacados de un escrito judicial (providencia, decreto, auto, sentencia, requerimiento…). Llámala cuando el usuario escriba /plazos o pida ver los plazos de un escrito, después de leerlo. No modifica ningún archivo.',
      inputSchema: {
        type: 'object',
        required: ['documento', 'plazos'],
        properties: {
          documento: { type: 'string', description: 'Qué escrito es, en pocas palabras: «Decreto de admisión de la demanda»' },
          organo: { type: 'string', description: 'Juzgado o tribunal' },
          procedimiento: { type: 'string', description: 'Tipo y número de procedimiento' },
          jurisdiccion: { type: 'string', enum: ['civil', 'contencioso', 'laboral', 'penal'] },
          fecha_notificacion: { type: 'string', description: 'AAAA-MM-DD' },
          resumen: { type: 'string', description: 'Una o dos frases sobre lo que dice el escrito' },
          avisos: { type: 'array', items: { type: 'string' }, description: 'Advertencias sobre el cómputo (p. ej. que falta la fecha de notificación)' },
          plazos: {
            type: 'array',
            items: {
              type: 'object',
              required: ['titulo', 'accion'],
              properties: {
                titulo: { type: 'string', description: 'Nombre corto: «Contestación a la demanda»' },
                accion: { type: 'string', description: 'Qué hay que hacer exactamente' },
                parte: { type: 'string', description: 'A quién afecta' },
                dias: { type: 'number', description: 'Duración del plazo' },
                computo: { type: 'string', enum: ['hábiles', 'naturales', 'meses', 'fecha fija'] },
                fecha_inicio: { type: 'string', description: 'Día desde el que se cuenta (la notificación), AAAA-MM-DD' },
                fecha_vencimiento: { type: 'string', description: 'Día en que vence, AAAA-MM-DD' },
                fundamento: { type: 'string', description: 'Artículo que fija el plazo' },
                cita: { type: 'string', description: 'Frase literal del escrito de la que sale' },
              },
            },
          },
        },
      },
    })
  } catch (error) {
    anotarError(`Plazos del escrito: ${String(error).slice(0, 100)}`)
  }
  try {
    const guardado = await $.state.get(REF)
    if (guardado.value && Array.isArray(guardado.value.plazos)) {
      escrito.informe = guardado.value
      escrito.fase = 'listo'
    }
  } catch {
    // sin memoria de sesión: se empieza de cero
  }
}

async function recordar($: Motor): Promise<void> {
  try {
    await $.state.set(REF, escrito.informe)
  } catch {
    // no pasa nada: solo se pierde al recargar
  }
}

/** Comando /plazos-escrito y la herramienta que Claude llama con los plazos. */
export function registrarHooksPlazosEscrito(on: On): void {
  on('command.run', { command: 'plazos-escrito' }, async ($, e) => ({ text: await analizarEscrito($, e.args ?? '') })).catch(() => ({
    text: 'mods-abogados: no se pudo pedir el análisis del escrito.',
  }))

  on('tool.call', { tool: 'mcp__mods-abogados__plazos_del_escrito' }, async ($, e) => recibirPlazosEscrito($, e as unknown as Record<string, unknown>)).catch(
    () => ({ result: 'No se pudo dibujar el panel de plazos; dime los plazos en el chat.' }) as never,
  )
}

/** ¿Es la herramienta de este módulo? (por si Claude Code la lista con otro prefijo que el esperado) */
export function esHerramientaPlazosEscrito(herramienta: string): boolean {
  return herramienta.endsWith(`__${HERRAMIENTA_PLAZOS}`)
}

/** Claude entrega los plazos del escrito: se guardan, se abre la pestaña y se le contesta en una línea. */
export async function recibirPlazosEscrito($: Motor, e: Record<string, unknown>) {
  const { tool: _t, tool_use_id: _id, agentId: _a, requestMeta: _m, ...resto } = e
  const entrada = (resto.input && typeof resto.input === 'object' ? resto.input : resto) as unknown
  await actualizarHoy($)
  let ahora = Date.now()
  try {
    ahora = await $.clock.now()
  } catch {
    // vale el reloj del sistema
  }
  escrito.informe = normalizarInforme(entrada, horaMadrid(ahora))
  escrito.fase = 'listo'
  escrito.guardados = new Set()
  await recordar($)
  await marcarJuridica($)
  await abrirPanelPlazos($, 'escrito', true)
  const n = escrito.informe.plazos.length
  $.ui.toast(n === 0 ? '⚖ El escrito no trae plazos.' : `⚖ ${n === 1 ? 'Un plazo' : n + ' plazos'} del escrito en el panel.`)
  const primero = verPlazos(escrito.informe).find(v => v.restantes !== null && v.restantes >= 0)
  return {
    result:
      n === 0
        ? 'Panel al día: el escrito no trae plazos.'
        : `Panel al día con ${n} ${n === 1 ? 'plazo' : 'plazos'}.${primero ? ` El que vence antes: ${primero.p.titulo}, el ${fechaLarga(primero.p.fecha_vencimiento!)} (${cuantoQueda(primero)}).` : ''}`,
  } as never
}

// ── Dibujo de la pestaña ────────────────────────────────────────────────────

/** La pestaña «Del escrito». */
export function dibujarPlazosEscrito($: Motor, tabla: Tabla, ancho: number, superficie: string) {
  const { Box, Text, Button } = tabla
  const botonAnalizar = (etiqueta: string, principal: boolean) => (
    <Button
      key="escrito-analizar"
      label={conAtajo(etiqueta, 'a', superficie)}
      hotkey="a"
      {...(principal ? { variant: 'primary' as const } : {})}
      onPress={() => void analizarEscrito($, '')}
    />
  )

  if (escrito.fase === 'analizando') {
    return (
      <Box flexDirection="column">
        <Text bold color="suggestion">
          ⏳ Claude está leyendo el escrito y calculando los vencimientos…
        </Text>
        <Text dimColor wrap="truncate-end">
          {escrito.origen ? recortar(escrito.origen.replace(/\\/g, '/').split('/').pop() ?? escrito.origen, 80) : 'El escrito más reciente de la conversación'}
        </Text>
        <Text dimColor>Los plazos aparecerán aquí en cuanto termine.</Text>
      </Box>
    )
  }

  const informe = escrito.informe
  if (!informe) {
    return (
      <Box flexDirection="column">
        <Text bold>Los plazos de un escrito, de un vistazo</Text>
        <Text wrap="wrap">Adjunta en el chat la providencia, el decreto o la sentencia y pulsa el botón. Claude lo lee y aquí aparecen sus plazos, con el día en que vence cada uno.</Text>
        <Text dimColor wrap="wrap">También puedes escribir /plazos seguido de la ruta del archivo.</Text>
        <Text> </Text>
        <Box flexDirection="row">{botonAnalizar('Analizar el escrito de esta conversación', true)}</Box>
      </Box>
    )
  }

  const vistos = verPlazos(informe)
  const primero = vistos.find(v => v.restantes !== null && v.restantes >= 0) ?? vistos.find(v => v.estado === 'vencido')
  const recuento = (['vencido', 'rojo', 'ambar', 'verde'] as const)
    .map(e => ({ e, n: vistos.filter(v => v.estado === e).length }))
    .filter(x => x.n > 0)
  const sinFecha = vistos.filter(v => v.estado === null).length
  // El cartel, solo donde se pueden dibujar imágenes (la app de escritorio).
  const cartel = superficie !== 'terminal' && 'Svg' in tabla ? cartelPlazos(informe, vistos, estado.hoy) : null
  const datos = [informe.organo, informe.procedimiento, informe.fecha_notificacion ? `notificado el ${fechaCompleta(informe.fecha_notificacion)}` : ''].filter(Boolean).join(' · ')

  const tarjeta = (v: PlazoVisto) => {
    const color = v.estado ? COLOR[v.estado] : 'subtle'
    const cuenta = cuentaAtras(v)
    const palabra = cuenta.cifra.length > 3 // «VENCIDO»
    const duracion =
      v.p.dias !== undefined
        ? `${v.p.dias} ${v.p.computo === 'meses' ? (v.p.dias === 1 ? 'mes' : 'meses') : v.habiles ? (v.p.dias === 1 ? 'día hábil' : 'días hábiles') : v.p.dias === 1 ? 'día natural' : 'días naturales'}${v.p.fecha_inicio ? ` desde el ${fechaCorta(v.p.fecha_inicio)}` : ''}`
        : ''
    const yaGuardado = escrito.guardados.has(v.indice)
    return (
      <Box key={`escrito-plazo-${v.indice}`} flexDirection="row" columnGap={2} borderStyle="round" borderColor={color} paddingX={1}>
        {/* La cuenta atrás, en grande y con el color de la urgencia. */}
        <Box flexDirection="column" width={13} flexShrink={0} alignItems="center">
          {palabra ? (
            <Text backgroundColor="error" color="inverseText" bold>
              {` ${cuenta.cifra} `}
            </Text>
          ) : (
            <Text color={color} bold size="title">
              {cuenta.cifra}
            </Text>
          )}
          {cuenta.unidad ? (
            <Text color={color} size="footnote">
              {cuenta.unidad}
            </Text>
          ) : null}
        </Box>
        <Box flexDirection="column" flexGrow={1} flexShrink={1} minWidth={0}>
          <Text bold wrap="wrap">
            {v.p.titulo}
          </Text>
          <Text wrap="wrap">👉 {v.p.accion}</Text>
          {v.p.fecha_vencimiento ? (
            <Text wrap="wrap">
              📅 {verboDe(v)} {fechaCompleta(v.p.fecha_vencimiento)}
              {duracion ? ` · ${duracion}` : ''}
            </Text>
          ) : (
            <Text color="warning" wrap="wrap">
              📅 {duracion ? `${duracion}: ` : ''}falta saber desde qué día se cuenta
            </Text>
          )}
          {v.p.fundamento || v.p.parte ? (
            <Text dimColor wrap="wrap">
              {[v.p.fundamento ? `⚖ ${v.p.fundamento}` : '', v.p.parte ? `👤 ${v.p.parte}` : ''].filter(Boolean).join(' · ')}
            </Text>
          ) : null}
          {v.p.cita ? (
            <Text dimColor italic wrap="wrap">
              «{v.p.cita}»
            </Text>
          ) : null}
          {v.segunDespacho ? (
            <Text color="warning" wrap="wrap">
              ⚠ Con los festivos del despacho saldría el {fechaCompleta(v.segunDespacho)}: compruébalo.
            </Text>
          ) : null}
          {v.guardable ? (
            yaGuardado ? (
              <Text color="success">✓ Guardado en «Mis plazos»</Text>
            ) : (
              <Box flexDirection="row">
                <Button
                  key={`escrito-guardar-${v.indice}`}
                  label="Guardar en «Mis plazos»"
                  onPress={async () => {
                    if (escrito.guardados.has(v.indice)) return
                    escrito.guardados.add(v.indice)
                    await anadirPlazo($, {
                      asunto: recortar(informe.procedimiento ?? informe.documento, 60),
                      tipo: v.p.titulo,
                      jurisdiccion: jurisdiccionDe(informe),
                      notificacion: v.p.fecha_inicio!,
                      dias: v.p.dias!,
                      ...(estado.clienteActivo ? { cliente: estado.clienteActivo.nombre } : {}),
                    })
                    $.ui.toast(`✓ «${recortar(v.p.titulo, 50)}» guardado en «Mis plazos».`)
                    redibujar($)
                  }}
                />
              </Box>
            )
          ) : null}
        </Box>
      </Box>
    )
  }

  return (
    <Box flexDirection="column" rowGap={superficie === 'terminal' ? 0 : 1} width={Math.min(ancho, 100)}>
      <Box flexDirection="column">
        <Text bold wrap="wrap">
          📄 {informe.documento}
        </Text>
        {datos ? (
          <Text dimColor wrap="wrap">
            {datos}
          </Text>
        ) : null}
        {informe.resumen ? <Text wrap="wrap">{informe.resumen}</Text> : null}
      </Box>

      {vistos.length === 0 ? <Text color="warning">Este escrito no trae plazos.</Text> : null}

      {cartel && 'Svg' in tabla ? (
        <tabla.Svg
          source={cartel.svg}
          alt={`${primero ? `Lo primero que vence: ${primero.p.titulo}, ${primero.p.fecha_vencimiento ? fechaCompleta(primero.p.fecha_vencimiento) : 'sin fecha'} (${cuantoQueda(primero)}). ` : ''}Calendario: ${vistos
            .filter(v => v.p.fecha_vencimiento)
            .map(v => `${v.p.titulo}, ${fechaCorta(v.p.fecha_vencimiento!)}`)
            .join('; ')}.`}
          width={Math.min(ANCHO_CARTEL, Math.max(360, ancho * 9))}
        />
      ) : null}

      {/* Sin dibujo (terminal): lo mismo, en texto. */}
      {!cartel && primero && primero.p.fecha_vencimiento ? (
        <Box flexDirection="column" borderStyle="round" borderColor={primero.estado ? COLOR[primero.estado] : 'subtle'} paddingX={1}>
          <Text bold color={primero.estado ? COLOR[primero.estado] : 'text'}>
            ⏰ {primero.estado === 'vencido' ? 'PLAZO VENCIDO' : `LO PRIMERO QUE VENCE · ${cuantoQueda(primero).toUpperCase()}`}
          </Text>
          <Text bold wrap="wrap">
            {primero.p.titulo} · {fechaCompleta(primero.p.fecha_vencimiento)}
          </Text>
        </Box>
      ) : null}
      {!cartel && (recuento.length > 0 || sinFecha > 0) ? (
        <Box flexDirection="row" columnGap={2}>
          {recuento.map(x => (
            <Text key={`escrito-recuento-${x.e}`} color={COLOR[x.e]} bold>
              ● {x.n} {NOMBRE[x.e][x.n === 1 ? 0 : 1]}
            </Text>
          ))}
          {sinFecha > 0 ? <Text dimColor>○ {sinFecha} sin fecha</Text> : null}
        </Box>
      ) : null}

      {vistos.map(v => tarjeta(v))}

      {informe.avisos.length > 0 ? (
        <Box flexDirection="column" borderStyle="round" borderColor="warning" paddingX={1}>
          <Text bold color="warning">
            ⚠ A tener en cuenta
          </Text>
          {informe.avisos.map((a, i) => (
            <Text key={`escrito-aviso-${i}`} wrap="wrap">
              · {a}
            </Text>
          ))}
        </Box>
      ) : null}

      <Box flexDirection="column">
        <Box flexDirection="row" columnGap={2}>
          {botonAnalizar('Analizar otro escrito', false)}
          <Button
            key="escrito-limpiar"
            label="Quitar de aquí"
            plain
            dimColor
            onPress={async () => {
              escrito.informe = null
              escrito.fase = 'vacio'
              escrito.guardados = new Set()
              await recordar($)
              redibujar($)
            }}
          />
        </Box>
        <Text dimColor wrap="wrap">
          Leído a las {informe.hora}. Las fechas las calcula Claude y el plugin las repasa con los festivos del despacho.
        </Text>
      </Box>
    </Box>
  )
}
