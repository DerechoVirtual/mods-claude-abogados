// ─────────────────────────────────────────────────────────────────────────────
// MOD 5 · Contador del cupo de Jurisprudenciator
//
// Cuenta las consultas que gastan cupo (las de Claude y las de sus
// subagentes) y avisa ANTES de agotarlo:
//   · un aviso emergente si la próxima consulta no cabe en lo que queda,
//   · otro al entrar en la zona de aviso (quedan 3 o menos, editable),
//   · otro si se va a lanzar un subagente con el cupo casi agotado,
//   · una pastilla en la banda SOLO cuando queda poco («⚖ Quedan 2/10 hoy»).
// /cupo da el detalle y permite fijar los límites del plan.
//
// Nunca bloquea ni cambia una llamada: mira antes y después y la deja pasar.
// Guarda la cuenta en data/cupo.json (por día de Madrid y semana ISO), así la
// comparten todas las sesiones de este ordenador. No ve lo consultado desde
// otros equipos, la web o el Mac.
// ─────────────────────────────────────────────────────────────────────────────

import type { On, ToolCallInput, ToolCallResult } from 'claude-code'
import {
  anotarLlamada,
  avisoAntesDeLlamada,
  formatoUnidades,
  herramientaDelCupo,
  leerArgumentosCupo,
  normalizarConfigCupo,
  normalizarRegistro,
  pesoDeLlamada,
  resumenCupo,
  situacionCupo,
  textoChipCupo,
  type Nivel,
} from './lib/cupo'
import { anotarError, escribirJson, estado, horaMadrid, leerJson, redibujar, type Motor, type Pastilla } from './lib/estado'
import { fechaEnZona } from './lib/plazos'
import { pulsable } from './pastilla'

const ARCHIVO = 'data/cupo.json'

/** Las escrituras van de una en una: cinco subagentes a la vez no pierden sumas. */
let cola: Promise<unknown> = Promise.resolve()
function enCola<T>(trabajo: () => Promise<T>): Promise<T> {
  const p = cola.then(trabajo, trabajo)
  cola = p.catch(() => undefined)
  return p
}

/** Para no repetir el mismo aviso: último nivel avisado y hora del último aviso. */
const avisos = { nivel: 'holgado' as Nivel, dia: '', ultimoMs: 0 }

function avisar($: Motor, texto: string, ahora: number): void {
  if (ahora - avisos.ultimoMs < 20_000) return // como mucho un aviso cada 20 s
  avisos.ultimoMs = ahora
  $.ui.toast(texto, { timeoutMs: 9000 })
}

async function ahoraMs($: Motor): Promise<number> {
  try {
    return await $.clock.now()
  } catch {
    return Date.now()
  }
}

/** Relee config/cupo.json y data/cupo.json (otra sesión puede haber sumado). */
async function recargar($: Motor, hoy: string): Promise<void> {
  estado.configCupo = normalizarConfigCupo(await leerJson($, 'config/cupo.json', {}))
  estado.cupo = normalizarRegistro(await leerJson($, ARCHIVO, null), hoy, estado.configCupo)
}

function argumentos(e: Record<string, unknown>): Record<string, unknown> {
  const { tool: _t, tool_use_id: _id, agentId: _a, requestMeta: _m, consent: _c, ...resto } = e
  return resto
}

function textoDelResultado(resultado: ToolCallResult): string {
  if (typeof resultado.text === 'string') return resultado.text
  if (typeof resultado.result === 'string') return resultado.result
  try {
    return JSON.stringify(resultado.result ?? '')
  } catch {
    return ''
  }
}

// ── Manejadores que llama register.tsx (ninguno lanza errores) ──────────────

/** MOD 5 · Al iniciar la sesión: lee la cuenta y registra /cupo. */
export async function iniciarCupo($: Motor): Promise<void> {
  try {
    await recargar($, estado.hoy)
    await $.command.register({
      name: 'cupo',
      description: 'Cupo de Jurisprudenciator: lo gastado hoy y esta semana, y los límites',
      argumentHint: '[10 30 | sin limite | reiniciar]',
    })
  } catch (error) {
    anotarError(`Mod 5: ${String(error).slice(0, 100)}`)
  }
}

/** MOD 5 · Antes de la llamada: avisa si no cabe. No la toca. */
export async function antesDeHerramientaCupo($: Motor, e: ToolCallInput): Promise<void> {
  try {
    const datos = e as unknown as Record<string, unknown>
    const herramienta = String(e.tool)
    const sit = situacionCupo(estado.cupo, estado.configCupo)

    // Lanzar subagentes con el cupo casi agotado: cada uno consultará por su cuenta.
    if (herramienta === 'Agent' || herramienta === 'Task') {
      if ((sit.nivel === 'aviso' || sit.nivel === 'agotado') && sit.quedan !== null) {
        const n = Math.max(0, sit.quedan)
        avisar($, `Vas a repartir trabajo y a Jurisprudenciator solo le ${n === 1 ? 'queda 1 lectura' : `quedan ${formatoUnidades(n)} lecturas`} ${sit.periodo}.`, await ahoraMs($))
      }
      return
    }

    const corto = herramientaDelCupo(herramienta, estado.configCupo)
    if (!corto) return
    const texto = avisoAntesDeLlamada(sit, pesoDeLlamada(corto, argumentos(datos), estado.configCupo))
    if (texto) avisar($, texto, await ahoraMs($))
  } catch {
    // un fallo al avisar no afecta a la llamada
  }
}

