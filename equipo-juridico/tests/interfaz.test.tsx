// Pruebas de lo que se dibuja: la oficina (SVG en escritorio, puestos de texto
// en terminal), la lista, la ficha al pulsar a una persona con su avance y
// «Ver más», las frases en vivo, la banda, el spinner, las filas y los avisos.
// En una prueba no hay nada debajo del mod: los `on(...)` de aquí hacen de
// Claude Code (contestan a lo que el mod pide y dibujan lo «de serie»).

import { expect, test } from 'claude-code/testing'
import type { AgentSpawnInput, On } from 'claude-code'

let llamada = 0

/** La entrada completa de un lanzamiento de subagente, como la da Claude Code. */
function lanzar(datos: { prompt: string; description: string; subagentType: string }): AgentSpawnInput {
  llamada += 1
  return {
    tool_use_id: `llamada-${llamada}`,
    provider: { plugin: 'engine', tier: 'core' },
    parentModel: 'claude-opus-5-5',
    background: true,
    fork: false,
    ...datos,
  }
}

const SUPERFICIES = ['terminal', 'desktop'] as const

const PANEL = {
  plugin: 'equipo-juridico',
  component: 'Pane',
  requestId: 'equipo-juridico',
  props: {
    title: 'Equipo jurídico',
    isFocused: false,
    bodyColumns: 100,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 60 },
    view: {},
  },
} as const

const BANDA = {
  plugin: 'equipo-juridico',
  component: 'AbovePrompt',
  requestId: 'above-prompt',
  props: {
    hasSurvey: false,
    isWorking: true,
    maxRows: 12,
    bodyColumns: 120,
    scroll: { offset: 0, bodyRows: 12 },
    view: {},
  },
} as const

type Opciones = {
  equipoJson?: string
  /** Lo que «devuelve» cada herramienta (el texto que lee el modelo). */
  textoDe?: (e: { tool: string; tool_use_id: string; args: Record<string, unknown> }) => string
  alLlamar?: (e: { tool: string; tool_use_id: string }) => void
  /** Aquí se apuntan los avisos emergentes. */
  avisos?: string[]
  /** La prueba contesta ella misma a ui.open y ui.panes. */
  sinPaneles?: boolean
  /** Aquí se apuntan las líneas de depuración del mod (para pillar errores de dibujo). */
  registros?: string[]
  /** Reloj que la prueba puede adelantar (por defecto, un segundo por lectura). */
  reloj?: { ahora: number }
}

/** Lo que Claude Code contesta por debajo del mod en estas pruebas. */
function motor(on: On, opciones: Opciones = {}): void {
  let siguiente = 0
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('command.register', () => ({ value: { command: 'equipo' } }))
  if (opciones.sinPaneles !== true) {
    on('ui.open', () => ({ value: { isPlaced: true } }))
    on('ui.panes', () => ({ value: [] }))
  }
  on('fs.read', () => {
    if (opciones.equipoJson === undefined) throw new Error('sin disco en las pruebas')
    return { value: opciones.equipoJson }
  })
  on('agent.spawn', () => {
    siguiente += 1
    return { model: 'haiku', agentId: `agente-${siguiente}` }
  })
  on('turn.complete', () => ({ text: '' }))
  on('prompt.submit', (_, e) => ({ text: e.text }))
  on('tool.call', (_, e) => {
    opciones.alLlamar?.({ tool: String(e.tool), tool_use_id: e.tool_use_id })
    const { tool, tool_use_id, ...args } = e as unknown as Record<string, unknown>
    const text = opciones.textoDe?.({ tool: String(tool), tool_use_id: String(tool_use_id), args }) ?? ''
    return { result: {}, text }
  })
  on('ui.toast', (_, e) => {
    opciones.avisos?.push(e.text)
    return { value: undefined }
  })
  on('ui.log', (_, e) => {
    opciones.registros?.push(String((e as { text?: unknown }).text ?? ''))
    return { value: undefined }
  })
  // Reloj fijo: cada lectura avanza un segundo (la prueba puede adelantarlo).
  const reloj = opciones.reloj ?? { ahora: 1_800_000_000_000 }
  on('clock.now', () => {
    reloj.ahora += 1000
    return { value: reloj.ahora }
  })
  // Sin latido en las pruebas; la espera de las entradas se cumple al momento.
  on('clock.every', () => ({ deny: 'sin reloj en las pruebas' }))
  on('clock.after', () => ({ value: undefined }))
  // Lo «de serie»: dibuja el texto del spinner y una fila neutra.
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    const props = e.props as { message?: string | null; word?: string }
    return <Text>{props.message ?? props.word ?? 'de serie'}</Text>
  })
}

/** Todos los textos de un dibujo, unidos. */
async function textos(ui: { findAll: (q: { type: string }) => Promise<Array<{ text: string; props: Record<string, unknown> }>> }): Promise<string> {
  const t = (await ui.findAll({ type: 'Text' })).map(x => x.text)
  const b = (await ui.findAll({ type: 'Button' })).map(x => String(x.props.label ?? ''))
  return [...t, ...b].join(' | ')
}

/** Fin de turno de un subagente, como lo da Claude Code. */
function finDe(agentId: string, answer: string) {
  return { agentId, reason: 'answer' as const, answer, durationMs: 30_000, isAborted: false, turnId: `turno-${agentId}` }
}

