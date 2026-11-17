// Pruebas de interfaz con el kit oficial (claude-code/testing): se carga el
// plugin, se disparan eventos como lo haría Claude Code y se dibuja la banda
// y los paneles en el terminal y en la app de escritorio. No hay sesión, ni
// archivos, ni red: los «stubs» responden en lugar de Claude Code.

import { expect, test } from 'claude-code/testing'
import type { On } from 'claude-code'

// 08/11/2026 a las 12:00 en Madrid.
const AHORA = Date.UTC(2026, 10, 8, 11, 0, 0)

const PLAZOS = {
  plazos: [
    { id: 'p1', asunto: 'García c. Aseguradora Ficticia', tipo: 'Contestación a la demanda', jurisdiccion: 'civil', notificacion: '2026-10-14', dias: 20, cliente: 'García' },
    { id: 'p2', asunto: 'López c. Talleres Inventados', tipo: 'Recurso de apelación', jurisdiccion: 'civil', notificacion: '2026-10-27', dias: 20, cliente: 'López' },
    { id: 'p3', asunto: 'Comunidad Calle Imaginaria 12', tipo: 'Recurso de reposición', jurisdiccion: 'civil', notificacion: '2026-11-02', dias: 5 },
  ],
  papelera: [],
}
const CLIENTES = {
  clientes: [
    { nombre: 'García', expediente: '0123/2026', carpeta: 'expedientes/garcia', color: '#2F6FED' },
    { nombre: 'López', expediente: '0456/2026', carpeta: 'expedientes/lopez', color: '#C2389E' },
  ],
}
const FESTIVOS = { festivos: [{ fecha: '2026-12-08', nombre: 'Inmaculada Concepción' }] }
const REVISOR = {
  herramientasVerificacion: ['buscar_por_cita', 'buscar_articulo'],
  leyes: [{ clave: 'CC', nombre: 'Código Civil', alias: ['CC', 'Código Civil'], maxArticulo: 1976 }],
}

const BANDA = {
  plugin: 'mods-abogados',
  component: 'AbovePrompt',
  props: { hasSurvey: false, isWorking: false, maxRows: 12, bodyColumns: 110, scroll: { offset: 0, bodyRows: 12 }, view: {} },
} as const

/** Como si la persona escribiera el comando en el prompt. */
const comando = (command: string, args: string) =>
  ({ command, args, origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 } }) as const

const panel = (id: string) =>
  ({
    plugin: 'mods-abogados',
    component: 'Pane',
    requestId: id,
    props: { title: id, isFocused: true, bodyColumns: 110, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} },
  }) as const

// Las claves son rutas RELATIVAS a la carpeta del plugin («data/plazos.json»):
// el plugin pide «<su carpeta real>/data/plazos.json» y aquí se busca el final.
function claveDe(ruta: string): string {
  const r = ruta.replace(/\\/g, '/')
  for (const k of ['data/plazos.json', 'data/cliente-activo.json', 'data/cupo.json', 'config/clientes.json', 'config/festivos.json', 'config/revisor.json', 'config/computo.json', 'config/cupo.json']) {
    if (r.endsWith('/' + k)) return k
  }
  return r
}

/** Responde en lugar de Claude Code: archivos en memoria, reloj, avisos e interfaz. */
function simularMotor(
  on: On,
  archivos: Record<string, string>,
  escritos: Record<string, string>,
  opciones: { avisos?: string[]; reloj?: { ms: number }; enviados?: string[] } = {},
) {
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('command.register', () => ({ value: { command: 'x' } }))
  on('clock.now', () => ({ value: opciones.reloj?.ms ?? AHORA }))
  on('prompt.submit', (_$, e) => {
    opciones.enviados?.push(e.text)
    return { text: e.text }
  })
  on('fs.exists', (_$, e) => ({ value: claveDe(e.path) in archivos }))
  on('fs.read', (_$, e) => {
    const k = claveDe(e.path)
    return k in archivos ? { value: archivos[k]! } : { deny: 'no existe' }
  })
  on('fs.write', (_$, e) => {
    const k = claveDe(e.path)
    escritos[k] = e.text
    archivos[k] = e.text
    return { value: undefined }
  })
  on('ui.toast', (_$, e) => {
    opciones.avisos?.push(e.text)
    return { value: undefined }
  })
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.panes', () => ({ value: [] }))
  on('ui.close', () => ({ value: undefined }))
  on('ui.backdrop', () => ({ value: { isDrawn: false, reason: 'prueba' } }))
  on('turn.start', (_$, e) => ({ turnId: e.turnId }))
  on('turn.complete', (_$, e) => ({ text: e.answer }))
  // Lo que Claude Code dibujaría debajo de la banda.
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>[motor]</Text>
  })
}

