// ─────────────────────────────────────────────────────────────────────────────
// escritos.ts · ¿Ha terminado Claude un escrito? (funciones puras)
//
// El botón «Que lo ataque el contrario» solo debe aparecer con el escrito
// TERMINADO. Se considera terminado cuando, en un turno:
//   · el ensamblador de la redacción rápida (escrito.py ensamblar) acaba con
//     "ok": true y sin errores, o
//   · Claude entrega al abogado un Word o un PDF con nombre de escrito
//     (SendUserFile: demanda…, recurso…, contestación…).
// El nombre del Word se toma del argumento --salida (la salida del ensamblador
// puede venir recortada) y, si falta, del campo "word" del resultado.
// ─────────────────────────────────────────────────────────────────────────────

export type EscritoTerminado = {
  ruta: string // Word o PDF, con «/»
  nombre: string // legible: «Demanda de desahucio por falta de pago … López»
  carpeta: string // donde está el archivo
  via: 'ensamblado' | 'entrega'
}

/** Nombres de archivo que suenan a escrito jurídico. */
export const PALABRAS_ESCRITO =
  /(demanda|contestaci|recurso|escrito|querella|denuncia|alegaci|oposici|apelaci|casaci|reposici|burofax|requerimiento|conclusiones|solicitud|impugnaci|reclamaci|contrato|papeleta|dictamen)/i

const SHELLS = new Set(['Bash', 'PowerShell'])

/** ¿Es la orden que ensambla un escrito de la redacción rápida? */
export function esEnsamblado(e: Record<string, unknown>): boolean {
  if (!SHELLS.has(String(e.tool))) return false
  const comando = typeof e.command === 'string' ? e.command : ''
  return /escrito\.py/.test(comando) && /\bensamblar\b/.test(comando)
}

/** Ruta del argumento --salida (entre comillas o sin ellas). */
export function rutaSalida(comando: string): string | null {
  const m = /--salida[\s=]+(?:"([^"]+)"|'([^']+)'|(\S+))/.exec(comando)
  const ruta = m ? (m[1] ?? m[2] ?? m[3] ?? '') : ''
  return ruta ? ruta.replace(/\\/g, '/') : null
}

/** Palabras de escrito que en un nombre de archivo suelen ir sin tilde. */
const CON_TILDE: Record<string, string> = {
  contestacion: 'contestación',
  apelacion: 'apelación',
  reposicion: 'reposición',
  casacion: 'casación',
  suplicacion: 'suplicación',
  revision: 'revisión',
  oposicion: 'oposición',
  impugnacion: 'impugnación',
  reclamacion: 'reclamación',
  ejecucion: 'ejecución',
  modificacion: 'modificación',
  conciliacion: 'conciliación',
  reconvencion: 'reconvención',
  liquidacion: 'liquidación',
  aclaracion: 'aclaración',
  subsanacion: 'subsanación',
  personacion: 'personación',
  ampliacion: 'ampliación',
  indemnizacion: 'indemnización',
  resolucion: 'resolución',
  peticion: 'petición',
  proposicion: 'proposición',
  tasacion: 'tasación',
  administracion: 'administración',
  jurisdiccion: 'jurisdicción',
  prescripcion: 'prescripción',
  suplica: 'súplica',
  juridico: 'jurídico',
  juridica: 'jurídica',
  credito: 'crédito',
  prestamo: 'préstamo',
  hipoteca: 'hipoteca',
  trafico: 'tráfico',
  medico: 'médico',
  medica: 'médica',
  regimen: 'régimen',
  pension: 'pensión',
  custodia: 'custodia',
  sucesion: 'sucesión',
  particion: 'partición',
  division: 'división',
  rescision: 'rescisión',
  articulo: 'artículo',
  numero: 'número',
  expediente: 'expediente',
}

/** Nombres y apellidos frecuentes que llevan tilde o eñe (un archivo no las trae). */
const NOMBRES_CON_TILDE =
  'García Martínez López Sánchez Pérez Gómez Fernández González Rodríguez Jiménez Hernández Díaz Álvarez Muñoz Gutiérrez Ramírez Vázquez Domínguez Suárez Méndez Benítez Giménez Márquez Núñez Ibáñez Cortés Peña Marín Román Sáez Sáenz Yáñez Báez Galán Durán Beltrán Millán Bermúdez Meléndez Valdés Avilés Cáceres Córdoba Guzmán Roldán Castañar Barragán Cárdenas Andrés María José Jesús Ángel Ángela Lucía Sofía Raúl Iván Óscar Héctor Víctor Mónica Verónica Inés Belén Nicolás Tomás Julián Adrián Martín Simón Joaquín Agustín Rubén Álvaro Sebastián Cristóbal Rocío Félix César Germán Fermín Valentín Benjamín Ramón Hernán Elías Matías'.split(
    ' ',
  )

const llana = (palabra: string) =>
  palabra
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()

