// ─────────────────────────────────────────────────────────────────────────────
// expediente.ts · Ficha del expediente: MASC y procurador (funciones puras)
//
// La FICHA de cada expediente (data/fichas.json) guarda: procedimiento,
// cuantía, procurador y el intento de negociación previa (MASC).
//
// · Semáforo MASC (Mod 7). En el orden civil, la demanda exige haber acudido
//   antes a un medio adecuado de solución de controversias (art. 5.1 LO 1/2025),
//   con las excepciones del art. 5.2 y 5.3, y ese intento debe constar en un
//   documento (art. 10). Si Claude escribe una demanda en la carpeta del
//   expediente activo y la ficha no tiene medio, fecha y documento, avisa.
// · Procurador (Mod 8). La comparecencia es por procurador y con abogado
//   (arts. 23.1 y 31.1 LEC), salvo los supuestos tasados del 23.2 y 31.2: el
//   verbal por razón de la CUANTÍA que no exceda de 2.000 € y la petición
//   inicial del monitorio, entre otros. Un verbal por razón de la MATERIA
//   (desahucio, art. 250.1.1.º) necesita procurador sea cual sea la cuantía.
//
// LAS REGLAS ESTÁN EN config/masc.json y config/postulacion.json, no aquí.
// Se comprobaron el 09/11/2026 con el texto vigente en Jurisprudenciator, pero
// son orientativas: DEBE VALIDARLAS UN ABOGADO antes de confiar en ellas.
// ─────────────────────────────────────────────────────────────────────────────

import { estaDentro, normalizarRuta, sinTildes, unirRuta } from './texto'

// ── Tipos ───────────────────────────────────────────────────────────────────

export type Masc = {
  medio: string // clave de config/masc.json → medios (burofax, mediacion, oferta-vinculante…)
  fecha: string // AAAA-MM-DD
  documento: string // el documento que lo acredita (art. 10 LO 1/2025)
  nota?: string
}

export type Ficha = {
  procedimiento?: string // clave de config/postulacion.json → procedimientos
  cuantia?: number // euros
  procurador?: string
  masc?: Masc
  excepcionMasc?: string // clave de config/masc.json → excepciones, si la materia está exceptuada
  nota?: string
}

export type ReglaProcedimiento = {
  nombre: string
  exento?: boolean // sin procurador ni abogado, sea cual sea la cuantía
  exentoHasta?: number // sin procurador ni abogado si la cuantía NO excede de esta cifra
  fundamento: string
}

export type ConfigPostulacion = {
  aviso: string
  procedimientos: Record<string, ReglaProcedimiento>
  /** Si la ficha no dice el procedimiento: avisar cuando la cuantía supere esta cifra. */
  umbralSinProcedimiento: number
}

export type ConfigMasc = {
  aviso: string
  jurisdicciones: string[] // órdenes en que se exige (civil y familia)
  patronesDemanda: string[] // trozos del nombre del archivo o carpeta que indican una demanda
  excluir: string[] // trozos que indican que NO es una demanda sujeta (contestación, ejecutiva…)
  medios: Record<string, string> // clave → nombre
  excepciones: Record<string, string> // clave → materia exceptuada y artículo
}

// ── Reglas por defecto (las mismas que traen los archivos de config) ────────

export const POSTULACION_POR_DEFECTO: ConfigPostulacion = {
  aviso: 'Postulación obligatoria (arts. 23 y 31 LEC)',
  umbralSinProcedimiento: 2000,
  procedimientos: {
    ordinario: { nombre: 'Juicio ordinario', fundamento: 'Arts. 23.1 y 31.1 LEC: procurador y abogado' },
    'verbal-cuantia': {
      nombre: 'Juicio verbal por razón de la cuantía',
      exentoHasta: 2000,
      fundamento: 'Arts. 23.2.1.º y 31.2.1.º LEC: sin procurador ni abogado si la cuantía no excede de 2.000 €',
    },
    'verbal-materia': {
      nombre: 'Juicio verbal por razón de la materia (art. 250.1 LEC: desahucio, precario…)',
      fundamento: 'La exención de los arts. 23.2.1.º y 31.2.1.º LEC solo alcanza a los verbales por razón de la cuantía',
    },
    'monitorio-peticion-inicial': {
      nombre: 'Petición inicial del monitorio',
      exento: true,
      fundamento: 'Arts. 23.2.1.º y 31.2.1.º LEC: la petición inicial del monitorio, sin procurador ni abogado',
    },
    'medidas-urgentes-previas': {
      nombre: 'Medidas urgentes antes del juicio',
      exento: true,
      fundamento: 'Arts. 23.2.3.º y 31.2.2.º LEC',
    },
  },
}

