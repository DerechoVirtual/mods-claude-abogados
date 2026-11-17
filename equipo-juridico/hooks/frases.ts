// Lo que dice cada persona del equipo, en tiempo real.
//
// Las frases salen de HECHOS observados en lo que devuelven de verdad las
// herramientas (sentencias que aparecen, un artículo vigente, un archivo
// escrito con sus palabras, una búsqueda vacía…), nunca inventados: si el
// resultado no trae un identificador, la frase no menciona ninguno. Se eligen
// de plantillas locales (sin llamar a modelos), con las coletillas de cada
// persona y sin repetir la misma frase seguida. Celebran lo que devolvió la
// herramienta; no son una valoración jurídica de la sentencia.

import type { Oficio, Persona, Tono } from '../types'
import { rutaCorta } from './equipo'
import { conTildes, documentoEnFrase, nombreLey, recortar } from './llano'

/** Una resolución que ha aparecido en un resultado. */
export type Cita = { id: string; tribunal: string; supremo: boolean }

/** Un hecho observado del que se puede hablar. */
export type Hecho =
  | { tipo: 'empieza'; descripcion: string }
  | { tipo: 'expediente' }
  | { tipo: 'sentencias'; citas: Cita[] }
  | { tipo: 'busqueda' }
  | { tipo: 'vacio' }
  | { tipo: 'lectura'; cita: string }
  | { tipo: 'articulo'; articulo: string; ley: string; vigencia: 'vigente' | 'derogado' | 'desconocida' }
  | { tipo: 'verificacion'; limpio: boolean }
  /** `doc`: cómo se nombra el documento en una frase («la contestación», «la sección 02», «encabezamiento y hechos»). */
  | { tipo: 'archivo'; ruta: string; doc?: string; palabras: number; seccion?: string; fuentes: boolean; edicion: boolean }
  | { tipo: 'error'; herramienta: string }
  | { tipo: 'termina'; descripcion: string; tiempo: string; busquedas: number; citas: number; archivos: number; palabras: number }
  | { tipo: 'falla'; descripcion: string }

// ---------------------------------------------------------------------------
// Lectura de resultados
// ---------------------------------------------------------------------------

const TRIBUNAL: Record<string, string> = {
  STS: 'del Supremo',
  ATS: 'del Supremo',
  SAP: 'de la Audiencia Provincial',
  AAP: 'de la Audiencia Provincial',
  SAN: 'de la Audiencia Nacional',
  AAN: 'de la Audiencia Nacional',
  STSJ: 'del TSJ',
  ATSJ: 'del TSJ',
  STC: 'del Constitucional',
  ATC: 'del Constitucional',
  SJPI: 'de un juzgado',
  SJM: 'de un juzgado',
  SJSO: 'de un juzgado',
  SJCA: 'de un juzgado',
}

const TRIBUNAL_ECLI: Record<string, string> = {
  TS: 'del Supremo',
  AP: 'de la Audiencia Provincial',
  AN: 'de la Audiencia Nacional',
  TSJ: 'del TSJ',
  TC: 'del Constitucional',
}

/** Máximo de texto que se mira de un resultado. */
const LARGO_RESULTADO = 20_000

/**
 * Las resoluciones que aparecen en un texto, en el orden en que salen y sin
 * repetir: «STS 323/2017», «SAP 1234/2023», «STC 31/2010», «C-311/19» o ECLI.
 */
