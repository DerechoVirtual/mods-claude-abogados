// Pruebas del pulido del 09/11/2026 (v1.6.0): lo que se vio mal en la grabación
// del vídeo y lo que Carlos pidió después.
//   · La banda: solo los plazos del cliente activo, dos filas como mucho, nada
//     que se salga por la derecha.
//   · Citas: «art. 7.3» es el artículo 7; la petición no repite citas ni se
//     envía dos veces.
//   · Títulos legibles a partir del nombre del archivo.
//   · El panel de plazos: pestaña «Del escrito» (los plazos de un escrito, con
//     su cartel), «Mis plazos» con los del cliente delante y etiquetas sin
//     repetir el atajo.
//   · El contrario, rápido y corto.

import { expect, mock, test, type TestBody } from 'claude-code/testing'
import type { On } from 'claude-code'
import { extraerCitas, peticionVerificacion, revisarCitas, type ConfigRevisor } from '../hooks/lib/citas'
import { aprenderNombres, nombreLegible, peticionAtaque } from '../hooks/lib/escritos'
import { cartelPlazos, cuantoQueda, fechaCompleta, normalizarInforme, renglones, verPlazos } from '../hooks/plazos-escrito'

type Kit = Parameters<TestBody>[0]

// ── Funciones puras ─────────────────────────────────────────────────────────

const REVISOR: ConfigRevisor = {
  herramientasVerificacion: ['buscar_por_cita', 'buscar_articulo'],
  excluirHerramientas: [],
  analizarArchivosEscritos: true,
  leyes: [
    { clave: 'CC', nombre: 'Código Civil', alias: ['CC', 'Código Civil'], maxArticulo: 1976 },
    { clave: 'LEC', nombre: 'Ley de Enjuiciamiento Civil', alias: ['LEC'], maxArticulo: 827 },
  ],
}

test('Citas: «art. 7.3» es el artículo 7 (no el 7 y el 3) y la petición no repite ninguna', () => {
  const texto = 'Según el art. 7.3 LO 1/2025, el art. 10.4 y el art. 1964.2 CC. Otra vez el art. 7.3 LO 1/2025, y los arts. 23 y 31 LEC.'
  const citas = extraerCitas(texto, REVISOR, '2026-11-09')
  expect(citas.map(c => c.texto)).toEqual(['art. 7.3 LO 1/2025', 'art. 10.4', 'art. 1964.2 CC', 'art. 23 LEC', 'art. 31 LEC'])
  expect(citas.find(c => c.texto === 'art. 1964.2 CC')?.numeroArticulo).toBe(1964) // y no «artículo 2 del Código Civil»
  // Al artículo sin norma se le apunta la última citada antes, como pista (el semáforo no cambia).
  expect(citas.find(c => c.texto === 'art. 10.4')?.normaCercana).toBe('LO 1/2025')
  const peticion = peticionVerificacion(revisarCitas(citas, [], REVISOR), REVISOR)
  const lineas = peticion.split('\n').filter(l => /^\d+\. /.test(l))
  expect(lineas).toHaveLength(5)
  expect(new Set(lineas.map(l => l.replace(/^\d+\. /, ''))).size).toBe(5)
  expect(peticion).toContain('2. art. 10.4 (no dice la norma; la última citada antes era LO 1/2025: confírmalo)')
  expect(peticion).toContain('estas 5 citas')
  // Con una sola, en singular.
  expect(peticionVerificacion(revisarCitas(extraerCitas('El art. 1902 CC.', REVISOR, '2026-11-09'), [], REVISOR), REVISOR)).toContain('esta cita de tu última respuesta que no tiene respaldo')
})

test('Títulos: el nombre del archivo se escribe como lo escribiría una persona', () => {
  aprenderNombres(['Marcos Ibáñez', 'Divorcio contencioso c. Silvia Cortés'])
  expect(nombreLegible('C:/x/CONTESTACION-DEMANDA-DIVORCIO-Ibanez-Cortes.pdf')).toBe('Contestación a la demanda de divorcio · Ibáñez Cortés')
  expect(nombreLegible('C:/x/demanda-de-desahucio-lopez-20261109.docx')).toBe('Demanda de desahucio · López')
  expect(nombreLegible('C:/x/Demanda-juicio-ordinario-Gomez-Ruiz-c-Reformas-Ejemplo-Turia.pdf')).toBe('Demanda de juicio ordinario · Gómez Ruiz c. Reformas Ejemplo Turia')
  expect(nombreLegible('C:/x/Boceto recurso de apelacion.docx')).toBe('Boceto recurso de apelación')
  expect(nombreLegible('C:/x/RECURSO_APELACION_SENTENCIA_123.docx')).toBe('Recurso de apelación sentencia 123')
  expect(nombreLegible('C:/x/Escrito oposicion ejecucion Banco Ejemplo SA.docx')).toBe('Escrito de oposición a la ejecución · Banco Ejemplo SA')
  expect(nombreLegible('C:/x/demanda-borrador.md')).toBe('Demanda borrador')
})

