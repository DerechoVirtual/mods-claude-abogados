// Pruebas de interfaz de los Mods 5 (cupo de Jurisprudenciator) y 6 (que lo
// ataque el contrario), y de la regla de la banda: como mucho dos líneas.
// Mismo kit oficial (claude-code/testing) que interfaz.test.tsx: sin sesión,
// sin archivos reales y sin red.

import { expect, test } from 'claude-code/testing'
import type { On } from 'claude-code'

// 08/11/2026 a las 12:00 en Madrid.
const AHORA = Date.UTC(2026, 10, 8, 11, 0, 0)
const LEER = 'mcp__6fa064c5-f0dd__leer_sentencias'
const ARTICULO = 'mcp__6fa064c5-f0dd__buscar_articulo'

const PLAZOS = {
  plazos: [
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
const REVISOR = {
  herramientasVerificacion: ['buscar_por_cita', 'buscar_articulo'],
  leyes: [{ clave: 'CC', nombre: 'Código Civil', alias: ['CC', 'Código Civil'], maxArticulo: 1976 }],
}

const BANDA = {
  plugin: 'mods-abogados',
  component: 'AbovePrompt',
  props: { hasSurvey: false, isWorking: false, maxRows: 12, bodyColumns: 110, scroll: { offset: 0, bodyRows: 12 }, view: {} },
} as const

const comando = (command: string, args: string) =>
  ({ command, args, origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 } }) as const

const ARCHIVOS = ['data/plazos.json', 'data/cliente-activo.json', 'data/cupo.json', 'config/clientes.json', 'config/festivos.json', 'config/revisor.json', 'config/computo.json', 'config/cupo.json']
function claveDe(ruta: string): string {
  const r = ruta.replace(/\\/g, '/')
  return ARCHIVOS.find(k => r.endsWith('/' + k)) ?? r
}

type Opciones = { avisos?: string[]; reloj?: { ms: number }; enviados?: string[]; rellenos?: string[] }

/** Responde en lugar de Claude Code: archivos en memoria, reloj, avisos e interfaz. */
function simularMotor(on: On, archivos: Record<string, string>, escritos: Record<string, string>, opciones: Opciones = {}) {
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('command.register', () => ({ value: { command: 'x' } }))
  on('clock.now', () => ({ value: opciones.reloj?.ms ?? AHORA }))
  on('prompt.submit', (_$, e) => {
    opciones.enviados?.push(e.text)
    return { text: e.text }
  })
  on('prompt.fill', (_$, e) => {
    opciones.rellenos?.push(e.text)
    return { isFilled: true }
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
  on('session.messages', () => ({ value: [] }))
  on('turn.start', (_$, e) => ({ turnId: e.turnId }))
  on('turn.complete', (_$, e) => ({ text: e.answer }))
  // Lo que Claude Code (u otro mod) dibujaría debajo de la banda.
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>[motor]</Text>
  })
}

function archivosBase(): Record<string, string> {
  return {
    'data/plazos.json': JSON.stringify(PLAZOS),
    'config/clientes.json': JSON.stringify(CLIENTES),
    'config/festivos.json': JSON.stringify({ festivos: [] }),
    'config/revisor.json': JSON.stringify(REVISOR),
  }
}

const finTurno = (turnId: string, answer = 'Listo.') =>
  ({ answer, durationMs: 1000, isAborted: false, turnId, reason: 'answer' }) as const

// ── Mod 5 · Cupo de Jurisprudenciator ───────────────────────────────────────

test('Mod 5: cuenta las lecturas de los subagentes, avisa antes de agotar y corrige un límite que no era el real', { timeoutMs: 20_000 }, async ($, on) => {
  const escritos: Record<string, string> = {}
  const avisos: string[] = []
  const reloj = { ms: AHORA }
  simularMotor(on, archivosBase(), escritos, { avisos, reloj })
  on('tool.call', () => ({ result: 'ok', text: '=== STS 1/2020  |  ECLI:ES:TS:2020:1 ===\nTexto de la sentencia…' }))
  await $.session.start({ cwd: '/demo', surface: 'terminal', isInteractive: false })

  // Dos redactores (subagentes) leen 3 sentencias cada uno; luego, dos artículos.
  await $.tool.call({ tool: LEER, citas: 'STS 1/2020, STS 2/2020, STS 3/2020', agentId: 'redactor-1' } as never)
  await $.tool.call({ tool: LEER, citas: 'STS 4/2020, STS 5/2020, STS 6/2020', agentId: 'redactor-2' } as never)
  await $.tool.call({ tool: ARTICULO, ley: 'LEC', articulo: '22', agentId: 'redactor-3' } as never)
  await $.tool.call({ tool: ARTICULO, ley: 'LEC', articulo: '437' } as never)
  await $.tool.call({ tool: 'mcp__6fa064c5-f0dd__buscar_sentencias', query: 'desahucio' } as never) // no gasta

  const cuenta = JSON.parse(escritos['data/cupo.json'] ?? '{}')
  expect(cuenta.usadoDia).toBe(7)
  expect(avisos.some(a => a.includes('quedan 3 de 10 lecturas hoy'))).toBe(true)

  const ui = await $.ui.mount({ ...BANDA, surface: 'terminal' })
  expect((await ui.find({ type: 'Text', text: /Quedan 3\/10 hoy/ }))?.props.color).toBe('warning')
  await ui.unmount()

  // Una lectura de 4 sentencias no cabe en las 3 que quedan: aviso ANTES de hacerla.
  avisos.length = 0
  reloj.ms += 60_000
  await $.tool.call({ tool: LEER, citas: 'STS 7/2020; STS 8/2020; STS 9/2020; STS 10/2020' } as never)
  expect(avisos.some(a => a.includes('esta consulta gasta 4 y hoy solo quedan 3'))).toBe(true)
  // Jurisprudenciator siguió respondiendo con 11: el límite de 10 no era el real.
  expect(avisos.some(a => a.includes('tu cupo diario es mayor que 10'))).toBe(true)
  const corregida = JSON.parse(escritos['data/cupo.json'] ?? '{}')
  expect(corregida.limites.diario).toBe(null)
  expect(corregida.limites.origen).toContain('superado')
  const ui2 = await $.ui.mount({ ...BANDA, surface: 'terminal' })
  expect(await ui2.find({ type: 'Text', text: /Quedan/ })).toBeUndefined() // sin avisos falsos
  await ui2.unmount()
})

test('Mod 5: el aviso «cupo agotado» se apunta y /cupo lo explica y permite fijar los límites', { timeoutMs: 20_000 }, async ($, on) => {
  const escritos: Record<string, string> = {}
  simularMotor(on, archivosBase(), escritos)
  on('tool.call', () => ({
    result: 'error',
    text: 'Has agotado el cupo de lectura de hoy. Tu plan Gratis incluye 10 sentencias al día y 30 a la semana; mejora tu plan para seguir.',
    isError: true,
  }))
  await $.session.start({ cwd: '/demo', surface: 'terminal', isInteractive: false })
  await $.tool.call({ tool: LEER, citas: 'STS 1/2020' } as never)

  const cuenta = JSON.parse(escritos['data/cupo.json'] ?? '{}')
  expect(cuenta.agotadoDia).toBe(true)
  expect(cuenta.limites.origen).toBe('Jurisprudenciator')

  const ui = await $.ui.mount({ ...BANDA, surface: 'desktop' })
  expect((await ui.find({ type: 'Text', text: /Cupo agotado hoy/ }))?.props.color).toBe('error')
  await ui.unmount()

  const ver = await $.command.run(comando('cupo', ''))
  expect(ver.text).toContain('AGOTADO según Jurisprudenciator')
  expect(ver.text).toContain('contado en este ordenador')
  const fijar = await $.command.run(comando('cupo', '20 60'))
  expect(fijar.text).toContain('de 20')
  expect(JSON.parse(escritos['data/cupo.json'] ?? '{}').limites).toEqual({ diario: 20, semanal: 60, origen: 'manual' })
  const mal = await $.command.run(comando('cupo', 'muchos'))
  expect(mal.text).toContain('Uso: /cupo')
})

// ── Mod 6 · Que lo ataque el contrario ──────────────────────────────────────

test('Mod 6: el botón del contrario solo aparece con el escrito terminado y envía la petición', { timeoutMs: 20_000 }, async ($, on) => {
  const enviados: string[] = []
  const rellenos: string[] = []
  simularMotor(on, archivosBase(), {}, { enviados, rellenos })
  const salida = { texto: '' }
  on('tool.call', () => ({ result: 'ok', text: salida.texto }))
  await $.session.start({ cwd: '/demo', surface: 'terminal', isInteractive: false })
  const ENSAMBLAR =
    'python "C:/plugins/redaccion-rapida/scripts/escrito.py" ensamblar "." --salida "C:/exp/lopez/demanda-de-desahucio-lopez-20261109.docx" --palabras 3150 | grep -E "ok|errores"'
  const boton = async () => {
    const ui = await $.ui.mount({ ...BANDA, surface: 'terminal' })
    const b = await ui.find({ key: 'contrario-atacar' })
    await ui.unmount()
    return b
  }

  // Turno 1: el ensamblado da errores → el escrito NO está terminado.
  await $.turn.start({ text: 'Redacta la demanda', turnId: 't1' })
  salida.texto = '{ "ok": false, "errores": ["cita sin leer en 03.md"], "pendientes": [] }'
  await $.tool.call({ tool: 'Bash', command: ENSAMBLAR } as never)
  await $.turn.complete(finTurno('t1'))
  expect(await boton()).toBeUndefined()

  // Turno 2: ensambla bien, pero el botón espera a que acabe el turno.
  await $.turn.start({ text: 'Corrige y entrega', turnId: 't2' })
  salida.texto = ' "ok": true,\n "errores": [],\n "pendientes": []'
  await $.tool.call({ tool: 'Bash', command: ENSAMBLAR } as never)
  expect(await boton()).toBeUndefined()
  await $.turn.complete(finTurno('t2'))
  expect(await boton()).toBeDefined()

  const ui = await $.ui.mount({ ...BANDA, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: /Escrito terminado: «Demanda de desahucio · López»/ })).toBeDefined()
  await ui.press({ key: 'contrario-atacar' })
  await ui.unmount()
  expect(enviados[0]).toContain('Haz de abogado de la parte contraria')
  expect(enviados[0]).toContain('C:/exp/lopez/demanda-de-desahucio-lopez-20261109.docx')
  expect(enviados[0]).toContain('C:/exp/lopez/ataque-de-la-contraria.md')
  expect(enviados[0]).toContain('No modifiques el escrito')
  // La descripción del subagente hace que el mod equipo jurídico lo pinte como el rival (Rufino).
  expect(enviados[0]).toContain('«Atacar el escrito como la parte contraria»')
  expect(await boton()).toBeUndefined() // pulsado: desaparece

  // /contrario deja la petición en el cuadro de escritura para el último escrito terminado.
  const r = await $.command.run(comando('contrario', ''))
  expect(r.text).toContain('pulsa Intro')
  expect(rellenos[0]).toContain('Haz de abogado de la parte contraria')
})

