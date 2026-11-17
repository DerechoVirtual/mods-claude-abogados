// ─────────────────────────────────────────────────────────────────────────────
// MOD 9 · Anonimizar con Anonimizator  (DESACTIVADO por defecto)
//
// Al terminar un escrito (el Word ensamblado, un escrito entregado o un
// borrador escrito por Claude), si tiene datos personales del cliente, el mod
// se lo pasa DIRECTAMENTE al conector de Anonimizator y guarda al lado una
// COPIA ANONIMIZADA (…ANONIMIZADO.md o .docx). El original no se toca: al
// juzgado van los nombres reales. La copia sirve para compartir, publicar,
// archivar o pasar el escrito a otra IA.
//
// Requisitos: activarlo en /plugin (a muchos abogados no les hace falta) y
// tener el conector de Anonimizator en Claude con la URL personal
// (anonimizator.org/conector; el conector necesita un plan de pago). Si falta
// el conector, la banda lo dice solo cuando hay un escrito con datos.
//
// Privacidad: con el conector de URL personal el texto viaja de Claude a
// Anonimizator (UE, sin retención); no oculta nada a Claude, que ya escribió
// el escrito. Con el conector local de Anonimizator, el Word se anonimiza en
// el ordenador y por el canal solo viajan rutas y recuentos: si está, se usa.
// El mod nunca guarda ni muestra un dato personal: solo recuentos.
// Cada envío cuenta en el plan de Anonimizator: el mismo texto no se manda dos veces.
// ─────────────────────────────────────────────────────────────────────────────

import type { On, ToolCallInput, ToolCallResult, TurnCompleteInput, TurnStartInput } from 'claude-code'
import {
  buscarAnonimizator,
  carpetaRedaccionDeSeccion,
  COMO_CONECTAR,
  detectarDatosPersonales,
  esCopiaAnonimizada,
  huella,
  leerRespuesta,
  mensajeDeError,
  rutaAnonimizada,
  rutaEscritoMd,
  textoRecuento,
  type DatosDetectados,
} from './lib/anonimizar'
import { detectarEscritoTerminado, esEnsamblado, nombreLegible, PALABRAS_ESCRITO } from './lib/escritos'
import { anotarError, enviarUnaVez, estado, redibujar, type Motor, type Pastilla } from './lib/estado'

/** Qué hay que anonimizar: el texto (Markdown) y/o el Word. */
export type Objetivo = { nombre: string; md: string | null; docx: string | null }

/** Lo que pasa en el turno en curso (se decide al acabarlo). */
const turno = {
  ensamblado: null as Objetivo | null,
  entregado: null as Objetivo | null,
  borrador: null as string | null,
}
/** Carpeta de la redacción rápida cuyas secciones se han escrito (para hallar escrito.md). */
let carpetaSecciones: string | null = null
/** Textos ya enviados en esta sesión (cada envío cuenta en el plan de Anonimizator). */
const enviados = new Set<string>()

const TURNOS_VISIBLE = 2