/** MOD 5 · Después de la llamada: suma lo gastado y avisa al entrar en la zona de aviso. */
export async function despuesDeHerramientaCupo($: Motor, e: ToolCallInput, resultado: ToolCallResult): Promise<void> {
  try {
    if (resultado.deny !== undefined) return // no llegó a ejecutarse
    const datos = e as unknown as Record<string, unknown>
    const corto = herramientaDelCupo(String(e.tool), estado.configCupo)
    if (!corto) return
    const peso = pesoDeLlamada(corto, argumentos(datos), estado.configCupo)
    const ahora = await ahoraMs($)
    const hoy = fechaEnZona(ahora)

    const anotacion = await enCola(async () => {
      await recargar($, hoy)
      const r = anotarLlamada(estado.cupo, {
        herramienta: corto,
        peso,
        subagente: e.agentId !== undefined,
        hora: horaMadrid(ahora),
        texto: textoDelResultado(resultado),
        isError: resultado.isError === true,
      })
      estado.cupo = r.registro
      await escribirJson($, ARCHIVO, { _nota: 'Cuenta del cupo de Jurisprudenciator en este ordenador. La lleva el mod; /cupo para verla o corregirla.', ...r.registro })
      return r
    })

    if (anotacion.aviso) {
      avisos.ultimoMs = 0 // corregir un límite equivocado es importante: no se salta
      avisar($, anotacion.aviso, ahora)
    }

    // Aviso al CAMBIAR de nivel (una vez por nivel y día).
    const sit = situacionCupo(estado.cupo, estado.configCupo)
    if (avisos.dia !== hoy) {
      avisos.dia = hoy
      avisos.nivel = 'holgado'
    }
    if ((sit.nivel === 'aviso' || sit.nivel === 'agotado') && sit.nivel !== avisos.nivel) {
      avisos.nivel = sit.nivel
      avisos.ultimoMs = 0 // este aviso no se salta
      avisar(
        $,
        sit.nivel === 'agotado'
          ? `Jurisprudenciator: cupo agotado ${sit.periodo}. Las próximas lecturas pueden no responder.`
          : `Jurisprudenciator: ${sit.quedan === 1 ? 'queda 1' : `quedan ${formatoUnidades(sit.quedan ?? 0)}`} de ${formatoUnidades(sit.limite ?? 0)} lecturas ${sit.periodo}.`,
        ahora,
      )
    }
    redibujar($)
  } catch (error) {
    anotarError(`Mod 5: ${String(error).slice(0, 100)}`)
  }
}

/** MOD 5 · Comando /cupo (hook con filtro propio). */
export function registrarHooksCupo(on: On): void {
  on('command.run', { command: 'cupo' }, async ($, e) => {
    const hoy = fechaEnZona(await ahoraMs($))
    const orden = leerArgumentosCupo(e.args ?? '')
    if (orden.tipo === 'error') return { text: orden.texto }

    return enCola(async () => {
      await recargar($, hoy)
      if (orden.tipo === 'reiniciar') {
        estado.cupo = { ...estado.cupo, usadoDia: 0, agotadoDia: false, agotadoSemana: false, ultimas: [] }
      } else if (orden.tipo === 'limites') {
        const manual = orden.diario === null && orden.semanal === null ? 'manual (sin límite)' : 'manual'
        estado.cupo = { ...estado.cupo, limites: { diario: orden.diario, semanal: orden.semanal, origen: manual } }
      }
      if (orden.tipo !== 'ver') {
        avisos.nivel = 'holgado'
        await escribirJson($, ARCHIVO, { _nota: 'Cuenta del cupo de Jurisprudenciator en este ordenador. La lleva el mod; /cupo para verla o corregirla.', ...estado.cupo })
        redibujar($)
      }
      return { text: resumenCupo(estado.cupo, estado.configCupo) }
    })
  }).catch(() => ({ text: 'mods-abogados: no se pudo leer el cupo.' }))
}

/** Pastilla de la banda: solo cuando queda poco (o no queda). */
export function chipCupo($: Motor, tabla: ReturnType<Motor['ui']['resolve']>, nivel: 0 | 1 | 2 = 0): Pastilla | null {
  try {
    const sit = situacionCupo(estado.cupo, estado.configCupo)
    if (sit.nivel === 'holgado' || sit.nivel === 'sinLimite') return null
    const { Text } = tabla
    const color = sit.nivel === 'atento' ? 'text' : sit.nivel === 'aviso' ? 'warning' : 'error'
    // Con poco sitio: «⚖ 2/10 hoy» en vez de «⚖ Quedan 2/10 hoy».
    const texto = nivel === 0 ? textoChipCupo(sit) : textoChipCupo(sit).replace('Quedan ', '').replace('Cupo agotado', 'Sin cupo')
    const nodo = (
      pulsable(
        tabla,
        'banda-cupo',
        'Cupo de Jurisprudenciator',
        () => $.ui.toast(resumenCupo(estado.cupo, estado.configCupo).split('\n').slice(1, 4).join(' '), { timeoutMs: 9000 }),
        <Text color={color} bold={sit.nivel !== 'atento'} dimColor={sit.nivel === 'atento'} wrap="truncate-end">
          {texto}
        </Text>,
      )
    )
    return { nodo, ancho: texto.length + 1 }
  } catch {
    return null
  }
}
