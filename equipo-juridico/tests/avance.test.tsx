// Pruebas de la barra de avance del escrito: cuándo empieza, cómo sube
// (0, 5, 10… 100 %) y cómo se dibuja. Datos ficticios.

import { describe, expect, test } from 'claude-code/testing'
import type { AgentSpawnInput, On } from 'claude-code'

import {
  anotarHerramienta,
  barra,
  calcularAvance,
  completarRedaccion,
  esSkillDeEscrito,
  hayEscrito,
  nuevaRedaccion,
  pideEscrito,
  progresoParte,
  tituloDeDocumento,
  tituloDeSkill,
} from '../hooks/avance'
import type { Redaccion, Tarea } from '../types'

describe('cuándo se pide un escrito', () => {
  test('frases que piden redactar un escrito judicial', () => {
    expect(pideEscrito('Redacta un recurso de apelación contra la sentencia del juzgado')).toBe('Recurso de apelación')
    expect(pideEscrito('Prepárame la contestación a la demanda')).toBe('Contestación a la demanda')
    expect(pideEscrito('quiero que redactes una demanda de reclamación de cantidad')).toBe('Demanda de reclamación de cantidad')
    expect(pideEscrito('Escribe un escrito judicial de oposición a la ejecución')).toBe('Escrito judicial de oposición a la ejecución')
    expect(pideEscrito('Hazme la querella por estafa, caso ficticio')).toBe('Querella por estafa')
  })

  test('el título es el tipo de escrito, limpio y corto (frases reales de Carlos)', () => {
    // 9/11/2026: salía «Recurso de apelación en tan s…».
    expect(pideEscrito('Mal, mira: vuelve a redactar otro recurso de apelación en tan solo un minuto. Lo que necesito es ver la barra.')).toBe('Recurso de apelación')
    expect(
      pideEscrito('mira, necesito que lleves a cabo la contestación de la demanda de divorcio. ¿Tienes 5 minutos para llevarme a cabo la contestación de la demanda completa?'),
    ).toBe('Contestación a la demanda de divorcio')
    expect(pideEscrito('Mira, redáctame un boceto muy rápido de demanda de juicio verbal. Simplemente tienes 30 segundos para redactarla.')).toBe('Demanda de juicio verbal')
    expect(pideEscrito('necesito que empieces a redactar una demanda donde los ocho empleados del despacho se pongan a trabajar')).toBe('Demanda')
    expect(pideEscrito('redacta otra demanda de prueba vamos a ver si funciona todo bien')).toBe('Demanda de prueba')
    expect(pideEscrito('Redacta una demanda de reclamación de cantidad contra Aseguradora Ficticia por los daños del coche')).toBe('Demanda de reclamación de cantidad')
    expect(pideEscrito('Prepara un recurso contencioso-administrativo contra la sanción')).toBe('Recurso contencioso-administrativo')
    // «he escrito la sección 03» no pide ningún escrito (salía «Escrito la sección 03 de la d…»).
    expect(pideEscrito('Quiero que sepas que he escrito la sección 03 de la demanda')).toBeUndefined()
    expect(pideEscrito('Haz un resumen: ya he escrito la sección 03')).toBeUndefined()
    for (const frase of ['Redacta un recurso de apelación en tan solo un minuto', 'Prepárame la contestación a la demanda de divorcio de Ibáñez ya mismo']) {
      expect((pideEscrito(frase) ?? '').length).toBeLessThanOrEqual(46)
    }
  })

  test('una carta o un contrato dan título, pero no encienden la barra por sí solos', () => {
    const carta = 'Redáctame una carta al cliente, clara y sin tecnicismos, que explique el escrito que acabamos de terminar.'
    expect(pideEscrito(carta)).toBeUndefined()
    expect(tituloDeDocumento(carta)).toBe('Carta al cliente')
    expect(tituloDeDocumento('Prepara un contrato de arrendamiento de vivienda para López')).toBe('Contrato de arrendamiento de vivienda')
    expect(tituloDeDocumento('¿Qué hora es?')).toBeUndefined()
  })

  test('el título que da una skill: nunca «Redaccion rapida»', () => {
    expect(tituloDeSkill('jurisprudenciator:redaccion-rapida')).toBe('Escrito')
    expect(tituloDeSkill('litigacion-civil-espana:recurso-apelacion')).toBe('Recurso de apelación')
    expect(tituloDeSkill('litigacion-laboral-espana:redactar-demanda-despido')).toBe('Demanda de despido')
    expect(tituloDeSkill('litigacion-civil-espana:medidas-cautelares')).toBe('Medidas cautelares')
    expect(tituloDeSkill('litigacion-civil-espana:redactar-contestacion')).toBe('Contestación')
  })

  test('frases que no lo piden', () => {
    expect(pideEscrito('Revisa el escrito')).toBeUndefined()
    expect(pideEscrito('Redacta un correo para el cliente')).toBeUndefined()
    expect(pideEscrito('Escribe un post sobre IA y luego, más tarde, quizá hablemos de la demanda')).toBeUndefined()
    expect(pideEscrito('¿Qué plazo hay para contestar?')).toBeUndefined()
  })

  test('skills de redactar sí, las de apoyo no', () => {
    expect(esSkillDeEscrito('jurisprudenciator:redaccion-rapida')).toBe(true)
    expect(esSkillDeEscrito('litigacion-civil-espana:recurso-apelacion')).toBe(true)
    expect(esSkillDeEscrito('litigacion-laboral-espana:redactar-demanda-despido')).toBe(true)
    expect(esSkillDeEscrito('litigacion-civil-espana:estilo-escritos-judiciales')).toBe(false)
    expect(esSkillDeEscrito('litigacion-civil-espana:perfil-de-estilo')).toBe(false)
    expect(esSkillDeEscrito('litigacion-civil-espana:cronologia')).toBe(false)
    expect(esSkillDeEscrito('mailerlite')).toBe(false)
  })
})