export function extraerCitas(texto: string, maximo = 3): Cita[] {
  const fuente = texto.slice(0, LARGO_RESULTADO)
  const patron = /\b(STS|ATS|SAP|AAP|SAN|AAN|STSJ|ATSJ|STC|ATC|SJPI|SJM|SJSO|SJCA)\s+(\d{1,5}\/\d{4})\b|ECLI:ES:([A-Z]+):(\d{4}):(\d+)[A-Z]?|\b([CT]-\d{1,4}\/\d{2})\b/g
  // El ECLI y el ROJ de una misma sentencia cuentan como una sola.
  const PREFIJO_ECLI: Record<string, string> = { TS: 'STS', AP: 'SAP', AN: 'SAN', TSJ: 'STSJ', TC: 'STC' }
  const vistas = new Set<string>()
  const citas: Cita[] = []
  for (const m of fuente.matchAll(patron)) {
    let cita: Cita
    let clave: string
    if (m[1] !== undefined && m[2] !== undefined) {
      cita = { id: `${m[1]} ${m[2]}`, tribunal: TRIBUNAL[m[1]] ?? '', supremo: m[1] === 'STS' || m[1] === 'ATS' }
      clave = cita.id
    } else if (m[3] !== undefined) {
      cita = { id: m[0], tribunal: TRIBUNAL_ECLI[m[3]] ?? '', supremo: m[3] === 'TS' }
      const prefijo = PREFIJO_ECLI[m[3]]
      clave = prefijo !== undefined ? `${prefijo} ${m[5] ?? ''}/${m[4] ?? ''}` : m[0]
    } else {
      cita = { id: `asunto ${m[6] ?? ''}`, tribunal: 'del TJUE', supremo: false }
      clave = cita.id
    }
    if (vistas.has(clave)) continue
    vistas.add(clave)
    citas.push(cita)
    if (citas.length >= maximo) break
  }
  return citas
}

/** Cuenta las palabras de un texto (lo que tiene letras o números). */
export function contarPalabras(texto: string): number {
  return texto.split(/\s+/).filter(p => /[\p{L}\p{N}]/u.test(p)).length
}

/** Las palabras pedidas en un encargo: «Extensión: 600 palabras». */
export function extensionPedida(encargo: string): number | undefined {
  const m = /Extensi[oó]n:\s*(?:unas?\s+|aprox\.?\s+)?(\d[\d.]*)\s*palabras/i.exec(encargo)
  if (m === null) return undefined
  const n = Number((m[1] ?? '').replace(/\./g, ''))
  return Number.isFinite(n) && n > 0 ? n : undefined
}

/** «Sección 03 (fondo)» a partir de «secciones/03-fondo.md». */
function seccionDeRuta(ruta: string): string | undefined {
  const m = /secciones\/(\d{1,2})-?([^/]*?)\.md$/i.exec(ruta.replace(/\\/g, '/'))
  if (m === null) return undefined
  const nombre = conTildes((m[2] ?? '').replace(/[-_]+/g, ' ').trim())
  return `Sección ${(m[1] ?? '').padStart(2, '0')}${nombre !== '' ? ` (${nombre})` : ''}`
}

const BUSQUEDAS = new Set(['buscar_sentencias', 'buscar_por_cita'])
const RESULTADO_VACIO = /\b(0|cero|ning[uú]n[ao]?|sin)\s+(resultados?|sentencias?|resoluciones?|coincidencias?)\b|no se (han )?encontrad/i

/**
 * Qué hecho real deja una llamada a una herramienta (ya terminada). `texto` es
 * lo que devolvió, tal como lo lee el modelo. Devuelve undefined si no hay nada
 * que contar (una lectura de archivo, un listado…).
 */