test('Contrario: la petición pide un ataque rápido y corto, con la descripción que usa el equipo jurídico', () => {
  const p = peticionAtaque({ ruta: 'C:/x/demanda.docx', nombre: 'Demanda', carpeta: 'C:/x', via: 'ensamblado' })
  expect(p).toContain('con la descripción «Atacar el escrito como la parte contraria»')
  expect(p).toContain('entre 3 y 4 minutos')
  expect(p).toContain('entrega lo que tenga')
  expect(p).toContain('Como mucho 6 consultas a Jurisprudenciator')
  expect(p).toContain('«C:/x/ataque-de-la-contraria.md»')
  expect(p).toContain('No modifiques el escrito')
})

test('Plazos del escrito: cuenta atrás, fechas completas y el cartel', () => {
  expect(fechaCompleta('2026-11-13')).toBe('viernes 13 de noviembre de 2026')
  expect(renglones('Aclaración o complemento de la sentencia', 24, 2)).toEqual(['Aclaración o complemento', 'de la sentencia'])
  const informe = normalizarInforme(
    {
      documento: 'Decreto de admisión',
      jurisdiccion: 'civil',
      plazos: [
        { titulo: 'Contestación a la demanda', accion: 'Contestar', dias: 20, computo: 'hábiles', fecha_inicio: '2026-11-06', fecha_vencimiento: '2026-12-04' },
        { titulo: 'Vista de medidas', accion: 'Acudir', computo: 'fecha fija', fecha_vencimiento: '2026-11-24' },
        { titulo: 'Subsanar el poder', accion: 'Aportarlo', dias: 2, computo: 'hábiles', fecha_inicio: '2026-11-04', fecha_vencimiento: '2026-11-06' },
        { titulo: 'Sin título de verdad', accion: '', dias: -3, fecha_vencimiento: '31 de febrero' },
        { accion: 'sin título: se descarta' },
      ],
      avisos: ['Cuento desde la fecha del decreto.', 7],
    },
    '11:00',
  )
  expect(informe.plazos).toHaveLength(4)
  expect(informe.avisos).toEqual(['Cuento desde la fecha del decreto.'])
  expect(informe.plazos[3]).toEqual({ titulo: 'Sin título de verdad', accion: 'Sin título de verdad' }) // ni días negativos ni fechas imposibles
  // El cartel: lo primero que vence (no lo ya vencido), con su cuenta y su fecha completa.
  const vistos = verPlazos(informe)
  const cartel = cartelPlazos(informe, vistos, '2026-11-09')!
  expect(cartel.svg).toContain('LO PRIMERO QUE VENCE')
  expect(cartel.svg).toContain('Vista de medidas')
  expect(cartel.svg).toContain('Señalado para el martes 24 de noviembre de 2026')
  expect(cartel.svg).toContain('1 vencido')
  expect(cartel.svg.length).toBeLessThan(20_000)
  expect(cartel.svg).not.toMatch(/<script|onload=/)
  expect(cuantoQueda({ p: informe.plazos[0]!, indice: 0, restantes: 1, habiles: true, estado: 'rojo', guardable: true })).toBe('queda 1 día hábil')
  expect(cuantoQueda({ p: informe.plazos[0]!, indice: 0, restantes: 3, habiles: false, estado: 'ambar', guardable: false })).toBe('quedan 3 días')
})

// ── Con el motor ────────────────────────────────────────────────────────────