export const MASC_POR_DEFECTO: ConfigMasc = {
  aviso: 'Sin MASC acreditado',
  jurisdicciones: ['civil', 'familia'],
  patronesDemanda: ['demanda'],
  excluir: ['contestacion', 'ejecutiva', 'ejecucion'],
  medios: {
    burofax: 'Burofax con propuesta de negociación',
    mediacion: 'Mediación',
    'oferta-vinculante': 'Oferta vinculante confidencial',
    conciliacion: 'Conciliación',
    'negociacion-directa': 'Negociación directa entre las partes o sus abogados',
    'experto-independiente': 'Opinión de persona experta independiente',
    'derecho-colaborativo': 'Derecho colaborativo',
  },
  excepciones: {
    'derechos-fundamentales': 'Tutela judicial civil de derechos fundamentales (art. 5.2.a)',
    'medidas-158-cc': 'Medidas del art. 158 CC (art. 5.2.b)',
    'apoyo-discapacidad': 'Medidas de apoyo a personas con discapacidad (art. 5.2.c)',
    filiacion: 'Filiación, paternidad y maternidad (art. 5.2.d)',
    'tutela-sumaria-posesion': 'Tutela sumaria de la tenencia o la posesión (art. 5.2.e)',
    ruina: 'Demolición o derribo por ruina (art. 5.2.f)',
    menores: 'Ingreso de menores, entrada en domicilios o restitución de menores (art. 5.2.g)',
    cambiario: 'Juicio cambiario (art. 5.2.h)',
    ejecutiva: 'Demanda ejecutiva (art. 5.3)',
    'cautelares-previas': 'Medidas cautelares previas a la demanda (art. 5.3)',
    'diligencias-preliminares': 'Diligencias preliminares (art. 5.3)',
    'monitorio-europeo': 'Requerimiento europeo de pago (art. 5.3)',
    'escasa-cuantia-europeo': 'Proceso europeo de escasa cuantía (art. 5.3)',
  },
}

// ── Lectura de la configuración ─────────────────────────────────────────────

const esTexto = (v: unknown): v is string => typeof v === 'string' && v.trim() !== ''
const listaDeTextos = (v: unknown, porDefecto: string[]) => (Array.isArray(v) ? v.filter(esTexto) : porDefecto)
const mapaDeTextos = (v: unknown, porDefecto: Record<string, string>) =>
  v && typeof v === 'object' ? Object.fromEntries(Object.entries(v as Record<string, unknown>).filter(([, t]) => esTexto(t))) as Record<string, string> : porDefecto

export function normalizarPostulacion(parcial: unknown): ConfigPostulacion {
  const p = (parcial && typeof parcial === 'object' ? parcial : {}) as Partial<ConfigPostulacion>
  const procedimientos: Record<string, ReglaProcedimiento> = {}
  for (const [clave, regla] of Object.entries(p.procedimientos ?? POSTULACION_POR_DEFECTO.procedimientos)) {
    if (!regla || typeof regla !== 'object' || !esTexto(regla.nombre)) continue
    procedimientos[clave] = {
      nombre: regla.nombre,
      fundamento: esTexto(regla.fundamento) ? regla.fundamento : '',
      ...(regla.exento === true ? { exento: true } : {}),
      ...(typeof regla.exentoHasta === 'number' && regla.exentoHasta >= 0 ? { exentoHasta: regla.exentoHasta } : {}),
    }
  }
  const umbral = Number(p.umbralSinProcedimiento)
  return {
    aviso: esTexto(p.aviso) ? p.aviso : POSTULACION_POR_DEFECTO.aviso,
    procedimientos: Object.keys(procedimientos).length ? procedimientos : POSTULACION_POR_DEFECTO.procedimientos,
    umbralSinProcedimiento: Number.isFinite(umbral) && umbral >= 0 ? umbral : POSTULACION_POR_DEFECTO.umbralSinProcedimiento,
  }
}

export function normalizarConfigMasc(parcial: unknown): ConfigMasc {
  const p = (parcial && typeof parcial === 'object' ? parcial : {}) as Partial<ConfigMasc>
  return {
    aviso: esTexto(p.aviso) ? p.aviso : MASC_POR_DEFECTO.aviso,
    jurisdicciones: listaDeTextos(p.jurisdicciones, MASC_POR_DEFECTO.jurisdicciones).map(sinTildes),
    patronesDemanda: listaDeTextos(p.patronesDemanda, MASC_POR_DEFECTO.patronesDemanda).map(sinTildes),
    excluir: listaDeTextos(p.excluir, MASC_POR_DEFECTO.excluir).map(sinTildes),
    medios: mapaDeTextos(p.medios, MASC_POR_DEFECTO.medios),
    excepciones: mapaDeTextos(p.excepciones, MASC_POR_DEFECTO.excepciones),
  }
}