export function hechoDeHerramienta(herramienta: string, args: Record<string, unknown>, ok: boolean, texto: string): Hecho | undefined {
  const corto = herramienta.includes('__') ? (herramienta.split('__').pop() ?? herramienta) : herramienta
  const cadena = (v: unknown): string => (typeof v === 'string' ? v : '')

  if (!ok) {
    if (BUSQUEDAS.has(corto)) return { tipo: 'vacio' }
    return { tipo: 'error', herramienta: corto }
  }
  if (BUSQUEDAS.has(corto)) {
    const citas = extraerCitas(texto, 2)
    if (citas.length > 0) return { tipo: 'sentencias', citas }
    if (texto.trim().length < 40 || RESULTADO_VACIO.test(texto.slice(0, 2000))) return { tipo: 'vacio' }
    return { tipo: 'busqueda' }
  }
  if (corto === 'Read') {
    // Estudiar el expediente: el plan del caso, el escrito o los documentos del cliente.
    const ruta = cadena(args.file_path).replace(/\\/g, '/')
    return /(^|\/)(caso|escrito)\.md$|\.(pdf|docx?|odt|rtf|eml|msg)$/i.test(ruta) ? { tipo: 'expediente' } : undefined
  }
  if (corto === 'leer_sentencias') {
    // La cita sale de lo que se pidió leer, no del texto (que cita otras muchas).
    const primera = cadena(args.citas).split(',')[0]?.trim() ?? ''
    return primera !== '' ? { tipo: 'lectura', cita: recortar(primera, 40) } : undefined
  }
  if (corto === 'buscar_articulo') {
    const articulo = cadena(args.articulo).trim()
    const ley = cadena(args.ley).trim()
    if (articulo === '' || ley === '') return undefined
    const muestra = texto.slice(0, 3000)
    const vigencia = /derogad/i.test(muestra) ? 'derogado' : /vigent/i.test(muestra) ? 'vigente' : 'desconocida'
    return { tipo: 'articulo', articulo: recortar(articulo, 20), ley: nombreLey(ley), vigencia }
  }
  if (corto === 'verificar_escrito') {
    const muestra = texto.slice(0, 5000)
    const limpio = /sin errores|no se (han )?detectad|ning[uú]n error|0 (posibles )?errores/i.test(muestra) || !/error|incorrect|no existe|derogad/i.test(muestra)
    return { tipo: 'verificacion', limpio }
  }
  if (corto === 'Write' || corto === 'Edit' || corto === 'MultiEdit') {
    const ruta = cadena(args.file_path).replace(/\\/g, '/')
    if (ruta === '') return undefined
    const palabras = corto === 'Write' ? contarPalabras(cadena(args.content)) : 0
    const seccion = seccionDeRuta(ruta)
    return {
      tipo: 'archivo',
      ruta: rutaCorta(ruta),
      doc: documentoEnFrase(ruta),
      palabras,
      ...(seccion !== undefined ? { seccion } : {}),
      fuentes: /(^|\/)fuentes\//i.test(ruta),
      edicion: corto !== 'Write',
    }
  }
  return undefined
}

/** ¿Es un gran momento (aviso emergente)? */
export function esGrande(hecho: Hecho): boolean {
  if (hecho.tipo === 'sentencias') return hecho.citas.some(c => c.supremo)
  if (hecho.tipo === 'archivo') return hecho.seccion !== undefined && !hecho.edicion && hecho.palabras > 0
  return hecho.tipo === 'termina'
}

// ---------------------------------------------------------------------------
// Plantillas
// ---------------------------------------------------------------------------

type Plantillas = Record<Tono, string[]>

/** Rellena {campos} de una plantilla. */
function rellenar(plantilla: string, datos: Record<string, string>): string {
  return plantilla
    .replace(/\{(\w+)\}/g, (_, k: string) => datos[k] ?? '')
    .replace(/\bde el\b/g, 'del')
    .replace(/\ba el\b/g, 'al')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([.,:;])/g, '$1')
    .trim()
}

