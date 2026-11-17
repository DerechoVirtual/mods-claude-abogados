// ─────────────────────────────────────────────────────────────────────────────
// plazos.ts · Cálculo de plazos procesales en días hábiles (funciones PURAS)
//
// Aquí no hay nada de Claude Code: solo fechas y reglas. Todo lo que el cálculo
// necesita (festivos, reglas por jurisdicción, fecha de hoy) entra como
// argumento, así las pruebas automáticas pueden comprobarlo sin archivos.
//
// Las fechas se manejan SIEMPRE como texto «AAAA-MM-DD» y se convierten a un
// número de días desde 1970 en UTC. Así no hay sorpresas con el horario de
// verano ni con la zona horaria del ordenador.
//
// Base legal de las reglas por defecto (verificadas el 08/11/2026 con
// Jurisprudenciator, texto vigente del BOE):
//   · art. 182.1 LOPJ y art. 130.2 LEC: sábados, domingos y festivos inhábiles.
//   · art. 183 LOPJ (red. LO 14/2022): agosto y del 24 de diciembre al 6 de
//     enero inhábiles, salvo actuaciones urgentes según las leyes procesales.
//   · art. 128.2 LJCA: en agosto no corren los plazos (salvo derechos
//     fundamentales).
//   · art. 43.4 LRJS: agosto y 24 dic–6 ene inhábiles, salvo despido y otras
//     modalidades que el propio artículo enumera.
//   · art. 201 LECrim: todos los días son hábiles para la instrucción penal.
//   · art. 135.5 LEC: presentación hasta las 15:00 del día hábil siguiente al
//     del vencimiento.
// CÁLCULO ORIENTATIVO: un abogado debe revisar cada plazo.
// ─────────────────────────────────────────────────────────────────────────────

/** Jurisdicciones que entiende el panel. */
export type Jurisdiccion = 'civil' | 'contencioso' | 'laboral' | 'penal'

export const JURISDICCIONES: readonly Jurisdiccion[] = ['civil', 'contencioso', 'laboral', 'penal']

/** Un festivo del archivo config/festivos.json. */
export type Festivo = {
  fecha: string // «AAAA-MM-DD»
  nombre: string
  ambito?: string // nacional, autonómico, local…
}

/** Reglas de cómputo de una jurisdicción (config/computo.json). */
export type ReglaJurisdiccion = {
  agostoInhabil: boolean
  navidadInhabil: boolean // del 24 de diciembre al 6 de enero
  nota?: string
}

/** Todas las reglas de cómputo configurables. */
export type ReglasComputo = {
  jurisdicciones: Record<Jurisdiccion, ReglaJurisdiccion>
  /** Margen del art. 135.5 LEC (15:00 del día hábil siguiente). Apagado por defecto. */
  lexnet15h: boolean
  /** Verde con MÁS de `verdeMasDe` días hábiles; ámbar desde `ambarDesde`. */
  umbrales: { verdeMasDe: number; ambarDesde: number }
}

/** Reglas por defecto: las mismas que trae config/computo.json. */
export const REGLAS_POR_DEFECTO: ReglasComputo = {
  jurisdicciones: {
    civil: { agostoInhabil: true, navidadInhabil: true },
    contencioso: { agostoInhabil: true, navidadInhabil: true },
    laboral: { agostoInhabil: true, navidadInhabil: true },
    penal: { agostoInhabil: false, navidadInhabil: false },
  },
  lexnet15h: false,
  umbrales: { verdeMasDe: 5, ambarDesde: 2 },
}

/** Un plazo registrado (data/plazos.json). */
export type Plazo = {
  id: string
  asunto: string
  tipo: string
  jurisdiccion: Jurisdiccion
  notificacion: string // «AAAA-MM-DD»
  dias: number // días hábiles del plazo
  cliente?: string // nombre o referencia del cliente (Mod 4)
  /**
   * Excepción legal para ESTE plazo: agosto y del 24 de diciembre al 6 de enero
   * cuentan como hábiles (p. ej. despido y otras modalidades del art. 43.4 LRJS,
   * derechos fundamentales del art. 128.2 LJCA, actuaciones urgentes).
   */
  especialesHabiles?: boolean
  creado?: string
}

/** Un día del desglose que muestra la calculadora. */
export type DiaDesglose = {
  fecha: string
  diaSemana: string // «lun», «mar»…
  habil: boolean
  motivo?: string // por qué no cuenta
  contador?: number // número de día hábil (1, 2, 3…)
}

