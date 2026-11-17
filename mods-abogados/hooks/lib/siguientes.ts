// ─────────────────────────────────────────────────────────────────────────────
// siguientes.ts · Las tres siguientes peticiones más probables (funciones puras)
//
// Al terminar un escrito, el Mod 10 propone tres actuaciones («ahora el recurso
// de apelación», «prepara la vista»…). Salen de:
//   1. una tabla por tipo de escrito (config/siguientes.json),
//   2. Claude con el modelo pequeño, que ordena y concreta las candidatas para
//      este caso (una sola llamada por escrito),
//   3. el historial de lo que el abogado eligió otras veces, que sube puestos.
// Si el modelo falla, se usan las tres primeras de la tabla con el historial.
// La tabla es ORIENTATIVA: debe validarla un abogado.
// ─────────────────────────────────────────────────────────────────────────────

import { calcularPlazo, fechaCorta, type Festivo, type Jurisdiccion, type ReglasComputo } from './plazos'
import { sinTildes } from './texto'

export type Accion = {
  etiqueta: string
  porque: string
  peticion: string
  plazoTexto?: string
  plazo?: { dias: number; jurisdiccion: Jurisdiccion; desde: string }
}

export type TipoEscrito = { id: string; nombre: string; patrones: string[]; procedimientos?: string[]; acciones: string[] }

export type ConfigSiguientes = { tipos: TipoEscrito[]; acciones: Record<string, Accion> }

/** Una opción del panel: la acción de la tabla, con la etiqueta y el porqué ya concretados. */
export type Opcion = { id: string; etiqueta: string; porque: string; peticion: string; plazoTexto?: string; plazo?: Accion['plazo'] }

/** Historial: por tipo de escrito, cuántas veces se eligió cada acción. */
export type Historial = Record<string, Record<string, number>>

const esTexto = (v: unknown): v is string => typeof v === 'string' && v.trim() !== ''

export function normalizarConfigSiguientes(parcial: unknown): ConfigSiguientes {
  const p = (parcial && typeof parcial === 'object' ? parcial : {}) as Partial<ConfigSiguientes>
  const acciones: Record<string, Accion> = {}
  for (const [id, a] of Object.entries(p.acciones ?? {})) {
    if (!a || !esTexto(a.etiqueta) || !esTexto(a.peticion)) continue
    acciones[id] = {
      etiqueta: a.etiqueta,
      porque: esTexto(a.porque) ? a.porque : '',
      peticion: a.peticion,
      ...(esTexto(a.plazoTexto) ? { plazoTexto: a.plazoTexto } : {}),
      ...(a.plazo && typeof a.plazo.dias === 'number' && esTexto(a.plazo.desde)
        ? { plazo: { dias: a.plazo.dias, jurisdiccion: (a.plazo.jurisdiccion ?? 'civil') as Jurisdiccion, desde: a.plazo.desde } }
        : {}),
    }
  }
  const tipos = (Array.isArray(p.tipos) ? p.tipos : [])
    .filter(t => t && esTexto(t.id) && Array.isArray(t.acciones))
    .map(t => ({
      id: t.id,
      nombre: esTexto(t.nombre) ? t.nombre : t.id,
      patrones: (Array.isArray(t.patrones) ? t.patrones : []).filter(esTexto).map(sinTildes),
      ...(Array.isArray(t.procedimientos) ? { procedimientos: t.procedimientos.filter(esTexto) } : {}),
      acciones: t.acciones.filter(id => id in acciones),
    }))
  return { tipos, acciones }
}

/**
 * ¿Qué tipo de escrito es? Gana el primer tipo de la tabla cuyos trozos estén
 * TODOS en el nombre (sin tildes). Si ninguno, el que encaje con el
 * procedimiento de la ficha; si tampoco, «otro».
 */
export function tipoDeEscrito(nombre: string, procedimiento: string | undefined, cfg: ConfigSiguientes): TipoEscrito {
  const n = sinTildes(nombre)
  const porNombre = cfg.tipos.find(t => t.patrones.length > 0 && t.patrones.every(p => n.includes(p)))
  if (porNombre) {
    // «Demanda» a secas: si la ficha dice el procedimiento, se afina (verbal u ordinario).
    const unico = porNombre.patrones.length === 1 ? porNombre.patrones[0]! : null
    if (procedimiento && unico) {
      const porFicha = cfg.tipos.find(t => t.procedimientos?.includes(procedimiento) && t.patrones.includes(unico))
      if (porFicha) return porFicha
    }
    return porNombre
  }
  return cfg.tipos.find(t => t.id === 'otro') ?? { id: 'otro', nombre: 'Escrito', patrones: [], acciones: Object.keys(cfg.acciones).slice(0, 3) }
}

