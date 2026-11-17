// Pruebas del Mod 9 (copia anonimizada con Anonimizator). El conector se
// simula: estas pruebas comprueban qué manda el mod, cuándo y qué guarda, no
// la calidad de la anonimización, que es cosa de Anonimizator.

import { expect, mock, test, type TestBody } from 'claude-code/testing'
import type { On } from 'claude-code'
import {
  buscarAnonimizator,
  carpetaRedaccionDeSeccion,
  detectarDatosPersonales,
  huella,
  leerRespuesta,
  rutaAnonimizada,
  rutaEscritoMd,
  textoRecuento,
} from '../hooks/lib/anonimizar'

// ── Funciones puras ─────────────────────────────────────────────────────────

test('Anonimizar: detecta datos personales sin IA (solo para decidir si se actúa)', () => {
  const d = detectarDatosPersonales(
    'DON ANDRÉS LÓPEZ FICTICIO, con DNI 00000001R y NIE X1234567L, cuenta ES91 2100 0418 4502 0005 1332, ' +
      'teléfono 612 345 678, correo andres@ejemplo.es. Contra D.ª Lucía Inventada Soler.',
  )
  expect(d.porTipo).toEqual({ DNI: 1, NIE: 1, 'cuenta bancaria': 1, teléfono: 1, correo: 1, nombre: 2 })
  expect(d.total).toBe(7)
  // Letras de control falsas, cuantías y placeholders no cuentan.
  expect(detectarDatosPersonales('DNI 12345678A, cuantía de 14.400 € y renta de 1.200 €, D./D.ª [PROCURADOR/A], art. 250.1.1.º LEC').total).toBe(0)
  expect(textoRecuento(d)).toBe('2 nombres, 1 DNI, 1 NIE, 1 cuenta bancaria, 1 teléfono y 1 correo')
})

test('Anonimizar: reconoce el conector por sus herramientas, no por «estado»', () => {
  const remoto = buscarAnonimizator([
    { name: 'mcp__6fa064c5-f0dd__estado', mcp: true },
    { name: 'mcp__claude_ai_Anonimizator__anonimizar_texto', mcp: true },
  ])
  expect(remoto).toEqual({ remoto: { servidor: 'claude_ai_Anonimizator', herramienta: 'anonimizar_texto' }, local: null })
  expect(buscarAnonimizator([{ name: 'mcp__anonimizator__anonimizar_documento', mcp: true }]).local?.servidor).toBe('anonimizator')
  expect(buscarAnonimizator([{ name: 'mcp__6fa064c5-f0dd__estado', mcp: true }, { name: 'Read', mcp: false }])).toEqual({ remoto: null, local: null })
})

test('Anonimizar: encuentra el texto del escrito ensamblado aunque la salida venga filtrada', () => {
  const docx = '--salida "C:/exp/lopez/demanda.docx"'
  expect(rutaEscritoMd('python escrito.py ensamblar . ' + docx, '{"ok": true, "escrito": "C:\\\\exp\\\\lopez\\\\redaccion\\\\d\\\\escrito.md"}', null)).toBe('C:/exp/lopez/redaccion/d/escrito.md')
  expect(rutaEscritoMd(`python escrito.py ensamblar "C:/exp/lopez/redaccion/d" ${docx} | grep ok`, '"ok": true', null)).toBe('C:/exp/lopez/redaccion/d/escrito.md')
  expect(rutaEscritoMd(`cd "C:/exp/lopez/redaccion/d" && python escrito.py ensamblar "." ${docx}`, '"ok": true', null)).toBe('C:/exp/lopez/redaccion/d/escrito.md')
  expect(rutaEscritoMd(`python escrito.py ensamblar . ${docx}`, '"ok": true', 'C:/exp/lopez/redaccion/d')).toBe('C:/exp/lopez/redaccion/d/escrito.md')
  expect(rutaEscritoMd(`python escrito.py ensamblar . ${docx}`, '"ok": true', null)).toBe(null)
  expect(carpetaRedaccionDeSeccion('C:\\exp\\lopez\\redaccion\\d\\secciones\\01-hechos.md')).toBe('C:/exp/lopez/redaccion/d')
  expect(rutaAnonimizada('C:/exp/lopez/redaccion/d/escrito.md')).toBe('C:/exp/lopez/redaccion/d/escrito.ANONIMIZADO.md')
  expect(rutaAnonimizada('C:/exp/lopez/demanda.docx')).toBe('C:/exp/lopez/demanda.ANONIMIZADO.docx')
  expect(huella('abc')).toBe(huella('abc'))
  expect(huella('abc')).not.toBe(huella('abd'))
})

