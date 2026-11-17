// ─────────────────────────────────────────────────────────────────────────────
// cupo.ts · Cuentas del cupo de Jurisprudenciator (funciones puras)
//
// Jurisprudenciator limita las lecturas por día y por semana según el plan de
// la cuenta. Este archivo lleva la cuenta de lo gastado EN ESTE ORDENADOR y
// dice cuánto queda, para avisar ANTES de agotarlo. No hace llamadas de red:
// solo suma lo que Claude (o sus subagentes) consulta.
//
// Cómo se cuenta (editable en config/cupo.json):
//   · leer_sentencias  → 1 por cada sentencia pedida en «citas»
//   · buscar_articulo  → 0,5 (media lectura)
//   · buscar_sentencias y buscar_por_cita → 0
// Los límites de partida son los del plan Gratis (10 al día, 30 a la semana).
// Se corrigen solos: si Jurisprudenciator sigue respondiendo después de pasar
// el límite, ese límite no era el real y se deja de avisar con él; si responde
// «cupo agotado», se apunta el agotamiento (y los límites, si los dice).
// ─────────────────────────────────────────────────────────────────────────────

/** Coste de una herramienta: un número fijo o «uno por sentencia pedida». */
export type Peso = number | 'porCita'

export type ConfigCupo = {
  limitesIniciales: { diario: number | null; semanal: number | null }
  avisarCuandoQueden: number
  pesos: Record<string, Peso>
}

export const CUPO_POR_DEFECTO: ConfigCupo = {
  limitesIniciales: { diario: 10, semanal: 30 },
  avisarCuandoQueden: 3,
  pesos: { leer_sentencias: 'porCita', buscar_articulo: 0.5, buscar_por_cita: 0, buscar_sentencias: 0 },
}

export type Limites = {
  diario: number | null
  semanal: number | null
  /** De dónde salen: «por defecto», «manual», «Jurisprudenciator» o «superado …». */
  origen: string
}

export type LlamadaCupo = { hora: string; herramienta: string; peso: number; subagente: boolean }

export type RegistroCupo = {
  dia: string // AAAA-MM-DD (Madrid)
  semana: string // AAAA-Wnn (semana ISO, de lunes a domingo)
  usadoDia: number
  usadoSemana: number
  agotadoDia: boolean
  agotadoSemana: boolean
  limites: Limites
  ultimas: LlamadaCupo[]
}

export type Nivel = 'sinLimite' | 'holgado' | 'atento' | 'aviso' | 'agotado'

export type Situacion = {
  nivel: Nivel
  usado: number
  limite: number | null
  quedan: number | null
  periodo: 'hoy' | 'esta semana'
}

// ── Configuración y registro ────────────────────────────────────────────────

const numeroONulo = (v: unknown, porDefecto: number | null): number | null =>
  v === null ? null : typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : porDefecto

/** Lee config/cupo.json con valores por defecto para lo que falte o esté mal. */
export function normalizarConfigCupo(parcial: unknown): ConfigCupo {
  const p = (parcial && typeof parcial === 'object' ? parcial : {}) as Partial<ConfigCupo>
  const pesos: Record<string, Peso> = { ...CUPO_POR_DEFECTO.pesos }
  for (const [clave, valor] of Object.entries(p.pesos ?? {})) {
    if (valor === 'porCita' || (typeof valor === 'number' && Number.isFinite(valor) && valor >= 0)) pesos[clave] = valor
  }
  const avisar = Number(p.avisarCuandoQueden)
  return {
    limitesIniciales: {
      diario: numeroONulo(p.limitesIniciales?.diario, CUPO_POR_DEFECTO.limitesIniciales.diario),
      semanal: numeroONulo(p.limitesIniciales?.semanal, CUPO_POR_DEFECTO.limitesIniciales.semanal),
    },
    avisarCuandoQueden: Number.isFinite(avisar) && avisar >= 0 ? avisar : CUPO_POR_DEFECTO.avisarCuandoQueden,
    pesos,
  }
}

export function registroVacio(hoy: string, cfg: ConfigCupo): RegistroCupo {
  return {
    dia: hoy,
    semana: claveSemana(hoy),
    usadoDia: 0,
    usadoSemana: 0,
    agotadoDia: false,
    agotadoSemana: false,
    limites: { ...cfg.limitesIniciales, origen: 'por defecto' },
    ultimas: [],
  }
}

