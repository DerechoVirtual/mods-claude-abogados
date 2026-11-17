// Pruebas de los Mods 7 (Semáforo MASC) y 8 (procurador): umbrales y
// excepciones de postulación, acreditación del MASC, detección del archivo de
// demanda y el recorrido completo en la banda y en el panel /ficha.
// Las reglas son ORIENTATIVAS (config/masc.json y config/postulacion.json):
// estas pruebas comprueban que el código las aplica, no que sean correctas en
// Derecho; eso debe validarlo un abogado.

import { expect, test } from 'claude-code/testing'
import type { On } from 'claude-code'
import {
  avisoProcurador,
  claveFicha,
  estadoMasc,
  euros,
  exigeMasc,
  leerArgumentosMasc,
  leerCuantia,
  MASC_POR_DEFECTO,
  normalizarFichas,
  POSTULACION_POR_DEFECTO,
  rutaDeDemanda,
} from '../hooks/lib/expediente'
import { leerFechaUsuario } from '../hooks/lib/plazos'

const P = POSTULACION_POR_DEFECTO
const M = MASC_POR_DEFECTO
const AVISO = 'Postulación obligatoria (arts. 23 y 31 LEC)'

// ── Procurador (Mod 8) ──────────────────────────────────────────────────────

test('Procurador: los cuatro casos de referencia', () => {
  // Desahucio (verbal por razón de la MATERIA, art. 250.1.1.º): procurador siempre.
  expect(avisoProcurador({ procedimiento: 'verbal-materia', cuantia: 1200 }, P)?.texto).toBe(AVISO)
  // Verbal por razón de la CUANTÍA que no excede de 2.000 €: exento (arts. 23.2.1.º y 31.2.1.º).
  expect(avisoProcurador({ procedimiento: 'verbal-cuantia', cuantia: 1500 }, P)).toBe(null)
  // Ordinario: procurador siempre.
  expect(avisoProcurador({ procedimiento: 'ordinario', cuantia: 8000 }, P)?.texto).toBe(AVISO)
  // Petición inicial del monitorio: exenta, sea cual sea la cuantía.
  expect(avisoProcurador({ procedimiento: 'monitorio-peticion-inicial', cuantia: 50000 }, P)).toBe(null)
})

test('Procurador: el umbral, el procurador ya designado y la ficha sin procedimiento', () => {
  expect(avisoProcurador({ procedimiento: 'verbal-cuantia', cuantia: 2000 }, P)).toBe(null) // «no exceda de 2.000»
  expect(avisoProcurador({ procedimiento: 'verbal-cuantia', cuantia: 2000.01 }, P)?.texto).toBe(AVISO)
  expect(avisoProcurador({ procedimiento: 'verbal-cuantia', cuantia: 2340 }, P)?.motivo).toContain('2.340 €')
  expect(avisoProcurador({ procedimiento: 'verbal-materia', cuantia: 1200, procurador: 'D. Luis Pérez García' }, P)).toBe(null)
  expect(avisoProcurador({ procedimiento: 'verbal-cuantia' }, P)).toBe(null) // sin cuantía no se decide
  expect(avisoProcurador({ cuantia: 3000 }, P)?.texto).toBe(AVISO) // sin procedimiento: solo por encima del umbral
  expect(avisoProcurador({ cuantia: 1000 }, P)).toBe(null)
  expect(avisoProcurador(undefined, P)).toBe(null)
  expect(avisoProcurador({ procedimiento: 'medidas-urgentes-previas' }, P)).toBe(null)
})

// ── MASC (Mod 7) ────────────────────────────────────────────────────────────

const LOPEZ = {
  procedimiento: 'verbal-materia',
  cuantia: 14400,
  procurador: 'D. Luis Pérez García',
  masc: { medio: 'burofax', fecha: '2026-09-25', documento: 'DOC. 5 · burofax y certificado de entrega', nota: 'Oferta de pago en dos plazos; sin respuesta.' },
}

