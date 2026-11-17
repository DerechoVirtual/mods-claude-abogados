// Pruebas del Mod 10 (Siguientes pasos). El modelo y la memoria entre
// sesiones se simulan: se comprueba cuándo sale el panel, qué opciones da,
// qué envía cada botón y cómo influye el historial.

import { expect, mock, test, type TestBody } from 'claude-code/testing'
import type { On } from 'claude-code'
import { candidatas, combinar, leerRespuestaModelo, normalizarConfigSiguientes, opcionesDeTabla, tipoDeEscrito } from '../hooks/lib/siguientes'

type Kit = Parameters<TestBody>[0]

// La tabla real del plugin (la misma que config/siguientes.json, resumida en lo que se prueba).
const TABLA = {
  tipos: [
    { id: 'demanda-desahucio', nombre: 'Demanda de desahucio', patrones: ['demanda', 'desahucio'], acciones: ['preparar-vista', 'ejecucion-desahucio', 'carta-cliente', 'proposicion-prueba-verbal'] },
    { id: 'demanda-verbal', nombre: 'Demanda de juicio verbal', patrones: ['demanda', 'verbal'], procedimientos: ['verbal-cuantia', 'verbal-materia'], acciones: ['proposicion-prueba-verbal', 'preparar-vista', 'carta-cliente'] },
    { id: 'demanda', nombre: 'Demanda', patrones: ['demanda'], acciones: ['carta-cliente', 'preparar-vista'] },
    { id: 'otro', nombre: 'Escrito', patrones: [], acciones: ['carta-cliente', 'minuta', 'recurso-apelacion'] },
  ],
  acciones: {
    'preparar-vista': { etiqueta: 'Preparar la vista del juicio verbal', porque: 'Vista en un mes (art. 440 LEC).', peticion: 'Prepárame la vista del juicio verbal.', plazoTexto: 'La vista, dentro de un mes desde la citación (art. 440 LEC)' },
    'ejecucion-desahucio': { etiqueta: 'Pedir la ejecución de las rentas tras el decreto', porque: 'Art. 438.5 LEC.', peticion: 'Prepárame la solicitud de ejecución de las rentas.' },
    'carta-cliente': { etiqueta: 'Carta al cliente explicando el escrito', porque: 'El cliente tiene que saberlo.', peticion: 'Redáctame una carta al cliente.' },
    'proposicion-prueba-verbal': {
      etiqueta: 'Escrito de proposición de prueba',
      porque: '5 días (art. 438.8 LEC).',
      peticion: 'Prepárame el escrito de proposición de prueba.',
      plazo: { dias: 5, jurisdiccion: 'civil', desde: 'el traslado de la contestación' },
      plazoTexto: '5 días desde el traslado de la contestación (art. 438.8 LEC)',
    },
    minuta: { etiqueta: 'Minuta de honorarios orientativa', porque: 'Buen momento.', peticion: 'Prepárame una minuta.' },
    'recurso-apelacion': { etiqueta: 'Recurso de apelación contra la sentencia', porque: '20 días (art. 458.1 LEC).', peticion: 'Prepárame el recurso de apelación.' },
  },
}
const CFG = normalizarConfigSiguientes(TABLA)

// ── Funciones puras ─────────────────────────────────────────────────────────

test('Siguientes: reconoce el tipo de escrito por su nombre y, si hace falta, por la ficha', () => {
  expect(tipoDeEscrito('Demanda de desahucio por falta de pago lopez', undefined, CFG).id).toBe('demanda-desahucio')
  expect(tipoDeEscrito('Demanda borrador', 'verbal-cuantia', CFG).id).toBe('demanda-verbal')
  expect(tipoDeEscrito('Demanda borrador', undefined, CFG).id).toBe('demanda')
  expect(tipoDeEscrito('Informe para el cliente', undefined, CFG).id).toBe('otro')
  // Siempre al menos tres candidatas (se completa con las del tipo «otro»).
  expect(candidatas(tipoDeEscrito('Demanda borrador', undefined, CFG), CFG)).toEqual(['carta-cliente', 'preparar-vista', 'minuta', 'recurso-apelacion'])
})