const AHORA = Date.UTC(2026, 10, 9, 10, 0, 0) // lunes 09/11/2026, 11:00 en Madrid
const LARGO = { timeoutMs: 20_000 } // en un ordenador cargado, la primera prueba tarda en arrancar
const RAIZ = '/demo/expedientes'
const ARCHIVOS: Record<string, string> = {
  'data/plazos.json': JSON.stringify({
    plazos: [
      { id: 'p1', asunto: 'García c. Aseguradora Ficticia', tipo: 'Contestación a la demanda', jurisdiccion: 'civil', notificacion: '2026-10-14', dias: 20, cliente: 'García' },
      { id: 'p2', asunto: 'Pérez (despido ficticio)', tipo: 'Demanda de despido', jurisdiccion: 'laboral', notificacion: '2026-10-08', dias: 20, especialesHabiles: true, cliente: 'Pérez' },
      { id: 'p3', asunto: 'Asunto viejo', tipo: 'Recurso', jurisdiccion: 'civil', notificacion: '2026-08-31', dias: 5 },
    ],
    papelera: [],
  }),
  'config/clientes.json': JSON.stringify({
    clientes: [
      { nombre: 'García', expediente: '0123/2026', jurisdiccion: 'civil', carpeta: `${RAIZ}/garcia`, color: '#2F6FED' },
      { nombre: 'López', expediente: '0456/2026', jurisdiccion: 'civil', carpeta: `${RAIZ}/lopez`, color: '#C2389E' },
      { nombre: 'Marcos Ibáñez', expediente: 'Divorcio contencioso 1452/2026 (TI Zaragoza, Familia, Plaza 2)', jurisdiccion: 'familia', carpeta: `${RAIZ}/ibanez`, color: '#2F6FED' },
    ],
  }),
  'config/festivos.json': JSON.stringify({ festivos: [{ fecha: '2026-12-08', nombre: 'Inmaculada Concepción' }] }),
  'config/siguientes.json': JSON.stringify({
    tipos: [{ id: 'otro', nombre: 'Escrito', patrones: [], acciones: ['carta-cliente', 'minuta', 'vista'] }],
    acciones: {
      'carta-cliente': { etiqueta: 'Carta al cliente explicando el escrito', porque: 'El cliente tiene que saberlo.', peticion: 'Redáctame una carta al cliente.' },
      minuta: { etiqueta: 'Minuta de honorarios orientativa', porque: 'Buen momento.', peticion: 'Prepárame una minuta.' },
      vista: { etiqueta: 'Preparar la vista', porque: 'Conviene llevarla preparada.', peticion: 'Prepárame la vista.' },
    },
  }),
  'data/cupo.json': JSON.stringify({ dia: '2026-11-09', semana: '2026-W46', usadoDia: 8, usadoSemana: 8, limites: { diario: 10, semanal: 30, origen: 'manual' } }),
}
const CLAVES = Object.keys(ARCHIVOS)
const claveDe = (ruta: string) => CLAVES.find(k => ruta.replace(/\\/g, '/').endsWith('/' + k)) ?? ruta
const comando = (command: string, args: string) =>
  ({ command, args, origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 } }) as const
const banda = (cols: number) =>
  ({ plugin: 'mods-abogados', component: 'AbovePrompt', props: { hasSurvey: false, isWorking: false, maxRows: 12, bodyColumns: cols, scroll: { offset: 0, bodyRows: 12 }, view: {} } }) as const
const panel = (id: string, cols = 90) =>
  ({ plugin: 'mods-abogados', component: 'Pane', requestId: id, props: { title: id, isFocused: true, bodyColumns: cols, placement: 'dock', scroll: { offset: 0, bodyRows: 60 }, view: {} } }) as const
const fin = (turnId: string, answer: string) => ({ answer, durationMs: 1000, isAborted: false, turnId, reason: 'answer' as const })

type Escena = { avisos: string[]; enviados: string[]; abiertos: string[]; cerrados: string[] }