test('MASC: acreditado, incompleto, sin intento y materia exceptuada', () => {
  const lopez = estadoMasc(LOPEZ, M)
  expect(lopez.tipo).toBe('acreditado')
  expect(lopez.tipo === 'acreditado' && lopez.resumen).toBe('Burofax con propuesta de negociación · 25/09/2026 · DOC. 5 · burofax y certificado de entrega')
  expect(estadoMasc({ masc: { medio: 'burofax', fecha: '2026-09-25', documento: '' } }, M)).toEqual({ tipo: 'falta', faltan: ['documento'] })
  expect(estadoMasc({ procedimiento: 'ordinario' }, M)).toEqual({ tipo: 'falta', faltan: ['medio', 'fecha', 'documento'] })
  expect(estadoMasc({ excepcionMasc: 'cambiario' }, M).tipo).toBe('excepcion')
  // El desahucio por falta de pago no está entre las excepciones del art. 5.2.
  expect(Object.values(M.excepciones).some(t => /desahucio/i.test(t))).toBe(false)
  expect(exigeMasc('civil', M)).toBe(true)
  expect(exigeMasc('Familia', M)).toBe(true)
  expect(exigeMasc('laboral', M)).toBe(false)
  expect(exigeMasc(undefined, M)).toBe(true)
})

test('MASC: detecta la escritura de una demanda en la carpeta del expediente activo', () => {
  const carpeta = 'C:\\exp\\lopez'
  const cwd = 'C:/despacho'
  const escribir = (file_path: string, tool = 'Write') => rutaDeDemanda({ tool, file_path }, carpeta, cwd, M)
  // Secciones de la redacción rápida y el borrador directo.
  expect(escribir('C:/exp/lopez/redaccion/demanda-de-desahucio-lopez-20261109/secciones/01-hechos.md')).toContain('secciones/01-hechos.md')
  expect(escribir('C:\\exp\\lopez\\Demanda-Lopez.md', 'Edit')).toContain('Demanda-Lopez.md')
  // El ensamblado del Word con --salida.
  expect(rutaDeDemanda({ tool: 'Bash', command: 'python escrito.py ensamblar . --salida "C:/exp/lopez/demanda-lopez.docx"' }, carpeta, cwd, M)).toBe('C:/exp/lopez/demanda-lopez.docx')
  // Lo que NO cuenta.
  expect(escribir('C:/exp/lopez/contestacion-a-la-demanda.md')).toBe(null)
  expect(escribir('C:/exp/lopez/demanda-ejecutiva.md')).toBe(null)
  expect(escribir('C:/exp/garcia/demanda.md')).toBe(null) // otro expediente
  expect(escribir('C:/exp/lopez/notas.md')).toBe(null)
  expect(escribir('C:/exp/lopez/demanda.md', 'Read')).toBe(null) // leer no es escribir
  expect(rutaDeDemanda({ tool: 'Bash', command: 'cat C:/exp/lopez/demanda.md' }, carpeta, cwd, M)).toBe(null)
  // Si la carpeta del expediente se llama «demandas», solo cuenta lo que hay dentro.
  expect(rutaDeDemanda({ tool: 'Write', file_path: '/x/demandas/lopez/notas.md' }, '/x/demandas/lopez', '/', M)).toBe(null)
  // Rutas relativas a la carpeta de la sesión.
  expect(rutaDeDemanda({ tool: 'Write', file_path: 'expedientes/lopez/demanda.md' }, 'expedientes/lopez', '/demo', M)).toBe('expedientes/lopez/demanda.md')
})