test('Siguientes: tabla de reserva, respuesta del modelo y peso del historial', () => {
  const ids = candidatas(CFG.tipos[0]!, CFG)
  expect(opcionesDeTabla(ids, {}, 'demanda-desahucio', CFG).map(o => o.id)).toEqual(['preparar-vista', 'ejecucion-desahucio', 'carta-cliente'])
  expect(opcionesDeTabla(ids, { 'demanda-desahucio': { minuta: 2 } }, 'demanda-desahucio', CFG)[0]!.id).toBe('minuta')
  // El modelo solo puede usar ids de la lista, sin repetir.
  const modelo = leerRespuestaModelo('Aquí va: [{"id":"carta-cliente","etiqueta":"Carta a López"},{"id":"inventada"},{"id":"carta-cliente"},{"id":"preparar-vista"}]', ids)
  expect(modelo.map(m => m.id)).toEqual(['carta-cliente', 'preparar-vista'])
  expect(leerRespuestaModelo('no sé', ids)).toEqual([])
  // Modelo: vista, ejecución, prueba. Historial: la carta elegida 3 veces sube por delante de la ejecución.
  const ordenadas = combinar(
    [{ id: 'preparar-vista' }, { id: 'ejecucion-desahucio' }, { id: 'proposicion-prueba-verbal' }],
    ids,
    { 'demanda-desahucio': { 'carta-cliente': 3 } },
    'demanda-desahucio',
    CFG,
  )
  expect(ordenadas.map(o => o.id)).toEqual(['preparar-vista', 'carta-cliente', 'ejecucion-desahucio'])
})

// ── Recorrido completo ──────────────────────────────────────────────────────

const AHORA = Date.UTC(2026, 10, 9, 10, 0, 0)
const DOCX = '/demo/expedientes/lopez/demanda-de-desahucio-lopez-20261109.docx'
const ENSAMBLAR = `python escrito.py ensamblar "/demo/expedientes/lopez/redaccion/d" --salida "${DOCX}" | grep ok`
const CLIENTES = { clientes: [{ nombre: 'López', expediente: '0456/2026', asunto: 'Impago de rentas de un local', jurisdiccion: 'civil', carpeta: '/demo/expedientes/lopez', color: '#C2389E' }] }
const FICHAS = { fichas: { '0456/2026': { procedimiento: 'verbal-materia', cuantia: 14400, procurador: 'D. Luis Pérez García' } } }
const BANDA = {
  plugin: 'mods-abogados',
  component: 'AbovePrompt',
  props: { hasSurvey: false, isWorking: false, maxRows: 12, bodyColumns: 140, scroll: { offset: 0, bodyRows: 12 }, view: {} },
} as const
const PANEL = {
  plugin: 'mods-abogados',
  component: 'Pane',
  requestId: 'siguientes',
  props: { title: 'Siguientes pasos', isFocused: true, bodyColumns: 110, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} },
} as const
const comando = (command: string, args: string) =>
  ({ command, args, origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 } }) as const
const PLUGIN = ['data/plazos.json', 'data/cupo.json', 'data/fichas.json', 'config/clientes.json', 'config/siguientes.json']
const sinUnidad = (ruta: string) => ruta.replace(/\\/g, '/').replace(/^[A-Za-z]:(?=\/)/, '')
const claveDe = (ruta: string) => PLUGIN.find(k => sinUnidad(ruta).endsWith('/' + k)) ?? sinUnidad(ruta)

type Escena = {
  enviados: { text: string; asUser?: boolean }[]
  abiertos: string[]
  cerrados: string[]
  llamadasModelo: { model: string; prompt: unknown }[]
  memoria: Record<string, unknown>
  respuestaModelo: string | null // null: el modelo falla
}