function motor(on: On): Escena {
  const s: Escena = { avisos: [], enviados: [], abiertos: [], cerrados: [] }
  const archivos = { ...ARCHIVOS }
  const memoria: Record<string, unknown> = {}
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('command.register', () => ({ value: { command: 'x' } }))
  on('tool.register', () => ({ value: undefined }) as never)
  on('tool.list', () => ({ value: [] }) as never)
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
  on('ui.backdrop', () => ({ value: { isDrawn: false, reason: 'prueba' } }))
  on('ui.open', (_$, e) => {
    s.abiertos.push(e.id)
    return { value: { isPlaced: true } }
  })
  on('ui.close', (_$, e) => {
    s.cerrados.push(e.id)
    return { value: undefined }
  })
  on('ui.panes', () => ({ value: s.abiertos.filter(id => !s.cerrados.includes(id)).map(id => ({ id })) }) as never)
  on('session.messages', () => ({ value: [] }))
  on('turn.start', (_$, e) => ({ turnId: e.turnId }))
  on('turn.complete', (_$, e) => ({ text: e.answer }))
  on('prompt.submit', (_$, e) => {
    s.enviados.push(e.text)
    return { text: e.text }
  })
  on('store.get', (_$, e) => ({ value: memoria[e.key] }))
  on('store.set', (_$, e) => {
    memoria[e.key] = e.value
    return { value: undefined }
  })
  on('model.complete', () => ({ value: { isAnswered: false, reason: 'api-error', usage: { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 } } }) as never)
  on('tool.call', (_$, e) => (String(e.tool) === 'Bash' ? { result: 'ok', text: ' "ok": true,\n "errores": []' } : { result: 'ok', text: 'hecho' }))
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>[motor]</Text>
  })
  return s
}

type Nodo = { type?: string; props?: Record<string, unknown>; children?: unknown[] } | string | number | null | undefined

/** Lo que se lee en un elemento (de un botón, su etiqueta). */
function leer(n: Nodo): string {
  if (n === null || n === undefined || typeof n === 'boolean') return ''
  if (typeof n === 'string' || typeof n === 'number') return String(n)
  const dentro = ((n.children ?? []) as Nodo[]).map(leer).join(' ')
  // De un botón se lee lo que lleva dentro (terminal) o, si no lleva nada, su etiqueta (app de escritorio).
  if (n.type === 'Button') return dentro || String(n.props?.label ?? '')
  return dentro
}

/** Las filas que pone el plugin en la banda (sin lo que dibuja el motor debajo), con lo que se lee en cada una. */
async function filasDeLaBanda($: Kit, cols: number, surface: 'desktop' | 'terminal'): Promise<string[]> {
  const ui = await $.ui.mount({ ...banda(cols), surface })
  const arbol = (await ui.drawn()) as Nodo
  await ui.unmount()
  if (!arbol || typeof arbol !== 'object' || arbol.type !== 'Box') return []
  return ((arbol.children ?? []) as Nodo[]).map(leer).filter(t => t !== '[motor]')
}

test('Banda: con cliente activo solo salen SUS plazos; sin cliente, no los vencidos de hace más de una semana', LARGO, async ($, on) => {
  mock.clock(on, { now: AHORA })
  const s = motor(on)
  await $.session.start({ cwd: '/demo', surface: 'desktop', isInteractive: true })
  await $.command.run(comando('citas', '')) // trabajo jurídico: sale la banda
  // Sin cliente: el vencido reciente (Pérez, venció el vie 06/11) sí; «Asunto viejo» (septiembre) no.
  const sinCliente = (await filasDeLaBanda($, 120, 'desktop')).join(' | ')
  expect(sinCliente).toContain('Pérez (despido ficticio)')
  expect(sinCliente).toContain('VENCIDO')
  expect(sinCliente).toContain('+1 más') // Pérez y García; el viejo no cuenta
  expect(sinCliente).not.toContain('Asunto viejo')
  // Marcos Ibáñez no tiene plazos: la banda NO enseña el vencido de otro cliente (lo que se vio en la grabación).
  await $.command.run(comando('cliente', 'marcos'))
  for (const cols of [57, 93, 140]) {
    const fila = (await filasDeLaBanda($, cols, 'desktop')).join(' | ')
    expect(fila).toContain('● Marcos Ibáñez')
    expect(fila).not.toMatch(/⏳|VENCIDO|Pérez|más/)
  }
  // Con sitio, el expediente en corto (su número), no el texto entero del juzgado.
  expect((await filasDeLaBanda($, 140, 'desktop')).join(' ')).toContain('● Marcos Ibáñez · 1452/2026')
  // García sí tiene uno: sale el suyo, con el tipo de escrito (el asunto ya lo dice la pastilla del cliente).
  await $.command.run(comando('cliente', 'garcia'))
  const garcia = (await filasDeLaBanda($, 140, 'desktop')).join(' | ')
  expect(garcia).toContain('⏳ Contestación a la demanda · 2 días hábiles · mié 11/11')
  expect(garcia).not.toMatch(/Pérez|más/)
  expect(s.avisos.some(a => a.includes('Asunto viejo'))).toBe(false)
})