test('MASC: /masc lee medio, fecha y documento', () => {
  const fecha = (t: string) => leerFechaUsuario(t, '2026-11-09')
  expect(leerArgumentosMasc('burofax | 25/09/2026 | DOC. 5 · burofax | sin respuesta', M, fecha)).toEqual({
    masc: { medio: 'burofax', fecha: '2026-09-25', documento: 'DOC. 5 · burofax', nota: 'sin respuesta' },
  })
  expect(leerArgumentosMasc('Oferta vinculante | hoy | DOC. 7', M, fecha)).toEqual({ masc: { medio: 'oferta-vinculante', fecha: '2026-11-09', documento: 'DOC. 7' } })
  expect('error' in leerArgumentosMasc('telegrama | 25/09/2026 | DOC. 5', M, fecha)).toBe(true)
  expect('error' in leerArgumentosMasc('burofax | 31/02/2026 | DOC. 5', M, fecha)).toBe(true)
  expect('error' in leerArgumentosMasc('burofax | 25/09/2026', M, fecha)).toBe(true) // sin documento (art. 10)
})

test('Ficha: cuantías, euros, claves y lectura tolerante', () => {
  expect(leerCuantia('2.340')).toBe(2340)
  expect(leerCuantia('2.340,50 €')).toBe(2340.5)
  expect(leerCuantia('14.400')).toBe(14400)
  expect(leerCuantia('1200')).toBe(1200)
  expect(leerCuantia('mucho')).toBe(null)
  expect(euros(14400)).toBe('14.400 €')
  expect(euros(2340.5)).toBe('2.340,50 €')
  expect(claveFicha({ nombre: 'López', expediente: '0456/2026' })).toBe('0456/2026')
  expect(claveFicha({ nombre: 'Laura Pérez' })).toBe('laura perez')
  expect(normalizarFichas({ fichas: { a: { cuantia: 'mucho', procurador: '', masc: { medio: 'burofax' } } } })).toEqual({
    a: { masc: { medio: 'burofax', fecha: '', documento: '' } },
  })
})

// ── Recorrido completo en la banda y el panel ───────────────────────────────

const CLIENTES = {
  clientes: [
    { nombre: 'García', expediente: '0123/2026', jurisdiccion: 'civil', carpeta: 'expedientes/garcia', color: '#2F6FED' },
    { nombre: 'López', expediente: '0456/2026', jurisdiccion: 'civil', carpeta: 'expedientes/lopez', color: '#C2389E' },
    { nombre: 'Pérez (despido)', expediente: '0999/2026', jurisdiccion: 'laboral', carpeta: 'expedientes/perez', color: '#6B4FBB' },
  ],
}
const FICHAS = {
  fichas: {
    '0456/2026': LOPEZ,
    '0123/2026': { procedimiento: 'verbal-cuantia', cuantia: 2340 },
    '0999/2026': { procedimiento: 'ordinario', cuantia: 9000, procurador: 'D.ª Ana Ficticia' },
  },
}
const BANDA = {
  plugin: 'mods-abogados',
  component: 'AbovePrompt',
  props: { hasSurvey: false, isWorking: false, maxRows: 12, bodyColumns: 120, scroll: { offset: 0, bodyRows: 12 }, view: {} },
} as const
const PANEL = {
  plugin: 'mods-abogados',
  component: 'Pane',
  requestId: 'ficha',
  props: { title: 'ficha', isFocused: true, bodyColumns: 110, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} },
} as const
const comando = (command: string, args: string) =>
  ({ command, args, origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 } }) as const
const ARCHIVOS = ['data/plazos.json', 'data/cliente-activo.json', 'data/cupo.json', 'data/fichas.json', 'config/clientes.json', 'config/masc.json', 'config/postulacion.json']
const claveDe = (ruta: string) => ARCHIVOS.find(k => ruta.replace(/\\/g, '/').endsWith('/' + k)) ?? ruta