test('la oficina empieza vacía y Juan entra al recibir su tarea', { timeoutMs: 30_000 }, async ($, on) => {
  const avisos: string[] = []
  motor(on, { avisos })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  // Vacía: en escritorio, su dibujo; en terminal, un texto.
  const vaciaEscritorio = await $.ui.mount({ ...PANEL, surface: 'desktop' })
  const vacia = String((await vaciaEscritorio.find({ type: 'Svg' }))?.props.source)
  expect(vacia).toContain('oficina está vacía')
  expect(vacia).toContain('TABLERO DE CONTROL')
  await vaciaEscritorio.unmount()
  const vaciaTerminal = await $.ui.mount({ ...PANEL, surface: 'terminal' })
  expect(await textos(vaciaTerminal)).toContain('La oficina está vacía')
  expect(await vaciaTerminal.find({ type: 'Svg' })).toBeUndefined()
  await vaciaTerminal.unmount()

  await $.agent.spawn(
    lanzar({
      prompt: 'Busca sentencias del Tribunal Supremo sobre despido (caso ficticio).',
      description: 'Investigar jurisprudencia despido',
      subagentType: 'general-purpose',
    }),
  )
  expect(avisos.some(a => a.includes('🔎 Juan entra en la oficina'))).toBe(true)

  // Escritorio: la escena SVG con Juan y su botón; terminal: su puesto, sin SVG.
  const escritorio = await $.ui.mount({ ...PANEL, surface: 'desktop' })
  const svg = String((await escritorio.find({ type: 'Svg' }))?.props.source)
  expect(svg).toContain('JUAN')
  expect(svg).toContain('TRABAJANDO')
  expect(svg).toContain('DIRECTOR CARLOS')
  expect(svg).toContain('CHAT DEL DESPACHO')
  expect(svg).toContain('Carlos:')
  expect(svg).toContain('<animate')
  expect(String((await escritorio.find({ key: 'persona-juan' }))?.props.label)).toContain('Juan')
  await escritorio.unmount()

  const terminal = await $.ui.mount({ ...PANEL, surface: 'terminal' })
  expect(await terminal.find({ type: 'Svg' })).toBeUndefined()
  const puesto = await textos(terminal)
  expect(puesto).toContain('está buscando jurisprudencia')
  expect(puesto).toContain('💬')
  expect(await terminal.find({ key: 'persona-juan' })).toBeDefined()
  await terminal.unmount()

  for (const surface of SUPERFICIES) {
    const banda = await $.ui.mount({ ...BANDA, surface })
    const fila = await banda.find({ type: 'Text', text: /Equipo/ })
    expect(fila?.text).toContain('Juan')
    // En la app de escritorio, lo que hace; en la terminal, con sitio, también su frase.
    expect(fila?.text).toContain(surface === 'desktop' ? 'Juan buscando jurisprudencia' : '💬')
    expect(fila?.props.wrap).toBe('truncate-end')
    await banda.unmount()

    const spinner = await $.ui.mount({
      plugin: 'equipo-juridico',
      surface,
      component: 'Spinner',
      requestId: 'main',
      props: { word: 'Pensando', message: null, suffix: '…', mode: 'tool-use' },
    })
    expect((await spinner.find({ type: 'Text' }))?.text).toBe('Juan está buscando jurisprudencia')
    await spinner.unmount()
  }
})

test('«Ver más» pone el panel DELANTE (focus) aunque ya estuviera abierto detrás de otro', { timeoutMs: 30_000 }, async ($, on) => {
  motor(on, { sinPaneles: true })
  const aperturas: Array<{ id: string; focus?: true }> = []
  on('ui.panes', () => ({ value: [] }))
  on('ui.open', (_$, e) => {
    aperturas.push({ id: e.id, ...(e.focus === true ? { focus: true as const } : {}) })
    return { value: { isPlaced: true } }
  })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.agent.spawn({
    ...lanzar({ description: 'Redactar contestación a la demanda', prompt: 'Borrador ficticio.', subagentType: 'general-purpose' }),
    tool_use_id: 'llamada-f',
  })
  const fila = await $.ui.mount({
    plugin: 'equipo-juridico',
    surface: 'desktop',
    component: 'ToolUse',
    requestId: 'llamada-f',
    props: {
      tool_use_id: 'llamada-f',
      tool: 'Agent',
      input: { description: 'Redactar contestación a la demanda', prompt: 'Borrador ficticio.' },
      isRunning: true,
      isErrored: false,
      isInterrupted: false,
    },
  })
  aperturas.length = 0
  await fila.press({ key: 'ver-ficha' })
  await fila.unmount()
  expect(aperturas.some(a => a.id === 'equipo-juridico' && a.focus === true)).toBe(true)
})