test('Mod 6: «Ahora no» lo oculta y, sin usarlo, se va solo a los dos turnos', { timeoutMs: 20_000 }, async ($, on) => {
  simularMotor(on, archivosBase(), {})
  on('tool.call', () => ({ result: 'ok', text: '"ok": true, "errores": []' }))
  await $.session.start({ cwd: '/demo', surface: 'terminal', isInteractive: false })
  const terminar = async (turnId: string) => {
    await $.turn.start({ text: 'x', turnId })
    await $.tool.call({ tool: 'Bash', command: 'python escrito.py ensamblar . --salida /exp/recurso-x.docx' } as never)
    await $.turn.complete(finTurno(turnId))
  }
  await terminar('t1')
  const ui = await $.ui.mount({ ...BANDA, surface: 'terminal' })
  await ui.press({ key: 'contrario-ahora-no' })
  expect(await ui.find({ key: 'contrario-atacar' })).toBeUndefined()
  await ui.unmount()

  await terminar('t2')
  for (const id of ['t3', 't4', 't5']) {
    await $.turn.start({ text: 'otra cosa', turnId: id })
    await $.turn.complete(finTurno(id))
  }
  const ui2 = await $.ui.mount({ ...BANDA, surface: 'terminal' })
  expect(await ui2.find({ key: 'contrario-atacar' })).toBeUndefined()
  await ui2.unmount()
})