function escena(on: On): Escena {
  const s: Escena = { enviados: [], abiertos: [], cerrados: [], llamadasModelo: [], memoria: {}, respuestaModelo: null }
  const archivos: Record<string, string> = {
    'data/plazos.json': JSON.stringify({ plazos: [], papelera: [] }),
    'config/clientes.json': JSON.stringify(CLIENTES),
    'data/fichas.json': JSON.stringify(FICHAS),
    'config/siguientes.json': JSON.stringify(TABLA),
  }
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('command.register', () => ({ value: { command: 'x' } }))
  on('fs.exists', (_$, e) => ({ value: claveDe(e.path) in archivos }))
  on('fs.read', (_$, e) => (claveDe(e.path) in archivos ? { value: archivos[claveDe(e.path)]! } : { deny: 'no existe' }))
  on('fs.write', (_$, e) => {
    archivos[claveDe(e.path)] = e.text
    return { value: undefined }
  })
  on('ui.toast', () => ({ value: undefined }))
  on('ui.backdrop', () => ({ value: { isDrawn: false, reason: 'prueba' } }))
  on('ui.open', (_$, e) => {
    s.abiertos.push(e.id)
    return { value: { isPlaced: true } }
  })
  on('ui.close', (_$, e) => {
    s.cerrados.push(e.id)
    return { value: undefined }
  })
  on('ui.panes', () => ({ value: [] }))
  on('session.messages', () => ({ value: [] }))
  on('turn.start', (_$, e) => ({ turnId: e.turnId }))
  on('turn.complete', (_$, e) => ({ text: e.answer }))
  on('prompt.submit', (_$, e) => {
    // «Como si lo escribiera el abogado» llega en el origen del mensaje.
    const marca = e as unknown as { asUser?: boolean; origin?: { asUser?: boolean } }
    s.enviados.push({ text: e.text, ...(marca.asUser || marca.origin?.asUser ? { asUser: true } : {}) })
    return { text: e.text }
  })
  on('store.get', (_$, e) => ({ value: s.memoria[e.key] }))
  on('store.set', (_$, e) => {
    s.memoria[e.key] = e.value
    return { value: undefined }
  })
  on('model.complete', (_$, e) => {
    s.llamadasModelo.push({ model: e.model, prompt: e.prompt })
    const usage = { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 }
    return {
      value: s.respuestaModelo === null ? { isAnswered: false, reason: 'api-error', usage } : { isAnswered: true, text: s.respuestaModelo, usage },
    } as never
  })
  on('tool.call', (_$, e) => (String(e.tool) === 'Bash' ? { result: 'ok', text: ' "ok": true,\n "errores": []' } : { result: 'ok', text: 'hecho' }))
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>[motor]</Text>
  })
  return s
}

async function terminarEscrito($: Kit, turnId: string) {
  await $.turn.start({ text: 'Redacta la demanda de desahucio', turnId })
  await $.tool.call({ tool: 'Bash', command: ENSAMBLAR } as never)
  await $.turn.complete({ answer: 'Listo.', durationMs: 1000, isAborted: false, turnId, reason: 'answer' })
}

async function botonesDelPanel($: Kit): Promise<string[]> {
  const ui = await $.ui.mount({ ...PANEL, surface: 'desktop' })
  const botones = await ui.findAll({ type: 'Button' })
  await ui.unmount()
  return botones.map(b => String((b.props as { label?: string }).label ?? ''))
}