function archivosBase(): Record<string, string> {
  return {
    'data/plazos.json': JSON.stringify(PLAZOS),
    'config/clientes.json': JSON.stringify(CLIENTES),
    'config/festivos.json': JSON.stringify(FESTIVOS),
    'config/revisor.json': JSON.stringify(REVISOR),
  }
}

test('Mod 3: la pastilla muestra el plazo más próximo en rojo y el contador «+N más»', { timeoutMs: 20_000 }, async ($, on) => {
  simularMotor(on, archivosBase(), {})
  await $.session.start({ cwd: '/demo', surface: 'terminal', isInteractive: false })
  await $.command.run(comando('plazos', '')) // trabajo jurídico: desde aquí sale la banda
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...BANDA, surface })
    const fila = await ui.find({ type: 'Text', text: /Comunidad Calle Imaginaria 12/ })
    expect(fila?.text).toContain('lun 09/11')
    expect(fila?.text).toContain('1 día hábil')
    expect(fila?.props.color).toBe('error')
    expect((await ui.find({ type: 'Text', text: /\+2 más/ }))?.text).toContain('+2 más')
    // Lo que dibujan otros mods (o Claude Code) se conserva.
    expect((await ui.find({ type: 'Text', text: /\[motor\]/ }))?.text).toBe('[motor]')
    await ui.unmount()
  }
})

test('Mod 1: /plazo-nuevo con argumentos guarda el plazo y el panel lo dibuja', { timeoutMs: 20_000 }, async ($, on) => {
  const escritos: Record<string, string> = {}
  simularMotor(on, archivosBase(), escritos)
  await $.session.start({ cwd: '/demo', surface: 'terminal', isInteractive: false })

  const r = await $.command.run(comando('plazo-nuevo', 'Ruiz c. Villaejemplo | Demanda | contencioso | 03/11/2026 | 20'))
  expect(r.text).toContain('vence el 01/12/2026')
  expect(escritos['data/plazos.json']).toContain('Ruiz c. Villaejemplo')

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...panel('plazos'), surface })
    expect(await ui.find({ type: 'Text', text: /PLAZOS PROCESALES/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Ruiz c\. Villaejemplo/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Cálculo orientativo/ })).toBeDefined()
    // Pestaña «Calculadora»
    await ui.press({ key: 'pestana-calculadora' })
    await ui.input({ key: 'calc-notificacion', text: '04/12/2026', kind: 'change' })
    await ui.input({ key: 'calc-dias', text: '3', kind: 'change' })
    expect((await ui.find({ type: 'Text', text: /Vence el/ }))?.text).toContain('jue 10/12')
    expect(await ui.find({ type: 'Text', text: /no cuenta: festivo: Inmaculada/ })).toBeDefined()
    await ui.press({ key: 'pestana-plazos' })
    await ui.unmount()
  }
})

test('Mod 1: /plazo-borrar pide confirmación y guarda el borrado en la papelera', { timeoutMs: 20_000 }, async ($, on) => {
  const escritos: Record<string, string> = {}
  simularMotor(on, archivosBase(), escritos)
  await $.session.start({ cwd: '/demo', surface: 'terminal', isInteractive: false })
  const r = await $.command.run(comando('plazo-borrar', 'López'))
  expect(r.text).toContain('Confirma en el panel')
  const ui = await $.ui.mount({ ...panel('plazos'), surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: /¿Borrar este plazo\?/ })).toBeDefined()
  await ui.press({ key: 'confirmar-borrar' })
  const guardado = JSON.parse(escritos['data/plazos.json'] ?? '{}')
  expect(guardado.plazos.some((p: { id: string }) => p.id === 'p2')).toBe(false)
  expect(guardado.papelera.some((p: { id: string }) => p.id === 'p2')).toBe(true)
  await ui.unmount()
})