/** «ibanez» → «Ibáñez»: los nombres frecuentes y los que se aprenden de los clientes del despacho. */
const NOMBRES = new Map<string, string>(NOMBRES_CON_TILDE.map(n => [llana(n), n]))

/**
 * Aprende nombres propios con sus tildes (los de los clientes): así el título
 * de «…-Ibanez-Cortes.pdf» sale «Ibáñez Cortés» aunque el archivo no las lleve.
 */
export function aprenderNombres(textos: readonly string[]): void {
  for (const texto of textos) {
    for (const palabra of texto.split(/[^\p{L}]+/u)) {
      // Solo nombres propios (mayúscula inicial) que de verdad llevan tilde o eñe.
      if (palabra.length >= 3 && /^\p{Lu}\p{Ll}+$/u.test(palabra) && llana(palabra) !== palabra.toLowerCase()) NOMBRES.set(llana(palabra), palabra)
    }
  }
}

/** Palabras de enlace que ya trae el nombre. */
const ENLACES = new Set(['de', 'del', 'la', 'el', 'los', 'las', 'a', 'al', 'y', 'e', 'en', 'por', 'para', 'con', 'contra', 'sobre', 'c', 'vs'])
/** «demanda divorcio» → «demanda de divorcio»: sustantivos que piden «de» delante del siguiente. */
const PIDE_DE = new Set(['demanda', 'recurso', 'escrito', 'solicitud', 'papeleta', 'proposición', 'reclamación', 'impugnación', 'modificación', 'ejecución', 'incidente', 'tasación', 'juicio', 'contestación', 'oposición'])
const TRAS_DE = new Set([
  'divorcio', 'desahucio', 'despido', 'apelación', 'reposición', 'casación', 'suplicación', 'revisión', 'queja', 'ejecución', 'conciliación', 'alegaciones',
  'conclusiones', 'reclamación', 'modificación', 'nulidad', 'medidas', 'juicio', 'cantidad', 'prueba', 'costas', 'separación', 'alimentos', 'rentas', 'daños',
  'oposición', 'impugnación', 'personación', 'subsanación', 'aclaración',
])

/**
 * «…/demanda-de-desahucio-lopez-20261109.docx» → «Demanda de desahucio · López».
 * Un nombre de archivo (a veces en MAYÚSCULAS, sin tildes y sin «de») se lee mal
 * en pantalla, así que se escribe como lo escribiría una persona:
 * «CONTESTACION-DEMANDA-DIVORCIO-Ibanez-Cortes.pdf» → «Contestación a la demanda
 * de divorcio · Ibáñez Cortés». Los nombres de las partes van al final, tras «·».
 */
export function nombreLegible(ruta: string): string {
  const base = ruta.replace(/\\/g, '/').split('/').pop() ?? ruta
  const sinExt = base.replace(/\.[a-z0-9]+$/i, '')
  const sinFecha = sinExt.replace(/[-_ ]?\d{8}(?:[-_]\d{4,6})?$/, '')
  const crudas = sinFecha.replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean)
  if (crudas.length === 0) return base
  // ¿Las mayúsculas del nombre distinguen algo? (no, si todo va en mayúsculas o todo en minúsculas)
  const mezcla = crudas.some(p => /^\p{Lu}\p{Ll}/u.test(p)) && crudas.some(p => p === p.toUpperCase() || p === p.toLowerCase())
  const palabras = crudas.map((cruda, i) => {
    const ll = llana(cruda)
    const esSigla = cruda.length <= 4 && cruda === cruda.toUpperCase() && /^\p{Lu}+$/u.test(cruda) && !CON_TILDE[ll] && !ENLACES.has(ll) && crudas.some(p => p !== p.toUpperCase())
    if (esSigla) return { texto: cruda, propio: false, enlace: i > 0 } // «SA», «SL»: van con el nombre al que acompañan
    if (CON_TILDE[ll]) return { texto: CON_TILDE[ll]!, propio: false }
    if (ENLACES.has(ll)) return { texto: ll === 'c' || ll === 'vs' ? 'c.' : ll, propio: false, enlace: true }
    const nombre = NOMBRES.get(ll)
    if (nombre) return { texto: nombre, propio: true }
    // Con mayúscula inicial en un nombre que mezcla (y no es la primera palabra): nombre propio.
    if (i > 0 && mezcla && /^\p{Lu}\p{Ll}+$/u.test(cruda) && !PIDE_DE.has(ll) && !TRAS_DE.has(ll)) return { texto: cruda, propio: true }
    return { texto: /\d/.test(cruda) ? cruda : cruda.toLowerCase(), propio: false }
  })
  // Las partes: desde el primer nombre propio hasta el final (con sus «c.» y «y» de en medio).
  const primerPropio = palabras.findIndex((p, i) => p.propio && palabras.slice(i).every(q => q.propio || q.enlace))
  const escrito = primerPropio < 0 ? palabras : palabras.slice(0, primerPropio)
  const partes = primerPropio < 0 ? [] : palabras.slice(primerPropio)
  // Los «de» y «a la» que un nombre de archivo se come.
  const conEnlaces: string[] = []
  escrito.forEach((p, i) => {
    conEnlaces.push(p.texto)
    const siguiente = escrito[i + 1]
    if (!siguiente || p.enlace || siguiente.enlace) return
    const a = p.texto.toLowerCase()
    const b = siguiente.texto.toLowerCase()
    if ((a === 'contestación' || a === 'oposición') && (b === 'demanda' || b === 'ejecución')) conEnlaces.push('a la')
    else if (PIDE_DE.has(a) && TRAS_DE.has(b)) conEnlaces.push('de')
  })
  while (conEnlaces.length > 0 && ENLACES.has(conEnlaces[conEnlaces.length - 1]!.replace('.', ''))) conEnlaces.pop() // sin «de» colgando al final
  const titulo = conEnlaces.join(' ')
  const nombres = partes.map(p => p.texto).join(' ')
  const texto = titulo && nombres ? `${titulo} · ${nombres}` : titulo || nombres
  return texto ? texto.charAt(0).toUpperCase() + texto.slice(1) : base
}