test('la fila de Agent cuenta quién lo hace, lo que dice, y su «Ver más» abre la ficha', { timeoutMs: 30_000 }, async ($, on) => {
  motor(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.agent.spawn({
    ...lanzar({ description: 'Redactar contestación a la demanda', prompt: 'Borrador para el cliente ficticio Pérez.', subagentType: 'general-purpose' }),
    tool_use_id: 'llamada-x',
  })
  const fila = {
    plugin: 'equipo-juridico',
    component: 'ToolUse',
    requestId: 'llamada-x',
    props: {
      tool_use_id: 'llamada-x',
      tool: 'Agent',
      input: { description: 'Redactar contestación a la demanda', prompt: 'Borrador para el cliente ficticio Pérez.' },
      isRunning: true,
      isErrored: false,
      isInterrupted: false,
    },
  } as const

  for (const surface of SUPERFICIES) {
    const corriendo = await $.ui.mount({ ...fila, surface })
    const texto = await textos(corriendo)
    expect(texto).toContain('Luis')
    expect(texto).toContain('picapleitos')
    expect(texto).toContain('está redactando la contestación')
    // La descripción sale UNA vez: la frase de arranque («Me pongo con «…»») la
    // repetiría justo debajo, así que en la fila no se enseña.
    expect(texto.split('Redactar contestación a la demanda').length - 1).toBe(1)
    expect(String((await corriendo.find({ key: 'ver-ficha' }))?.props.label)).toBe('Ver más')
    await corriendo.press({ key: 'ver-ficha' })
    await corriendo.unmount()

    // «Ver más» ha dejado el panel en la ficha COMPLETA de Luis.
    const panel = await $.ui.mount({ ...PANEL, surface })
    const ficha = await textos(panel)
    expect(ficha).toContain('Luis está redactando la contestación.')
    expect(ficha).toContain('📋 Ficha completa: 1 tarea')
    expect(ficha).toContain('Instrucciones que recibió: «Borrador para el cliente ficticio Pérez.»')
    await panel.press({ key: 'volver' })
    await panel.unmount()

    const fallida = await $.ui.mount({ ...fila, surface, props: { ...fila.props, isRunning: false, isErrored: true } })
    expect(await textos(fallida)).toContain('no ha podido terminar')
    await fallida.unmount()

    // En cuanto dice algo nuevo (ha dejado escrita la contestación), su frase sale en la fila.
    await $.tool.call({ tool: 'Write', file_path: 'C:/casos/ficticio/CONTESTACION-DEMANDA-Perez.md', content: 'uno dos tres', agentId: 'agente-1' } as never)
    const conFrase = await $.ui.mount({ ...fila, surface })
    const dicho = await textos(conFrase)
    expect(dicho).toContain('💬')
    expect(dicho).toMatch(/(Ya está|He redactado) la contestación: 3 palabras\./)
    expect(dicho).not.toMatch(/\.md|CONTESTACION/)
    await conFrase.unmount()

    // Con ctrl+o (expandida) se ve la fila de siempre.
    const expandida = await $.ui.mount({ ...fila, surface, props: { ...fila.props, isExpanded: true } })
    expect((await expandida.find({ type: 'Text' }))?.text).toBe('de serie')
    await expandida.unmount()
  }
})

test('la fila no repite el nombre ni la descripción: «Elena: revisar…» se lee una sola vez', { timeoutMs: 30_000 }, async ($, on) => {
  // 9/11/2026: se leía «Elena (revisora) ha comprobado…» + «Elena: revisar coherencia y cifras del escrito corregido»
  // + «💬 «Elena: revisar coherencia y cifras del escrito corregido» listo en 1 min».
  motor(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const descripcion = 'Elena: revisar coherencia y cifras del escrito corregido'
  await $.agent.spawn({ ...lanzar({ description: descripcion, prompt: 'Caso ficticio.', subagentType: 'general-purpose' }), tool_use_id: 'llamada-e' })
  await $.turn.complete(finDe('agente-1', 'Todo coherente.'))
  for (const surface of SUPERFICIES) {
    const fila = await $.ui.mount({
      plugin: 'equipo-juridico',
      surface,
      component: 'ToolUse',
      requestId: 'llamada-e',
      props: { tool_use_id: 'llamada-e', tool: 'Agent', input: { description: descripcion, prompt: 'Caso ficticio.' }, isRunning: false, isErrored: false, isInterrupted: false },
    })
    const texto = await textos(fila)
    // Es de Elena (la nombra la descripción), y su nombre no se repite delante de la tarea.
    expect(texto).toContain('Elena')
    expect(texto).toContain('«Revisar coherencia y cifras del escrito corregido»')
    expect(texto).not.toContain('Elena: revisar')
    expect(texto.toLowerCase().split('revisar coherencia y cifras').length - 1).toBe(1)
    // Su frase de cierre cuenta el tiempo, sin repetir la tarea.
    expect(texto).toMatch(/💬 .*(Terminado en|Hecho en|Lo mío ya está, en|Todo hecho en)/)
    // El tiempo se dice una vez (en la frase), no también detrás del estado.
    expect(texto.split(' s').length - 1).toBeLessThanOrEqual(1)
    await fila.unmount()

    // Lo mismo en el aviso de «tarea terminada».
    const aviso = await $.ui.mount({
      plugin: 'equipo-juridico',
      surface,
      component: 'UserMessage',
      requestId: 'aviso-e',
      props: { origin: { kind: 'task-notification' }, text: 'x', isExpanded: false, task: { id: 'agente-1', status: 'completed', durationMs: 86_000 } },
    } as never)
    const textoAviso = await textos(aviso)
    expect(textoAviso).toContain('«Revisar coherencia y cifras del escrito corregido»')
    expect(textoAviso).not.toContain('Elena: revisar')
    expect(textoAviso.toLowerCase().split('revisar coherencia y cifras').length - 1).toBe(1)
    await aviso.unmount()
  }
})

test('al pulsar a una persona se abre su ficha; «Ver más» la despliega', { timeoutMs: 30_000 }, async ($, on) => {
  const registros: string[] = []
  motor(on, { registros })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.agent.spawn(lanzar({ prompt: 'Clasifica estos PDF ficticios por fecha.', description: 'Ordenar el expediente', subagentType: 'general-purpose' }))
  await $.tool.call({ tool: 'Write', file_path: 'C:/casos/ficticio/indice.md', content: 'Índice del expediente', agentId: 'agente-1' } as never)
  await $.turn.complete(finDe('agente-1', 'Índice creado en indice.md con 12 documentos ficticios.'))

  for (const surface of SUPERFICIES) {
    const panel = await $.ui.mount({ ...PANEL, surface })
    expect(await textos(panel)).toContain('0 tareas en marcha · 1 terminada')
    await panel.press({ key: 'persona-maria' })
    expect(registros.filter(r => r.includes('panel:'))).toEqual([])
    const ficha = await textos(panel)
    expect(ficha).toContain('María ha ordenado el expediente.')
    expect(ficha).toContain('«Ordenar el expediente»')
    expect(ficha).toContain('💬 En directo')
    expect(ficha).toContain('no son una valoración jurídica')
    // En lenguaje de despacho, sin «Write», «Bash» ni rutas.
    // El encargo no se repite debajo del título cuando no añade nada.
    expect(ficha).not.toContain('Su encargo')
    expect(ficha).toContain('📒 Diario de trabajo:')
    expect(ficha).toContain('✓ Redacta el documento «índice» → 3 palabras')
    expect(ficha).toContain('📝 Su informe: «Índice creado en «índice» con 12 documentos ficticios.»')
    expect(ficha).not.toMatch(/\bWrite\b|\bBash\b|\bGrep\b|herramientas/)
    expect(ficha).toContain('Ver más')

    // «Ver más» despliega la ficha (sus documentos y las instrucciones que recibió) y «Ver menos» la recoge.
    await panel.press({ key: 'ver-mas' })
    const amplia = await textos(panel)
    expect(amplia).toContain('Documentos que ha preparado: «índice» (3 palabras)')
    expect(amplia).not.toMatch(/\.md\b/)
    expect(amplia).toContain('Instrucciones que recibió: «Clasifica estos PDF ficticios por fecha.»')
    expect(amplia).toContain('Ver menos')
    await panel.press({ key: 'ver-menos' })
    expect(await textos(panel)).not.toContain('Instrucciones que recibió')
    await panel.press({ key: 'volver' })
    expect(await panel.find({ key: 'persona-maria' })).toBeDefined()
    await panel.unmount()
  }
})

test('en el panel del despacho, «Ver más» despliega la ficha arriba aunque la pulsación llegue dos veces', { timeoutMs: 30_000 }, async ($, on) => {
  // Carlos (9/11/2026): «en el panel del despacho le doy a "Ver más" y no funciona».
  motor(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.agent.spawn(
    lanzar({ prompt: 'Redacta el fundamento de fondo de la demanda ficticia.', description: 'Redactar fundamento de fondo', subagentType: 'general-purpose' }),
  )
  await $.tool.call({ tool: 'Write', file_path: 'C:/casos/ficticio/secciones/03-fondo.md', content: 'uno dos tres cuatro', agentId: 'agente-1' } as never)

  for (const surface of SUPERFICIES) {
    // Desde la oficina (la vista por defecto), se pulsa a Luis: ficha recogida.
    const panel = await $.ui.mount({ ...PANEL, surface })
    await panel.press({ key: 'persona-luis' })
    const recogida = await textos(panel)
    expect(recogida).toContain('Luis está redactando')
    expect(recogida).not.toContain('Ficha completa')
    expect(recogida).not.toContain('Instrucciones que recibió')
    expect(String((await panel.find({ key: 'ver-mas' }))?.props.label)).toBe('Ver más')

    // La pulsación llega dos veces a la vez (doble clic, o la app la entrega
    // dos veces): la ficha queda desplegada, no vuelve a como estaba.
    await Promise.all([panel.press({ key: 'ver-mas' }), panel.press({ key: 'ver-mas' })])
    const amplia = await textos(panel)
    expect(amplia).toContain('📋 Ficha completa: 1 tarea · 1 paso dado · 1 documento preparado')
    expect(amplia).toContain('Instrucciones que recibió: «Redacta el fundamento de fondo de la demanda ficticia.»')
    expect(amplia).toContain('Documentos que ha preparado: la sección 03 (4 palabras)')
    // Lo que añade sale ARRIBA, antes del diario de trabajo: se ve sin bajar.
    expect(amplia.indexOf('Instrucciones que recibió')).toBeLessThan(amplia.indexOf('Diario de trabajo'))
    expect(await panel.find({ key: 'ver-mas' })).toBeUndefined()
    expect(String((await panel.find({ key: 'ver-menos' }))?.props.label)).toBe('Ver menos')

    // «Ver menos», también doble, la recoge.
    await Promise.all([panel.press({ key: 'ver-menos' }), panel.press({ key: 'ver-menos' })])
    expect(await textos(panel)).not.toContain('Ficha completa')
    expect(await panel.find({ key: 'ver-mas' })).toBeDefined()

    // Al volver y entrar de nuevo, la ficha empieza recogida.
    await panel.press({ key: 'ver-mas' })
    await panel.press({ key: 'volver' })
    await panel.press({ key: 'persona-luis' })
    expect(await textos(panel)).not.toContain('Ficha completa')
    await panel.press({ key: 'volver' })
    await panel.unmount()
  }
})

test('12 tareas a la vez con 8 personas: cada uno lleva las suyas, con avance y frases reales', { timeoutMs: 30_000 }, async ($, on) => {
  const avisos: string[] = []
  motor(on, {
    avisos,
    textoDe: ({ tool }) =>
      tool.endsWith('buscar_sentencias') ? '1. STS 323/2017 · ECLI:ES:TS:2017:323 · responsabilidad extracontractual\n2. SAP 88/2022' : '',
  })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  const TIPO = 'litigacion-civil-espana:redactor-seccion'
  const seccion = (n: string, linea: string) =>
    lanzar({
      description: `Sección ${n}`,
      prompt: `Carpeta: C:/casos/ficticio (lee caso.md)\n${linea} Extensión: 500 palabras.\nEscribe secciones/${n}-x.md y fuentes/${n}.md.`,
      subagentType: TIPO,
    })
  const suelta = (description: string) => lanzar({ description, prompt: 'Datos ficticios de prueba.', subagentType: 'general-purpose' })
  const lote: AgentSpawnInput[] = [
    seccion('01', 'Sección 01 — Encabezamiento y hechos: relato del accidente ficticio.'),
    seccion('02', 'Sección 02 — Fundamentos procesales: jurisdicción, competencia y procedimiento.'),
    seccion('03', 'Sección 03 — Fundamento de fondo: responsabilidad extracontractual.'),
    seccion('04', 'Sección 04 — Fundamento de fondo: daño moral.'),
    seccion('05', 'Sección 05 — Cierre: costas, súplica y otrosíes.'),
    suelta('Investigar jurisprudencia del Supremo'),
    suelta('Repasar normativa del BOE'),
    suelta('Verificar las citas'),
    suelta('Calcular la indemnización'),
    suelta('Ordenar el expediente'),
    suelta('Montar cronología de hechos'),
    suelta('Preparar presentación en LexNET'),
  ]
  for (const entrada of lote) await $.agent.spawn(entrada)
  expect(avisos.filter(a => a.includes('entra en la oficina')).length).toBeGreaterThanOrEqual(1)

  // Luis (agente-4, sección 04) busca, lee y escribe 120 palabras de las 500 pedidas.
  await $.tool.call({ tool: 'mcp__plugin_x_jurisprudenciator__buscar_sentencias', consulta: 'daño moral tráfico', base: 'TS', agentId: 'agente-4' } as never)
  await $.tool.call({ tool: 'mcp__plugin_x_jurisprudenciator__leer_sentencias', citas: 'STS 323/2017', agentId: 'agente-4' } as never)
  const texto = Array.from({ length: 120 }, () => 'palabra').join(' ')
  await $.tool.call({ tool: 'Write', file_path: 'C:/casos/ficticio/secciones/04-dano-moral.md', content: texto, agentId: 'agente-4' } as never)

  // El gran momento (sentencia del Supremo) sale en un aviso, con el dato real.
  expect(avisos.some(a => a.startsWith('📝 Luis:') && a.includes('STS 323/2017'))).toBe(true)

  for (const surface of SUPERFICIES) {
    const panel = await $.ui.mount({ ...PANEL, surface })
    // 8 personas en la oficina, ni una más.
    const botones = (await panel.findAll({ type: 'Button' })).filter(b => String(b.key).startsWith('persona-'))
    expect(botones.map(b => b.key).sort()).toEqual(
      ['persona-alberto', 'persona-carmen', 'persona-clara', 'persona-elena', 'persona-juan', 'persona-luis', 'persona-maria', 'persona-pablo'].sort(),
    )
    expect(await textos(panel)).toContain('12 tareas en marcha')
    if (surface === 'terminal') expect(await textos(panel)).toContain('Tablero: 8 personas trabajando')

    await panel.press({ key: 'persona-luis' })
    const ficha = await textos(panel)
    expect(ficha).toContain('(lleva 3 tareas a la vez)')
    expect(ficha).toContain('Sección 04 — Fundamento de fondo: daño moral')
    expect(ficha).toContain('🎯 Su encargo: Redactar la Sección 04 — Fundamento de fondo: daño moral, unas 500 palabras.')
    expect(ficha).toContain('120 de 500 palabras (24 %)')
    expect(ficha).toContain('⚖️ Lo que ha conseguido:')
    expect(ficha).toContain('Jurisprudencia encontrada: STS 323/2017 del Supremo, SAP 88/2022 de la Audiencia Provincial')
    expect(ficha).toContain('Sentencias leídas a fondo: STS 323/2017')
    expect(ficha).toContain('Ha redactado la sección 04: 120 palabras')
    expect(ficha).toContain('3 pasos dados · 1 búsqueda de jurisprudencia')
    expect(ficha).toContain('Busca jurisprudencia del Supremo sobre «daño moral tráfico» → han salido la STS 323/2017 del Supremo y la SAP 88/2022')
    expect(ficha).toContain('✓ Lee a fondo la STS 323/2017')
    expect(ficha).toContain('✓ Redacta la sección 04 → 120 palabras')
    await panel.press({ key: 'volver' })
    await panel.unmount()

    // La banda: UNA sola fila. El resumen por persona y la última frase van en
    // el mismo texto; el detalle por persona, en el panel (no hay «Ver más»).
    const banda = await $.ui.mount({ ...BANDA, surface })
    const fila = (await banda.find({ type: 'Text', text: /Equipo/ }))?.text ?? ''
    // Trabajan 8 personas (12 tareas).
    expect(fila).toContain('8 trabajando')
    if (surface === 'desktop') {
      // En la app de escritorio la fila es corta (nunca pasa a una segunda línea): quien más lleva, primero.
      expect(fila).toContain('Luis ×3 y 7 más')
      expect(fila.length).toBeLessThanOrEqual(46)
    } else {
      // En la terminal, con sitio, la última frase: la sección con su nombre bien escrito.
      expect(fila).toContain('💬 Luis:')
      expect(fila).toContain('Sección 04 (daño moral)')
    }
    expect(await banda.find({ key: 'ver-mas' })).toBeUndefined()
    expect(await banda.find({ key: 'ver' })).toBeDefined()
    await banda.unmount()
  }

  // Termina Luis su sección 04: lo cuenta con orgullo y queda en la ficha.
  await $.turn.complete(finDe('agente-4', 'secciones/04-dano-moral.md, 520 palabras, sin pendientes.'))
  const panel = await $.ui.mount({ ...PANEL, surface: 'desktop' })
  await panel.press({ key: 'persona-luis' })
  const ficha = await textos(panel)
  expect(ficha).toContain('Su informe: «la sección 04, 520 palabras, sin pendientes.»')
  expect(ficha).toMatch(/Terminado en|Hecho en|Lo mío ya está, en|Todo hecho en/)
  await panel.press({ key: 'volver' })
  await panel.unmount()
})

test('el spinner de un subagente habla de su propia persona', { timeoutMs: 30_000 }, async ($, on) => {
  motor(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.agent.spawn(lanzar({ prompt: 'x', description: 'Investigar jurisprudencia', subagentType: 'general-purpose' }))
  await $.agent.spawn(lanzar({ prompt: 'y', description: 'Calcular la minuta', subagentType: 'general-purpose' }))

  const principal = await $.ui.mount({
    plugin: 'equipo-juridico',
    surface: 'terminal',
    component: 'Spinner',
    requestId: 'main',
    props: { word: 'Pensando', message: null, suffix: '…', mode: 'tool-use' },
  })
  expect((await principal.find({ type: 'Text' }))?.text).toBe('Carmen está calculando la minuta (y 1 compañero más)')
  await principal.unmount()

  const deJuan = await $.ui.mount({
    plugin: 'equipo-juridico',
    surface: 'terminal',
    component: 'Spinner',
    requestId: 'agente-1',
    props: { word: 'Pensando', message: null, suffix: '…', mode: 'tool-use' },
  })
  expect((await deJuan.find({ type: 'Text' }))?.text).toBe('Juan está buscando jurisprudencia')
  await deJuan.unmount()
})

test('el equipo y el tono se leen de config/equipo.json', { timeoutMs: 30_000 }, async ($, on) => {
  motor(on, {
    equipoJson: JSON.stringify({
      tono: 'profesional',
      porDefecto: 'pasantia',
      oficios: [
        {
          id: 'pasantia',
          oficio: 'pasante',
          grupo: 'Pasantía',
          emoji: '🎓',
          color: 'green',
          claves: ['investig'],
          acciones: [{ claves: [], gerundio: 'empollando el caso', participio: 'ha empollado el caso' }],
          personas: ['Rosa'],
        },
      ],
    }),
  })
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.agent.spawn(lanzar({ prompt: 'z', description: 'Investigar algo', subagentType: 'general-purpose' }))

  const panel = await $.ui.mount({ ...PANEL, surface: 'terminal' })
  const texto = await textos(panel)
  expect(texto).toContain('está empollando el caso')
  expect(texto).toMatch(/(Empiezo con|Me ocupo de) «Investigar algo»\./)
  await panel.unmount()
})

test('en una terminal estrecha la oficina usa iniciales', { timeoutMs: 30_000 }, async ($, on) => {
  motor(on)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.agent.spawn(lanzar({ prompt: 'z', description: 'Revisar el escrito', subagentType: 'general-purpose' }))

  const panel = await $.ui.mount({ ...PANEL, surface: 'terminal', props: { ...PANEL.props, bodyColumns: 30, placement: 'inline' } })
  expect(String((await panel.find({ key: 'persona-elena' }))?.props.label)).toContain('Elena')
  await panel.press({ key: 'persona-elena' })
  expect(await panel.find({ type: 'Text', text: /\[E\] Elena/ })).toBeDefined()
  await panel.press({ key: 'volver' })
  await panel.unmount()
})

test('la vista Lista sigue disponible', { timeoutMs: 30_000 }, async ($, on) => {
  motor(on)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await $.agent.spawn(lanzar({ prompt: 'z', description: 'Calcular la indemnización', subagentType: 'general-purpose' }))
  for (const surface of SUPERFICIES) {
    const panel = await $.ui.mount({ ...PANEL, surface })
    await panel.press({ key: 'vista-lista' })
    expect(String((await panel.find({ key: 'persona-carmen' }))?.props.label)).toContain('Carmen — está calculando la indemnización')
    await panel.press({ key: 'vista-oficina' })
    await panel.unmount()
  }
})

test('un Workflow con varios agentes: el encargo y quién está con él', { timeoutMs: 30_000 }, async ($, on) => {
  let idFlujo = ''
  motor(on, {
    alLlamar: e => {
      if (e.tool === 'Workflow') idFlujo = e.tool_use_id
    },
  })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const script = "export const meta = { name: 'wf_mods', description: 'Informe de prueba', phases: [] }"
  await $.tool.call({ tool: 'Workflow', script })
  expect(idFlujo).not.toBe('')

  const enFlujo = (n: number, description: string): AgentSpawnInput => ({
    ...lanzar({ prompt: 'Datos ficticios.', description, subagentType: 'general-purpose' }),
    tool_use_id: idFlujo,
    workflow: { runId: 'wf_prueba', agentIndex: n },
  })
  await $.agent.spawn(enFlujo(1, 'Investigar jurisprudencia tema 1'))
  await $.agent.spawn(enFlujo(2, 'Investigar jurisprudencia tema 2'))
  await $.agent.spawn(enFlujo(3, 'Redactar borrador del informe'))

  const filaFlujo = {
    plugin: 'equipo-juridico',
    component: 'ToolUse',
    requestId: idFlujo,
    props: { tool_use_id: idFlujo, tool: 'Workflow', input: { script }, isRunning: true, isErrored: false, isInterrupted: false },
  } as const

  for (const surface of SUPERFICIES) {
    const fila = await $.ui.mount({ ...filaFlujo, surface })
    const texto = await textos(fila)
    expect(texto).toContain('«wf_mods»')
    // Dos tareas de jurisprudencia: las lleva Juan.
    expect(texto).toContain('Juan buscando jurisprudencia ×2 · Luis redactando el borrador')
    await fila.unmount()

    const panel = await $.ui.mount({ ...PANEL, surface })
    expect(await textos(panel)).toContain('Encargo «wf_mods»: Informe de prueba')
    await panel.unmount()

    // Una fila de Agent que comparte id con el flujo no se queda con sus tareas.
    const filaAgente = await $.ui.mount({
      plugin: 'equipo-juridico',
      surface,
      component: 'ToolUse',
      requestId: idFlujo,
      props: {
        tool_use_id: idFlujo,
        tool: 'Agent',
        input: { description: 'Calcular la minuta', prompt: 'x' },
        isRunning: true,
        isErrored: false,
        isInterrupted: false,
      },
    })
    const textoAgente = await textos(filaAgente)
    expect(textoAgente).toContain('Carmen')
    expect(textoAgente).not.toContain('Juan')
    await filaAgente.unmount()
  }

  await $.turn.complete(finDe('agente-1', 'Hecho.'))
  const tras = await $.ui.mount({ ...filaFlujo, surface: 'desktop' })
  expect(await textos(tras)).toContain('Juan buscando jurisprudencia · Luis redactando el borrador · 1 terminada')
  await tras.unmount()

  const aviso = await $.ui.mount({
    plugin: 'equipo-juridico',
    surface: 'desktop',
    component: 'UserMessage',
    requestId: 'mensaje-flujo',
    props: {
      text: 'Workflow wf_mods completed',
      origin: { kind: 'task-notification' },
      isExpanded: false,
      task: { id: 'tarea-del-flujo', toolUseId: idFlujo, status: 'completed', durationMs: 60_000 },
    } as never,
  })
  const textoAviso = await textos(aviso)
  expect(textoAviso).toContain('El equipo')
  expect(textoAviso).toContain('(3 tareas, 2 personas)')
  await aviso.unmount()

  // El aviso de una tarea suelta trae su frase y su «Ver más».
  const avisoTarea = await $.ui.mount({
    plugin: 'equipo-juridico',
    surface: 'terminal',
    component: 'UserMessage',
    requestId: 'mensaje-tarea',
    props: {
      text: 'Agent completed',
      origin: { kind: 'task-notification' },
      isExpanded: false,
      task: { id: 'agente-1', status: 'completed', durationMs: 65_000 },
    } as never,
  })
  const textoTarea = await textos(avisoTarea)
  expect(textoTarea).toContain('Juan')
  expect(textoTarea).toContain('1 min 5 s')
  expect(textoTarea).toContain('💬')
  expect(await avisoTarea.find({ key: 'ver-ficha' })).toBeDefined()
  await avisoTarea.unmount()
})

test('/equipo oficina y /equipo lista abren el panel (nunca lo cierran); /equipo a secas alterna', { timeoutMs: 30_000 }, async ($, on) => {
  // Aquí Claude Code dice que el panel YA está abierto, y se apunta cada apertura y cierre.
  const abiertos: string[] = []
  const cerrados: string[] = []
  let panelAbierto = true
  on('ui.panes', () => ({ value: (panelAbierto ? [{ id: 'equipo-juridico', title: 'Equipo jurídico', isShown: true, isFocused: false, isPlaced: true }] : []) as never }))
  on('ui.open', (_, e) => {
    abiertos.push(e.id)
    panelAbierto = true
    return { value: { isPlaced: true } }
  })
  on('ui.close', (_, e) => {
    cerrados.push(e.id)
    panelAbierto = false
    return { value: undefined }
  })
  motor(on, { sinPaneles: true })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  for (const args of ['oficina', 'lista', 'Oficina', ' ver la oficina ', 'lista.']) {
    const r = await $.command.run({ command: 'equipo', args } as never)
    expect(r.text).toContain('abierto')
    expect(cerrados).toEqual([])
  }
  expect(abiertos.length).toBe(5)
  const vista = await $.ui.mount({ ...PANEL, surface: 'terminal' })
  expect(await textos(vista)).toContain('Oficina')
  await vista.unmount()

  // Un argumento desconocido tampoco cierra.
  expect((await $.command.run({ command: 'equipo', args: 'loquesea' } as never)).text).toContain('abierto')
  expect(cerrados).toEqual([])
  // Solo «/equipo» a secas (con el panel abierto) o «/equipo cerrar» lo cierran.
  expect((await $.command.run({ command: 'equipo', args: '' } as never)).text).toContain('cerrado')
  expect(cerrados).toEqual(['equipo-juridico'])
  expect((await $.command.run({ command: 'equipo', args: 'oficina' } as never)).text).toContain('abierto')
  expect((await $.command.run({ command: 'equipo', args: 'cerrar' } as never)).text).toContain('cerrado')
})

test('la banda ocupa una sola fila y se retira sola cuando el equipo termina', { timeoutMs: 30_000 }, async ($, on) => {
  const reloj = { ahora: 1_800_000_000_000 }
  motor(on, { reloj })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const nuestra = async (): Promise<string | undefined> => {
    const banda = await $.ui.mount({ ...BANDA, surface: 'desktop' })
    const fila = (await banda.find({ type: 'Text', text: /Equipo/ }))?.text
    await banda.unmount()
    return fila
  }

  await $.agent.spawn(lanzar({ prompt: 'Busca sentencias del TS (ficticio).', description: 'Investigar jurisprudencia despido', subagentType: 'general-purpose' }))
  await $.agent.spawn(lanzar({ prompt: 'Redacta los hechos (ficticio).', description: 'Redactar los hechos', subagentType: 'general-purpose' }))
  // Mientras trabajan: una fila con los dos. En la app de escritorio, corta
  // (lo que no cabe entero no entra); en una terminal ancha, con la última frase.
  const trabajando = (await nuestra()) ?? ''
  expect(trabajando).toContain('Juan')
  expect(trabajando).toContain('Clara')
  expect(trabajando.length).toBeLessThanOrEqual(46)
  const ancha = await $.ui.mount({ ...BANDA, surface: 'terminal', props: { ...BANDA.props, bodyColumns: 160 } })
  const enTerminal = await ancha.find({ type: 'Text', text: /Equipo/ })
  expect(enTerminal?.text).toContain('💬')
  // Una sola fila de texto y, a su lado, los dos botones.
  expect(enTerminal?.props.wrap).toBe('truncate-end')
  expect((await ancha.findAll({ type: 'Text' })).filter(t => t.text.includes('Equipo')).length).toBe(1)
  expect((await ancha.findAll({ type: 'Button' })).map(b => b.props.label)).toEqual(['Ver equipo', 'Ocultar'])
  await ancha.unmount()

  // Terminan los dos: la fila dice que han terminado, sin frase…
  await $.turn.complete(finDe('agente-1', 'Hecho.'))
  await $.turn.complete(finDe('agente-2', 'Hecho.'))
  const terminado = (await nuestra()) ?? ''
  expect(terminado).toContain('ha terminado · 2 tareas hechas')
  expect(terminado).not.toContain('💬')
  // …y pasado un minuto, desaparece sola.
  reloj.ahora += 61_000
  expect(await nuestra()).toBeUndefined()

  // Si vuelve a trabajar alguien, reaparece solo con lo nuevo.
  await $.agent.spawn(lanzar({ prompt: 'z', description: 'Preparar presentación en LexNET', subagentType: 'general-purpose' }))
  await $.turn.complete(finDe('agente-3', 'Hecho.'))
  expect(await nuestra()).toContain('1 tarea hecha')
  // El siguiente mensaje de la persona la retira también, sin esperar al minuto.
  await $.prompt.submit({ text: 'Gracias', wait: false, origin: { kind: 'composer' } } as never)
  expect(await nuestra()).toBeUndefined()
})

test('el abogado de la parte contraria entra a atacar el escrito y no cuenta como del despacho', { timeoutMs: 30_000 }, async ($, on) => {
  motor(on, {
    textoDe: ({ tool }) => (tool.endsWith('buscar_sentencias') ? '1. STS 323/2017 · ECLI:ES:TS:2017:323 · propiedad horizontal, cuotas' : ''),
  })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const ayuda = await $.command.run({ command: 'equipo', args: 'ayuda' } as never)
  expect(ayuda.text).toContain('8 personas')
  expect(ayuda.text).toContain('Rufino (abogado de la parte contraria')

  await $.agent.spawn(
    lanzar({
      prompt: 'Haz de abogado de la parte contraria con el escrito terminado (ficticio) y atácalo: excepciones procesales, hechos sin probar, jurisprudencia contraria.',
      description: 'Atacar el escrito como la parte contraria',
      subagentType: 'general-purpose',
    }),
  )
  const panel = await $.ui.mount({ ...PANEL, surface: 'desktop' })
  const svg = String((await panel.find({ type: 'Svg' }))?.props.source)
  expect(svg).toContain('RUFINO')
  expect(svg).toContain('⚔ ATACANDO')
  await panel.unmount()

  // Habla como un juez cabrón: en la banda, en la fila y en el chat de la oficina.
  const SOEZ = /joder|hostia|mierda|me cago|coño|listillos|bodrio|engendro|patatas|escocer|desmonto/i
  for (const surface of SUPERFICIES) {
    const banda = await $.ui.mount({ ...BANDA, surface, props: { ...BANDA.props, bodyColumns: 160 } })
    const texto = await textos(banda)
    expect(texto).toContain('Rufino')
    // En la terminal, con sitio, su frase; en la app de escritorio la fila es corta y su frase está en la oficina.
    if (surface === 'terminal') {
      expect(texto).toContain('💬')
      expect(texto).toMatch(SOEZ)
    }
    await banda.unmount()
  }
  // Una sentencia que sale de verdad en su búsqueda, la usa contra nosotros.
  await $.tool.call({ tool: 'mcp__x__buscar_sentencias', consulta: 'cuotas de comunidad', agentId: 'agente-1' } as never)
  const oficina = await $.ui.mount({ ...PANEL, surface: 'desktop' })
  const alt = String((await oficina.find({ type: 'Svg' }))?.props.alt)
  expect(alt).toContain('«Rufino, ¿qué te parece nuestro escrito?» Rufino: «')
  expect(alt).toContain('STS 323/2017 del Supremo')
  expect(alt).toMatch(SOEZ)
  await oficina.unmount()
  const banda = await $.ui.mount({ ...BANDA, surface: 'terminal', props: { ...BANDA.props, bodyColumns: 160 } })
  const conSentencia = await textos(banda)
  expect(conSentencia).toContain('STS 323/2017')
  expect(conSentencia).toMatch(SOEZ)
  await banda.unmount()
})

test('/equipo responde y la banda se puede ocultar', { timeoutMs: 30_000 }, async ($, on) => {
  motor(on)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  const ayuda = await $.command.run({ command: 'equipo', args: 'ayuda' } as never)
  expect(ayuda.text).toContain('8 personas')
  expect(ayuda.text).toContain('Juan (buscador de jurisprudencia')

  await $.agent.spawn(lanzar({ prompt: 'z', description: 'Preparar presentación en LexNET', subagentType: 'general-purpose' }))
  const banda = await $.ui.mount({ ...BANDA, surface: 'terminal' })
  expect((await banda.find({ type: 'Text', text: /Equipo/ }))?.text).toContain('Pablo')
  await banda.press({ key: 'ocultar' })
  expect(await banda.find({ type: 'Text', text: /Pablo/ })).toBeUndefined()
  await banda.unmount()
})