test('Banda: con todo a la vez y el chat estrecho, dos filas como mucho y nada se sale por la derecha', { ...LARGO, options: { mod_anonimizar: true } }, async ($, on) => {
  const reloj = mock.clock(on, { now: AHORA })
  const s = motor(on)
  await $.session.start({ cwd: '/demo', surface: 'desktop', isInteractive: true })
  await $.command.run(comando('cliente', 'garcia'))
  await $.turn.start({ text: 'Redacta la contestación', turnId: 't1' })
  await $.tool.call({ tool: 'Read', file_path: `${RAIZ}/lopez/contrato.md` } as never) // expediente cruzado
  await $.tool.call({ tool: 'Write', file_path: `${RAIZ}/garcia/demanda-borrador.md`, content: 'D. Juan García, DNI 12345678Z.' } as never)
  await $.tool.call({ tool: 'Bash', command: `python escrito.py ensamblar . --salida "${RAIZ}/garcia/CONTESTACION-DEMANDA-DIVORCIO-Ibanez-Cortes-20261109.docx"` } as never)
  await $.turn.complete(fin('t1', 'Listo. Según el art. 1902 CC y la STS 45/2031.'))
  await reloj.advance(200)
  for (const surface of ['desktop', 'terminal'] as const) {
    for (const cols of [40, 57, 93, 140]) {
      const filas = await filasDeLaBanda($, cols, surface)
      expect(filas.length).toBeLessThanOrEqual(2) // antes eran tres (y la tercera, cortada)
      for (const fila of filas) expect(fila.length).toBeLessThanOrEqual(cols)
      const ui = await $.ui.mount({ ...banda(cols), surface })
      // Los botones de la fila de acción están enteros; el texto es el que se encoge.
      expect(String((await ui.find({ key: 'siguientes-abrir' }))?.props.label)).toBe('Siguientes pasos')
      expect(String((await ui.find({ key: 'siguientes-ahora-no' }))?.props.label)).toBe('Ahora no')
      expect((await ui.find({ type: 'Text', text: /✅/ }))?.props.wrap).toBe('truncate-end')
      await ui.unmount()
    }
  }
  // Con sitio, el título del escrito legible (no el nombre del archivo en mayúsculas y sin tildes).
  expect((await filasDeLaBanda($, 140, 'desktop'))[1]).toContain('«Contestación a la demanda de divorcio · Ibáñez Cortés»')
  // Las citas pendientes van en la misma fila que las demás pastillas, con su plural.
  expect((await filasDeLaBanda($, 140, 'desktop'))[0]).toMatch(/§ 2 (citas por verificar|por verificar)/)
  // Al elegir un siguiente paso empieza otro trabajo: «Escrito terminado» se va de la banda (también el botón del contrario).
  const p = await $.ui.mount({ ...panel('siguientes'), surface: 'desktop' })
  await p.press({ key: 'siguiente-1' })
  await p.unmount()
  const despues = await $.ui.mount({ ...banda(140), surface: 'desktop' })
  expect(await despues.find({ key: 'siguientes-abrir' })).toBeUndefined()
  expect(await despues.find({ key: 'contrario-atacar' })).toBeUndefined()
  await despues.unmount()
  expect(s.enviados).toHaveLength(1)
})

test('Citas: «Pedir verificación» se envía una sola vez aunque se pulse tres', LARGO, async ($, on) => {
  mock.clock(on, { now: AHORA })
  const s = motor(on)
  await $.session.start({ cwd: '/demo', surface: 'desktop', isInteractive: true })
  await $.turn.start({ text: 'Redacta', turnId: 't1' })
  await $.turn.complete(fin('t1', 'Según el art. 7.3 LO 1/2025 y, otra vez, el art. 7.3 LO 1/2025.'))
  const p = await $.ui.mount({ ...panel('citas'), surface: 'desktop' })
  expect(String((await p.find({ key: 'pedir-verificacion' }))?.props.label)).toBe('Pedir verificación') // sin «(v)»: la app ya dibuja la tecla
  await Promise.all([p.press({ key: 'pedir-verificacion' }), p.press({ key: 'pedir-verificacion' })])
  await p.press({ key: 'pedir-verificacion' })
  await p.unmount()
  expect(s.enviados).toHaveLength(1)
  expect(s.enviados[0]!.match(/art\. 7\.3 LO 1\/2025/g)).toHaveLength(1)
  expect(s.enviados[0]).toContain('esta cita')
})