function carpetaDe(ruta: string): string {
  const i = ruta.lastIndexOf('/')
  return i > 0 ? ruta.slice(0, i) : '.'
}

/**
 * Mira una llamada YA respondida. Devuelve el escrito si con ella queda
 * terminado; null si no.
 */
export function detectarEscritoTerminado(e: Record<string, unknown>, salida: string, isError: boolean): EscritoTerminado | null {
  if (isError) return null
  const herramienta = String(e.tool)

  if (esEnsamblado(e)) {
    if (!/"ok"\s*:\s*true/.test(salida)) return null
    if (/"errores"\s*:\s*\[\s*[^\]\s]/.test(salida)) return null // con errores no está terminado
    const comando = typeof e.command === 'string' ? e.command : ''
    const delCampo = /"word"\s*:\s*"([^"]+)"/.exec(salida)?.[1]?.replace(/\\\\/g, '/')
    const ruta = rutaSalida(comando) ?? (delCampo ? delCampo.replace(/\\/g, '/') : null)
    if (!ruta) return null
    return { ruta, nombre: nombreLegible(ruta), carpeta: carpetaDe(ruta), via: 'ensamblado' }
  }

  if (herramienta === 'SendUserFile') {
    const archivos = Array.isArray(e.files) ? e.files.filter((f): f is string => typeof f === 'string') : []
    const escrito = archivos
      .map(f => f.replace(/\\/g, '/'))
      .find(f => /\.(docx|pdf)$/i.test(f) && PALABRAS_ESCRITO.test(f.split('/').pop() ?? ''))
    if (!escrito) return null
    return { ruta: escrito, nombre: nombreLegible(escrito), carpeta: carpetaDe(escrito), via: 'entrega' }
  }

  return null
}

/** La petición que el botón envía a Claude. Solo lee y opina: no toca el escrito. */
export function peticionAtaque(esc: EscritoTerminado): string {
  const informe = `${esc.carpeta}/ataque-de-la-contraria.md`
  return [
    `Haz de abogado de la parte contraria con el escrito terminado «${esc.nombre}» (${esc.ruta}).`,
    '',
    'Lanza UN subagente (general-purpose) con la descripción «Atacar el escrito como la parte contraria» que lea ese escrito —y, si existe, el escrito.md de su carpeta de redacción— y lo ataque como lo haría el abogado de la otra parte. Dile que busque, por este orden:',
    '1. Excepciones procesales: competencia, procedimiento y cuantía, legitimación, postulación y requisitos de procedibilidad.',
    '2. Hechos sin probar con los documentos citados o que se contradicen entre sí.',
    '3. Fundamentos débiles y lo que la otra parte opondría a cada uno.',
    '4. Jurisprudencia: el FALLO de las sentencias que citamos (por si se vuelven en contra) y la que invocaría la otra parte. Nada que no haya leído.',
    '',
    'RÁPIDO Y CORTO (díselo tal cual al subagente):',
    '· Tiene entre 3 y 4 minutos. Si no le da tiempo, entrega lo que tenga: no se queda investigando.',
    '· Como mucho 6 consultas a Jurisprudenciator en total, solo para los ataques más serios.',
    '· Como mucho 6 ataques, de mayor a menor riesgo. De cada uno, tres líneas: el ataque, la probabilidad de que prospere (alta, media o baja) y cómo reforzar el escrito.',
    '',
    `Que guarde el informe (una página) en «${informe}». Tú dame en el chat los tres ataques más peligrosos en cuanto termine.`,
    'No modifiques el escrito: solo analízalo.',
  ].join('\n')
}