/** Una sección de redaccion-rapida con las herramientas que lleva. */
function seccion(n: number, herramientas: number, estado: Tarea['estado'] = 'trabajando'): Tarea {
  return {
    id: `s${n}`,
    toolUseId: `t${n}`,
    oficio: 'fondo',
    persona: 'luis',
    accion: 0,
    descripcion: `Sección 0${n}`,
    seccion: `Sección 0${n} — x`,
    encargo: '',
    tipo: 'litigacion-civil-espana:redactor-seccion',
    estado,
    inicio: 2000,
    actividad: [],
    herramientas,
    archivos: [],
  }
}

describe('cómo sube el porcentaje', () => {
  test('una sola barra del trabajo total, con redaccion-rapida', () => {
    let r: Redaccion = nuevaRedaccion('Demanda', 1000)
    const av = (tareas: Tarea[] = []) => calcularAvance(r, tareas)
    const pct = (tareas: Tarea[] = []) => av(tareas).porcentaje
    expect(pct()).toBe(0)
    // Arranque: estado de Jurisprudenciator y escrito.py iniciar (0-5 %).
    r = anotarHerramienta(r, 'mcp__plugin_x_jurisprudenciator__estado', {}, true, 1100)
    r = anotarHerramienta(r, 'Bash', { command: 'python "C:/skills/redaccion-rapida/scripts/escrito.py" iniciar --tipo "demanda" --cliente "Pérez"' }, true, 1200)
    expect(r.arranque).toBe(true)
    expect(pct()).toBe(5)
    expect(av().fase).toBe('preparando la mesa de trabajo')
    // Plan (caso.md): 15 %.
    r = anotarHerramienta(r, 'Write', { file_path: 'C:/casos/ficticio/caso.md' }, true, 1500)
    expect(pct()).toBe(15)
    // Equipo lanzado: 20 %; las secciones llevan del 20 al 75 %.
    const seis = [1, 2, 3, 4, 5, 6].map(n => seccion(n, 0))
    expect(pct(seis)).toBe(20)
    expect(pct(seis.map(s => ({ ...s, herramientas: 4 })))).toBe(45)
    const mitad = seis.map((s, i) => (i < 3 ? { ...s, estado: 'terminada' as const } : { ...s, herramientas: 4 }))
    expect(pct(mitad)).toBe(60)
    expect(av(mitad).fase).toBe('el equipo redacta las secciones · 3 de 6 hechas')
    const todas = seis.map(s => ({ ...s, estado: 'terminada' as const }))
    expect(pct(todas)).toBe(75)
    // Con todas hechas ya no dice «el equipo trabajando (6 de 6)»: lo que queda es unir el escrito.
    expect(av(todas).fase).toBe('el equipo ha terminado sus partes; uniendo el escrito')
    // Ensamblado con errores y correcciones (75-90 %).
    r = anotarHerramienta(r, 'Bash', { command: 'python escrito.py ensamblar "C:/casos/ficticio" --salida "demanda.docx" --palabras 3000' }, false, 3000)
    expect(pct(todas)).toBe(75)
    expect(av(todas).fase).toBe('montando el Word')
    r = anotarHerramienta(r, 'Edit', { file_path: 'secciones/03-fondo.md' }, true, 3100)
    r = anotarHerramienta(r, 'Edit', { file_path: 'secciones/04-fondo.md' }, true, 3200)
    expect(r.correcciones).toBe(2)
    expect(pct(todas)).toBe(80)
    expect(av(todas).fase).toBe('corrigiendo los fallos del montaje')
    expect(hayEscrito(r, todas)).toBe(false)
    // Ensamblado bueno: Word escrito (90 %); coherencia y reensamblado (90-97 %).
    r = anotarHerramienta(r, 'Bash', { command: 'python escrito.py ensamblar "C:/casos/ficticio" --salida "demanda.docx" --palabras 3000' }, true, 3300)
    expect(r.docx).toBe(true)
    expect(pct(todas)).toBe(90)
    r = anotarHerramienta(r, 'Read', { file_path: 'C:/casos/ficticio/escrito.md' }, true, 3400)
    expect(av(todas).fase).toBe('leyendo la coherencia del escrito')
    r = anotarHerramienta(r, 'Edit', { file_path: 'secciones/05-cierre.md' }, true, 3500)
    r = anotarHerramienta(r, 'Bash', { command: 'python escrito.py ensamblar "C:/casos/ficticio" --salida "demanda.docx"' }, true, 3600)
    expect(pct(todas)).toBe(95)
    expect(av(todas).fase).toBe('Word montado de nuevo; últimos repasos')
    // Solo el Word entregado es el 100 %.
    expect(hayEscrito(r, todas)).toBe(true)
    expect(calcularAvance({ ...r, terminado: true }, todas)).toMatchObject({ porcentaje: 100, fase: 'Word entregado' })
  })

  test('las secciones pesan por las palabras pedidas a cada una', () => {
    const r: Redaccion = { ...nuevaRedaccion('Demanda', 0), casoMd: true }
    const larga = { ...seccion(1, 8), extension: 1000, palabras: 1000 }
    const corta = { ...seccion(2, 0), extension: 200, palabras: 0 }
    expect(progresoParte(larga)).toBe(0.95)
    expect(progresoParte(corta)).toBe(0)
    // 20 + 55 × (0,95 × 1000) / 1200 = 63,5 → 60 %
    expect(calcularAvance(r, [larga, corta]).porcentaje).toBe(60)
    expect(progresoParte({ ...seccion(3, 4), extension: 500, palabras: 250 })).toBe(0.5)
  })

  test('una redacción guardada por la versión anterior se completa', () => {
    const antigua = { titulo: 'Demanda', inicio: 0, ultimo: 0, porcentaje: 40, fase: 'x', herramientas: 3, investigaciones: 1, skill: true, casoMd: true, borrador: 0, ensamblado: true, retoques: 0, verificado: false, docx: false, terminado: false } as unknown as Redaccion
    const r = completarRedaccion(antigua)
    expect(r.ensamblados).toBe(1)
    expect(r.ensamblesOk).toBe(0)
    expect(r.arranque).toBe(false)
    expect(r.porcentaje).toBe(40)
    expect(Number.isNaN(calcularAvance(r, []).porcentaje)).toBe(false)
  })

  test('redactando sin equipo', () => {
    let r: Redaccion = nuevaRedaccion('Burofax', 0)
    const pct = () => calcularAvance(r, []).porcentaje
    for (let i = 0; i < 3; i += 1) {
      r = anotarHerramienta(r, 'mcp__plugin_x_jurisprudenciator__buscar_sentencias', { consulta: 'x' }, true, i)
    }
    expect(r.investigaciones).toBe(3)
    expect(pct()).toBe(15)
    r = anotarHerramienta(r, 'Write', { file_path: 'borrador.md' }, true, 5)
    expect(pct()).toBe(40)
    r = anotarHerramienta(r, 'Edit', { file_path: 'borrador.md' }, true, 6)
    r = anotarHerramienta(r, 'Edit', { file_path: 'borrador.md' }, true, 7)
    expect(pct()).toBe(50)
    r = anotarHerramienta(r, 'mcp__x__verificar_escrito', { texto: 'x' }, true, 8)
    expect(pct()).toBe(80)
    expect(hayEscrito(r, [])).toBe(false)
    r = anotarHerramienta(r, 'Bash', { command: 'pandoc borrador.md -o burofax.docx' }, true, 9)
    expect(pct()).toBe(95)
    expect(hayEscrito(r, [])).toBe(true)
  })

  test('el escrito entregado por otra vía (PDF generado y enviado) también cuenta', () => {
    // 9/11/2026: la barra se quedó en el 75 % con el PDF ya entregado.
    let r: Redaccion = { ...nuevaRedaccion('Contestación a la demanda', 0), porcentaje: 75 }
    // Leer un PDF del expediente no es entregar nada…
    r = anotarHerramienta(r, 'Bash', { command: 'python leer.py "C:/casos/01/demanda.pdf"' }, true, 1)
    expect(hayEscrito(r, [])).toBe(false)
    // …generar el PDF del escrito, sí.
    const generado = anotarHerramienta(r, 'Bash', { command: 'python generar_pdf.py --salida "C:/casos/01/CONTESTACION.pdf"' }, true, 2)
    expect(generado.pdf).toBe(true)
    expect(hayEscrito(generado, [])).toBe(true)
    expect(calcularAvance(generado, []).fase).toBe('PDF listo, a punto de entregar')
    expect(calcularAvance({ ...generado, terminado: true }, [])).toMatchObject({ porcentaje: 100, fase: 'PDF entregado' })
    // Y enviárselo a la persona, también (aunque el PDF se hiciera sin dejar rastro).
    const enviado = anotarHerramienta(r, 'SendUserFile', { files: ['C:/casos/01/CONTESTACION.pdf'], status: 'normal' }, true, 3)
    expect(hayEscrito(enviado, [])).toBe(true)
    expect(hayEscrito(anotarHerramienta(r, 'SendUserFile', { files: ['C:/casos/01/captura.png'] }, true, 3), [])).toBe(false)
    // Al principio (antes del 40 %), una orden con un PDF no entrega nada.
    const pronto = anotarHerramienta(nuevaRedaccion('Demanda', 0), 'Bash', { command: 'pandoc notas.md -o notas.pdf' }, true, 1)
    expect(hayEscrito(pronto, [])).toBe(false)
  })

  test('una redacción en pausa vuelve en cuanto se sigue trabajando en el escrito', () => {
    const pausada: Redaccion = { ...nuevaRedaccion('Demanda', 0), porcentaje: 75, pausa: 500 }
    // Un paso cualquiera (mirar una carpeta) no la saca de la pausa…
    expect(anotarHerramienta(pausada, 'Bash', { command: 'ls' }, true, 600).pausa).toBe(500)
    // …pero corregir el escrito o montarlo, sí.
    expect(anotarHerramienta(pausada, 'Edit', { file_path: 'C:/casos/x/borrador.md' }, true, 700).pausa).toBeUndefined()
    expect(anotarHerramienta(pausada, 'mcp__x__buscar_sentencias', { consulta: 'x' }, true, 700).pausa).toBeUndefined()
  })

  test('sin escrito no hay 100 %', () => {
    const r = nuevaRedaccion('Demanda', 0)
    expect(hayEscrito(r, [])).toBe(false)
    expect(calcularAvance({ ...r, herramientas: 50 }, []).porcentaje).toBeLessThan(100)
  })

  test('la barra', () => {
    expect(barra(40, 10)).toEqual({ llena: '████', vacia: '░░░░░░' })
    expect(barra(100, 10).llena).toBe('██████████')
    expect(barra(0, 10).vacia).toBe('░░░░░░░░░░')
  })
})