/** Lee data/cupo.json tolerando campos que falten, y lo pone al día. */
export function normalizarRegistro(parcial: unknown, hoy: string, cfg: ConfigCupo): RegistroCupo {
  const base = registroVacio(hoy, cfg)
  if (!parcial || typeof parcial !== 'object') return base
  const p = parcial as Partial<RegistroCupo>
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : 0)
  const limites: Limites =
    p.limites && typeof p.limites === 'object'
      ? {
          diario: numeroONulo(p.limites.diario, base.limites.diario),
          semanal: numeroONulo(p.limites.semanal, base.limites.semanal),
          origen: typeof p.limites.origen === 'string' ? p.limites.origen : base.limites.origen,
        }
      : base.limites
  const leido: RegistroCupo = {
    dia: typeof p.dia === 'string' ? p.dia : hoy,
    semana: typeof p.semana === 'string' ? p.semana : claveSemana(typeof p.dia === 'string' ? p.dia : hoy),
    usadoDia: num(p.usadoDia),
    usadoSemana: num(p.usadoSemana),
    agotadoDia: p.agotadoDia === true,
    agotadoSemana: p.agotadoSemana === true,
    limites,
    ultimas: Array.isArray(p.ultimas) ? p.ultimas.filter(l => l && typeof l.herramienta === 'string').slice(-20) : [],
  }
  return alDia(leido, hoy)
}

/** Semana ISO («2026-W46») de una fecha AAAA-MM-DD. */
export function claveSemana(dia: string): string {
  const [a, m, d] = dia.split('-').map(Number)
  const fecha = new Date(Date.UTC(a!, (m ?? 1) - 1, d ?? 1))
  const diaSemana = fecha.getUTCDay() || 7 // lunes = 1 … domingo = 7
  fecha.setUTCDate(fecha.getUTCDate() + 4 - diaSemana) // el jueves de esa semana
  const anio = fecha.getUTCFullYear()
  const semana = Math.ceil(((fecha.getTime() - Date.UTC(anio, 0, 1)) / 86_400_000 + 1) / 7)
  return `${anio}-W${String(semana).padStart(2, '0')}`
}

/** Pone a cero lo del día (y lo de la semana) si ha cambiado. Los límites se conservan. */
export function alDia(reg: RegistroCupo, hoy: string): RegistroCupo {
  let r = reg
  if (r.dia !== hoy) r = { ...r, dia: hoy, usadoDia: 0, agotadoDia: false, ultimas: [] }
  const semana = claveSemana(hoy)
  if (r.semana !== semana) r = { ...r, semana, usadoSemana: 0, agotadoSemana: false }
  return r
}

// ── Qué llamadas cuentan ─────────────────────────────────────────────────────

/** «mcp__6fa064c5-…__leer_sentencias» → «leer_sentencias». */
export function nombreHerramienta(tool: string): string {
  const partes = tool.split('__')
  return partes[partes.length - 1] ?? tool
}

/**
 * Si la herramienta es de Jurisprudenciator y está en la tabla de pesos,
 * devuelve su nombre corto. Se reconoce por el NOMBRE de la herramienta, no por
 * el del servidor: el conector de claude.ai se llama con un código (mcp__6fa0…).
 */
export function herramientaDelCupo(tool: string, cfg: ConfigCupo): string | null {
  if (!tool.startsWith('mcp__')) return null
  const corto = nombreHerramienta(tool)
  return Object.prototype.hasOwnProperty.call(cfg.pesos, corto) ? corto : null
}

/** Cuántas sentencias pide «citas» («STS 1/2020, STS 2/2021» → 2). */
export function contarCitas(valor: unknown): number {
  if (Array.isArray(valor)) return Math.max(1, valor.length)
  if (typeof valor !== 'string' || !valor.trim()) return 1
  return Math.max(1, valor.split(/[,;\n]/).filter(t => t.trim()).length)
}