// ── La banda no se llena ────────────────────────────────────────────────────

test('Banda: con todas las señales a la vez, este plugin ocupa como mucho dos líneas', { timeoutMs: 20_000 }, async ($, on) => {
  const archivos = archivosBase()
  archivos['data/cupo.json'] = JSON.stringify({
    dia: '2026-11-08',
    semana: '2026-W45',
    usadoDia: 8,
    usadoSemana: 8,
    limites: { diario: 10, semanal: 30, origen: 'por defecto' },
  })
  simularMotor(on, archivos, {})
  on('tool.call', (_$, e) =>
    String(e.tool) === 'Bash' ? { result: 'ok', text: '"ok": true, "errores": []' } : { result: 'ok', text: 'contenido ficticio' },
  )
  await $.session.start({ cwd: '/demo', surface: 'terminal', isInteractive: false })
  await $.command.run(comando('cliente', 'garcia'))
  await $.turn.start({ text: 'Redacta', turnId: 't1' })
  await $.tool.call({ tool: 'Read', file_path: '/demo/expedientes/lopez/contrato.md' } as never) // expediente cruzado
  await $.tool.call({ tool: 'Bash', command: 'python escrito.py ensamblar . --salida /demo/expedientes/garcia/demanda-garcia.docx' } as never)
  await $.turn.complete(finTurno('t1', 'Según el art. 1902 CC y la STS 45/2031.'))

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...BANDA, surface })
    // Están todas las señales…
    const senales = {
      cruce: !!(await ui.find({ type: 'Text', text: /⚠ (En García, tocando López|Tocando López|Otro cliente)/ })),
      // Con todo a la vez, cada pastilla se encoge a lo esencial. García (el cliente activo)
      // no tiene plazos guardados: la banda no enseña el de la Comunidad, que es de otro asunto.
      plazo: !!(await ui.find({ type: 'Text', text: /⏳/ })),
      ficha: !!(await ui.find({ type: 'Text', text: /⚠ (Sin MASC|Ficha)/ })), // escribe una demanda de García sin MASC en la ficha
      citas: !!(await ui.find({ type: 'Text', text: /§ 2 (citas por verificar|por verificar|citas)/ })),
      cupo: !!(await ui.find({ type: 'Text', text: /2\/10 hoy/ })),
      contrario: !!(await ui.find({ key: 'contrario-atacar' })),
    }
    expect(senales).toEqual({ cruce: true, plazo: false, ficha: true, citas: true, cupo: true, contrario: true })
    expect(await ui.find({ type: 'Text', text: /Comunidad|1 día hábil/ })).toBeUndefined() // nada del plazo de otro cliente
    // …y caben en dos líneas: estado + acción (más lo que dibujen otros mods debajo).
    const arbol = (await ui.drawn()) as unknown as { type: string; children?: unknown[] }
    expect(arbol.type).toBe('Box')
    expect(arbol.children?.length).toBe(3)
    await ui.unmount()
  }
})