function simularMotor(on: On, archivos: Record<string, string>, escritos: Record<string, string>, avisos: string[]) {
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('command.register', () => ({ value: { command: 'x' } }))
  on('clock.now', () => ({ value: Date.UTC(2026, 10, 9, 10, 0, 0) }))
  on('fs.exists', (_$, e) => ({ value: claveDe(e.path) in archivos }))
  on('fs.read', (_$, e) => (claveDe(e.path) in archivos ? { value: archivos[claveDe(e.path)]! } : { deny: 'no existe' }))
  on('fs.write', (_$, e) => {
    escritos[claveDe(e.path)] = e.text
    archivos[claveDe(e.path)] = e.text
    return { value: undefined }
  })
  on('ui.toast', (_$, e) => {
    avisos.push(e.text)
    return { value: undefined }
  })
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.panes', () => ({ value: [] }))
  on('ui.close', () => ({ value: undefined }))
  on('ui.backdrop', () => ({ value: { isDrawn: false, reason: 'prueba' } }))
  on('session.messages', () => ({ value: [] }))
  on('turn.start', (_$, e) => ({ turnId: e.turnId }))
  on('turn.complete', (_$, e) => ({ text: e.answer }))
  on('tool.call', () => ({ result: 'ok', text: 'hecho' }))
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>[motor]</Text>
  })
}

function archivosBase(): Record<string, string> {
  return {
    'data/plazos.json': JSON.stringify({ plazos: [], papelera: [] }),
    'config/clientes.json': JSON.stringify(CLIENTES),
    'data/fichas.json': JSON.stringify(FICHAS),
  }
}

async function textoDeLaFicha(montar: () => Promise<{ find: (q: { type: string; text: RegExp }) => Promise<{ text?: string } | undefined>; unmount: () => Promise<void> }>) {
  const ui = await montar()
  const t = (await ui.find({ type: 'Text', text: /^⚠ / }))?.text ?? null
  await ui.unmount()
  return t
}

test('Mods 7 y 8: García sin procurador ni MASC; al escribir la demanda avisa; desde /ficha se registra y el aviso se va', { timeoutMs: 20_000 }, async ($, on) => {
  const escritos: Record<string, string> = {}
  const avisos: string[] = []
  simularMotor(on, archivosBase(), escritos, avisos)
  await $.session.start({ cwd: '/demo', surface: 'terminal', isInteractive: false })
  await $.command.run(comando('cliente', 'garcia'))
  const banda = () => textoDeLaFicha(() => $.ui.mount({ ...BANDA, surface: 'terminal' }))

  // Al activar García: solo el procurador (verbal por cuantía de 2.340 €). El MASC aún no, porque no hay demanda en curso.
  expect(await banda()).toBe(`⚠ ${AVISO}`)

  // Claude escribe la demanda en la carpeta de García: ahora también el MASC, y un aviso emergente. La llamada no se toca.
  const r = await $.tool.call({ tool: 'Write', file_path: '/demo/expedientes/garcia/demanda-garcia.md', content: 'DEMANDA…' } as never)
  expect(r.result).toBe('ok')
  expect(await banda()).toBe('⚠ Sin MASC acreditado · Sin procurador (arts. 23 y 31 LEC)')
  expect(avisos.some(a => a.includes('Sin MASC acreditado en la ficha de García') && a.includes('faltan el medio, la fecha y el documento'))).toBe(true)

  // En /ficha: Burofax, fecha y documento → Guardar.
  for (const surface of ['terminal', 'desktop'] as const) {
    const p = await $.ui.mount({ ...PANEL, surface })
    expect(await p.find({ type: 'Text', text: /FICHA DEL EXPEDIENTE · García · 0123\/2026/ })).toBeDefined()
    expect(await p.find({ type: 'Text', text: /debe\s+validarlas un abogado/ })).toBeDefined()
    await p.unmount()
  }
  const p = await $.ui.mount({ ...PANEL, surface: 'desktop' })
  await p.press({ key: 'masc-burofax' })
  await p.input({ key: 'ficha-fecha', text: '20/03/2026', kind: 'change' })
  await p.input({ key: 'ficha-documento', text: 'DOC. 5 · reclamación y justificante de recepción', kind: 'change' })
  await p.press({ key: 'masc-guardar' })
  expect(await p.find({ type: 'Text', text: /✓ Acreditado: Burofax con propuesta de negociación · 20\/03\/2026/ })).toBeDefined()
  const guardada = JSON.parse(escritos['data/fichas.json'] ?? '{}').fichas['0123/2026']
  expect(guardada.masc).toEqual({ medio: 'burofax', fecha: '2026-03-20', documento: 'DOC. 5 · reclamación y justificante de recepción' })
  expect(await banda()).toBe(`⚠ ${AVISO}`) // queda solo el procurador

  // Procurador designado → sin avisos.
  await p.input({ key: 'ficha-procurador', text: 'D.ª Marta Ficticia', kind: 'change' })
  await p.press({ key: 'ficha-guardar-datos' })
  await p.unmount()
  expect(JSON.parse(escritos['data/fichas.json'] ?? '{}').fichas['0123/2026'].procurador).toBe('D.ª Marta Ficticia')
  expect(await banda()).toBe(null)
  // La ficha de López sigue intacta.
  expect(JSON.parse(escritos['data/fichas.json'] ?? '{}').fichas['0456/2026'].masc.fecha).toBe('2026-09-25')
})