const P: Record<string, Plantillas> = {
  expediente: {
    informal: [
      'Me estoy empapando del expediente: no se me escapa ni un detalle.',
      'Primero, el expediente de arriba abajo. Así no nos pillan en nada.',
      '{m} Repaso el expediente con lupa antes de mover un dedo.',
    ],
    profesional: ['Estudio el expediente del caso.', 'Reviso la documentación del asunto.'],
  },
  empieza: {
    informal: ['¡Al lío! Me pongo con «{d}».', 'Voy con «{d}». {m}', 'Manos a la obra: «{d}».'],
    profesional: ['Empiezo con «{d}».', 'Me ocupo de «{d}».'],
  },
  supremo: {
    informal: [
      '¡Buah! Acabo de encontrar la {id} del Supremo, es la hostia. Con ella vamos a machacar a la parte contraria.{mas}',
      '{m} La {id} del Supremo nos viene de lujo.{mas}',
      '¡Toma ya! Ha salido la {id} del Supremo. Esta la quiero en el escrito.{mas}',
      '¡Joder, le tenemos pillado! Fíjate qué pedazo de sentencia acabo de encontrar: la {id} del Supremo.{mas}',
      'Doctrina del Supremo al canto: la {id}. Con esto el juez no tiene por dónde escaparse.{mas}',
    ],
    profesional: ['He localizado la {id} del Tribunal Supremo, relevante para el asunto.{mas}', 'Resultado útil: {id} del Tribunal Supremo.{mas}'],
  },
  sentencia: {
    informal: [
      'Tengo la {id} {t}, pinta muy bien.{mas}',
      '¡Mira esto! La {id} {t}.{mas}',
      '{m} Me apunto la {id} {t}.{mas}',
      '¡Le tenemos pillado! La {id} {t} va justo en nuestra línea.{mas}',
    ],
    profesional: ['He localizado la {id} {t}.{mas}', 'Resultado: {id} {t}.{mas}'],
  },
  busqueda: {
    informal: ['Búsqueda hecha, a ver qué hay aquí…', 'Rastreando resultados…', 'Buscando con lupa…'],
    profesional: ['Búsqueda realizada; reviso los resultados.', 'Reviso los resultados de la búsqueda.'],
  },
  vacio: {
    informal: [
      'Nada por aquí, pruebo otra búsqueda.',
      'Ni rastro. Cambio los términos y vuelvo a la carga.',
      'Cero resultados. Esto no se queda así.',
      'Nada en esta búsqueda. Afino los términos: la sentencia buena está ahí, seguro.',
    ],
    profesional: ['Sin resultados; ajusto la búsqueda.', 'La búsqueda no ha dado resultados; pruebo otros términos.'],
  },
  lectura: {
    informal: [
      'Leyendo la {c} con lupa…',
      'Me empapo de la {c}.',
      'A ver qué dice la {c}…',
      'Estoy desmenuzando la {c}: busco el párrafo exacto que nos da la razón.',
    ],
    profesional: ['Leo la {c}.', 'Analizo la {c}.'],
  },
  vigente: {
    informal: [
      'Ojo, el art. {a} {l} está vigente. ¡A tope!',
      'Art. {a} {l} comprobado: vigente. {m}',
      'El art. {a} {l} está vigente y dice justo lo que necesitamos. Con esto fundamentamos la pretensión.',
    ],
    profesional: ['El art. {a} {l} está vigente.', 'Comprobado: art. {a} {l}, redacción vigente.'],
  },
  derogado: {
    informal: ['¡Cuidado! El art. {a} {l} sale derogado. Lo aparco.', 'El art. {a} {l} está derogado, no nos sirve.'],
    profesional: ['Atención: el art. {a} {l} figura como derogado.'],
  },
  articulo: {
    informal: ['Tengo el texto del art. {a} {l}.', 'Art. {a} {l} en la mano.'],
    profesional: ['He obtenido el texto del art. {a} {l}.'],
  },
  verificado: {
    informal: [
      'Citas verificadas y sin errores. ¡Todo limpio! {m}',
      'Verificación pasada sin un solo error.',
      'Citas comprobadas: todo vigente y bien citado. Al juez no le vamos a dar ni una excusa.',
    ],
    profesional: ['Verificación de citas sin errores.'],
  },
  revisar: {
    informal: ['La verificación marca cosas que revisar. Al lío.', 'Ojo, hay citas que repasar. Me pongo.'],
    profesional: ['La verificación señala citas que revisar.'],
  },
  seccion: {
    informal: [
      '¡{s} escrita, {p} palabras! {m}',
      '{s} lista: {p} palabras. {m}',
      '¡Zas! {s} terminada, {p} palabras.',
      '¡{s} terminada! {p} palabras con todo bien atado para que el juez lo vea clarito.',
    ],
    profesional: ['{s} redactada: {p} palabras.', 'He terminado la {s} ({p} palabras).'],
  },
  fuentes: {
    informal: ['Fuentes anotadas: cada cita con su respaldo.', 'Dejo anotadas las fuentes, que luego todo se pregunta.'],
    profesional: ['Fuentes anotadas.'],
  },
  archivo: {
    informal: ['Ya está {n}{pp}.', 'He redactado {n}{pp}.'],
    profesional: ['He redactado {n}{pp}.'],
  },
  retoque: {
    informal: ['Retoco {n}.', 'Pulo un detalle de {n}.'],
    profesional: ['Corrijo {n}.'],
  },
  error: {
    informal: ['Vaya, este paso no ha salido. Lo intento de otra forma.', 'Se me ha atascado una cosa. Ahora vuelvo a la carga.'],
    profesional: ['Un paso no ha salido; lo intento de otro modo.'],
  },
  termina: {
    informal: [
      '¡Ya está! Terminado en {tiempo}{datos}. {m}',
      'Hecho en {tiempo}{datos}. ¡Orgullo de despacho!',
      'Lo mío ya está, en {tiempo}{datos}. {m}',
      'Todo hecho en {tiempo}{datos}. La parte contraria lo va a tener muy difícil.',
    ],
    profesional: ['He terminado en {tiempo}{datos}.', 'Tarea completada en {tiempo}{datos}.'],
  },
  falla: {
    informal: ['No he podido terminar «{d}». Mal día…', '«{d}» se me ha resistido. Lo dejo anotado.'],
    profesional: ['No he podido completar «{d}».'],
  },
}

