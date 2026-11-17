// ─────────────────────────────────────────────────────────────────────────────
// sesion.ts · ¿Esta sesión es de trabajo jurídico?
//
// Orden de Carlos (09/11/2026): «cuando no esté trabajando con clientes ni con
// escritos judiciales, no debería aparecer». Por eso:
//   · el cliente activo es de CADA sesión (antes se guardaba en un archivo común
//     y salía en todas, también en las de marketing);
//   · la banda del plugin solo sale en una sesión JURÍDICA, que es la que:
//       - se abre dentro de la carpeta de un expediente,
//       - tiene un cliente elegido (o Claude toca la carpeta de un cliente),
//       - consulta Jurisprudenciator o redacta, monta o entrega un escrito,
//       - usa un comando del plugin (/plazos, /cliente, /citas…).
// Las dos cosas se guardan en la memoria de la sesión ($.state): sobreviven a
// /reload-plugins en esa sesión y no pasan a las demás.
// ─────────────────────────────────────────────────────────────────────────────

import { esEnsamblado, PALABRAS_ESCRITO } from './lib/escritos'
import { herramientaDelCupo } from './lib/cupo'
import { estaDentro, normalizarRuta, unirRuta } from './lib/texto'
import { anotarError, estado, redibujar, type Cliente, type Motor } from './lib/estado'

const REF_CLIENTE = { plugin: 'mods-abogados', key: 'cliente' } as const
const REF_JURIDICA = { plugin: 'mods-abogados', key: 'juridica' } as const

/** Comandos del plugin: usarlos ya es trabajo jurídico. */
export const COMANDOS_DEL_PLUGIN = new Set([
  'plazos',
  'plazos-escrito',
  'plazo-nuevo',
  'plazo-borrar',
  'citas',
  'cliente',
  'cliente-nuevo',
  'cupo',
  'contrario',
  'ficha',
  'masc',
  'anonimizar',
  'siguientes',
])

/** El cliente cuya carpeta contiene esta ruta (la carpeta de la sesión, por ejemplo), o null. */
export function clienteDeCarpeta(ruta: string, clientes: readonly Cliente[], cwd: string): Cliente | null {
  if (!ruta) return null
  const r = unirRuta(cwd, ruta)
  // La carpeta más concreta gana (un expediente dentro de otra carpeta de cliente).
  let mejor: { cliente: Cliente; largo: number } | null = null
  for (const c of clientes) {
    if (!c.carpeta) continue
    const carpeta = unirRuta(cwd, c.carpeta)
    if (estaDentro(r, carpeta) && (!mejor || carpeta.length > mejor.largo)) mejor = { cliente: c, largo: carpeta.length }
  }
  return mejor?.cliente ?? null
}

/**
 * ¿Esta llamada es trabajo jurídico? Jurisprudenciator, montar un escrito, o
 * escribir o entregar un archivo con nombre de escrito (demanda, recurso…).
 */
export function esLlamadaJuridica(e: Record<string, unknown>): boolean {
  const herramienta = String(e.tool)
  if (herramientaDelCupo(herramienta, estado.configCupo)) return true
  if (esEnsamblado(e)) return true
  const nombre = (ruta: unknown) => (typeof ruta === 'string' ? normalizarRuta(ruta).split('/').pop() ?? '' : '')
  if (herramienta === 'Write' || herramienta === 'Edit' || herramienta === 'MultiEdit') return PALABRAS_ESCRITO.test(nombre(e.file_path))
  if (herramienta === 'SendUserFile' && Array.isArray(e.files)) return e.files.some(f => PALABRAS_ESCRITO.test(nombre(f)))
  return false
}

/** Lee la memoria de esta sesión (tras un /reload-plugins sigue ahí). */
export async function leerSesion($: Motor): Promise<{ cliente: string | null; juridica: boolean }> {
  try {
    const cliente = await $.state.get(REF_CLIENTE)
    const juridica = await $.state.get(REF_JURIDICA)
    return { cliente: cliente.value ?? null, juridica: juridica.value === true }
  } catch {
    return { cliente: null, juridica: false }
  }
}

/** Marca la sesión como jurídica: desde ahora sale la banda del plugin. */
export async function marcarJuridica($: Motor): Promise<void> {
  if (estado.sesionJuridica) return
  estado.sesionJuridica = true
  try {
    await $.state.set(REF_JURIDICA, true)
  } catch (error) {
    anotarError(`Sesión: ${String(error).slice(0, 100)}`)
  }
  redibujar($)
}

/** Guarda el cliente activo de ESTA sesión (no lo ven las demás). */
export async function guardarClienteSesion($: Motor, nombre: string | null): Promise<void> {
  try {
    await $.state.set(REF_CLIENTE, nombre)
  } catch (error) {
    anotarError(`Sesión: ${String(error).slice(0, 100)}`)
  }
}

/** Al empezar: ¿la sesión ya era jurídica (recarga) o se abre en la carpeta de un expediente? */
export async function iniciarSesion($: Motor): Promise<void> {
  const memoria = await leerSesion($)
  const enExpediente = clienteDeCarpeta(estado.cwd, estado.clientes, estado.cwd) !== null
  estado.sesionJuridica = memoria.juridica || memoria.cliente !== null || enExpediente
  if (estado.sesionJuridica && !memoria.juridica) {
    try {
      await $.state.set(REF_JURIDICA, true)
    } catch {
      // se volverá a calcular
    }
  }
}