// --- La barra dibujada, de punta a punta ------------------------------------

let llamada = 0
function lanzar(datos: { prompt: string; description: string; subagentType: string }): AgentSpawnInput {
  llamada += 1
  return {
    tool_use_id: `llamada-b${llamada}`,
    provider: { plugin: 'engine', tier: 'core' },
    parentModel: 'claude-opus-5-5',
    background: false,
    fork: false,
    ...datos,
  }
}

function motor(on: On): void {
  let siguiente = 0
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('command.register', () => ({ value: { command: 'equipo' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.panes', () => ({ value: [] }))
  on('fs.read', () => {
    throw new Error('sin disco en las pruebas')
  })
  on('agent.spawn', () => {
    siguiente += 1
    return { model: 'sonnet', agentId: `redactor-${siguiente}` }
  })
  on('turn.complete', () => ({ text: '' }))
  on('tool.call', () => ({ result: {} }))
  on('prompt.submit', (_, e) => ({ text: e.text }))
  on('skill.prompt', (_, e) => ({ text: e.text }))
  on('ui.toast', () => ({ value: undefined }))
  on('ui.log', () => ({ value: undefined }))
  let ahora = 1_800_000_000_000
  on('clock.now', () => {
    ahora += 1000
    return { value: ahora }
  })
  on('clock.every', () => ({ deny: 'sin reloj en las pruebas' }))
  on('clock.after', () => ({ value: undefined }))
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    const props = e.props as { message?: string | null; word?: string }
    return <Text>{props.message ?? props.word ?? 'de serie'}</Text>
  })
}

const BANDA = {
  plugin: 'equipo-juridico',
  component: 'AbovePrompt',
  requestId: 'above-prompt',
  props: { hasSurvey: false, isWorking: true, maxRows: 6, bodyColumns: 120, scroll: { offset: 0, bodyRows: 6 }, view: {} },
} as const

test('pedir una demanda enciende la barra, que sube con el trabajo hasta el 100 %', { timeoutMs: 30_000 }, async ($, on) => {
  motor(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  // La fila de la banda (siempre una) y la línea del escrito en la cabecera del panel.
  const lineaDe = async (surface: 'terminal' | 'desktop'): Promise<string> => {
    const banda = await $.ui.mount({ ...BANDA, surface })
    const fila = await banda.find({ type: 'Text', text: / %/ })
    if (fila !== undefined) expect(fila.props.wrap).toBe('truncate-end')
    await banda.unmount()
    return fila?.text ?? ''
  }
  const enElPanel = async (): Promise<string> => {
    const panel = await $.ui.mount({
      plugin: 'equipo-juridico',
      surface: 'desktop',
      component: 'Pane',
      requestId: 'equipo-juridico',
      props: { title: 'Equipo jurídico', isFocused: false, bodyColumns: 100, placement: 'dock', scroll: { offset: 0, bodyRows: 60 }, view: {} },
    })
    const texto = (await panel.find({ type: 'Text', text: /ahora:|entregado/ }))?.text ?? ''
    await panel.unmount()
    return texto
  }
  const spinner = async (): Promise<string> => {
    const s = await $.ui.mount({
      plugin: 'equipo-juridico',
      surface: 'desktop',
      component: 'Spinner',
      requestId: 'main',
      props: { word: 'Pensando', message: null, suffix: '…', mode: 'tool-use' },
    })
    const texto = (await s.find({ type: 'Text' }))?.text ?? ''
    await s.unmount()
    return texto
  }

  await $.prompt.submit({ text: 'Redacta una demanda de reclamación de cantidad (caso ficticio)', wait: false, origin: { kind: 'composer' } } as never)
  for (const surface of ['terminal', 'desktop'] as const) {
    const linea = await lineaDe(surface)
    expect(linea).toContain('0 %')
    expect(linea).toContain('Demanda de reclamación')
  }
  // En la terminal, con sitio, cabe también el paso actual.
  expect(await lineaDe('terminal')).toContain('Demanda de reclamación de cantidad')
  expect(await lineaDe('terminal')).toContain('· ahora: preparando el encargo')
  // En la app de escritorio la fila es corta: jamás pasa a una segunda línea.
  expect((await lineaDe('desktop')).length).toBeLessThanOrEqual(46)

  await $.skill.prompt({ skill: 'jurisprudenciator:redaccion-rapida', text: '…', frontmatter: {}, source: 'plugin' } as never)
  // La skill no cambia el título que pidió la persona.
  expect(await enElPanel()).toContain('Demanda de reclamación de cantidad')
  expect(await enElPanel()).toContain('ahora: preparando el encargo')

  await $.tool.call({ tool: 'Write', file_path: 'C:/casos/ficticio/caso.md', content: '…' } as never)
  expect(await lineaDe('desktop')).toContain('15 %')
  expect(await spinner()).toBe('Escrito: 15 % del total · ahora: plan del escrito listo')

  const tipo = 'litigacion-civil-espana:redactor-seccion'
  for (const [n, linea] of [
    ['01', 'Sección 01 — Encabezamiento y hechos: relato.'],
    ['02', 'Sección 02 — Fundamentos procesales: competencia.'],
    ['03', 'Sección 03 — Fundamento de fondo: incumplimiento.'],
    ['04', 'Sección 04 — Cierre: súplica y otrosíes.'],
  ] as const) {
    await $.agent.spawn(lanzar({ description: `Sección ${n}`, prompt: `${linea} Extensión: 400 palabras.`, subagentType: tipo }))
  }
  expect(await lineaDe('desktop')).toContain('20 %')
  expect(await spinner()).toContain('· escrito: 20 % del total')

  // Dos redactores trabajan (4 herramientas cada uno) y otros dos terminan.
  for (const agente of ['redactor-1', 'redactor-2']) {
    for (let i = 0; i < 4; i += 1) await $.tool.call({ tool: 'Read', file_path: 'caso.md', agentId: agente } as never)
  }
  // Y uno de ellos ya ha escrito las 400 palabras que le pidieron.
  const cuatrocientas = Array.from({ length: 400 }, () => 'palabra').join(' ')
  await $.tool.call({ tool: 'Write', file_path: 'C:/casos/ficticio/secciones/01-hechos.md', content: cuatrocientas, agentId: 'redactor-1' } as never)
  for (const agente of ['redactor-3', 'redactor-4']) {
    await $.turn.complete({ agentId: agente, reason: 'answer', answer: 'Hecho.', durationMs: 1, isAborted: false, turnId: agente })
  }
  const media = await lineaDe('desktop')
  expect(media).toContain('60 %')
  expect(media).toContain('2 trabajando')
  expect(media.length).toBeLessThanOrEqual(46)
  expect(await enElPanel()).toContain('· ahora: el equipo redacta las secciones · 2 de 4 hechas')

  for (const agente of ['redactor-1', 'redactor-2']) {
    await $.turn.complete({ agentId: agente, reason: 'answer', answer: 'Hecho.', durationMs: 1, isAborted: false, turnId: agente })
  }
  expect(await lineaDe('desktop')).toContain('75 %')

  await $.tool.call({ tool: 'Bash', command: 'python escrito.py ensamblar "C:/casos/ficticio" --salida "demanda.docx" --palabras 1600' } as never)
  expect(await lineaDe('desktop')).toContain('90 %')
  expect(await enElPanel()).toContain('ahora: Word montado; repaso de coherencia')

  // Claude termina su turno con el Word final: 100 %.
  await $.turn.complete({ reason: 'answer', answer: 'Aquí tienes la demanda.', durationMs: 1, isAborted: false, turnId: 'principal' })
  const final = await lineaDe('desktop')
  expect(final).toContain('100 %')
  expect(final).toContain('Word entregado')
  // Sin la «s» suelta de «1 min 27 s» en otra línea: lo que no cabe entero, no entra.
  expect(final.length).toBeLessThanOrEqual(46)
  expect(final).not.toMatch(/ en \d+ min \d*$/)

  // El siguiente prompt (que no pide otro escrito) la retira.
  await $.prompt.submit({ text: 'Gracias', wait: false, origin: { kind: 'composer' } } as never)
  expect(await lineaDe('desktop')).toBe('')
})

test('la barra no se queda colgada: sin entrega, se retira; con el PDF enviado, llega al 100 %', { timeoutMs: 30_000 }, async ($, on) => {
  // Carlos (9/11/2026): la barra seguía en «75 % · el equipo trabajando (3 de 3)» con el PDF entregado hacía rato.
  motor(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const fila = async (): Promise<string> => {
    const banda = await $.ui.mount({ ...BANDA, surface: 'desktop' })
    const texto = (await banda.find({ type: 'Text', text: / %|Equipo/ }))?.text ?? ''
    await banda.unmount()
    return texto
  }
  await $.prompt.submit({ text: 'Redacta la contestación a la demanda de divorcio (caso ficticio), repartida entre el equipo', wait: false, origin: { kind: 'composer' } } as never)
  for (const descripcion of ['Luis: redactar los fundamentos', 'Clara: redactar los hechos', 'Alberto: fundamentos procesales']) {
    await $.agent.spawn(lanzar({ description: descripcion, prompt: 'Caso ficticio.', subagentType: 'general-purpose' }))
  }
  expect(await fila()).toContain('3 trabajando')
  const primero = Number(/redactor-(\d+)/.exec(JSON.stringify(await $.agent.spawn(lanzar({ description: 'María: ordenar el expediente', prompt: 'x', subagentType: 'general-purpose' }))))?.[1] ?? '4')
  for (let n = primero - 3; n <= primero; n += 1) {
    await $.turn.complete({ agentId: `redactor-${n}`, reason: 'answer', answer: 'Hecho.', durationMs: 1, isAborted: false, turnId: `t${n}` })
  }
  // Todos han terminado y Claude acaba su turno SIN entregar el documento.
  expect(await fila()).toContain('75 %')
  await $.turn.complete({ reason: 'answer', answer: 'El equipo ha terminado; ahora uno las partes.', durationMs: 1, isAborted: false, turnId: 'p1' })
  // Sigue un minuto a la vista…
  expect(await fila()).toContain('75 %')
  // …y al escribir otra cosa (o pasado el minuto) ya no está: no se queda colgada.
  await $.prompt.submit({ text: '¿qué nos dice Rufino?', wait: false, origin: { kind: 'composer' } } as never)
  expect(await fila()).toBe('')
  // Rufino ataca el escrito: él no es «el equipo trabajando (1 de 1)» ni devuelve la barra.
  await $.agent.spawn(lanzar({ description: 'Atacar el escrito como la parte contraria', prompt: 'x', subagentType: 'general-purpose' }))
  const conRufino = await fila()
  expect(conRufino).toContain('Rufino')
  expect(conRufino).not.toContain(' %')
  // Luis corrige el escrito: la barra vuelve sola.
  await $.agent.spawn(lanzar({ description: 'Luis: corregir la contestación', prompt: 'x', subagentType: 'general-purpose' }))
  expect(await fila()).toContain('75 %')
  // Claude envía el PDF y termina: 100 %, «PDF entregado».
  await $.tool.call({ tool: 'SendUserFile', files: ['C:/casos/01/CONTESTACION-DEMANDA-DIVORCIO.pdf'], status: 'normal' } as never)
  await $.turn.complete({ reason: 'answer', answer: 'Te he enviado el PDF.', durationMs: 1, isAborted: false, turnId: 'p2' })
  const final = await fila()
  expect(final).toContain('100 %')
  expect(final).toContain('entregado')
  // Con sitio (una terminal), dice que lo entregado es el PDF.
  const ancha = await $.ui.mount({ ...BANDA, surface: 'terminal' })
  expect((await ancha.find({ type: 'Text', text: / %/ }))?.text).toContain('PDF entregado')
  await ancha.unmount()
})

test('un aviso de tarea terminada no enciende ni cambia la barra', { timeoutMs: 30_000 }, async ($, on) => {
  motor(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const titulo = async (): Promise<string> => {
    const banda = await $.ui.mount({ ...BANDA, surface: 'terminal' })
    const texto = (await banda.find({ type: 'Text', text: / %/ }))?.text ?? ''
    await banda.unmount()
    return texto
  }
  // No lo escribe la persona: es el aviso de un subagente que ha acabado.
  await $.prompt.submit({ text: 'Tarea terminada: quiero que sepas que he escrito la sección 03 de la demanda', wait: false, origin: { kind: 'task-notification' } } as never)
  expect(await titulo()).toBe('')
  // Una carta al cliente con la skill de redactar: el título es «Carta al cliente», no «Redaccion rapida».
  await $.prompt.submit({ text: 'Redáctame una carta al cliente, clara y sin tecnicismos, que explique el escrito.', wait: false, origin: { kind: 'composer' } } as never)
  expect(await titulo()).toBe('')
  await $.skill.prompt({ skill: 'jurisprudenciator:redaccion-rapida', text: '…', frontmatter: {}, source: 'plugin' } as never)
  expect(await titulo()).toContain('Carta al cliente')
  expect(await titulo()).not.toContain('edaccion')
})
