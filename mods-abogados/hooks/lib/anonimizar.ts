// ─────────────────────────────────────────────────────────────────────────────
// anonimizar.ts · Datos personales del escrito y conector de Anonimizator
// (funciones puras)
//
// QUÉ HACE EL MOD 9 Y QUÉ NO: crea una COPIA ANONIMIZADA del escrito (para
// compartirlo, publicarlo, archivarlo o pasárselo a otra IA). El original no
// se toca: al juzgado van los nombres reales. Con el conector de URL personal
// el texto viaja de Claude a Anonimizator (que lo procesa en la UE sin
// guardarlo); no oculta nada a Claude, que ya ha escrito el escrito. Para que
// un documento no salga del ordenador está el conector local de Anonimizator.
//
// Aquí solo hay cuentas: detectar si hay datos personales (para decidir si se
// actúa), reconocer el conector entre las herramientas de la sesión, encontrar
// el texto del escrito y leer las respuestas de Anonimizator. Nunca se guarda
// ni se muestra un dato personal: solo recuentos.
// ─────────────────────────────────────────────────────────────────────────────

export type DatosDetectados = { total: number; porTipo: Record<string, number> }

// ── Detección local (solo decide si merece la pena llamar a Anonimizator) ───

const LETRAS_DNI = 'TRWAGMYFPDXBNJZSQVHLCKE'

function dniValido(numero: string, letra: string): boolean {
  return LETRAS_DNI[Number(numero) % 23] === letra.toUpperCase()
}

function ibanValido(iban: string): boolean {
  const limpio = iban.replace(/\s+/g, '').toUpperCase()
  if (!/^ES\d{22}$/.test(limpio)) return false
  const reordenado = limpio.slice(4) + limpio.slice(0, 4)
  const digitos = reordenado.replace(/[A-Z]/g, c => String(c.charCodeAt(0) - 55))
  let resto = 0
  for (const d of digitos) resto = (resto * 10 + Number(d)) % 97
  return resto === 1
}

const MAYUS = 'A-ZÁÉÍÓÚÜÑ'
const PALABRA = `[${MAYUS}][${MAYUS}a-záéíóúüñ'-]+`

/**
 * Cuenta los datos personales que se reconocen sin IA: DNI y NIE con su letra
 * de control, IBAN españoles válidos, teléfonos, correos y nombres precedidos
 * de tratamiento («D.ª Lucía García», «DON ANDRÉS LÓPEZ»). Los nombres sin
 * tratamiento los encuentra Anonimizator, no esto.
 */
export function detectarDatosPersonales(texto: string): DatosDetectados {
  const porTipo: Record<string, number> = {}
  const sumar = (tipo: string, valores: Iterable<string>) => {
    const unicos = new Set(valores)
    if (unicos.size) porTipo[tipo] = (porTipo[tipo] ?? 0) + unicos.size
  }
  const todas = (re: RegExp) => Array.from(texto.matchAll(re))

  sumar('DNI', todas(/\b(\d{8})-?([A-Za-z])\b/g).filter(m => dniValido(m[1]!, m[2]!)).map(m => m[1]! + m[2]!.toUpperCase()))
  sumar(
    'NIE',
    todas(/\b([XYZxyz])-?(\d{7})-?([A-Za-z])\b/g)
      .filter(m => dniValido(String('XYZ'.indexOf(m[1]!.toUpperCase())) + m[2]!, m[3]!))
      .map(m => m[0]!.toUpperCase()),
  )
  sumar('cuenta bancaria', todas(/\bES\d{2}(?:[ ]?\d{4}){5}\b/gi).filter(m => ibanValido(m[0]!)).map(m => m[0]!.replace(/\s/g, '')))
  // 9 cifras que empiezan por 6, 7, 8 o 9, con espacios o puntos opcionales; no si forman parte de otra cifra (1.612.345.678,50).
  sumar('teléfono', todas(/(?<!\d)(?<!\d[.,/-])(?:\+34[ ]?)?[6789](?:[ .]?\d){8}(?!\d)(?![.,/-]\d)/g).map(m => m[0]!.replace(/\D/g, '').slice(-9)))
  sumar('correo', todas(/\b[\w.+-]+@[\w-]+(?:\.[\w-]+)+\b/g).map(m => m[0]!.toLowerCase()))
  sumar(
    'nombre',
    todas(new RegExp(`\\b(?:D\\.ª|Dª|D\\.|Dña\\.|Doña|Don|DOÑA|DON)\\s+(${PALABRA}(?:\\s+(?:de\\s+|del\\s+|de\\s+la\\s+)?${PALABRA}){1,3})`, 'g')).map(m => m[1]!.toUpperCase()),
  )
  const total = Object.values(porTipo).reduce((s, n) => s + n, 0)
  return { total, porTipo }
}