test('Mod 10: sale solo en una sesión jurídica y solo al terminar el escrito', { timeoutMs: 20_000 }, async ($, on) => {
  const reloj = mock.clock(on, { now: AHORA })
  const s = escena(on)
  await $.session.start({ cwd: '/marketing', surface: 'terminal', isInteractive: false })
  // Una tarea de marketing: nada.
  await $.turn.start({ text: 'Haz la landing', turnId: 't1' })
  await $.tool.call({ tool: 'Write', file_path: '/marketing/landing.md', content: 'x' } as never)
  await $.turn.complete({ answer: 'Hecha.', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' })
  expect(s.abiertos).not.toContain('siguientes')

  // A mitad de la redacción: tampoco.
  await $.turn.start({ text: 'Redacta', turnId: 't2' })
  await $.tool.call({ tool: 'Bash', command: ENSAMBLAR } as never)
  expect(s.abiertos).not.toContain('siguientes')
  // Al terminar el turno: el panel y la línea de la banda.
  await $.turn.complete({ answer: 'Listo.', durationMs: 1, isAborted: false, turnId: 't2', reason: 'answer' })
  expect(s.abiertos).toContain('siguientes')
  const ui = await $.ui.mount({ ...BANDA, surface: 'terminal' })
  expect(await ui.find({ key: 'siguientes-abrir' })).toBeDefined()
  expect(await ui.find({ key: 'contrario-atacar' })).toBeUndefined() // el contrario va dentro del panel
  await ui.unmount()
  await reloj.advance(100)
})

test('Mod 10: si el modelo falla, las tres primeras de la tabla, con su plazo', { timeoutMs: 20_000 }, async ($, on) => {
  const reloj = mock.clock(on, { now: AHORA })
  const s = escena(on)
  await $.session.start({ cwd: '/demo/expedientes/lopez', surface: 'terminal', isInteractive: false })
  await terminarEscrito($, 't1')
  await reloj.advance(100)
  expect(s.llamadasModelo).toHaveLength(1)
  expect(s.llamadasModelo[0]!.model).toBe('haiku')
  const botones = await botonesDelPanel($)
  // En la app de escritorio la tecla ya va en una chapa junto al botón: la etiqueta no la repite.
  expect(botones.slice(0, 3)).toEqual(['Preparar la vista del juicio verbal', 'Pedir la ejecución de las rentas tras el decreto', 'Carta al cliente explicando el escrito'])
  expect(botones).toContain('⚔ Que lo ataque el contrario')
  expect(botones).toContain('Ninguno')
  const p = await $.ui.mount({ ...PANEL, surface: 'terminal' })
  expect(await p.find({ type: 'Text', text: /Las habituales del despacho/ })).toBeDefined()
  // En el terminal sí llevan el número y la tecla; y nada de jerga en el pie.
  expect(String((await p.find({ key: 'siguiente-1' }))?.props.label)).toBe('1. Preparar la vista del juicio verbal')
  expect(String((await p.find({ key: 'siguientes-ninguno' }))?.props.label)).toBe('Ninguno (0)')
  expect(await p.find({ type: 'Text', text: /\.json|modelo pequeño|config\// })).toBeUndefined()
  expect(await p.find({ type: 'Text', text: /SIGUIENTES PASOS · «Demanda de desahucio · López»/ })).toBeDefined()
  expect(await p.find({ type: 'Text', text: /dentro de un mes desde la citación/ })).toBeDefined()
  await p.unmount()
})

test('Mod 10: Claude ordena y concreta; una sola llamada por escrito', { timeoutMs: 20_000 }, async ($, on) => {
  const reloj = mock.clock(on, { now: AHORA })
  const s = escena(on)
  s.respuestaModelo = JSON.stringify([
    { id: 'ejecucion-desahucio', etiqueta: 'Ejecutar las rentas de López tras el decreto', porque: 'Si Talleres Inventados no paga ni se opone.' },
    { id: 'carta-cliente', etiqueta: 'Carta a López con lo que viene ahora' },
    { id: 'preparar-vista' },
  ])
  await $.session.start({ cwd: '/demo/expedientes/lopez', surface: 'terminal', isInteractive: false })
  await terminarEscrito($, 't1')
  await reloj.advance(100)
  expect((await botonesDelPanel($)).slice(0, 3)).toEqual([
    'Ejecutar las rentas de López tras el decreto',
    'Carta a López con lo que viene ahora',
    'Preparar la vista del juicio verbal',
  ])
  // El mismo escrito otra vez (bucle de correcciones): no vuelve a preguntar al modelo.
  await terminarEscrito($, 't2')
  await reloj.advance(100)
  expect(s.llamadasModelo).toHaveLength(1)
  expect((await botonesDelPanel($))[0]).toBe('Ejecutar las rentas de López tras el decreto')
})

test('Mod 10: el botón envía la petición completa, apunta la elección y retira el panel', { timeoutMs: 20_000 }, async ($, on) => {
  const reloj = mock.clock(on, { now: AHORA })
  const s = escena(on)
  await $.session.start({ cwd: '/demo/expedientes/lopez', surface: 'terminal', isInteractive: false })
  await terminarEscrito($, 't1')
  await reloj.advance(100)
  const p = await $.ui.mount({ ...PANEL, surface: 'desktop' })
  await p.press({ key: 'siguiente-3' })
  await p.unmount()
  const enviado = s.enviados[0]!
  expect(enviado.asUser).toBe(true) // como si lo escribiera el abogado
  expect(enviado.text).toContain('Redáctame una carta al cliente.')
  expect(enviado.text).toContain('Cliente: López (expediente 0456/2026) · Impago de rentas de un local.')
  expect(enviado.text).toContain(`«Demanda de desahucio · López» (Demanda de desahucio), en ${DOCX}`)
  expect(enviado.text).toContain('Ficha del expediente: procedimiento Juicio verbal por razón de la materia')
  expect(enviado.text).toContain('cuantía 14.400 € · procurador D. Luis Pérez García')
  expect(enviado.text).toContain('No me hagas preguntas')
  expect(s.memoria['siguientes-historial']).toEqual({ 'demanda-desahucio': { 'carta-cliente': 1 } })
  expect(s.cerrados).toContain('siguientes')
})

test('Mod 10: lo que eliges otras veces sube puestos aunque el modelo falle', { timeoutMs: 20_000 }, async ($, on) => {
  const reloj = mock.clock(on, { now: AHORA })
  const s = escena(on)
  s.memoria['siguientes-historial'] = { 'demanda-desahucio': { 'proposicion-prueba-verbal': 2 } }
  await $.session.start({ cwd: '/demo/expedientes/lopez', surface: 'terminal', isInteractive: false })
  await terminarEscrito($, 't1')
  await reloj.advance(100)
  expect((await botonesDelPanel($))[0]).toBe('Escrito de proposición de prueba')
  // El historial también llega al modelo.
  expect(String(s.llamadasModelo[0]!.prompt)).toContain('proposicion-prueba-verbal (2 veces)')
})

test('Mod 10: «Ninguno», un mensaje nuevo o «Que lo ataque el contrario» retiran el panel', { timeoutMs: 20_000 }, async ($, on) => {
  const reloj = mock.clock(on, { now: AHORA })
  const s = escena(on)
  await $.session.start({ cwd: '/demo/expedientes/lopez', surface: 'terminal', isInteractive: false })
  const visible = async () => {
    const ui = await $.ui.mount({ ...BANDA, surface: 'terminal' })
    const b = await ui.find({ key: 'siguientes-abrir' })
    await ui.unmount()
    return b !== undefined
  }
  await terminarEscrito($, 't1')
  await reloj.advance(100)
  const p = await $.ui.mount({ ...PANEL, surface: 'terminal' })
  await p.press({ key: 'siguientes-ninguno' })
  await p.unmount()
  expect(await visible()).toBe(false)

  await terminarEscrito($, 't2')
  expect(await visible()).toBe(true)
  await $.turn.start({ text: 'Otra cosa', turnId: 't3' })
  expect(await visible()).toBe(false)
  await $.turn.complete({ answer: 'Vale.', durationMs: 1, isAborted: false, turnId: 't3', reason: 'answer' })

  await terminarEscrito($, 't4')
  await reloj.advance(100)
  const p2 = await $.ui.mount({ ...PANEL, surface: 'terminal' })
  await p2.press({ key: 'siguientes-contrario' })
  await p2.unmount()
  expect(s.enviados.some(x => x.text.includes('Atacar el escrito como la parte contraria'))).toBe(true)
  expect(await visible()).toBe(false)
  expect(await $.command.run(comando('siguientes', ''))).toEqual({ text: 'No hay siguientes pasos pendientes: aparecen al terminar un escrito.' })
})