test('Anonimizar: lee las respuestas de Anonimizator y explica los errores en llano', () => {
  const texto = (t: string, isError = false) => ({ content: [{ type: 'text', text: t }], isError })
  expect(leerRespuesta(texto(JSON.stringify({ texto_anonimizado: '[ACTOR_1]', total: 3 })))).toEqual({ ok: true, total: 3, texto: '[ACTOR_1]' })
  expect(leerRespuesta(texto(JSON.stringify({ veredicto: 'LIMPIO', total: 0 })))).toEqual({ ok: true, total: 0, veredicto: 'LIMPIO' })
  expect(leerRespuesta(texto(JSON.stringify({ resultado: 'C:\\exp\\d.ANONIMIZADO.docx', total: 4, revisarManualmente: 0 })))).toEqual({
    ok: true,
    total: 4,
    veredicto: 'LIMPIO',
    copia: 'C:/exp/d.ANONIMIZADO.docx',
  })
  const plan = leerRespuesta(texto('MCP error -32002: El plan gratuito incluye 3 documentos diarios…', true))
  expect(plan).toEqual({ ok: false, mensaje: 'Tu plan de Anonimizator no incluye el conector: hace falta un plan de pago (anonimizator.org).' })
  expect(leerRespuesta(texto('Enlace no válido. Copia de nuevo tu URL personal', true)).ok).toBe(false)
})

// ── Recorrido completo ──────────────────────────────────────────────────────

const AHORA = Date.UTC(2026, 10, 9, 10, 0, 0)
const CARPETA = '/demo/expedientes/lopez/redaccion/demanda-x'
const MD = `${CARPETA}/escrito.md`
const COPIA = `${CARPETA}/escrito.ANONIMIZADO.md`
const DOCX = '/demo/expedientes/lopez/demanda-de-desahucio-lopez-20261109.docx'
const TEXTO = 'DON ANDRÉS LÓPEZ FICTICIO, con DNI 00000001R, formula DEMANDA contra TALLERES INVENTADOS, S.L.'
const ENSAMBLAR = `cd "${CARPETA}" && python escrito.py ensamblar "." --salida "${DOCX}" --palabras 3150 | grep -E "ok|errores"`
const BANDA = {
  plugin: 'mods-abogados',
  component: 'AbovePrompt',
  props: { hasSurvey: false, isWorking: false, maxRows: 12, bodyColumns: 140, scroll: { offset: 0, bodyRows: 12 }, view: {} },
} as const
const comando = (command: string, args: string) =>
  ({ command, args, origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 } }) as const
const PLUGIN = ['data/plazos.json', 'data/cliente-activo.json', 'data/cupo.json', 'data/fichas.json', 'config/clientes.json']
/** Windows convierte «/demo/…» en «C:\demo\…»: se compara sin la letra de unidad. */
const sinUnidad = (ruta: string) => ruta.replace(/\\/g, '/').replace(/^[A-Za-z]:(?=\/)/, '')
const claveDe = (ruta: string) => PLUGIN.find(k => sinUnidad(ruta).endsWith('/' + k)) ?? sinUnidad(ruta)

const REMOTO = { name: 'mcp__claude_ai_Anonimizator__anonimizar_texto', description: '', mcp: true }
const LOCAL = { name: 'mcp__anonimizator__anonimizar_documento', description: '', mcp: true }
const JURIS = { name: 'mcp__6fa064c5-f0dd__estado', description: '', mcp: true }