/**
 * Rufino, el abogado de la PARTE CONTRARIA: habla como un juez cabrón (orden
 * de Carlos, 9/11/2026), soez y despectivo. Los insultos van SIEMPRE contra
 * nuestro escrito y contra el despacho («listillos», «genios»), nunca contra
 * colectivos ni personas reales: sale en YouTube. Frases cortas, porque la
 * banda tiene una sola fila. Igual que el resto, cuentan hechos reales: una
 * sentencia que ha salido la usa contra nosotros, sin inventar ninguna. En
 * tono profesional, frío y desdeñoso, sin tacos.
 */
const P_CONTRARIO: Record<string, Plantillas> = {
  expediente: {
    informal: [
      'Leyendo vuestro escrito. Madre mía, qué dolor de ojos.',
      'Joder, qué tostón de escrito. Y encima mal hilado.',
      '{m} Esto lo ha redactado un becario con resaca.',
      'Me estoy tragando vuestro bodrio entero. Me debéis una.',
    ],
    profesional: ['Examino el escrito de la otra parte.', 'Leo su escrito. Hay mucho que objetar.'],
  },
  empieza: {
    informal: [
      'A ver qué mierda me habéis traído hoy…',
      '¿Esto es un escrito? Me cago en la leche, a ver…',
      'Venga, listillos, enseñadme vuestro engendro.',
      'Hostia, otra vez vosotros. A ver este bodrio.',
    ],
    profesional: ['Veamos qué han presentado.', 'Reviso su escrito en busca de defectos.'],
  },
  supremo: {
    informal: [
      '¡Toma! La {id} del Supremo os revienta el escrito, listillos.{mas}',
      'La {id} del Supremo. Os la vais a comer con patatas.{mas}',
      '{m} Con la {id} del Supremo os desmonto en dos patadas.{mas}',
      'Hostia, la {id} del Supremo. Esto os va a escocer.{mas}',
    ],
    profesional: ['La {id} del Tribunal Supremo contradice su planteamiento.{mas}'],
  },
  sentencia: {
    informal: [
      'La {id} {t} os deja en bragas.{mas}',
      'Apuntada la {id} {t}. Se os va a atragantar.{mas}',
      '{m} La {id} {t} va contra vosotros, a ver qué decís.{mas}',
    ],
    profesional: ['La {id} {t} juega en su contra.{mas}'],
  },
  busqueda: {
    informal: ['Rebuscando con qué hundiros…', 'A ver qué jurisprudencia os tumba, que algo habrá.', 'Buscando el clavo de vuestro ataúd…'],
    profesional: ['Busco jurisprudencia contraria a su tesis.'],
  },
  vacio: {
    informal: [
      'Nada, coño. Pero no os libráis: busco otra vez.',
      'Cero resultados. Hoy tenéis una suerte que no merecéis.',
      'Me cago en diez, ni una. Vuelvo a la carga.',
    ],
    profesional: ['Sin resultados por ahora; sigo buscando.'],
  },
  lectura: {
    informal: [
      'Leyendo la {c}. Aquí hay munición contra vosotros.',
      'Desmenuzando la {c} para tumbaros, je.',
      'A ver qué dice la {c}… seguro que no lo que os gustaría.',
    ],
    profesional: ['Leo la {c} para rebatir su escrito.'],
  },
  vigente: {
    informal: ['El art. {a} {l} está vigente. ¿Lo habéis leído entero, genios?', 'Art. {a} {l} vigente. Y aun así lo aplicáis de pena.'],
    profesional: ['El art. {a} {l} está vigente; no lo aplican bien.'],
  },
  derogado: {
    informal: ['¡JA! El art. {a} {l} está derogado. ¿En qué año vivís?', 'Art. {a} {l} derogado. Me meo de la risa, de verdad.'],
    profesional: ['El art. {a} {l} figura como derogado. Error grave.'],
  },
  articulo: {
    informal: ['Tengo el art. {a} {l}. Os lo voy a restregar por la cara.', 'Art. {a} {l} en la mano. Preparaos.'],
    profesional: ['He obtenido el art. {a} {l} para rebatirles.'],
  },
  verificado: {
    informal: ['Las citas cuadran, joder. Algo habéis hecho bien, para variar.', 'Citas limpias. Milagro. Pero el fondo sigue cojo.'],
    profesional: ['Sus citas son correctas. El fondo, no tanto.'],
  },
  revisar: {
    informal: ['¡Citas mal puestas! Esto es de primero de carrera, hostia.', 'Citas que no cuadran. ¿Quién os dio el título?'],
    profesional: ['Hay citas que no se sostienen.'],
  },
  seccion: {
    informal: ['{s}: {p} palabras de pura bilis contra vuestro escrito.'],
    profesional: ['{s} redactada contra su escrito: {p} palabras.'],
  },
  fuentes: {
    informal: ['Fuentes anotadas, que luego lloráis que me lo invento.'],
    profesional: ['Fuentes anotadas.'],
  },
  archivo: {
    informal: ['Os dejo el informe{pp}. Hostias jurídicas, una detrás de otra.', 'Ahí va mi informe{pp}. Todo grietas. Llorad.'],
    profesional: ['He preparado el informe con las objeciones{pp}.'],
  },
  retoque: {
    informal: ['Afilando el informe… que duela más.'],
    profesional: ['Ajusto el informe.'],
  },
  error: {
    informal: ['Me cago en todo, esto no ha salido. Ni así os libráis.', 'Se ha atascado algo, joder. Ahora vuelvo a por vosotros.'],
    profesional: ['Un paso no ha salido; lo repito.'],
  },
  termina: {
    informal: [
      '¡Ahí tenéis vuestras vergüenzas, listillos!',
      'Escrito destrozado en {tiempo}. De nada.',
      'Hecho en {tiempo}. Si llega así al juzgado, os comen vivos.',
      '{m} Ataque listo en {tiempo}. A llorar.',
    ],
    profesional: ['Ataque terminado en {tiempo}{datos}. Su escrito tiene puntos débiles.'],
  },
  falla: {
    informal: ['No he podido terminar, coño. Hoy os salva la campana.', 'Se me ha resistido. Disfrutad, que dura poco.'],
    profesional: ['No he podido completar el ataque.'],
  },
}