/** Candidatas del tipo, con al menos tres (se completa con las del tipo «otro»). */
export function candidatas(tipo: TipoEscrito, cfg: ConfigSiguientes): string[] {
  const otro = cfg.tipos.find(t => t.id === 'otro')?.acciones ?? []
  return [...new Set([...tipo.acciones, ...otro])].filter(id => id in cfg.acciones)
}

/** Lo elegido otras veces sube puestos; a igualdad, manda el orden de la tabla. */
export function ordenarConHistorial(ids: string[], historial: Historial, tipo: string): string[] {
  const veces = historial[tipo] ?? {}
  return ids
    .map((id, i) => ({ id, i, n: veces[id] ?? 0 }))
    .sort((a, b) => b.n - a.n || a.i - b.i)
    .map(x => x.id)
}

function opcionDe(id: string, cfg: ConfigSiguientes, concreta?: { etiqueta?: string; porque?: string }): Opcion {
  const a = cfg.acciones[id]!
  return {
    id,
    etiqueta: concreta?.etiqueta && concreta.etiqueta.length <= 80 ? concreta.etiqueta : a.etiqueta,
    porque: concreta?.porque && concreta.porque.length <= 220 ? concreta.porque : a.porque,
    peticion: a.peticion,
    ...(a.plazoTexto ? { plazoTexto: a.plazoTexto } : {}),
    ...(a.plazo ? { plazo: a.plazo } : {}),
  }
}

/** Reserva sin modelo: las tres primeras de la tabla, con el historial. */
export function opcionesDeTabla(ids: string[], historial: Historial, tipo: string, cfg: ConfigSiguientes): Opcion[] {
  return ordenarConHistorial(ids, historial, tipo)
    .slice(0, 3)
    .map(id => opcionDe(id, cfg))
}

export type Contexto = {
  escrito: string // nombre legible
  ruta: string
  tipo: TipoEscrito
  cliente?: string
  expediente?: string
  asunto?: string
  ficha?: string // resumen de la ficha en una línea
  extracto?: string // el principio del escrito (para que el modelo concrete)
}

/** Lo que se pide al modelo pequeño: ordenar y concretar, solo con ids de la lista. */
export function promptModelo(ctx: Contexto, ids: string[], historial: Historial, cfg: ConfigSiguientes): { system: string; prompt: string } {
  const veces = historial[ctx.tipo.id] ?? {}
  const lista = ids.map(id => `- ${id}: ${cfg.acciones[id]!.etiqueta}. ${cfg.acciones[id]!.porque}`).join('\n')
  const preferidas = Object.entries(veces)
    .filter(([id, n]) => n > 0 && ids.includes(id))
    .sort((a, b) => b[1] - a[1])
    .map(([id, n]) => `${id} (${n} ${n === 1 ? 'vez' : 'veces'})`)
  return {
    system:
      'Eres un abogado procesalista español. Ordenas las siguientes actuaciones más probables y útiles después de un escrito. Respondes solo con JSON, sin texto alrededor.',
    prompt: [
      `Escrito terminado: «${ctx.escrito}» (tipo: ${ctx.tipo.nombre}).`,
      ctx.cliente ? `Cliente: ${ctx.cliente}${ctx.expediente ? ` (expediente ${ctx.expediente})` : ''}${ctx.asunto ? `. Asunto: ${ctx.asunto.replace(/\.+$/, '')}` : ''}.` : '',
      ctx.ficha ? `Ficha del expediente: ${ctx.ficha}.` : '',
      ctx.extracto ? `Principio del escrito:\n"""\n${ctx.extracto}\n"""` : '',
      `Actuaciones candidatas (usa SOLO estos ids):\n${lista}`,
      preferidas.length ? `El abogado suele elegir: ${preferidas.join(', ')}.` : '',
      'Elige las 3 más probables AHORA, en orden. Para cada una, una etiqueta concreta para este caso (máximo 60 caracteres) y un porqué de una línea (máximo 160). Formato exacto: [{"id":"…","etiqueta":"…","porque":"…"}]',
    ]
      .filter(Boolean)
      .join('\n\n'),
  }
}

