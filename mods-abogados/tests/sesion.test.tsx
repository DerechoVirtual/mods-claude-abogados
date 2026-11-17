// Pruebas de la regla de Carlos (09/11/2026): «cuando no esté trabajando con
// clientes ni con escritos judiciales, no debería aparecer». El cliente es de
// cada sesión y la banda solo sale en una sesión jurídica.

import { expect, test } from 'claude-code/testing'
import type { On } from 'claude-code'

const AHORA = Date.UTC(2026, 10, 9, 10, 0, 0)
const CLIENTES = {
  clientes: [
    { nombre: 'García', expediente: '0123/2026', jurisdiccion: 'civil', carpeta: '/demo/expedientes/garcia', color: '#2F6FED' },
    { nombre: 'López', expediente: '0456/2026', jurisdiccion: 'civil', carpeta: '/demo/expedientes/lopez', color: '#C2389E' },
  ],
}
const PLAZOS = {
  plazos: [{ id: 'p1', asunto: 'Comunidad Calle Imaginaria 12', tipo: 'Recurso de reposición', jurisdiccion: 'civil', notificacion: '2026-11-03', dias: 5 }],
  papelera: [],
}
const BANDA = {
  plugin: 'mods-abogados',
  component: 'AbovePrompt',
  props: { hasSurvey: false, isWorking: false, maxRows: 12, bodyColumns: 120, scroll: { offset: 0, bodyRows: 12 }, view: {} },
} as const
const comando = (command: string, args: string) =>
  ({ command, args, origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 } }) as const
const PLUGIN = ['data/plazos.json', 'data/cliente-activo.json', 'data/cupo.json', 'data/fichas.json', 'config/clientes.json']
const sinUnidad = (ruta: string) => ruta.replace(/\\/g, '/').replace(/^[A-Za-z]:(?=\/)/, '')
const claveDe = (ruta: string) => PLUGIN.find(k => sinUnidad(ruta).endsWith('/' + k)) ?? sinUnidad(ruta)

type Escena = { avisos: string[]; fondos: unknown[] }

function escena(on: On): Escena {
  const s: Escena = { avisos: [], fondos: [] }
  const archivos: Record<string, string> = {
    'data/plazos.json': JSON.stringify(PLAZOS),
    'config/clientes.json': JSON.stringify(CLIENTES),
    // El archivo común de antes: ya no se usa para elegir el cliente de una sesión nueva.
    'data/cliente-activo.json': JSON.stringify({ nombre: 'García', expediente: '0123/2026' }),
  }
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('command.register', () => ({ value: { command: 'x' } }))
  on('clock.now', () => ({ value: AHORA }))
  on('fs.exists', (_$, e) => ({ value: claveDe(e.path) in archivos }))
  on('fs.read', (_$, e) => (claveDe(e.path) in archivos ? { value: archivos[claveDe(e.path)]! } : { deny: 'no existe' }))
  on('fs.write', (_$, e) => {
    archivos[claveDe(e.path)] = e.text
    return { value: undefined }
  })
  on('ui.toast', (_$, e) => {
    s.avisos.push(e.text)
    return { value: undefined }
  })
  on('ui.backdrop', (_$, e) => {
    s.fondos.push(e)
    return { value: { isDrawn: false, reason: 'prueba' } }
  })
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.panes', () => ({ value: [] }))
  on('session.messages', () => ({ value: [] }))
  on('turn.start', (_$, e) => ({ turnId: e.turnId }))
  on('turn.complete', (_$, e) => ({ text: e.answer }))
  on('tool.call', () => ({ result: 'ok', text: 'contenido ficticio' }))
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>[motor]</Text>
  })
  return s
}

type Kit = Parameters<import('claude-code/testing').TestBody>[0]

async function banda($: Kit) {
  const ui = await $.ui.mount({ ...BANDA, surface: 'terminal' })
  const cliente = (await ui.find({ type: 'Text', text: /● / }))?.text ?? null
  const plazo = (await ui.find({ type: 'Text', text: /⏳/ }))?.text ?? null
  const motor = !!(await ui.find({ type: 'Text', text: /\[motor\]/ }))
  await ui.unmount()
  return { cliente, plazo, motor }
}

test('Sesión: en una sesión de otra cosa (marketing) no sale nada del despacho', { timeoutMs: 20_000 }, async ($, on) => {
  const s = escena(on)
  await $.session.start({ cwd: '/marketing/black-friday', surface: 'terminal', isInteractive: false })
  expect(await banda($)).toEqual({ cliente: null, plazo: null, motor: true }) // lo de otros mods sigue
  expect(s.avisos.some(a => a.includes('⏳'))).toBe(false) // ni el aviso de plazos al empezar
  expect(s.fondos.some(f => !!f && typeof f === 'object' && 'id' in f)).toBe(false) // ni el fondo de color del cliente
  // Una tarea de marketing que no toca expedientes no cambia nada.
  await $.tool.call({ tool: 'Write', file_path: '/marketing/black-friday/landing.md', content: 'Oferta' } as never)
  expect((await banda($)).plazo).toBe(null)
})

test('Sesión: abierta dentro de la carpeta de un expediente, ese es el cliente', { timeoutMs: 20_000 }, async ($, on) => {
  escena(on)
  await $.session.start({ cwd: '/demo/expedientes/garcia', surface: 'terminal', isInteractive: false })
  const b = await banda($)
  expect(b.cliente).toContain('● García · 0123/2026')
  // Con cliente activo, la banda solo enseña SUS plazos: García no tiene ninguno, y el de
  // la Comunidad (otro cliente) no sale (en la grabación salía el vencido de otro asunto).
  expect(b.plazo).toBe(null)
})

test('Sesión: si Claude trabaja en la carpeta de un cliente, pasa a ser el cliente de esta sesión', { timeoutMs: 20_000 }, async ($, on) => {
  const s = escena(on)
  await $.session.start({ cwd: '/demo', surface: 'terminal', isInteractive: false })
  expect((await banda($)).cliente).toBe(null)
  const r = await $.tool.call({ tool: 'Read', file_path: '/demo/expedientes/lopez/contrato.md' } as never)
  expect(r.result).toBe('ok') // la llamada no se toca
  expect((await banda($)).cliente).toContain('● López')
  expect(s.avisos.some(a => a.includes('Cliente de esta sesión: López'))).toBe(true)
  // /cliente-ninguno lo quita; la sesión sigue siendo jurídica (se ven los plazos).
  await $.command.run(comando('cliente-ninguno', ''))
  const b = await banda($)
  expect(b.cliente).toBe(null)
  expect(b.plazo).toContain('Comunidad')
})

test('Sesión: consultar Jurisprudenciator o usar un comando del plugin la convierte en jurídica', { timeoutMs: 20_000 }, async ($, on) => {
  escena(on)
  await $.session.start({ cwd: '/marketing', surface: 'terminal', isInteractive: false })
  expect((await banda($)).plazo).toBe(null)
  await $.tool.call({ tool: 'mcp__6fa064c5-f0dd__buscar_articulo', ley: 'LEC', articulo: '22' } as never)
  expect((await banda($)).plazo).toContain('Comunidad')
})

test('Sesión: un comando del plugin también cuenta como trabajo jurídico', { timeoutMs: 20_000 }, async ($, on) => {
  escena(on)
  await $.session.start({ cwd: '/marketing', surface: 'terminal', isInteractive: false })
  await $.command.run(comando('citas', ''))
  expect((await banda($)).plazo).toContain('Comunidad')
})