/** Lee data/fichas.json tolerando campos que falten o estén mal. */
export function normalizarFichas(parcial: unknown): Record<string, Ficha> {
  const p = parcial && typeof parcial === 'object' ? (parcial as { fichas?: unknown }).fichas : null
  if (!p || typeof p !== 'object') return {}
  const fichas: Record<string, Ficha> = {}
  for (const [clave, f] of Object.entries(p as Record<string, unknown>)) {
    if (!f || typeof f !== 'object') continue
    const x = f as Record<string, unknown>
    const masc = x.masc && typeof x.masc === 'object' ? (x.masc as Record<string, unknown>) : null
    fichas[clave] = {
      ...(esTexto(x.procedimiento) ? { procedimiento: x.procedimiento } : {}),
      ...(typeof x.cuantia === 'number' && Number.isFinite(x.cuantia) ? { cuantia: x.cuantia } : {}),
      ...(esTexto(x.procurador) ? { procurador: x.procurador } : {}),
      ...(esTexto(x.excepcionMasc) ? { excepcionMasc: x.excepcionMasc } : {}),
      ...(esTexto(x.nota) ? { nota: x.nota } : {}),
      ...(masc
        ? {
            masc: {
              medio: esTexto(masc.medio) ? masc.medio : '',
              fecha: esTexto(masc.fecha) ? masc.fecha : '',
              documento: esTexto(masc.documento) ? masc.documento : '',
              ...(esTexto(masc.nota) ? { nota: masc.nota } : {}),
            },
          }
        : {}),
    }
  }
  return fichas
}

/** Clave de la ficha de un cliente: su número de expediente o, si no tiene, su nombre. */
export function claveFicha(cliente: { nombre: string; expediente?: string }): string {
  return esTexto(cliente.expediente) ? cliente.expediente.trim() : sinTildes(cliente.nombre).trim()
}

// ── Procurador (Mod 8) ──────────────────────────────────────────────────────

export type AvisoProcurador = { texto: string; motivo: string }

/**
 * ¿Hace falta procurador y la ficha no lo tiene? Devuelve el aviso o null.
 * Sin procedimiento en la ficha, solo avisa si la cuantía supera el umbral.
 */
export function avisoProcurador(ficha: Ficha | undefined, cfg: ConfigPostulacion): AvisoProcurador | null {
  if (!ficha || esTexto(ficha.procurador)) return null
  const regla = ficha.procedimiento ? cfg.procedimientos[ficha.procedimiento] : undefined

  if (!regla) {
    if (ficha.cuantia === undefined || ficha.cuantia <= cfg.umbralSinProcedimiento) return null
    return {
      texto: cfg.aviso,
      motivo: `La cuantía (${euros(ficha.cuantia)}) supera ${euros(cfg.umbralSinProcedimiento)} y la ficha no dice el procedimiento ni el procurador.`,
    }
  }
  if (regla.exento) return null
  if (regla.exentoHasta !== undefined) {
    if (ficha.cuantia === undefined) return null // sin cuantía no se puede decidir
    if (ficha.cuantia <= regla.exentoHasta) return null
    return { texto: cfg.aviso, motivo: `${regla.nombre} de ${euros(ficha.cuantia)}: supera ${euros(regla.exentoHasta)}. ${regla.fundamento}.` }
  }
  return { texto: cfg.aviso, motivo: `${regla.nombre}${ficha.cuantia !== undefined ? ` (${euros(ficha.cuantia)})` : ''}: ${regla.fundamento}.` }
}

// ── Semáforo MASC (Mod 7) ───────────────────────────────────────────────────

export type EstadoMasc =
  | { tipo: 'acreditado'; resumen: string }
  | { tipo: 'excepcion'; texto: string }
  | { tipo: 'falta'; faltan: string[] }

/** ¿Consta en la ficha el intento de negociación previa con medio, fecha y documento? */
export function estadoMasc(ficha: Ficha | undefined, cfg: ConfigMasc): EstadoMasc {
  if (ficha?.excepcionMasc && cfg.excepciones[ficha.excepcionMasc]) {
    return { tipo: 'excepcion', texto: cfg.excepciones[ficha.excepcionMasc]! }
  }
  const m = ficha?.masc
  const faltan = [!m?.medio ? 'medio' : '', !m?.fecha ? 'fecha' : '', !m?.documento ? 'documento' : ''].filter(Boolean)
  if (!m || faltan.length) return { tipo: 'falta', faltan: m ? faltan : ['medio', 'fecha', 'documento'] }
  const medio = cfg.medios[m.medio] ?? m.medio
  return { tipo: 'acreditado', resumen: `${medio} · ${fechaLegible(m.fecha)} · ${m.documento}` }
}