type Kit = Parameters<TestBody>[0]

type Llamada = { server: string; tool: string; args: Record<string, unknown> }
type Escena = {
  archivos: Record<string, string>
  escritos: Record<string, string>
  avisos: string[]
  enviados: string[]
  llamadas: Llamada[]
  herramientas: { name: string; description: string; mcp: boolean }[]
  respuesta: (l: Llamada) => { content: { type: string; text: string }[]; isError: boolean }
}

function escena(on: On, texto = TEXTO): Escena {
  const s: Escena = {
    archivos: { 'data/plazos.json': JSON.stringify({ plazos: [], papelera: [] }), [MD]: texto },
    escritos: {},
    avisos: [],
    enviados: [],
    llamadas: [],
    herramientas: [JURIS, REMOTO],
    respuesta: l => {
      const json = (o: unknown) => ({ content: [{ type: 'text', text: JSON.stringify(o) }], isError: false })
      if (l.tool === 'anonimizar_texto') return json({ texto_anonimizado: '[ACTOR_1], con DNI [DNI_1], formula DEMANDA contra [EMPRESA_1].', total: 3 })
      if (l.tool === 'verificar_anonimizado') return json({ veredicto: 'LIMPIO', total: 0 })
      return json({ origen: DOCX, resultado: DOCX.replace('.docx', '.ANONIMIZADO.docx'), total: 4, revisarManualmente: 0 })
    },
  }
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('command.register', () => ({ value: { command: 'x' } }))
  on('fs.exists', (_$, e) => ({ value: claveDe(e.path) in s.archivos }))
  on('fs.read', (_$, e) => (claveDe(e.path) in s.archivos ? { value: s.archivos[claveDe(e.path)]! } : { deny: 'no existe' }))
  on('fs.write', (_$, e) => {
    s.escritos[claveDe(e.path)] = e.text
    s.archivos[claveDe(e.path)] = e.text
    return { value: undefined }
  })
  on('ui.toast', (_$, e) => {
    s.avisos.push(e.text)
    return { value: undefined }
  })
  on('prompt.submit', (_$, e) => {
    s.enviados.push(e.text)
    return { text: e.text }
  })
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.panes', () => ({ value: [] }))
  on('ui.backdrop', () => ({ value: { isDrawn: false, reason: 'prueba' } }))
  on('session.messages', () => ({ value: [] }))
  on('turn.start', (_$, e) => ({ turnId: e.turnId }))
  on('turn.complete', (_$, e) => ({ text: e.answer }))
  on('tool.list', () => ({ value: s.herramientas }))
  on('mcp.call', (_$, e) => {
    const l = { server: e.server, tool: e.tool, args: e.args }
    s.llamadas.push(l)
    return { value: s.respuesta(l) }
  })
  on('tool.call', (_$, e) =>
    String(e.tool) === 'Bash' ? { result: 'ok', text: ' "ok": true,\n "errores": [],\n "pendientes": []' } : { result: 'ok', text: 'hecho' },
  )
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>[motor]</Text>
  })
  return s
}

/** Un turno en que se escribe una sección (subagente) y se ensambla el Word. */
async function redactar($: Kit, turnId: string) {
  await $.turn.start({ text: 'Redacta la demanda', turnId })
  await $.tool.call({ tool: 'Write', file_path: `${CARPETA}/secciones/01-hechos.md`, content: 'x', agentId: 'redactor-1' } as never)
  await $.tool.call({ tool: 'Bash', command: ENSAMBLAR } as never)
  await $.turn.complete({ answer: 'Listo.', durationMs: 1000, isAborted: false, turnId, reason: 'answer' })
}

/**
 * Lo que la banda dice de Anonimizator con la fila de acción libre: al terminar
 * un escrito esa fila la ocupan «Siguientes pasos» y el contrario (y entonces
 * Anonimizator es una pastilla corta arriba); se apartan con «Ahora no».
 */
