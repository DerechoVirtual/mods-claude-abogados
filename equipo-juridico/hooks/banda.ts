// La banda de encima del prompt: qué cabe en UNA sola fila.
//
// Orden de Carlos (9/11/2026): «lo que no quiero es con clientes agobio». En
// la app de escritorio el texto largo se partía en hasta cinco líneas, así que
// aquí se decide qué entra por orden de importancia y con un presupuesto de
// caracteres: lo que no cabe entero se queda fuera (está en el panel), y nada
// se parte ni se corta a medias. Lógica pura (sin sesión ni disco), para
// poder probarla.

import type { Redaccion } from '../types'
import { barra, faseEntregado } from './avance'
import { duracion } from './equipo'
import { recortar } from './llano'

/** Quien trabaja ahora mismo, para nombrarlo en la banda. */
export type EnLaBanda = {
  nombre: string
  /** «redactando la contestación». */
  haciendo: string
  /** Cuántas tareas lleva a la vez. */
  tareas: number
}

export type DatosBanda = {
  /** El escrito en curso (o recién entregado), si sale en la banda. */
  red?: Redaccion
  /** Tareas en marcha y tareas ya hechas de esta tanda. */
  trabajando: number
  hechas: number
  /** Las personas que trabajan, de más carga a menos. */
  quienes: readonly EnLaBanda[]
  /** La última frase de alguien que trabaja y quién la dice. */
  frase?: { quien: string; texto: string }
  ahora: number
}

/** Lo que dibuja la banda. Con `soloEquipo`, es el texto entero (no hay escrito). */
export type TextoBanda = {
  icono: string
  titulo: string
  llena: string
  vacia: string
  porcentaje: string
  /** Lo que va detrás del porcentaje, ya con sus separadores. */
  resto: string
  soloEquipo?: string
}

/**
 * El presupuesto de caracteres del texto de la banda. En la terminal, el
 * ancho menos los botones. En la app de escritorio el ancho que se anuncia no
 * sirve (con el panel abierto, junto a los botones caben unos 45 caracteres,
 * y las casillas de la barra y los emojis son más anchos que una letra): se
 * usa un presupuesto prudente y fijo, para que el texto jamás pase a otra línea.
 */
export function presupuestoDeLaBanda(columnas: number, escritorio: boolean): number {
  const botones = columnas < 60 ? 18 : 24
  return Math.max(24, escritorio ? Math.min(columnas - botones, 46) : columnas - botones)
}

/** «Luis ×2», «Clara». */
function nombreCon(q: EnLaBanda): string {
  return q.tareas > 1 ? `${q.nombre} ×${q.tareas}` : q.nombre
}

/**
 * El texto de la banda, sin pasar del presupuesto. Por orden de importancia:
 * el escrito con su barra y su porcentaje; cuánta gente trabaja; el paso
 * actual; y, si aún queda sitio, la última frase.
 */
