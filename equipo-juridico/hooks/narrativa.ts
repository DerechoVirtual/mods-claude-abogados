// El trabajo de cada persona contado como lo contaría un despacho, no un
// programador: nada de «Read», «Grep» ni «Bash D=C:/…». Cada paso se narra en
// lenguaje jurídico («Estudia el expediente del caso», «Busca jurisprudencia
// del Supremo sobre…», «Redacta la sección 01») y, al acabar, se dice qué ha
// dado de sí («han salido la STS 323/2017 y otra», «vigente», «667 palabras»).

import type { Hecho } from './frases'
import { documentoEnFrase, nombreDocumento, nombreLey, recortar } from './llano'

/** El nombre corto de una herramienta (sin el prefijo del conector). */
function corto(herramienta: string): string {
  return herramienta.includes('__') ? (herramienta.split('__').pop() ?? herramienta) : herramienta
}

/** Un texto en una línea, cortado por una palabra entera si es largo. */
function texto(v: unknown, largo = 60): string {
  return typeof v === 'string' ? recortar(v, largo) : ''
}

/** Un documento dicho en una frase: «la demanda», «la sección 02» o «el documento «poder notarial»». */
function documento(ruta: string): string {
  const doc = documentoEnFrase(ruta)
  return doc.startsWith('«') ? `el documento ${doc}` : doc
}

/** Archivos que son herramientas del ordenador, no documentos del asunto. */
const DE_ORDENADOR = /\.(py|js|ts|json|sh|ps1|bat|ya?ml|toml)$/i

/** «la sección 01» a partir de «…/secciones/01-hechos.md». */
function seccionDe(ruta: string): string | undefined {
  const m = /secciones\/(\d{1,2})[^/]*\.md$/i.exec(ruta.replace(/\\/g, '/'))
  return m === null ? undefined : `la sección ${(m[1] ?? '').padStart(2, '0')}`
}

const TRIBUNAL_BASE: Record<string, string> = {
  TS: 'del Supremo',
  AN: 'de Audiencias y TSJ',
  TC: 'del Constitucional',
  TJUE: 'europea (TJUE)',
}