async function textoBanda($: Kit) {
  const ui = await $.ui.mount({ ...BANDA, surface: 'terminal' })
  for (const key of ['siguientes-ahora-no', 'contrario-ahora-no']) if (await ui.find({ key })) await ui.press({ key })
  const t = (await ui.find({ type: 'Text', text: /🔒/ }))?.text ?? null
  await ui.unmount()
  return t
}

/** La pastilla corta de Anonimizator mientras la fila de acción está ocupada, y cuántas filas pone el plugin. */
async function pastillaBanda($: Kit) {
  const ui = await $.ui.mount({ ...BANDA, surface: 'desktop' })
  const pastilla = (await ui.find({ type: 'Text', text: /🔒/ }))?.text ?? String((await ui.find({ type: 'Button', text: /🔒/ }))?.props.label ?? '')
  const arbol = (await ui.drawn()) as unknown as { children?: unknown[] }
  await ui.unmount()
  return { pastilla, filas: (arbol.children?.length ?? 1) - 1 } // menos lo que dibuja el motor debajo
}

test('Mod 9: apagado por defecto, no manda nada aunque el escrito tenga datos', { timeoutMs: 20_000 }, async ($, on) => {
  const reloj = mock.clock(on, { now: AHORA })
  const s = escena(on)
  await $.session.start({ cwd: '/demo', surface: 'terminal', isInteractive: false })
  await redactar($, 't1')
  await reloj.advance(200)
  expect(s.llamadas).toHaveLength(0)
  expect(await textoBanda($)).toBe(null)
})

test('Mod 9: con el conector de URL personal guarda una copia anonimizada al lado y no toca el original', { timeoutMs: 20_000, options: { mod_anonimizar: true } }, async ($, on) => {
  const reloj = mock.clock(on, { now: AHORA })
  const s = escena(on)
  await $.session.start({ cwd: '/demo', surface: 'terminal', isInteractive: false })
  await redactar($, 't1')
  expect(s.llamadas).toHaveLength(0) // nada durante el turno: se hace después
  await reloj.advance(200)

  expect(s.llamadas.map(l => l.tool)).toEqual(['anonimizar_texto', 'verificar_anonimizado'])
  expect(s.llamadas[0]).toEqual({ server: 'claude_ai_Anonimizator', tool: 'anonimizar_texto', args: { texto: TEXTO, modo: 'token', conservar_fechas: true } })
  expect(s.escritos[COPIA]).toContain('[ACTOR_1]')
  expect(s.escritos[MD]).toBeUndefined() // el original no se toca
  expect(s.archivos[MD]).toBe(TEXTO)
  // Con todo a la vez (botón del contrario y copia anonimizada), dos filas como mucho: la
  // fila de acción es del contrario y la copia anonimizada es una pastilla corta arriba.
  const junto = await $.ui.mount({ ...BANDA, surface: 'desktop' })
  expect(await junto.find({ key: 'contrario-atacar' })).toBeDefined()
  expect(((await junto.drawn()) as unknown as { children?: unknown[] }).children?.length).toBeLessThanOrEqual(3)
  await junto.unmount()
  expect(await pastillaBanda($)).toEqual({ pastilla: '🔒 Copia anonimizada ✓', filas: 2 })
  // Con la fila de acción libre («Ahora no»), el aviso entero con su botón.
  expect(await textoBanda($)).toBe('🔒 Copia anonimizada: 3 datos · verificada')
  // Ningún aviso muestra un dato personal.
  expect(s.avisos.some(a => /00000001R|ANDRÉS/.test(a))).toBe(false)

  // «Word anonimizado»: Claude trabaja solo con la copia.
  const ui = await $.ui.mount({ ...BANDA, surface: 'desktop' })
  await ui.press({ key: 'anonimizar-word' })
  await ui.unmount()
  expect(s.enviados[0]).toContain(COPIA)
  expect(s.enviados[0]).toContain('no abras el original')
  expect(s.enviados[0]).toContain('demanda-de-desahucio-lopez-20261109.ANONIMIZADO.docx')

  // El mismo escrito otra vez (bucle de correcciones): no se vuelve a mandar.
  await redactar($, 't2')
  await reloj.advance(200)
  expect(s.llamadas).toHaveLength(2)
})