export function textoDeLaBanda(datos: DatosBanda, presupuesto: number): TextoBanda {
  const { red, trabajando, hechas, quienes, frase } = datos
  let usado = 0
  let resto = ''
  // Añade un trozo solo si cabe entero.
  const cabe = (trozo: string): boolean => {
    if (trozo === '' || usado + trozo.length > presupuesto) return false
    resto += trozo
    usado += trozo.length
    return true
  }
  const tareasHechas = `${hechas} ${hechas === 1 ? 'tarea hecha' : 'tareas hechas'}`

  // La frase, con el nombre delante salvo que ya se acabe de nombrar a esa persona.
  const fraseCon = (yaNombrado: boolean): string =>
    frase === undefined ? '' : ` · 💬 ${yaNombrado ? '' : `${frase.quien}: `}${frase.texto}`

  // ---- Solo el equipo (no hay escrito en curso) ----------------------------
  if (red === undefined) {
    const cabeza = '👥 Equipo: '
    usado = cabeza.length
    if (trabajando === 0) {
      cabe(`todo el equipo ha terminado · ${tareasHechas}`) || cabe(`ha terminado · ${tareasHechas}`) || cabe('ha terminado')
    } else {
      const sitio = presupuesto - usado
      const una = quienes.length === 1 ? (quienes[0] as EnLaBanda) : undefined
      const fraseSuya = una !== undefined && frase?.quien === una.nombre
      // Con pocas personas, qué hace cada una.
      const detalle = quienes.length <= 3 ? quienes.map(q => `${q.nombre} ${q.haciendo}${q.tareas > 1 ? ` ×${q.tareas}` : ''}`).join(' · ') : ''
      // Cuántos y quiénes; si no caben todos los nombres, «y N más».
      const corto = (limite: number): string => {
        if (una !== undefined) return limite >= una.nombre.length + 12 ? recortar(`${una.nombre} ${una.haciendo}`, limite) : nombreCon(una)
        let texto = `${trabajando} trabajando`
        let nombres = ''
        for (let i = 0; i < quienes.length; i += 1) {
          const faltan = quienes.length - i - 1
          const candidato = `${nombres}${nombres === '' ? ' · ' : ', '}${nombreCon(quienes[i] as EnLaBanda)}`
          const cola = faltan > 0 ? ` y ${faltan} más` : ''
          if (texto.length + candidato.length + cola.length > limite) {
            if (nombres !== '') nombres += ` y ${faltan + 1} más`
            break
          }
          nombres = candidato
        }
        texto += nombres
        return texto
      }
      const terminadas = hechas > 0 ? ` · ${hechas} ${hechas === 1 ? 'hecha' : 'hechas'}` : ''
      // Por orden de preferencia: lo que hace cada uno con la frase; los
      // nombres con la frase (la frase da vida a la banda); solo lo que hace
      // cada uno; y, si nada de eso cabe, cuántos y quiénes.
      const candidatos = [
        ...(detalle !== '' && frase !== undefined ? [`${detalle}${fraseCon(fraseSuya)}`] : []),
        ...(frase !== undefined ? [`${corto(sitio - fraseCon(fraseSuya).length)}${fraseCon(fraseSuya)}`] : []),
        ...(detalle !== '' ? [`${detalle}${terminadas}`, detalle] : []),
        `${corto(sitio - terminadas.length)}${terminadas}`,
      ]
      cabe(candidatos.find(c => c.length <= sitio) ?? corto(sitio))
    }
    return { icono: '👥', titulo: '', llena: '', vacia: '', porcentaje: '', resto: '', soloEquipo: `${cabeza}${resto}` }
  }

  // ---- El escrito, con su barra --------------------------------------------
  const casillas = presupuesto >= 90 ? 14 : presupuesto >= 56 ? 10 : 6
  const { llena, vacia } = barra(red.porcentaje, casillas)
  const porcentaje = `${red.porcentaje} %`
  // Icono y espacio, espacio, barra (sus casillas abultan algo más que una letra), espacio y porcentaje.
  const fijo = 3 + 1 + Math.ceil(casillas * 1.2) + 1 + porcentaje.length
  // Lo primero que debe caber detrás del porcentaje: cuánta gente trabaja (o
  // que está entregado). Se prueba de más largo a más corto y se queda el
  // primero que deja sitio para la primera palabra del título ENTERA (nunca
  // «Contestació…»).
  const una = quienes.length === 1 ? (quienes[0] as EnLaBanda) : undefined
  const sufijos = red.terminado
    ? [` · ${faseEntregado(red)} en ${duracion((red.fin ?? datos.ahora) - red.inicio)}`, ` · ${faseEntregado(red)}`, ' · entregado', '']
    : trabajando > 0
      ? [...(una !== undefined ? [` · ${una.nombre} ${una.haciendo}`] : []), ` · ${trabajando} trabajando`, ` · ${trabajando} 👥`, '']
      : ['']
  const palabras = red.titulo.trim().split(/\s+/)
  const minimoTitulo = Math.min(red.titulo.trim().length, (palabras[0] ?? '').length + (palabras.length > 1 ? 1 : 0))
  const maximoTitulo = presupuesto >= 90 ? 40 : 28
  // Manda lo de detrás (cuánta gente trabaja importa más que el título entero):
  // el primero que deje sitio a la primera palabra del título.
  const sufijo = sufijos.find(x => fijo + minimoTitulo + x.length <= presupuesto) ?? ''
  const titulo = recortar(red.titulo, Math.max(minimoTitulo, Math.min(maximoTitulo, presupuesto - fijo - sufijo.length)))
  usado = fijo + titulo.length
  cabe(sufijo)
  if (!red.terminado) {
    // Después, la última frase (da vida a la banda) y el paso actual, si caben.
    if (frase !== undefined) cabe(fraseCon(false))
    cabe(` · ahora: ${red.fase}`)
  }
  return { icono: red.terminado ? '✅' : '📝', titulo, llena, vacia, porcentaje, resto }
}