/** Qué familia de plantillas toca a un hecho. */
function familia(h: Hecho): string {
  switch (h.tipo) {
    case 'sentencias':
      return h.citas.some(c => c.supremo) ? 'supremo' : 'sentencia'
    case 'articulo':
      return h.vigencia === 'vigente' ? 'vigente' : h.vigencia === 'derogado' ? 'derogado' : 'articulo'
    case 'verificacion':
      return h.limpio ? 'verificado' : 'revisar'
    case 'archivo':
      if (h.edicion) return 'retoque'
      if (h.fuentes) return 'fuentes'
      return h.seccion !== undefined && h.palabras > 0 ? 'seccion' : 'archivo'
    default:
      return h.tipo
  }
}

/** Los datos con los que se rellenan las plantillas de un hecho. */
function datosDe(h: Hecho): Record<string, string> {
  switch (h.tipo) {
    case 'empieza':
    case 'falla':
      return { d: h.descripcion }
    case 'sentencias': {
      const principal = h.citas.find(c => c.supremo) ?? (h.citas[0] as Cita)
      const otras = h.citas.length - 1
      return { id: principal.id, t: principal.tribunal, mas: otras > 0 ? ` Y ${otras === 1 ? 'otra más' : `${otras} más`}.` : '' }
    }
    case 'lectura':
      return { c: h.cita }
    case 'articulo':
      return { a: h.articulo, l: h.ley }
    case 'archivo': {
      const doc = h.doc ?? documentoEnFrase(h.ruta)
      return { n: doc, p: String(h.palabras), pp: h.palabras > 0 ? `: ${h.palabras} palabras` : '', s: h.seccion ?? doc }
    }
    case 'error':
      return { h: h.herramienta }
    case 'termina': {
      const partes = [
        h.busquedas > 0 ? `${h.busquedas} ${h.busquedas === 1 ? 'búsqueda' : 'búsquedas'}` : '',
        h.citas > 0 ? `${h.citas} ${h.citas === 1 ? 'sentencia' : 'sentencias'}` : '',
        h.palabras > 0 ? `${h.palabras} palabras` : h.archivos > 0 ? `${h.archivos} ${h.archivos === 1 ? 'documento' : 'documentos'}` : '',
      ].filter(Boolean)
      return { d: h.descripcion, tiempo: h.tiempo, datos: partes.length > 0 ? `: ${partes.join(', ')}` : '' }
    }
    default:
      return {}
  }
}

/**
 * La frase de una persona para un hecho. Determinista: `turno` (cuántas
 * frases lleva) elige la plantilla y la coletilla, y se evita repetir
 * `anterior`. En tono profesional no hay coletillas. El abogado de la parte
 * contraria (oficio `rival`) tiene su propio repertorio.
 */
export function decir(hecho: Hecho, persona: Persona, oficio: Oficio, tono: Tono, turno: number, anterior?: string): string {
  const repertorio = oficio.rival === true ? P_CONTRARIO : P
  const lista = repertorio[familia(hecho)]?.[tono] ?? []
  if (lista.length === 0) return ''
  const muletillas = tono === 'informal' ? persona.muletillas : []
  const datos = datosDe(hecho)
  const elegir = (n: number): string => {
    const m = muletillas.length > 0 ? (muletillas[n % muletillas.length] as string) : ''
    return rellenar(lista[n % lista.length] as string, { ...datos, m })
  }
  let texto = elegir(turno)
  if (texto === anterior && lista.length > 1) texto = elegir(turno + 1)
  return texto
}