/** Lee la respuesta del modelo: solo ids válidos, sin repetir; vacía si no sirve. */
export function leerRespuestaModelo(texto: string, ids: string[]): Array<{ id: string; etiqueta?: string; porque?: string }> {
  const i = texto.indexOf('[')
  const j = texto.lastIndexOf(']')
  if (i < 0 || j <= i) return []
  try {
    const datos = JSON.parse(texto.slice(i, j + 1)) as unknown
    if (!Array.isArray(datos)) return []
    const vistos = new Set<string>()
    const salida: Array<{ id: string; etiqueta?: string; porque?: string }> = []
    for (const d of datos) {
      if (!d || typeof d !== 'object') continue
      const x = d as Record<string, unknown>
      const id = typeof x.id === 'string' ? x.id : ''
      if (!ids.includes(id) || vistos.has(id)) continue
      vistos.add(id)
      salida.push({ id, ...(esTexto(x.etiqueta) ? { etiqueta: x.etiqueta.trim() } : {}), ...(esTexto(x.porque) ? { porque: x.porque.trim() } : {}) })
    }
    return salida
  } catch {
    return []
  }
}

/**
 * Junta la ordenación del modelo y el historial: el modelo da 3, 2 y 1 puntos;
 * cada vez que el abogado eligió una acción suma 0,8 (hasta 3 veces). Gana la
 * puntuación más alta; a igualdad, el orden de la tabla.
 */
export function combinar(
  modelo: Array<{ id: string; etiqueta?: string; porque?: string }>,
  ids: string[],
  historial: Historial,
  tipo: string,
  cfg: ConfigSiguientes,
): Opcion[] {
  const veces = historial[tipo] ?? {}
  const puntos = (id: string) => {
    const pos = modelo.findIndex(m => m.id === id)
    return (pos >= 0 && pos < 3 ? 3 - pos : 0) + Math.min(veces[id] ?? 0, 3) * 0.8
  }
  return ids
    .map((id, i) => ({ id, i, p: puntos(id) }))
    .sort((a, b) => b.p - a.p || a.i - b.i)
    .slice(0, 3)
    .map(x => opcionDe(x.id, cfg, modelo.find(m => m.id === x.id)))
}

/** Apunta una elección en el historial (devuelve uno nuevo). */
export function anotarEleccion(historial: Historial, tipo: string, id: string): Historial {
  const delTipo = { ...(historial[tipo] ?? {}) }
  delTipo[id] = (delTipo[id] ?? 0) + 1
  return { ...historial, [tipo]: delTipo }
}

/** La petición completa que se envía a Claude, como si la escribiera el abogado. */
export function peticionCompleta(op: Opcion, ctx: Contexto): string {
  return [
    op.peticion,
    '',
    ctx.cliente ? `Cliente: ${ctx.cliente}${ctx.expediente ? ` (expediente ${ctx.expediente})` : ''}${ctx.asunto ? ` · ${ctx.asunto.replace(/\.+$/, '')}` : ''}.` : '',
    `Parte del escrito que acabamos de terminar: «${ctx.escrito}» (${ctx.tipo.nombre}), en ${ctx.ruta}.`,
    ctx.ficha ? `Ficha del expediente: ${ctx.ficha}.` : '',
    op.plazoTexto ? `Plazo: ${op.plazoTexto}.` : '',
    'Trabaja con el equipo jurídico y la redacción rápida, y verifica las citas con Jurisprudenciator. No me hagas preguntas: lo que falte, márcalo como [PENDIENTE].',
  ]
    .filter(s => s !== '')
    .join('\n')
}

/** «Si te lo notifican hoy, vence el lun 07/12» (orientativo, con los festivos y reglas del Mod 1). */
export function siFueraHoy(op: Opcion, hoy: string, festivos: readonly Festivo[], reglas: ReglasComputo): string | null {
  if (!op.plazo) return null
  try {
    const c = calcularPlazo({ notificacion: hoy, dias: op.plazo.dias, jurisdiccion: op.plazo.jurisdiccion }, festivos, reglas)
    const fin = c.finPresentacion ?? c.vencimiento
    return `si ${op.plazo.desde} fuera hoy, vencería el ${fechaCorta(fin)}`
  } catch {
    return null
  }
}