// ── El conector de Anonimizator ─────────────────────────────────────────────

export type Conector = { servidor: string; herramienta: string }
export type ConectoresAnonimizator = { remoto: Conector | null; local: Conector | null }

/** «mcp__claude_ai_Anonimizator__anonimizar_texto» → servidor y herramienta (el servidor puede llevar «_»). */
export function partirNombre(nombre: string): Conector | null {
  if (!nombre.startsWith('mcp__')) return null
  const i = nombre.lastIndexOf('__')
  if (i <= 5) return null
  return { servidor: nombre.slice(5, i), herramienta: nombre.slice(i + 2) }
}

/**
 * Busca el conector de Anonimizator entre las herramientas de la sesión:
 * el de URL personal tiene «anonimizar_texto»; el local, «anonimizar_documento».
 * Nunca se reconoce por «estado»: Jurisprudenciator tiene otra con ese nombre.
 */
export function buscarAnonimizator(herramientas: ReadonlyArray<{ name: string; mcp?: boolean }>): ConectoresAnonimizator {
  let remoto: Conector | null = null
  let local: Conector | null = null
  for (const h of herramientas) {
    const c = partirNombre(h.name)
    if (!c) continue
    if (c.herramienta === 'anonimizar_texto' && !remoto) remoto = c
    if (c.herramienta === 'anonimizar_documento' && !local) local = c
  }
  return { remoto, local }
}

export const COMO_CONECTAR =
  'Para conectar Anonimizator: copia tu dirección personal en anonimizator.org/conector y añádela en Claude (Ajustes → Conectores → «Añadir conector personalizado»). Necesita un plan de pago de Anonimizator.'

// ── El texto del escrito ────────────────────────────────────────────────────

const unix = (r: string) => r.replace(/\\/g, '/')

function carpetaDe(ruta: string): string {
  const r = unix(ruta).replace(/\/$/, '')
  const i = r.lastIndexOf('/')
  return i > 0 ? r.slice(0, i) : '.'
}

/** «…/demanda-x/secciones/01-hechos.md» → «…/demanda-x» (la carpeta de la redacción rápida). */
export function carpetaRedaccionDeSeccion(ruta: string): string | null {
  const r = unix(ruta)
  return /\/secciones\/[^/]+\.md$/i.test(r) ? carpetaDe(carpetaDe(r)) : null
}

const esAbsoluta = (r: string) => /^([a-z]:\/|\/|~\/)/i.test(r)

/**
 * Dónde está el texto (Markdown) de un escrito ensamblado por la redacción rápida:
 * 1) el campo "escrito" del resultado (falta si la salida se filtró);
 * 2) la carpeta que se pasó a «ensamblar», resuelta con el «cd» previo si es relativa;
 * 3) la carpeta de las últimas secciones escritas en la sesión.
 */
export function rutaEscritoMd(comando: string, salida: string, carpetaSecciones: string | null): string | null {
  const campo = /"escrito"\s*:\s*"([^"]+)"/.exec(salida)?.[1]
  if (campo) return unix(campo.replace(/\\\\/g, '/'))
  const arg = /\bensamblar\s+(?:"([^"]+)"|'([^']+)'|(?!--)(\S+))/.exec(comando)
  const carpeta = arg ? unix(arg[1] ?? arg[2] ?? arg[3] ?? '') : ''
  if (carpeta && esAbsoluta(carpeta)) return `${carpeta.replace(/\/$/, '')}/escrito.md`
  if (carpeta) {
    const cd = /\bcd\s+(?:"([^"]+)"|'([^']+)'|(\S+))/.exec(comando)
    const base = cd ? unix(cd[1] ?? cd[2] ?? cd[3] ?? '') : ''
    if (base && esAbsoluta(base)) {
      const unida = carpeta === '.' ? base : `${base.replace(/\/$/, '')}/${carpeta.replace(/^\.\//, '')}`
      return `${unida.replace(/\/$/, '')}/escrito.md`
    }
  }
  return carpetaSecciones ? `${unix(carpetaSecciones)}/escrito.md` : null
}