function mostrar($: Motor, aviso: NonNullable<typeof estado.anonimizacion>): void {
  estado.anonimizacion = aviso
  redibujar($)
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

/**
 * Hace el trabajo: lee el texto, comprueba si hay datos, busca el conector,
 * lo llama y guarda la copia. Se ejecuta DESPUÉS del turno (con $.clock.after),
 * para no retener a Claude mientras Anonimizator trabaja.
 */
export async function procesarAnonimizacion($: Motor, objetivo: Objetivo, forzar: boolean): Promise<void> {
  try {
    let texto: string | null = null
    if (objetivo.md && (await $.fs.exists(objetivo.md))) {
      const leido = await $.fs.read(objetivo.md)
      texto = typeof leido === 'string' ? leido : null
    }
    const datos: DatosDetectados | null = texto ? detectarDatosPersonales(texto) : null
    if (datos && datos.total === 0 && !forzar) return // sin datos personales: no se manda nada

    const clave = texto ? huella(texto) : `word:${objetivo.docx}`
    if (enviados.has(clave) && !forzar) return

    const { remoto, local } = buscarAnonimizator(await $.tool.list())
    const recuento = datos ? textoRecuento(datos) : 'posibles datos personales'

    if (!remoto && !local) {
      mostrar($, {
        tipo: 'sin-conector',
        texto: datos ? `🔒 Datos personales sin anonimizar (${recuento})` : '🔒 Posibles datos personales sin anonimizar',
        corto: '🔒 Sin anonimizar',
        turnos: 0,
      })
      // Una frase: el cómo se conecta lo cuentan el botón «Cómo conectarlo» y /anonimizar.
      $.ui.toast('🔒 El escrito lleva datos personales. Escribe /anonimizar para ver cómo conectar Anonimizator.', { timeoutMs: 8000 })
      return
    }

    // Con el conector local y un Word, mejor: el documento no sale del ordenador.
    if (local && objetivo.docx) {
      mostrar($, { tipo: 'trabajando', texto: '🔒 Anonimizando el Word en tu ordenador…', corto: '🔒 Anonimizando…', turnos: 0 })
      const r = leerRespuesta(await $.mcp.call(local.servidor, 'anonimizar_documento', { ruta: objetivo.docx, modo: 'token' }))
      enviados.add(clave)
      if (!r.ok) return mostrar($, { tipo: 'error', texto: `🔒 ${r.mensaje}`, corto: '🔒 No se pudo anonimizar', turnos: 0 })
      const limpia = r.veredicto === 'LIMPIO'
      const verificada = limpia ? 'verificada' : r.veredicto ? 'revísala: pueden quedar datos' : 'revísala'
      mostrar($, {
        tipo: 'hecha',
        texto: `🔒 Copia anonimizada del Word: ${r.total} datos · ${verificada}`,
        corto: limpia ? '🔒 Copia anonimizada ✓' : '🔒 Copia anonimizada: revísala',
        turnos: 0,
      })
      $.ui.toast('🔒 Copia anonimizada guardada junto al Word. El original no se ha tocado.', { timeoutMs: 8000 })
      return
    }

    if (!remoto || !texto || !objetivo.md) {
      mostrar($, {
        tipo: 'sin-texto',
        texto: local ? '🔒 Para anonimizarlo hace falta el Word: /anonimizar y su ruta' : '🔒 No encuentro el texto del escrito: /anonimizar y su ruta',
        corto: '🔒 Sin anonimizar',
        turnos: 0,
      })
      return
    }
    if (texto.length > 120_000) {
      return mostrar($, { tipo: 'error', texto: `🔒 ${mensajeDeError('demasiado largo')}`, corto: '🔒 No se pudo anonimizar', turnos: 0 })
    }

    mostrar($, { tipo: 'trabajando', texto: '🔒 Anonimizando el escrito con Anonimizator…', corto: '🔒 Anonimizando…', turnos: 0 })
    const r = leerRespuesta(await $.mcp.call(remoto.servidor, 'anonimizar_texto', { texto, modo: 'token', conservar_fechas: true }))
    enviados.add(clave)
    if (!r.ok || !r.texto) {
      return mostrar($, { tipo: 'error', texto: `🔒 ${r.ok ? mensajeDeError('') : r.mensaje}`, corto: '🔒 No se pudo anonimizar', turnos: 0 })
    }
    const copia = rutaAnonimizada(objetivo.md)
    await $.fs.write(copia, r.texto)

    // Control de calidad de Anonimizator sobre la copia (sin revelar valores).
    const v = leerRespuesta(await $.mcp.call(remoto.servidor, 'verificar_anonimizado', { texto: r.texto }))
    const limpia = v.ok && v.veredicto === 'LIMPIO'
    const verificada = limpia ? 'verificada' : v.ok && v.veredicto ? 'revísala: pueden quedar datos' : 'sin verificar'
    mostrar($, {
      tipo: 'hecha',
      texto: `🔒 Copia anonimizada: ${r.total} datos · ${verificada}`,
      corto: limpia ? '🔒 Copia anonimizada ✓' : '🔒 Copia anonimizada: revísala',
      copiaMd: copia,
      ...(objetivo.docx ? { docx: objetivo.docx } : {}),
      turnos: 0,
    })
    $.ui.toast('🔒 Copia anonimizada guardada junto al escrito. El original no se ha tocado.', { timeoutMs: 8000 })
  } catch (error) {
    anotarError(`Mod 9: ${String(error).slice(0, 100)}`)
    mostrar($, { tipo: 'error', texto: `🔒 ${mensajeDeError(String(error))}`, corto: '🔒 No se pudo anonimizar', turnos: 0 })
  }
}

// ── Manejadores que llama register.tsx (ninguno lanza errores) ──────────────

/** MOD 9 · Al iniciar la sesión: registra /anonimizar. No avisa de nada todavía (sin ruido). */
export async function iniciarAnonimizar($: Motor): Promise<void> {
  try {
    await $.command.register({
      name: 'anonimizar',
      description: 'Copia anonimizada del escrito con Anonimizator (sin argumentos: el último escrito o el estado del conector)',
      argumentHint: '[ruta del escrito .md o .docx]',
    })
  } catch (error) {
    anotarError(`Mod 9: ${String(error).slice(0, 100)}`)
  }
}

/** MOD 9 · Después de cada llamada: solo apunta rutas (nada de red aquí). */
export function despuesDeHerramientaAnonimizar(e: ToolCallInput, resultado: ToolCallResult): void {
  try {
    if (resultado.deny !== undefined || resultado.isError === true) return
    const datos = e as unknown as Record<string, unknown>
    const herramienta = String(e.tool)
    if (herramienta === 'Write' || herramienta === 'Edit' || herramienta === 'MultiEdit') {
      const ruta = typeof datos.file_path === 'string' ? datos.file_path.replace(/\\/g, '/') : ''
      if (!ruta || esCopiaAnonimizada(ruta)) return
      const seccion = carpetaRedaccionDeSeccion(ruta)
      if (seccion) {
        carpetaSecciones = seccion
        return
      }
      if (/\.(md|txt)$/i.test(ruta) && PALABRAS_ESCRITO.test(ruta.split('/').pop() ?? '')) turno.borrador = ruta
      return
    }
    const salida = textoDelResultado(resultado)
    const terminado = detectarEscritoTerminado(datos, salida, false)
    if (!terminado) return
    if (esEnsamblado(datos)) {
      const comando = typeof datos.command === 'string' ? datos.command : ''
      turno.ensamblado = { nombre: terminado.nombre, docx: terminado.ruta, md: rutaEscritoMd(comando, salida, carpetaSecciones) }
    } else if (!turno.ensamblado) {
      turno.entregado = { nombre: terminado.nombre, docx: /\.docx$/i.test(terminado.ruta) ? terminado.ruta : null, md: null }
    }
  } catch {
    // un fallo al apuntar no afecta a nada
  }
}

/** MOD 9 · Empieza un turno de la conversación principal. */
export function empezarTurnoAnonimizar($: Motor, e: TurnStartInput): void {
  if (e.agentId !== undefined) return
  turno.ensamblado = null
  turno.entregado = null
  turno.borrador = null
  if (estado.anonimizacion && estado.anonimizacion.tipo !== 'trabajando') {
    estado.anonimizacion = { ...estado.anonimizacion, turnos: estado.anonimizacion.turnos + 1 }
    if (estado.anonimizacion.turnos > TURNOS_VISIBLE) {
      estado.anonimizacion = null
      redibujar($)
    }
  }
}

/** MOD 9 · Acaba un turno: si se terminó un escrito, se anonimiza DESPUÉS, en segundo plano. */
export function terminarTurnoAnonimizar($: Motor, e: TurnCompleteInput): void {
  try {
    if (e.agentId !== undefined) return
    const borrador = turno.borrador
    const objetivo: Objetivo | null =
      turno.ensamblado ?? turno.entregado ?? (borrador ? { nombre: nombreLegible(borrador), md: borrador, docx: null } : null)
    turno.ensamblado = null
    turno.entregado = null
    turno.borrador = null
    if (!objetivo) return
    estado.ultimoObjetivoAnonimizar = objetivo
    $.clock.after(50, () => void procesarAnonimizacion($, objetivo, false))
  } catch {
    // nada
  }
}

/** MOD 9 · Comando /anonimizar (hook con filtro propio). */
export function registrarHooksAnonimizar(on: On): void {
  on('command.run', { command: 'anonimizar' }, async ($, e) => {
    const args = (e.args ?? '').trim().replace(/^["']|["']$/g, '')
    if (args) {
      const ruta = args.replace(/\\/g, '/')
      const objetivo: Objetivo = /\.(docx|pdf)$/i.test(ruta)
        ? { nombre: nombreLegible(ruta), md: null, docx: ruta }
        : { nombre: nombreLegible(ruta), md: ruta, docx: null }
      $.clock.after(50, () => void procesarAnonimizacion($, objetivo, true))
      return { text: `Anonimizando «${objetivo.nombre}»… Te aviso al terminar. El original no se toca.` }
    }
    const { remoto, local } = buscarAnonimizator(await $.tool.list())
    const conector = local
      ? 'Conector local de Anonimizator: el Word se anonimiza en tu ordenador.'
      : remoto
        ? 'Conector de Anonimizator con tu URL personal: el texto viaja de Claude a Anonimizator (UE, sin guardarlo).'
        : `No tienes conectado Anonimizator. ${COMO_CONECTAR}`
    const ultimo = estado.ultimoObjetivoAnonimizar
    if (ultimo && (remoto || local)) {
      $.clock.after(50, () => void procesarAnonimizacion($, ultimo, true))
      return { text: `Anonimizando «${ultimo.nombre}»… Te aviso al terminar. El original no se toca.\n${conector}` }
    }
    return {
      text: [
        'Anonimizar con Anonimizator (Mod 9): al terminar un escrito con datos personales, guarda al lado una copia anonimizada. El original no se toca.',
        conector,
        ultimo ? '' : 'Todavía no hay ningún escrito terminado en esta sesión. También puedes indicar uno: /anonimizar <ruta del .md o .docx>.',
      ]
        .filter(Boolean)
        .join('\n'),
    }
  }).catch(() => ({ text: 'mods-abogados: no se pudo usar Anonimizator ahora.' }))
}

/** Pedir a Claude el Word de la copia anonimizada (solo trabaja con el texto ya anonimizado). */
async function pedirWord($: Motor, copiaMd: string, docx: string): Promise<void> {
  const destino = rutaAnonimizada(docx)
  const enviado = await enviarUnaVez(
    $,
    [
      `Convierte la copia anonimizada «${copiaMd}» en un Word con el formato de escrito judicial de siempre y guárdalo como «${destino}».`,
      'Usa solo ese texto ya anonimizado: no abras el original. Respeta las etiquetas tal cual ([ACTOR_1], etc.).',
    ].join('\n'),
  )
  if (enviado !== 'enviado' && enviado !== 'repetido') $.ui.toast(`No se pudo pedir el Word (${enviado.fallo}).`)
}

/**
 * Lo que la banda dice del Mod 9, solo con algo que contar del último escrito.
 *   · `entero`: el aviso con su botón, para la fila de acción cuando está libre.
 *   · si no, una pastilla de dos o tres palabras para la fila de estado (la de
 *     acción ya la ocupa «Siguientes pasos» o el contrario): así el plugin
 *     nunca pasa de dos filas. Si falta el conector, la pastilla es un botón
 *     que dice cómo conectarlo.
 */
export function segmentoAnonimizar($: Motor, tabla: ReturnType<Motor['ui']['resolve']>, entero: boolean): Pastilla | null {
  try {
    const a = estado.anonimizacion
    if (!a) return null
    const { Box, Text, Button } = tabla
    const color = a.tipo === 'hecha' ? 'success' : a.tipo === 'trabajando' ? 'text' : a.tipo === 'error' ? 'error' : 'warning'
    const comoConectar = () => $.ui.toast(COMO_CONECTAR, { timeoutMs: 15_000 })
    if (!entero) {
      if (a.tipo === 'sin-conector') {
        const etiqueta = '🔒 Conectar Anonimizator'
        return { nodo: <Button key="anonimizar-como" label={etiqueta} plain onPress={comoConectar} />, ancho: etiqueta.length + 3 }
      }
      const texto = a.corto ?? '🔒 Anonimizator'
      return {
        nodo: (
          <Box key="anonimizar" flexDirection="row">
            <Text color={color} dimColor={a.tipo === 'trabajando'} wrap="truncate-end">
              {texto}
            </Text>
          </Box>
        ),
        ancho: texto.length + 1,
      }
    }
    const conWord = a.tipo === 'hecha' && a.copiaMd && a.docx
    const nodo = (
      <Box key="anonimizar" flexDirection="row" columnGap={1}>
        <Box flexShrink={1} minWidth={0}>
          <Text color={color} dimColor={a.tipo === 'trabajando'} bold={a.tipo !== 'trabajando'} wrap="truncate-end">
            {a.texto}
          </Text>
        </Box>
        {a.tipo === 'sin-conector' && (
          <Box flexShrink={0}>
            <Button key="anonimizar-como" label="Cómo conectarlo" plain onPress={comoConectar} />
          </Box>
        )}
        {conWord && (
          <Box flexShrink={0}>
            <Button key="anonimizar-word" label="Word anonimizado" plain onPress={() => void pedirWord($, a.copiaMd!, a.docx!)} />
          </Box>
        )}
      </Box>
    )
    return { nodo, ancho: a.texto.length + (a.tipo === 'sin-conector' ? 17 : 0) + (conWord ? 18 : 0) }
  } catch {
    return null
  }
}