/** Resultado del cómputo de un plazo. */
export type Computo = {
  vencimiento: string // último día hábil del plazo
  /** Con el ajuste art. 135.5 LEC: día hábil siguiente, hasta las 15:00. */
  finPresentacion?: string
  desglose: DiaDesglose[]
}

export type EstadoPlazo = 'verde' | 'ambar' | 'rojo' | 'vencido'

// ── Fechas como texto «AAAA-MM-DD» ──────────────────────────────────────────

const MS_DIA = 86_400_000
const DIAS_SEMANA = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']
export const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
]

/** Descompone «AAAA-MM-DD». Devuelve null si la fecha no existe (p. ej. 31 de febrero). */
export function partesFecha(fecha: string): { anio: number; mes: number; dia: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fecha.trim())
  if (!m) return null
  const anio = Number(m[1])
  const mes = Number(m[2])
  const dia = Number(m[3])
  if (mes < 1 || mes > 12 || dia < 1) return null
  const ultimo = new Date(Date.UTC(anio, mes, 0)).getUTCDate()
  if (dia > ultimo) return null
  return { anio, mes, dia }
}

/** true si el texto es una fecha válida «AAAA-MM-DD». */
export function esFechaValida(fecha: string): boolean {
  return partesFecha(fecha) !== null
}

/** Fecha → número de días desde 01/01/1970 (UTC). */
export function aNumero(fecha: string): number {
  const p = partesFecha(fecha)
  if (!p) throw new Error(`Fecha no válida: ${fecha}`)
  return Math.round(Date.UTC(p.anio, p.mes - 1, p.dia) / MS_DIA)
}

/** Número de días desde 1970 → «AAAA-MM-DD». */
export function deNumero(n: number): string {
  const d = new Date(n * MS_DIA)
  const anio = d.getUTCFullYear()
  const mes = String(d.getUTCMonth() + 1).padStart(2, '0')
  const dia = String(d.getUTCDate()).padStart(2, '0')
  return `${anio}-${mes}-${dia}`
}

/** Suma (o resta) días naturales a una fecha. */
export function sumarDias(fecha: string, dias: number): string {
  return deNumero(aNumero(fecha) + dias)
}

/** 0 = domingo … 6 = sábado. */
export function diaDeLaSemana(fecha: string): number {
  return ((aNumero(fecha) + 4) % 7 + 7) % 7 // el 01/01/1970 fue jueves
}

/** «vie 14/11» */
export function fechaCorta(fecha: string): string {
  const p = partesFecha(fecha)
  if (!p) return fecha
  const dd = String(p.dia).padStart(2, '0')
  const mm = String(p.mes).padStart(2, '0')
  return `${DIAS_SEMANA[diaDeLaSemana(fecha)]} ${dd}/${mm}`
}

/** «14/11/2026» */
export function fechaLarga(fecha: string): string {
  const p = partesFecha(fecha)
  if (!p) return fecha
  return `${String(p.dia).padStart(2, '0')}/${String(p.mes).padStart(2, '0')}/${p.anio}`
}

/**
 * La fecha de hoy en una zona horaria (por defecto Madrid), a partir de los
 * milisegundos que da el reloj. Si el entorno no tiene Intl, usa UTC.
 */
export function fechaEnZona(ms: number, zona = 'Europe/Madrid'): string {
  try {
    const partes = new Intl.DateTimeFormat('en-CA', {
      timeZone: zona,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date(ms))
    const valor = (tipo: string) => partes.find(p => p.type === tipo)?.value ?? ''
    const fecha = `${valor('year')}-${valor('month')}-${valor('day')}`
    if (esFechaValida(fecha)) return fecha
  } catch {
    // sin Intl: seguimos con UTC
  }
  return deNumero(Math.floor(ms / MS_DIA))
}

/**
 * Lee una fecha escrita por una persona: «14/11/2026», «14-11-2026»,
 * «2026-11-14», «14/11/26», «hoy» o «ayer». Devuelve «AAAA-MM-DD» o null.
 */
export function leerFechaUsuario(texto: string, hoy: string): string | null {
  const t = texto.trim().toLowerCase()
  if (t === 'hoy') return hoy
  if (t === 'ayer') return sumarDias(hoy, -1)
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t)
  if (m) return normalizar(Number(m[1]), Number(m[2]), Number(m[3]))
  m = /^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2}|\d{4})$/.exec(t)
  if (m) {
    const anio = m[3]!.length === 2 ? 2000 + Number(m[3]) : Number(m[3])
    return normalizar(anio, Number(m[2]), Number(m[1]))
  }
  return null

  function normalizar(anio: number, mes: number, dia: number): string | null {
    const f = `${anio}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`
    return esFechaValida(f) ? f : null
  }
}