test('/plazos saca los plazos del escrito y los enseña en la pestaña «Del escrito»', LARGO, async ($, on) => {
  const reloj = mock.clock(on, { now: AHORA })
  const s = motor(on)
  await $.session.start({ cwd: '/demo', surface: 'desktop', isInteractive: true })
  // /plazos a secas: abre el panel y pide a Claude los plazos del escrito de la conversación.
  const r = await $.command.run(comando('plazos', ''))
  expect(r.text).toContain('Buscando los plazos del escrito')
  expect(s.abiertos).toContain('plazos')
  await reloj.advance(200)
  expect(s.enviados).toHaveLength(1)
  expect(s.enviados[0]).toContain('mcp__mods-abogados__plazos_del_escrito')
  expect(s.enviados[0]).toContain('Si en la conversación no hay ningún escrito, no inventes nada')
  // Escribirlo otra vez no lo cierra (parecía que «no hacía nada») ni vuelve a pedirlo.
  await $.command.run(comando('plazos', ''))
  await reloj.advance(200)
  expect(s.cerrados).not.toContain('plazos')
  expect(s.enviados).toHaveLength(1)

  // Claude entrega los plazos a la herramienta del plugin.
  const entrega = await $.tool.call({
    tool: 'mcp__mods-abogados__plazos_del_escrito',
    documento: 'Decreto de admisión de la demanda de divorcio',
    organo: 'Tribunal de Instancia de Zaragoza',
    procedimiento: 'Divorcio contencioso 1452/2026',
    jurisdiccion: 'civil',
    fecha_notificacion: '2026-11-06',
    avisos: ['Cuento desde la fecha de notificación.'],
    plazos: [
      { titulo: 'Contestación a la demanda', accion: 'Presentar la contestación', parte: 'Marcos Ibáñez', dias: 20, computo: 'hábiles', fecha_inicio: '2026-11-06', fecha_vencimiento: '2026-12-03', fundamento: 'art. 405 LEC', cita: 'Emplácese al demandado' },
      { titulo: 'Recurso de reposición', accion: 'Recurrir el decreto', dias: 5, computo: 'hábiles', fecha_inicio: '2026-11-06', fecha_vencimiento: '2026-11-13', fundamento: 'art. 452 LEC' },
      { titulo: 'Vista de medidas provisionales', accion: 'Acudir', computo: 'fecha fija', fecha_vencimiento: '2026-11-24' },
    ],
  } as never)
  expect(String(entrega.result)).toContain('Panel al día con 3 plazos')
  expect(String(entrega.result)).toContain('El que vence antes: Recurso de reposición, el 13/11/2026 (quedan 4 días hábiles)')
  expect(s.avisos).toContain('⚖ 3 plazos del escrito en el panel.')

  for (const surface of ['desktop', 'terminal'] as const) {
    const p = await $.ui.mount({ ...panel('plazos'), surface })
    const textos = (await p.findAll({ type: 'Text' })).map(t => t.text)
    const todo = textos.join(' | ')
    // La pestaña activa es «Del escrito» (botón principal: en la app el subrayado no se ve).
    expect((await p.find({ key: 'pestana-escrito' }))?.props.variant).toBe('primary')
    expect((await p.find({ key: 'pestana-plazos' }))?.props.variant).toBeUndefined()
    expect(todo).toContain('📄 Decreto de admisión de la demanda de divorcio')
    expect(todo).toContain('notificado el viernes 6 de noviembre de 2026')
    // Una tarjeta por plazo, con la cuenta atrás en grande y lo que hay que hacer.
    expect(textos).toContain('4')
    expect(textos).toContain('días hábiles')
    expect(todo).toContain('📅 Vence el viernes 13 de noviembre de 2026 · 5 días hábiles desde el vie 06/11')
    expect(todo).toContain('📅 Señalado para el martes 24 de noviembre de 2026')
    expect(todo).toContain('⚖ art. 405 LEC · 👤 Marcos Ibáñez')
    expect(todo).toContain('«Emplácese al demandado»')
    // El plugin repasa la fecha con el calendario del despacho: 20 días hábiles desde el 06/11 son el 04/12, no el 03/12.
    expect(todo).toContain('⚠ Con los festivos del despacho saldría el viernes 4 de diciembre de 2026: compruébalo.')
    expect(todo).toContain('⚠ A tener en cuenta')
    // El cartel (lo primero que vence y el calendario) solo donde se pueden dibujar imágenes.
    const svg = await p.find({ type: 'Svg' })
    if (surface === 'desktop') {
      expect(String(svg?.props.source)).toContain('LO PRIMERO QUE VENCE')
      expect(String(svg?.props.source)).toContain('Vence el viernes 13 de noviembre de 2026')
      expect(String(svg?.props.alt)).toContain('Lo primero que vence: Recurso de reposición, viernes 13 de noviembre de 2026 (quedan 4 días hábiles)')
    } else {
      expect(svg).toBeUndefined()
      expect(todo).toContain('⏰ LO PRIMERO QUE VENCE · QUEDAN 4 DÍAS HÁBILES')
    }
    await p.unmount()
  }

  // «Guardar en "Mis plazos"» pasa el plazo a la tabla, y la pestaña «Mis plazos» lo enseña.
  const p = await $.ui.mount({ ...panel('plazos'), surface: 'desktop' })
  await Promise.all([p.press({ key: 'escrito-guardar-1' }), p.press({ key: 'escrito-guardar-1' })])
  expect(await p.find({ type: 'Text', text: /✓ Guardado en «Mis plazos»/ })).toBeDefined()
  await p.press({ key: 'pestana-plazos' })
  expect((await p.findAll({ type: 'Text', text: /Divorcio contencioso 1452\/2026/ })).length).toBe(1) // una vez, aunque se pulsó dos
  await p.unmount()

  // /plazos <ruta> analiza ese archivo; /plazos cerrar cierra.
  const conRuta = await $.command.run(comando('plazos', '"C:/casos/providencia.pdf"'))
  expect(conRuta.text).toContain('Leyendo el escrito')
  await reloj.advance(200)
  expect(s.enviados[1]).toContain('que está en: C:/casos/providencia.pdf')
  expect((await $.command.run(comando('plazos', 'cerrar'))).text).toBe('Panel de plazos cerrado.')
  expect(s.cerrados).toContain('plazos')
})