/** ¿El orden jurisdiccional del cliente exige MASC? Sin dato, se trata como civil. */
export function exigeMasc(jurisdiccion: string | undefined, cfg: ConfigMasc): boolean {
  if (!esTexto(jurisdiccion)) return true
  return cfg.jurisdicciones.includes(sinTildes(jurisdiccion))
}

const HERRAMIENTAS_ESCRITURA = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit'])

/**
 * ¿Esta llamada ESCRIBE una demanda en la carpeta del expediente activo?
 * Cuenta: Write/Edit/MultiEdit sobre un archivo cuya ruta nombra una demanda
 * (también las secciones de la redacción rápida, que van en una carpeta
 * «redaccion/demanda-…») y el ensamblado de un Word con --salida. Devuelve la ruta o null.
 */
export function rutaDeDemanda(e: Record<string, unknown>, carpeta: string, cwd: string, cfg: ConfigMasc): string | null {
  if (!esTexto(carpeta)) return null
  const herramienta = String(e.tool)
  let ruta = ''
  if (HERRAMIENTAS_ESCRITURA.has(herramienta)) {
    ruta = esTexto(e.file_path) ? e.file_path : esTexto(e.notebook_path) ? e.notebook_path : ''
  } else if ((herramienta === 'Bash' || herramienta === 'PowerShell') && esTexto(e.command) && /\bensamblar\b/.test(e.command)) {
    const m = /--salida[\s=]+(?:"([^"]+)"|'([^']+)'|(\S+))/.exec(e.command)
    ruta = m ? (m[1] ?? m[2] ?? m[3] ?? '') : ''
  }
  if (!ruta) return null
  const absoluta = unirRuta(cwd, ruta)
  if (!estaDentro(absoluta, unirRuta(cwd, carpeta))) return null
  // Solo lo que queda por debajo de la carpeta del expediente decide si es una demanda.
  const dentro = sinTildes(absoluta.slice(normalizarRuta(unirRuta(cwd, carpeta)).length))
  if (cfg.excluir.some(x => dentro.includes(x))) return null
  return cfg.patronesDemanda.some(x => dentro.includes(x)) ? ruta.replace(/\\/g, '/') : null
}

// ── /masc ───────────────────────────────────────────────────────────────────

/**
 * «burofax | 25/09/2026 | DOC. 5 burofax y certificado | nota» → Masc.
 * La fecha la interpreta `leerFecha` (la del Mod 1: dd/mm/aaaa, «hoy»…).
 */
export function leerArgumentosMasc(
  args: string,
  cfg: ConfigMasc,
  leerFecha: (texto: string) => string | null,
): { masc: Masc } | { error: string } {
  const [medioTxt = '', fechaTxt = '', documento = '', nota = ''] = args.split('|').map(t => t.trim())
  const claveMedio = Object.keys(cfg.medios).find(k => sinTildes(k) === sinTildes(medioTxt).replace(/\s+/g, '-'))
  const uso = `Uso: /masc ${Object.keys(cfg.medios).slice(0, 3).join('|')}… | dd/mm/aaaa | documento que lo acredita [| nota]`
  if (!claveMedio) return { error: `Medio no reconocido («${medioTxt}»). ${uso}` }
  const fecha = leerFecha(fechaTxt)
  if (!fecha) return { error: `Fecha no válida («${fechaTxt}»). ${uso}` }
  if (!documento) return { error: `Falta el documento que acredita el intento (art. 10 LO 1/2025). ${uso}` }
  return { masc: { medio: claveMedio, fecha, documento, ...(nota ? { nota } : {}) } }
}

// ── Utilidades ──────────────────────────────────────────────────────────────

/** «2.340 €», «1.200,50 €». */
export function euros(n: number): string {
  const [entero = '0', dec] = n.toFixed(2).split('.')
  const miles = entero.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return `${miles}${dec && dec !== '00' ? ',' + dec : ''} €`
}

/** «2.340,50 €», «2340.5», «1200» → número; null si no es una cantidad. */
export function leerCuantia(texto: string): number | null {
  const t = texto.replace(/[€\s]/g, '')
  if (!t) return null
  const normal = /,\d{1,2}$/.test(t) ? t.replace(/\./g, '').replace(',', '.') : t.replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '')
  const n = Number(normal)
  return Number.isFinite(n) && n >= 0 ? n : null
}

/** AAAA-MM-DD → dd/mm/aaaa. */
export function fechaLegible(fecha: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fecha)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : fecha
}