// ── Días hábiles ────────────────────────────────────────────────────────────

/**
 * Si el día es inhábil para esa jurisdicción, devuelve el motivo
 * («agosto», «24 dic–6 ene», «sábado», «domingo», «festivo: …»).
 * Si es hábil, devuelve null.
 *
 * Agosto y Navidad se comprueban primero para que el desglose diga «agosto»
 * todo el mes (también sus fines de semana) y lo muestre en una sola línea.
 */
export function motivoInhabil(
  fecha: string,
  jurisdiccion: Jurisdiccion,
  festivos: readonly Festivo[],
  reglas: ReglasComputo,
  opciones: { especialesHabiles?: boolean } = {},
): string | null {
  const p = partesFecha(fecha)
  if (!p) return 'fecha no válida'
  const regla = reglas.jurisdicciones[jurisdiccion] ?? REGLAS_POR_DEFECTO.jurisdicciones[jurisdiccion]

  // Con la excepción legal marcada en el plazo, agosto y Navidad cuentan.
  if (!opciones.especialesHabiles) {
    if (p.mes === 8 && regla.agostoInhabil) return 'agosto (art. 183 LOPJ)'
    const esNavidad = (p.mes === 12 && p.dia >= 24) || (p.mes === 1 && p.dia <= 6)
    if (esNavidad && regla.navidadInhabil) return '24 dic–6 ene (art. 183 LOPJ)'
  }

  const dow = diaDeLaSemana(fecha)
  if (dow === 6) return 'sábado'
  if (dow === 0) return 'domingo'

  const festivo = festivos.find(f => f.fecha === fecha)
  if (festivo) return `festivo: ${festivo.nombre}`

  return null
}

/** El primer día hábil DESPUÉS de una fecha. */
export function diaHabilSiguiente(
  fecha: string,
  jurisdiccion: Jurisdiccion,
  festivos: readonly Festivo[],
  reglas: ReglasComputo,
  opciones: { especialesHabiles?: boolean } = {},
): string {
  let n = aNumero(fecha) + 1
  for (let i = 0; i < 400; i++, n++) {
    const f = deNumero(n)
    if (motivoInhabil(f, jurisdiccion, festivos, reglas, opciones) === null) return f
  }
  return deNumero(n)
}

/**
 * Calcula el vencimiento de un plazo de `dias` días hábiles.
 * El día de la notificación NO cuenta: se empieza a contar al día siguiente
 * y solo cuentan los días hábiles. Devuelve también el desglose día a día.
 */
export function calcularPlazo(
  datos: { notificacion: string; dias: number; jurisdiccion: Jurisdiccion; especialesHabiles?: boolean },
  festivos: readonly Festivo[],
  reglas: ReglasComputo,
): Computo {
  if (!esFechaValida(datos.notificacion)) throw new Error('Fecha de notificación no válida')
  const dias = Math.floor(datos.dias)
  if (!(dias >= 1 && dias <= 365)) throw new Error('El número de días debe estar entre 1 y 365')

  const opciones = { especialesHabiles: datos.especialesHabiles === true }
  const desglose: DiaDesglose[] = []
  let contados = 0
  let n = aNumero(datos.notificacion)

  // Tope de seguridad: ningún plazo de 365 días hábiles ocupa más de 3 años.
  for (let vuelta = 0; contados < dias && vuelta < 1200; vuelta++) {
    n += 1
    const fecha = deNumero(n)
    const motivo = motivoInhabil(fecha, datos.jurisdiccion, festivos, reglas, opciones)
    const diaSemana = DIAS_SEMANA[diaDeLaSemana(fecha)]!
    if (motivo === null) {
      contados += 1
      desglose.push({ fecha, diaSemana, habil: true, contador: contados })
    } else {
      desglose.push({ fecha, diaSemana, habil: false, motivo })
    }
  }

  const vencimiento = deNumero(n)
  const computo: Computo = { vencimiento, desglose }
  if (reglas.lexnet15h) {
    computo.finPresentacion = diaHabilSiguiente(vencimiento, datos.jurisdiccion, festivos, reglas, opciones)
  }
  return computo
}

/**
 * Días hábiles que quedan desde `hoy` hasta `fin` (sin contar hoy).
 *   · 0  → vence hoy
 *   · negativo → vencido (cuántos días hábiles hace)
 */