test('«Mis plazos»: los del cliente activo delante, pestañas y etiquetas sin repetir el atajo', LARGO, async ($, on) => {
  mock.clock(on, { now: AHORA })
  motor(on)
  await $.session.start({ cwd: '/demo', surface: 'desktop', isInteractive: true })
  await $.command.run(comando('cliente', 'garcia'))
  await $.command.run(comando('plazo-borrar', '')) // abre «Mis plazos»
  const p = await $.ui.mount({ ...panel('plazos'), surface: 'desktop' })
  const textos = (await p.findAll({ type: 'Text' })).map(t => t.text)
  expect(textos.some(t => t.includes('PLAZOS PROCESALES · Cliente: García'))).toBe(true)
  // Primero «De García» con el suyo; después, atenuado, el resto del despacho.
  const deGarcia = textos.indexOf('De García')
  const resto = textos.indexOf('Resto del despacho')
  const suyo = textos.findIndex(t => t.includes('1. García c. Aseguradora Ficticia'))
  const ajeno = textos.findIndex(t => t.includes('Pérez (despido ficticio)'))
  expect(deGarcia).toBeGreaterThan(-1)
  expect(deGarcia < suyo && suyo < resto && resto < ajeno).toBe(true)
  expect((await p.find({ type: 'Text', text: /Pérez \(despido ficticio\)/ }))?.props.dimColor).toBe(true)
  // En la app de escritorio la tecla va en su chapa: la etiqueta no la repite. La pestaña activa, botón principal.
  expect(String((await p.find({ key: 'nuevo' }))?.props.label)).toBe('+ Nuevo plazo')
  expect(String((await p.find({ key: 'recargar' }))?.props.label)).toBe('Recargar')
  expect((await p.find({ key: 'pestana-plazos' }))?.props.variant).toBe('primary')
  expect(textos.join(' ')).not.toMatch(/\.json|config\//)
  await p.unmount()
  // En el terminal sí se dice la tecla.
  const t = await $.ui.mount({ ...panel('plazos'), surface: 'terminal' })
  expect(String((await t.find({ key: 'nuevo' }))?.props.label)).toBe('+ Nuevo plazo (n)')
  await t.unmount()
  // /plazo-borrar 1 es el primero de la tabla tal como se ve: el de García.
  const r = await $.command.run(comando('plazo-borrar', '1'))
  expect(r.text).toContain('García c. Aseguradora Ficticia')
})