/** Lo que gasta una llamada. */
export function pesoDeLlamada(corto: string, args: Record<string, unknown>, cfg: ConfigCupo): number {
  const peso = cfg.pesos[corto]
  if (peso === undefined) return 0
  return peso === 'porCita' ? contarCitas(args.citas ?? args.cita) : peso
}

// ── Lo que dice Jurisprudenciator cuando se acaba el cupo ───────────────────

export type SenalCupo = { semanal: boolean; limiteDiario?: number; limiteSemanal?: number }

const AGOTADO = [
  /\b(cupo|l[ií]mite|cuota)\b[^.\n]{0,120}?\b(agotad[oa]s?|alcanzad[oa]s?|superad[oa]s?|consumid[oa]s?|excedid[oa]s?|gastad[oa]s?)\b/i,
  /\b(agotad[oa]|alcanzad[oa]|superad[oa]|excedid[oa])\b[^.\n]{0,60}?\b(cupo|l[ií]mite|cuota)\b/i,
  /\b(quota|rate limit|limit)\b[^.\n]{0,60}?\b(exceeded|reached|exhausted)\b/i,
]

/**
 * ¿El resultado es el aviso de cupo agotado? Solo se miran textos cortos o de
 * error: el texto de una sentencia puede hablar de «cupos» sin que sea el aviso.
 */