export function diasHabilesRestantes(
  hoy: string,
  fin: string,
  jurisdiccion: Jurisdiccion,
  festivos: readonly Festivo[],
  reglas: ReglasComputo,
  opciones: { especialesHabiles?: boolean } = {},
): number {
  const a = aNumero(hoy)
  const b = aNumero(fin)
  if (a === b) return 0
  const hacia = b > a ? 1 : -1
  let cuenta = 0
  for (let n = a + hacia; hacia > 0 ? n <= b : n > b; n += hacia) {
    if (motivoInhabil(deNumero(n), jurisdiccion, festivos, reglas, opciones) === null) cuenta += 1
  }
  if (hacia < 0) return -Math.max(1, cuenta)
  return cuenta
}

/** Color del semáforo según los días hábiles que quedan. */
export function estadoPorDias(restantes: number, reglas: ReglasComputo): EstadoPlazo {
  if (restantes < 0) return 'vencido'
  if (restantes > reglas.umbrales.verdeMasDe) return 'verde'
  if (restantes >= reglas.umbrales.ambarDesde) return 'ambar'
  return 'rojo' // 1 día o el mismo día
}

/** Un plazo ya calculado, listo para dibujar. */
export type PlazoCalculado = Plazo & {
  computo: Computo | null
  /** Fecha que manda: el vencimiento o, con el ajuste 135.5 LEC, el día siguiente. */
  fin: string | null
  restantes: number | null
  estado: EstadoPlazo | null
  error?: string
}

/** Calcula todos los plazos y los ordena por vencimiento (los vencidos primero). */
export function calcularTodos(
  plazos: readonly Plazo[],
  hoy: string,
  festivos: readonly Festivo[],
  reglas: ReglasComputo,
): PlazoCalculado[] {
  const lista = plazos.map((plazo): PlazoCalculado => {
    try {
      const computo = calcularPlazo(plazo, festivos, reglas)
      const fin = computo.finPresentacion ?? computo.vencimiento
      const opciones = { especialesHabiles: plazo.especialesHabiles === true }
      const restantes = diasHabilesRestantes(hoy, fin, plazo.jurisdiccion, festivos, reglas, opciones)
      return { ...plazo, computo, fin, restantes, estado: estadoPorDias(restantes, reglas) }
    } catch (error) {
      return { ...plazo, computo: null, fin: null, restantes: null, estado: null, error: String(error) }
    }
  })
  return lista.sort((x, y) => (x.fin ?? '9999').localeCompare(y.fin ?? '9999'))
}

/** Une días seguidos inhábiles con el mismo motivo (p. ej. todo agosto) en una línea. */
export type TramoDesglose = DiaDesglose & { hasta?: string; cuantos?: number }

export function agruparDesglose(desglose: readonly DiaDesglose[]): TramoDesglose[] {
  const salida: TramoDesglose[] = []
  for (const dia of desglose) {
    const ultimo = salida[salida.length - 1]
    const motivoBase = (m?: string) => (m ?? '').replace(/^(sábado|domingo)$/, 'fin de semana')
    if (
      ultimo &&
      !dia.habil &&
      !ultimo.habil &&
      motivoBase(ultimo.motivo) === motivoBase(dia.motivo) &&
      motivoBase(dia.motivo) !== 'fin de semana' &&
      aNumero(ultimo.hasta ?? ultimo.fecha) + 1 === aNumero(dia.fecha)
    ) {
      ultimo.hasta = dia.fecha
      ultimo.cuantos = (ultimo.cuantos ?? 1) + 1
    } else {
      salida.push({ ...dia })
    }
  }
  return salida
}

// ── Lectura de los argumentos de /plazo-nuevo ───────────────────────────────

/**
 * Lee «/plazo-nuevo asunto | tipo | jurisdicción | fecha | días [| cliente]».
 * Acepta «|» o «;» como separador. Devuelve el plazo o un mensaje de error.
 */