test('Mod 4: /cliente activa el color, la pastilla lo muestra y el aviso de expediente cruzado la sustituye sin tocar la llamada', { timeoutMs: 20_000 }, async ($, on) => {
  const escritos: Record<string, string> = {}
  simularMotor(on, archivosBase(), escritos)
  const vistas: unknown[] = []
  // Herramienta simulada: guarda lo que le llega para comprobar que no cambió.
  on('tool.call', (_$, e) => {
    vistas.push(e)
    return { result: 'contenido ficticio' }
  })
  await $.session.start({ cwd: '/demo', surface: 'terminal', isInteractive: false })

  const r = await $.command.run(comando('cliente', 'garcia'))
  expect(r.text).toContain('Cliente activo: García')

  // Antes de tocar nada: la pastilla del cliente con su color.
  const antes = await $.ui.mount({ ...BANDA, surface: 'terminal' })
  const chip = await antes.find({ type: 'Text', text: /● García · 0123\/2026/ })
  expect(chip?.props.backgroundColor).toBe('#2F6FED')
  await antes.unmount()

  const llamada = { tool: 'Read', file_path: '/demo/expedientes/lopez/contrato.md' } as const
  const resultado = await $.tool.call(llamada)
  expect(resultado.result).toBe('contenido ficticio')
  expect((vistas[0] as { file_path: string }).file_path).toBe('/demo/expedientes/lopez/contrato.md')

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...BANDA, surface })
    const aviso = await ui.find({ type: 'Text', text: /En García, tocando López/ })
    expect(aviso?.props.backgroundColor).toBe('warning')
    // El aviso ocupa el sitio del cliente: no añade filas.
    expect(await ui.find({ type: 'Text', text: /● García/ })).toBeUndefined()
    await ui.unmount()
  }

  // Un mensaje nuevo de la persona quita el aviso y vuelve la pastilla del cliente.
  await $.turn.start({ text: 'sigue', turnId: 't2' })
  const despues = await $.ui.mount({ ...BANDA, surface: 'terminal' })
  expect(await despues.find({ type: 'Text', text: /En García, tocando López/ })).toBeUndefined()
  expect(await despues.find({ type: 'Text', text: /● García/ })).toBeDefined()
  await despues.unmount()

  const fin = await $.command.run(comando('cliente-ninguno', ''))
  expect(fin.text).toContain('interfaz neutra')
})

test('Mod 2: tras un turno, la banda cuenta las citas y el panel explica cada una', { timeoutMs: 20_000 }, async ($, on) => {
  simularMotor(on, archivosBase(), {})
  on('tool.call', () => ({ result: 'ok', text: '1. STC 31/2010  |  ECLI:ES:TC:2010:31  |  28/06/2010  |  Pleno' }))
  on('session.messages', () => ({ value: [] }))
  await $.session.start({ cwd: '/demo', surface: 'terminal', isInteractive: false })

  await $.turn.start({ text: 'Redacta el fundamento', turnId: 't1' })
  await $.tool.call({ tool: 'mcp__jurisprudenciator__buscar_por_cita', cita: 'STC 31/2010' } as never)
  await $.turn.complete({
    answer: 'Según la STC 31/2010 y el art. 1902 CC, y también la STS 45/2031.',
    durationMs: 1000,
    isAborted: false,
    turnId: 't1',
    reason: 'answer',
  })

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...BANDA, surface })
    const fila = await ui.find({ type: 'Text', text: /§ 2 citas por verificar/ })
    expect(fila).toBeDefined()
    expect(fila?.props.color).toBe('error')
    await ui.unmount()

    const p = await $.ui.mount({ ...panel('citas'), surface })
    expect(await p.find({ type: 'Text', text: /Sale en una consulta de jurisprudencia de esta respuesta/ })).toBeDefined()
    expect(await p.find({ type: 'Text', text: /Año futuro \(2031\)/ })).toBeDefined()
    expect(await p.find({ key: 'pedir-verificacion' })).toBeDefined()
    await p.unmount()
  }
})

test('Mods 1 y 4: pestaña Festivos, formulario de nuevo plazo y selector de clientes se dibujan', { timeoutMs: 20_000 }, async ($, on) => {
  simularMotor(on, archivosBase(), {})
  await $.session.start({ cwd: '/demo', surface: 'terminal', isInteractive: false })
  for (const surface of ['terminal', 'desktop'] as const) {
    // Festivos y reglas de cómputo
    const p = await $.ui.mount({ ...panel('plazos'), surface })
    await p.press({ key: 'pestana-festivos' })
    expect(await p.find({ type: 'Text', text: /Inmaculada Concepción/ })).toBeDefined()
    expect(await p.find({ type: 'Text', text: /penal: agosto hábil/ })).toBeDefined()
    expect(await p.find({ type: 'Text', text: /LexNET.*desactivado/ })).toBeDefined()
    await p.press({ key: 'pestana-plazos' })
    // Formulario «Nuevo plazo» con vista previa en vivo
    await p.press({ key: 'nuevo' })
    await p.input({ key: 'campo-asunto', text: 'Prueba ficticia', kind: 'change' })
    await p.input({ key: 'campo-notificacion', text: '04/12/2026', kind: 'change' })
    await p.input({ key: 'campo-dias', text: '3', kind: 'change' })
    expect((await p.find({ type: 'Text', text: /Vencería el/ }))?.text).toContain('jue 10/12')
    await p.press({ key: 'cancelar' })
    await p.unmount()

    // Selector de clientes
    const c = await $.ui.mount({ ...panel('clientes'), surface })
    expect(await c.find({ type: 'Text', text: /SIN CLIENTE ACTIVO/ })).toBeDefined()
    expect(await c.find({ key: 'cliente-0' })).toBeDefined()
    await c.press({ key: 'cliente-nuevo-boton' })
    expect(await c.find({ key: 'cliente-nombre' })).toBeDefined()
    await c.press({ key: 'cliente-cancelar' })
    await c.unmount()
  }
})