export function leerSenalCupo(texto: string, isError: boolean): SenalCupo | null {
  if (!texto || (!isError && texto.length > 2500)) return null
  const muestra = texto.slice(0, 4000)
  // Un resultado normal (artículo del BOE, lista de sentencias, texto leído) no es el aviso,
  // aunque la norma o la sentencia hablen de un «límite superado».
  if (/Fuente: BOE|===\s*S?T?S? ?\S+\s*\||resultados \(total en Jurisprudenciator|sentencia\(s\) leidas/i.test(muestra)) return null
  // El aviso habla de la cuenta, el plan o las lecturas.
  if (!/\b(plan|cuenta|suscripci[oó]n|mejora|lecturas?|consultas|sentencias al d[ií]a|ma[nñ]ana|semana|hoy|quota|limit)\b/i.test(muestra)) return null
  const frase = AGOTADO.map(r => r.exec(muestra)).find(m => m)
  if (!frase) return null
  const contexto = muestra.slice(Math.max(0, frase.index - 80), frase.index + frase[0].length + 80)
  const semanal = /seman/i.test(contexto) && !/\b(hoy|diari[oa]|del d[ií]a)\b/i.test(contexto)
  const diario = /(\d+)\s*(?:sentencias|lecturas|consultas)?\s*(?:al|por|cada)\s+d[ií]a/i.exec(muestra)
  const sem = /(\d+)\s*(?:sentencias|lecturas|consultas)?\s*(?:a|por|cada)\s+la\s+semana/i.exec(muestra)
  return {
    semanal,
    ...(diario ? { limiteDiario: Number(diario[1]) } : {}),
    ...(sem ? { limiteSemanal: Number(sem[1]) } : {}),
  }
}

// ── Anotar una llamada ──────────────────────────────────────────────────────

export type Anotacion = {
  registro: RegistroCupo
  /** Texto para un aviso puntual (límite corregido), o null. */
  aviso: string | null
}

/** Suma una llamada ya respondida. No toca la llamada: solo cuenta. */
export function anotarLlamada(
  reg: RegistroCupo,
  llamada: { herramienta: string; peso: number; subagente: boolean; hora: string; texto: string; isError: boolean },
): Anotacion {
  const senal = leerSenalCupo(llamada.texto, llamada.isError)
  const fila: LlamadaCupo = { hora: llamada.hora, herramienta: llamada.herramienta, peso: 0, subagente: llamada.subagente }

  if (senal) {
    // Jurisprudenciator dice que se acabó: se apunta (y se aprenden los límites si los da).
    const limites: Limites = {
      diario: senal.limiteDiario ?? reg.limites.diario,
      semanal: senal.limiteSemanal ?? reg.limites.semanal,
      origen: senal.limiteDiario || senal.limiteSemanal ? 'Jurisprudenciator' : reg.limites.origen,
    }
    const r: RegistroCupo = {
      ...reg,
      limites,
      agotadoDia: reg.agotadoDia || !senal.semanal,
      agotadoSemana: reg.agotadoSemana || senal.semanal,
      usadoDia: !senal.semanal && limites.diario !== null ? Math.max(reg.usadoDia, limites.diario) : reg.usadoDia,
      usadoSemana: senal.semanal && limites.semanal !== null ? Math.max(reg.usadoSemana, limites.semanal) : reg.usadoSemana,
      ultimas: [...reg.ultimas, fila].slice(-20),
    }
    return { registro: r, aviso: null }
  }

  if (llamada.isError || llamada.peso <= 0) {
    return { registro: llamada.peso > 0 ? reg : { ...reg, ultimas: [...reg.ultimas, fila].slice(-20) }, aviso: null }
  }

  const r: RegistroCupo = {
    ...reg,
    usadoDia: redondear(reg.usadoDia + llamada.peso),
    usadoSemana: redondear(reg.usadoSemana + llamada.peso),
    ultimas: [...reg.ultimas, { ...fila, peso: llamada.peso }].slice(-20),
  }

  // Se pasó del límite y Jurisprudenciator siguió respondiendo: ese límite no era el real.
  let aviso: string | null = null
  const limites = { ...r.limites }
  if (limites.diario !== null && r.usadoDia > limites.diario + 1e-9) {
    aviso = `Jurisprudenciator sigue respondiendo después de ${formatoUnidades(r.usadoDia)} lecturas hoy: tu cupo diario es mayor que ${formatoUnidades(limites.diario)}. Fíjalo con /cupo <día> <semana>.`
    limites.origen = `superado (${formatoUnidades(limites.diario)} al día)`
    limites.diario = null
  }
  if (limites.semanal !== null && r.usadoSemana > limites.semanal + 1e-9) {
    aviso ??= `Jurisprudenciator sigue respondiendo después de ${formatoUnidades(r.usadoSemana)} lecturas esta semana: tu cupo semanal es mayor que ${formatoUnidades(limites.semanal)}. Fíjalo con /cupo <día> <semana>.`
    limites.origen = `superado (${formatoUnidades(limites.semanal)} a la semana)`
    limites.semanal = null
  }
  return { registro: { ...r, limites }, aviso }
}

// ── Cuánto queda ────────────────────────────────────────────────────────────

/** Situación del cupo: el periodo (día o semana) al que menos le queda. */
export function situacionCupo(reg: RegistroCupo, cfg: ConfigCupo): Situacion {
  if (reg.agotadoDia) return { nivel: 'agotado', usado: reg.usadoDia, limite: reg.limites.diario, quedan: 0, periodo: 'hoy' }
  if (reg.agotadoSemana) return { nivel: 'agotado', usado: reg.usadoSemana, limite: reg.limites.semanal, quedan: 0, periodo: 'esta semana' }

  const candidatos: Situacion[] = []
  if (reg.limites.diario !== null) {
    candidatos.push({ nivel: 'holgado', usado: reg.usadoDia, limite: reg.limites.diario, quedan: redondear(reg.limites.diario - reg.usadoDia), periodo: 'hoy' })
  }
  if (reg.limites.semanal !== null) {
    candidatos.push({ nivel: 'holgado', usado: reg.usadoSemana, limite: reg.limites.semanal, quedan: redondear(reg.limites.semanal - reg.usadoSemana), periodo: 'esta semana' })
  }
  if (candidatos.length === 0) return { nivel: 'sinLimite', usado: reg.usadoDia, limite: null, quedan: null, periodo: 'hoy' }

  const peor = candidatos.reduce((a, b) => ((b.quedan ?? Infinity) < (a.quedan ?? Infinity) ? b : a))
  const quedan = peor.quedan ?? Infinity
  const avisar = cfg.avisarCuandoQueden
  const nivel: Nivel = quedan <= 0 ? 'agotado' : quedan <= avisar ? 'aviso' : quedan <= avisar * 2 ? 'atento' : 'holgado'
  return { ...peor, nivel }
}

/** Aviso ANTES de una llamada que no cabe en lo que queda (o null si cabe). */
export function avisoAntesDeLlamada(sit: Situacion, peso: number): string | null {
  if (peso <= 0 || sit.nivel === 'sinLimite' || sit.quedan === null) return null
  if (sit.nivel === 'agotado') return `Jurisprudenciator: el cupo de ${sit.periodo} parece agotado; esta consulta puede no responder.`
  if (peso > sit.quedan) {
    return `Jurisprudenciator: esta consulta gasta ${formatoUnidades(peso)} y ${sit.periodo} solo quedan ${formatoUnidades(sit.quedan)}.`
  }
  return null
}

/** Texto corto para la banda: «⚖ Cupo 7/10 hoy». */
export function textoChipCupo(sit: Situacion): string {
  if (sit.nivel === 'agotado') return `⚖ Cupo agotado ${sit.periodo}`
  return `⚖ Quedan ${formatoUnidades(sit.quedan ?? 0)}/${formatoUnidades(sit.limite ?? 0)} ${sit.periodo}`
}

/** Respuesta de /cupo. */
export function resumenCupo(reg: RegistroCupo, cfg: ConfigCupo): string {
  const sit = situacionCupo(reg, cfg)
  const lim = (n: number | null) => (n === null ? 'sin límite conocido' : formatoUnidades(n))
  const lineas = [
    `Cupo de Jurisprudenciator (contado en este ordenador):`,
    `· Hoy: ${formatoUnidades(reg.usadoDia)} de ${lim(reg.limites.diario)}${reg.agotadoDia ? ' · AGOTADO según Jurisprudenciator' : ''}`,
    `· Esta semana: ${formatoUnidades(reg.usadoSemana)} de ${lim(reg.limites.semanal)}${reg.agotadoSemana ? ' · AGOTADO según Jurisprudenciator' : ''}`,
    `· Límites: ${reg.limites.origen}. Aviso cuando queden ${formatoUnidades(cfg.avisarCuandoQueden)} o menos.`,
  ]
  if (sit.nivel !== 'sinLimite' && sit.quedan !== null) lineas.push(`· Quedan ${formatoUnidades(Math.max(0, sit.quedan))} ${sit.periodo}.`)
  const subagentes = reg.ultimas.filter(l => l.subagente && l.peso > 0).length
  if (reg.ultimas.length > 0) {
    lineas.push(`· Últimas consultas de hoy: ${reg.ultimas.slice(-6).map(l => `${l.hora} ${l.herramienta} (${formatoUnidades(l.peso)})`).join(', ')}${subagentes ? ` · ${subagentes} de subagentes` : ''}`)
  }
  lineas.push('Cómo cuenta: cada sentencia leída, 1; cada artículo consultado, 0,5; buscar no gasta.')
  lineas.push('Solo cuenta lo de este ordenador (no lo consultado desde la web u otros equipos). Para corregirlo: /cupo 10 30 · /cupo sin limite · /cupo reiniciar')
  return lineas.join('\n')
}

/** Interpreta los argumentos de /cupo. */
export function leerArgumentosCupo(args: string): { tipo: 'ver' } | { tipo: 'reiniciar' } | { tipo: 'limites'; diario: number | null; semanal: number | null } | { tipo: 'error'; texto: string } {
  const t = args.trim().toLowerCase()
  if (!t) return { tipo: 'ver' }
  if (/^(reiniciar|reset|cero|poner a cero)$/.test(t)) return { tipo: 'reiniciar' }
  if (/^sin\s+l[ií]mite$/.test(t)) return { tipo: 'limites', diario: null, semanal: null }
  const numeros = t.split(/[\s,;/]+/).filter(Boolean).map(n => Number(n.replace(',', '.')))
  if (numeros.length >= 1 && numeros.length <= 2 && numeros.every(n => Number.isFinite(n) && n > 0)) {
    return { tipo: 'limites', diario: numeros[0]!, semanal: numeros[1] ?? null }
  }
  return { tipo: 'error', texto: 'Uso: /cupo (ver) · /cupo 10 30 (límite diario y semanal) · /cupo sin limite · /cupo reiniciar' }
}

// ── Utilidades ──────────────────────────────────────────────────────────────

export function redondear(n: number): number {
  return Math.round(n * 100) / 100
}

/** 7 → «7»; 7.5 → «7,5». */
export function formatoUnidades(n: number): string {
  const r = redondear(n)
  return Number.isInteger(r) ? String(r) : String(r).replace('.', ',')
}