/** «…/escrito.md» → «…/escrito.ANONIMIZADO.md» (al lado del original). */
export function rutaAnonimizada(ruta: string): string {
  const r = unix(ruta)
  const i = r.lastIndexOf('.')
  return i > r.lastIndexOf('/') ? `${r.slice(0, i)}.ANONIMIZADO${r.slice(i)}` : `${r}.ANONIMIZADO`
}

export const esCopiaAnonimizada = (ruta: string) => /\.anonimizado(\.|$)/i.test(ruta)

/** Huella corta de un texto, para no mandar dos veces lo mismo (cada envío cuenta en el plan). */
export function huella(texto: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return `${texto.length}-${h.toString(16)}`
}

// ── Respuestas de Anonimizator ──────────────────────────────────────────────

export type RespuestaAnonimizator =
  | { ok: true; texto?: string; total: number; veredicto?: string; copia?: string }
  | { ok: false; mensaje: string }

/** Pasa a palabras sencillas un error del conector (nunca repite el texto enviado). */
export function mensajeDeError(texto: string): string {
  if (/-32002|plan gratuito|plan de pago/i.test(texto)) return 'Tu plan de Anonimizator no incluye el conector: hace falta un plan de pago (anonimizator.org).'
  if (/-32001|enlace no v[aá]lido|url personal/i.test(texto)) return 'El enlace del conector no es válido: copia de nuevo tu URL personal en anonimizator.org/conector.'
  if (/demasiado largo/i.test(texto)) return 'El escrito es demasiado largo para el conector: usa la aplicación de escritorio de Anonimizator.'
  return 'Anonimizator no ha podido anonimizar el escrito ahora. Prueba otra vez con /anonimizar.'
}

/** Lee el resultado de una llamada al conector: el JSON del primer bloque de texto. */
export function leerRespuesta(resultado: { content?: ReadonlyArray<{ type: string; text?: string }>; isError?: boolean }): RespuestaAnonimizator {
  const texto = (resultado.content ?? []).filter(b => b.type === 'text').map(b => b.text ?? '').join('\n')
  if (resultado.isError) return { ok: false, mensaje: mensajeDeError(texto) }
  try {
    const d = JSON.parse(texto) as Record<string, unknown>
    const total = typeof d.total === 'number' ? d.total : typeof d.sustituidos === 'number' ? d.sustituidos : 0
    return {
      ok: true,
      total,
      ...(typeof d.texto_anonimizado === 'string' ? { texto: d.texto_anonimizado } : {}),
      // Conector de URL personal: «veredicto». Conector local: «revisarManualmente» (datos que pudieron quedar).
      ...(typeof d.veredicto === 'string'
        ? { veredicto: d.veredicto }
        : typeof d.revisarManualmente === 'number'
          ? { veredicto: d.revisarManualmente > 0 ? 'CON POSIBLES FUGAS' : 'LIMPIO' }
          : {}),
      // El conector local escribe la copia él mismo y devuelve su ruta en «resultado».
      ...(typeof d.resultado === 'string' ? { copia: unix(d.resultado) } : {}),
    }
  } catch {
    return { ok: false, mensaje: mensajeDeError(texto) }
  }
}

/** «{DNI: 2, nombre: 3}» → «3 nombres y 2 DNI» (solo recuentos). */
export function textoRecuento(datos: DatosDetectados): string {
  const plural: Record<string, string> = { nombre: 'nombres', teléfono: 'teléfonos', correo: 'correos', 'cuenta bancaria': 'cuentas bancarias' }
  const partes = Object.entries(datos.porTipo)
    .sort((a, b) => b[1] - a[1])
    .map(([tipo, n]) => `${n} ${n === 1 ? tipo : (plural[tipo] ?? tipo)}`)
  if (partes.length <= 1) return partes[0] ?? '0 datos'
  return `${partes.slice(0, -1).join(', ')} y ${partes[partes.length - 1]}`
}