test('Mods 7 y 8: López (desahucio con burofax y procurador) no avisa; laboral no exige MASC; /masc registra en una línea', { timeoutMs: 20_000 }, async ($, on) => {
  const escritos: Record<string, string> = {}
  const avisos: string[] = []
  simularMotor(on, archivosBase(), escritos, avisos)
  await $.session.start({ cwd: '/demo', surface: 'terminal', isInteractive: false })
  const banda = () => textoDeLaFicha(() => $.ui.mount({ ...BANDA, surface: 'terminal' }))

  await $.command.run(comando('cliente', 'lopez'))
  await $.tool.call({ tool: 'Write', file_path: 'expedientes/lopez/redaccion/demanda-de-desahucio/secciones/01-hechos.md', content: 'x' } as never)
  expect(await banda()).toBe(null)
  expect(avisos.some(a => a.includes('MASC'))).toBe(false)

  // Laboral: no se exige MASC (y tiene procurador).
  await $.command.run(comando('cliente', 'perez'))
  await $.tool.call({ tool: 'Write', file_path: 'expedientes/perez/demanda-despido.md', content: 'x' } as never)
  expect(await banda()).toBe(null)

  // García: la demanda en curso de López no cuenta para García.
  await $.command.run(comando('cliente', 'garcia'))
  expect(await banda()).toBe(`⚠ ${AVISO}`)
  const r = await $.command.run(comando('masc', 'oferta vinculante | 02/11/2026 | DOC. 9 · oferta vinculante confidencial'))
  expect(r.text).toContain('MASC registrado en la ficha de García')
  expect(JSON.parse(escritos['data/fichas.json'] ?? '{}').fichas['0123/2026'].masc.medio).toBe('oferta-vinculante')
  const mal = await $.command.run(comando('masc', 'burofax | 02/11/2026'))
  expect(mal.text).toContain('Falta el documento')
})

test('Banda: en la app de escritorio las pastillas son texto de color, no botones con su nombre interno', { timeoutMs: 20_000 }, async ($, on) => {
  simularMotor(on, archivosBase(), {}, [])
  await $.session.start({ cwd: '/demo', surface: 'terminal', isInteractive: false })
  await $.command.run(comando('cliente', 'garcia'))
  // Escritorio: la app dibujaría un botón nativo con la etiqueta («Cambiar de cliente»), no el cliente.
  const escritorio = await $.ui.mount({ ...BANDA, surface: 'desktop' })
  expect((await escritorio.find({ key: 'banda-cliente' }))?.type).toBe('Box')
  expect(await escritorio.find({ type: 'Button', text: /Cambiar de cliente|Abrir la ficha/ })).toBeUndefined()
  expect((await escritorio.find({ type: 'Text', text: /● García · 0123\/2026/ }))?.props.backgroundColor).toBe('#2F6FED')
  await escritorio.unmount()
  // Terminal: la misma pastilla es un botón que se pulsa.
  const terminal = await $.ui.mount({ ...BANDA, surface: 'terminal' })
  expect((await terminal.find({ key: 'banda-cliente' }))?.type).toBe('Button')
  await terminal.unmount()
})