export function leerArgumentosPlazo(
  args: string,
  hoy: string,
): { plazo?: Omit<Plazo, 'id'>; error?: string; parcial: Partial<Record<string, string>> } {
  const trozos = args.split(/[|;]/).map(t => t.trim())
  const [asunto = '', tipo = '', jur = '', fecha = '', dias = '', cliente = ''] = trozos
  const parcial = { asunto, tipo, jurisdiccion: jur, notificacion: fecha, dias, cliente }

  if (trozos.length < 5) {
    return {
      parcial,
      error: 'Faltan datos. Formato: /plazo-nuevo Asunto | Tipo de escrito | civil | 14/11/2026 | 20',
    }
  }
  const jurisdiccion = leerJurisdiccion(jur)
  if (!jurisdiccion) return { parcial, error: `Jurisdicción «${jur}» no reconocida (civil, contencioso, laboral o penal).` }
  const notificacion = leerFechaUsuario(fecha, hoy)
  if (!notificacion) return { parcial, error: `Fecha «${fecha}» no válida. Usa dd/mm/aaaa.` }
  const numero = Number(dias.replace(/d[ií]as?/i, '').trim())
  if (!Number.isInteger(numero) || numero < 1 || numero > 365) {
    return { parcial, error: `Número de días «${dias}» no válido (entre 1 y 365).` }
  }
  if (!asunto) return { parcial, error: 'Falta el nombre del asunto.' }

  // Un sexto o séptimo trozo «urgente» o «agosto hábil» marca la excepción legal.
  const marcaUrgente = (t: string) => /^(urgente|agosto[\s-]*h[aá]bil|h[aá]biles)$/i.test(t)
  const especialesHabiles = trozos.slice(5).some(marcaUrgente)
  return {
    parcial,
    plazo: {
      asunto,
      tipo: tipo || 'Plazo',
      jurisdiccion,
      notificacion,
      dias: numero,
      ...(cliente && !marcaUrgente(cliente) ? { cliente } : {}),
      ...(especialesHabiles ? { especialesHabiles: true } : {}),
    },
  }
}

/** «Civil», «contencioso-administrativo», «social»… → jurisdicción del panel. */
export function leerJurisdiccion(texto: string): Jurisdiccion | null {
  const t = texto
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
  if (t.startsWith('civ') || t === 'mercantil' || t === 'familia') return 'civil'
  if (t.startsWith('cont') || t.startsWith('ca') || t.startsWith('admin')) return 'contencioso'
  if (t.startsWith('lab') || t.startsWith('soc')) return 'laboral'
  if (t.startsWith('pen') || t.startsWith('crim')) return 'penal'
  return null
}

/** Un identificador corto y estable para un plazo nuevo. */
export function nuevoId(ms: number, existentes: readonly { id: string }[]): string {
  let id = 'p' + ms.toString(36)
  let i = 1
  while (existentes.some(p => p.id === id)) id = 'p' + ms.toString(36) + '-' + i++
  return id
}

/**
 * Plazos de EJEMPLO, todos ficticios, calculados respecto a hoy para que el
 * panel muestre siempre un verde, un ámbar, un rojo y uno vencido.
 */
export function plazosDeEjemplo(
  hoy: string,
  festivos: readonly Festivo[],
  reglas: ReglasComputo,
  ms: number,
): Plazo[] {
  // Busca la fecha de notificación que deja `restantes` días hábiles hoy.
  const notificacionPara = (restantes: number, dias: number, jur: Jurisdiccion): string => {
    for (let atras = 0; atras < 800; atras++) {
      const notificacion = sumarDias(hoy, -atras)
      const fin = calcularPlazo({ notificacion, dias, jurisdiccion: jur }, festivos, reglas)
      const final = fin.finPresentacion ?? fin.vencimiento
      const quedan = diasHabilesRestantes(hoy, final, jur, festivos, reglas)
      if (quedan <= restantes) return notificacion
    }
    return hoy
  }
  const ejemplos: Array<Omit<Plazo, 'id' | 'notificacion'> & { quedan: number }> = [
    { asunto: 'García c. Aseguradora Ficticia', tipo: 'Contestación a la demanda (ordinario)', jurisdiccion: 'civil', dias: 20, cliente: 'García', quedan: 3 },
    { asunto: 'López c. Talleres Inventados', tipo: 'Recurso de apelación', jurisdiccion: 'civil', dias: 20, cliente: 'López', quedan: 12 },
    { asunto: 'Comunidad Calle Imaginaria 12', tipo: 'Recurso de reposición', jurisdiccion: 'civil', dias: 5, cliente: 'Comunidad Calle Imaginaria', quedan: 1 },
    { asunto: 'Ruiz c. Ayuntamiento de Villaejemplo', tipo: 'Demanda contencioso-administrativa', jurisdiccion: 'contencioso', dias: 20, quedan: 8 },
    { asunto: 'Pérez (despido ficticio)', tipo: 'Demanda de despido', jurisdiccion: 'laboral', dias: 20, especialesHabiles: true, cliente: 'Pérez', quedan: -1 },
  ]
  return ejemplos.map((ej, i) => {
    const { quedan, ...resto } = ej
    return {
      ...resto,
      id: `ejemplo-${i + 1}`,
      notificacion: notificacionPara(quedan, ej.dias, ej.jurisdiccion),
      creado: deNumero(Math.floor(ms / MS_DIA)),
    }
  })
}