/** Lo que hace una persona en un paso, en lenguaje de despacho. */
export function narrar(herramienta: string, args: Record<string, unknown>): string {
  const h = corto(herramienta)
  const ruta = typeof args.file_path === 'string' ? args.file_path.replace(/\\/g, '/') : typeof args.notebook_path === 'string' ? args.notebook_path : ''
  const orden = typeof args.command === 'string' ? args.command : ''

  switch (h) {
    case 'Read': {
      if (/(^|\/)caso\.md$/i.test(ruta)) return 'Estudia el expediente del caso y el plan del escrito'
      if (/(^|\/)escrito\.md$/i.test(ruta)) return 'Lee el escrito completo de principio a fin'
      if (/(^|\/)informe\.md$/i.test(ruta)) return 'Repasa la tabla de fuentes del escrito'
      if (/(^|\/)fuentes\//i.test(ruta)) return 'Repasa las fuentes anotadas'
      const seccion = seccionDe(ruta)
      if (seccion !== undefined) return `Lee ${seccion} del escrito`
      if (/(^|\/)SKILL\.md$/i.test(ruta) || DE_ORDENADOR.test(ruta)) return 'Repasa el método de trabajo del despacho'
      if (ruta !== '') return `Lee ${documento(ruta)}`
      return 'Lee un documento del expediente'
    }
    case 'Write': {
      const seccion = seccionDe(ruta)
      if (seccion !== undefined) return `Redacta ${seccion}`
      if (/(^|\/)fuentes\//i.test(ruta)) return 'Anota las fuentes que cita'
      if (/(^|\/)caso\.md$/i.test(ruta)) return 'Prepara el plan del escrito'
      if (/\.docx$/i.test(ruta)) return 'Genera el escrito en Word'
      if (DE_ORDENADOR.test(ruta)) return 'Prepara una herramienta de apoyo'
      return ruta !== '' ? `Redacta ${documento(ruta)}` : 'Redacta un documento'
    }
    case 'Edit':
    case 'MultiEdit': {
      const seccion = seccionDe(ruta)
      if (seccion !== undefined) return `Corrige y pule ${seccion}`
      if (/(^|\/)fuentes\//i.test(ruta)) return 'Completa las fuentes que cita'
      if (DE_ORDENADOR.test(ruta)) return 'Ajusta una herramienta de apoyo'
      return ruta !== '' ? `Corrige ${documento(ruta)}` : 'Corrige un documento'
    }
    case 'NotebookEdit':
      return 'Actualiza sus notas de trabajo'
    case 'Grep': {
      // Un patrón de búsqueda con símbolos de programador no se enseña.
      const patron = texto(args.pattern, 40)
      const llano = patron !== '' && !/[\\|^$*+?()[\]{}]/.test(patron)
      return llano ? `Busca «${patron}» en los documentos del expediente` : 'Busca un dato en los documentos del expediente'
    }
    case 'Glob':
      return 'Revisa qué documentos hay en la carpeta del asunto'
    case 'Bash':
    case 'PowerShell': {
      if (/escrito\.py/i.test(orden) && /ensamblar/i.test(orden)) return 'Monta el escrito completo en Word'
      if (/escrito\.py/i.test(orden) && /iniciar/i.test(orden)) return 'Prepara la mesa de trabajo del escrito'
      if (/\bwc\b|Measure-Object|palabras|words/i.test(orden)) return 'Cuenta las palabras de lo redactado'
      if (/pandoc|\.docx/i.test(orden)) return 'Convierte el escrito a Word'
      if (/\.pdf/i.test(orden)) return 'Prepara el escrito en PDF'
      if (/\b(python|node)\b/i.test(orden)) return 'Hace comprobaciones y cálculos'
      if (/\b(mkdir|New-Item)\b/i.test(orden)) return 'Prepara la carpeta del asunto'
      if (/\b(ls|dir|Get-ChildItem|find)\b/i.test(orden)) return 'Revisa la carpeta del asunto'
      return 'Ordena los archivos del asunto'
    }
    case 'buscar_sentencias': {
      const base = typeof args.base === 'string' ? (TRIBUNAL_BASE[args.base.toUpperCase()] ?? '') : 'del Supremo'
      const consulta = texto(args.consulta, 60)
      return `Busca jurisprudencia${base !== '' ? ` ${base}` : ''}${consulta !== '' ? ` sobre «${consulta}»` : ''}`
    }
    case 'leer_sentencias': {
      const citas = texto(args.citas, 200).split(',').map(c => c.trim()).filter(Boolean)
      if (citas.length === 0) return 'Lee a fondo una sentencia'
      return `Lee a fondo la ${citas[0]}${citas.length > 1 ? ` y ${citas.length - 1} más` : ''}`
    }
    case 'buscar_por_cita':
      return `Comprueba la cita ${texto(args.cita ?? args.citas, 50)}`.trim()
    case 'buscar_articulo':
      return `Consulta el art. ${texto(args.articulo, 15)} ${typeof args.ley === 'string' ? nombreLey(args.ley) : ''} en su redacción vigente`.replace(/\s+/g, ' ').trim()
    case 'verificar_escrito':
      return 'Comprueba que las leyes citadas existen, están vigentes y dicen lo que se afirma'
    case 'buscar_boe':
      return `Busca normativa en el BOE${texto(args.consulta ?? args.query, 50) !== '' ? ` sobre «${texto(args.consulta ?? args.query, 50)}»` : ''}`
    case 'leer_boe':
    case 'sumario_boe':
    case 'novedades_boe':
      return 'Lee el Boletín Oficial del Estado'
    case 'buscar_convenio':
    case 'leer_convenio':
    case 'vigencia_convenio':
      return 'Revisa el convenio colectivo aplicable'
    case 'buscar_consultas_hacienda':
    case 'leer_consulta_hacienda':
      return 'Consulta el criterio de Hacienda'
    case 'buscar_empresa_mercantil':
    case 'sumario_borme':
      return 'Consulta el Registro Mercantil'
    case 'consultar_catastro':
    case 'callejero_catastro':
      return 'Consulta el Catastro'
    case 'estado':
      return 'Comprueba que la conexión con Jurisprudenciator funciona'
    case 'WebSearch':
      return `Busca en fuentes oficiales «${texto(args.query, 50)}»`
    case 'WebFetch':
      return 'Consulta una página oficial'
    case 'Skill':
      return 'Repasa el método de trabajo del despacho'
    case 'TodoWrite':
    case 'TaskCreate':
    case 'TaskUpdate':
      return 'Ordena su lista de pendientes'
    case 'Agent':
      return 'Encarga una parte a un compañero'
    default:
      return h.includes('_') ? `Consulta: ${h.replace(/_/g, ' ')}` : 'Trabaja en el asunto'
  }
}

/** Qué ha dado de sí un paso, en pocas palabras (o nada si no hay que decir). */
export function resultadoDe(hecho: Hecho | undefined, ok: boolean): string | undefined {
  if (!ok && hecho?.tipo !== 'vacio') return 'no ha salido bien; lo intenta de otra forma'
  if (hecho === undefined) return undefined
  switch (hecho.tipo) {
    case 'sentencias': {
      const [a, b] = hecho.citas
      if (a === undefined) return undefined
      const primera = `${a.id}${a.tribunal !== '' ? ` ${a.tribunal}` : ''}`
      return `han salido la ${primera}${b !== undefined ? ` y la ${b.id}` : ''}`
    }
    case 'vacio':
      return 'sin resultados; probará otros términos'
    case 'busqueda':
      return 'hay resultados que revisar'
    case 'articulo':
      return hecho.vigencia === 'vigente' ? 'vigente' : hecho.vigencia === 'derogado' ? '¡derogado! No sirve' : 'texto obtenido'
    case 'verificacion':
      return hecho.limpio ? 'todo correcto' : 'hay citas que revisar'
    case 'archivo':
      return hecho.palabras > 0 ? `${hecho.palabras} palabras` : undefined
    case 'error':
      return 'no ha salido bien; lo intenta de otra forma'
    default:
      return undefined
  }
}

/**
 * Su informe final sin tecnicismos: sin comillas de código ni rutas
 * («`secciones/01-hechos.md`» → «la sección 01»).
 */
export function informeLimpio(texto: string): string {
  const carpetas = String.raw`(?:[A-Za-z]:[\\/])?(?:[\w.-]+[\\/])*`
  return (
    texto
      .replace(/`([^`]*)`/g, '$1')
      // «… la sección 01 en secciones/01-hechos.md, con…» → «… la sección 01, con…»
      .replace(new RegExp(String.raw`\s+(?:en|a)\s+${carpetas}secciones[\\/]\d{1,2}[^\s,;:)]*?\.md`, 'gi'), '')
      .replace(new RegExp(String.raw`${carpetas}secciones[\\/](\d{1,2})[^\s,;:)]*?\.md`, 'gi'), (_, n: string) => `la sección ${n.padStart(2, '0')}`)
      // «Las fuentes están en fuentes/01.md» → «Las fuentes están anotadas»
      .replace(new RegExp(String.raw`\s+(?:en|a)\s+${carpetas}fuentes[\\/]\d{1,2}\.md`, 'gi'), ' anotadas')
      .replace(new RegExp(String.raw`${carpetas}fuentes[\\/]\d{1,2}\.md`, 'gi'), 'sus fuentes')
      // Cualquier otra ruta, solo con el nombre del documento dicho en llano
      // («partes/02-hechos.md» → «hechos»). Un Word o un PDF nombrado sin
      // carpeta se deja como está: es el entregable y se reconoce así.
      .replace(new RegExp(String.raw`${carpetas}([\w.-]+\.(?:md|docx|pdf|txt))`, 'g'), (todo: string, nombre: string) =>
        /[\\/]/.test(todo) || /\.(md|txt)$/i.test(nombre)
          ? `«${nombreDocumento(nombre)}»${/\.docx$/i.test(nombre) ? ' (Word)' : /\.pdf$/i.test(nombre) ? ' (PDF)' : ''}`
          : todo,
      )
      .replace(/\s{2,}/g, ' ')
      .trim()
  )
}

/** Su encargo, resumido para un abogado (no el texto técnico que recibió). */
export function encargoResumido(descripcion: string, seccion: string | undefined, extension: number | undefined): string {
  const que = seccion !== undefined ? `redactar la ${seccion.replace(/\.$/, '')}` : `«${descripcion}»`
  return `${que.charAt(0).toUpperCase()}${que.slice(1)}${extension !== undefined ? `, unas ${extension} palabras` : ''}.`
}

/** El estado de Claude Code dicho como en un despacho. */
export function estadoLegible(palabra: string | undefined, trabajando: boolean): string {
  if (!trabajando) return 'ha terminado'
  if (palabra === 'waiting') return 'esperando algo para seguir'
  if (palabra === 'idle') return 'en pausa'
  if (palabra === 'pending') return 'a punto de empezar'
  return 'sigue trabajando'
}