test('Mod 9: sin el conector, lo dice con los pasos y no manda nada', { timeoutMs: 20_000, options: { mod_anonimizar: true } }, async ($, on) => {
  const reloj = mock.clock(on, { now: AHORA })
  const s = escena(on)
  s.herramientas = [JURIS]
  await $.session.start({ cwd: '/demo', surface: 'terminal', isInteractive: false })
  await redactar($, 't1')
  await reloj.advance(200)
  expect(s.llamadas).toHaveLength(0)
  // El aviso emergente es UNA frase corta (antes era un párrafo con todos los pasos).
  const aviso = s.avisos.find(a => a.includes('datos personales')) ?? ''
  expect(aviso).toContain('/anonimizar')
  expect(aviso.length).toBeLessThan(110)
  expect(aviso).not.toContain('Ajustes')
  // En la banda, una pastilla que se pulsa y cuenta cómo conectarlo.
  expect(await pastillaBanda($)).toEqual({ pastilla: '🔒 Conectar Anonimizator', filas: 2 })
  expect(await textoBanda($)).toContain('Datos personales sin anonimizar')
  const banda = await $.ui.mount({ ...BANDA, surface: 'terminal' })
  await banda.press({ key: 'anonimizar-como' })
  await banda.unmount()
  expect(s.avisos.some(a => a.includes('anonimizator.org/conector') && a.includes('plan de pago'))).toBe(true)
  const r = await $.command.run(comando('anonimizar', ''))
  expect(r.text).toContain('No tienes conectado Anonimizator')
})

test('Mod 9: sin plan de pago, el error sale en palabras sencillas', { timeoutMs: 20_000, options: { mod_anonimizar: true } }, async ($, on) => {
  const reloj = mock.clock(on, { now: AHORA })
  const s = escena(on)
  s.respuesta = () => ({ content: [{ type: 'text', text: 'MCP error -32002: El plan gratuito incluye 3 documentos diarios.' }], isError: true })
  await $.session.start({ cwd: '/demo', surface: 'terminal', isInteractive: false })
  await redactar($, 't1')
  await reloj.advance(200)
  expect(await textoBanda($)).toBe('🔒 Tu plan de Anonimizator no incluye el conector: hace falta un plan de pago (anonimizator.org).')
  expect(s.escritos[COPIA]).toBeUndefined()
})

test('Mod 9: con el conector local, el Word se anonimiza en el ordenador', { timeoutMs: 20_000, options: { mod_anonimizar: true } }, async ($, on) => {
  const reloj = mock.clock(on, { now: AHORA })
  const s = escena(on)
  s.herramientas = [JURIS, REMOTO, LOCAL]
  await $.session.start({ cwd: '/demo', surface: 'terminal', isInteractive: false })
  await redactar($, 't1')
  await reloj.advance(200)
  expect(s.llamadas).toEqual([{ server: 'anonimizator', tool: 'anonimizar_documento', args: { ruta: DOCX, modo: 'token' } }])
  expect(await textoBanda($)).toBe('🔒 Copia anonimizada del Word: 4 datos · verificada')
})

test('Mod 9: sin datos personales en el escrito no se manda nada', { timeoutMs: 20_000, options: { mod_anonimizar: true } }, async ($, on) => {
  const reloj = mock.clock(on, { now: AHORA })
  const s = escena(on, 'La demandada debe la renta de agosto a noviembre de 2026, según el art. 27.2.a LAU.')
  await $.session.start({ cwd: '/demo', surface: 'terminal', isInteractive: false })
  await redactar($, 't1')
  await reloj.advance(200)
  expect(s.llamadas).toHaveLength(0)
  expect(await textoBanda($)).toBe(null)
})
