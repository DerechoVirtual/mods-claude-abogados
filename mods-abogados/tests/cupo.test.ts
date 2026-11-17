// Pruebas de las cuentas del cupo (hooks/lib/cupo.ts) y de la detección de
// escritos terminados (hooks/lib/escritos.ts): funciones puras, sin interfaz.

import { expect, test } from 'claude-code/testing'
import {
  alDia,
  anotarLlamada,
  avisoAntesDeLlamada,
  claveSemana,
  CUPO_POR_DEFECTO,
  herramientaDelCupo,
  leerArgumentosCupo,
  leerSenalCupo,
  normalizarRegistro,
  pesoDeLlamada,
  registroVacio,
  situacionCupo,
} from '../hooks/lib/cupo'
import { detectarEscritoTerminado, nombreLegible, rutaSalida } from '../hooks/lib/escritos'

const cfg = CUPO_POR_DEFECTO

test('Cupo: reconoce las herramientas por su nombre, sea cual sea el servidor', () => {
  expect(herramientaDelCupo('mcp__6fa064c5-f0dd-4da2__leer_sentencias', cfg)).toBe('leer_sentencias')
  expect(herramientaDelCupo('mcp__plugin_litigacion-civil-espana_jurisprudenciator__buscar_articulo', cfg)).toBe('buscar_articulo')
  expect(herramientaDelCupo('Read', cfg)).toBe(null)
  expect(herramientaDelCupo('mcp__despachator__buscar_jurisprudencia', cfg)).toBe(null)
})

test('Cupo: lo que gasta cada llamada', () => {
  expect(pesoDeLlamada('leer_sentencias', { citas: 'STS 1/2020, STS 2/2021' }, cfg)).toBe(2)
  expect(pesoDeLlamada('leer_sentencias', { citas: 'ECLI:ES:TS:2024:2189' }, cfg)).toBe(1)
  expect(pesoDeLlamada('buscar_articulo', { ley: 'LEC', articulo: '22' }, cfg)).toBe(0.5)
  expect(pesoDeLlamada('buscar_sentencias', { query: 'x' }, cfg)).toBe(0)
})

test('Cupo: semana ISO y cambio de día sin perder los límites', () => {
  expect(claveSemana('2026-11-09')).toBe('2026-W46')
  expect(claveSemana('2026-11-08')).toBe('2026-W45') // domingo: aún la semana anterior
  expect(claveSemana('2027-01-01')).toBe('2026-W53')
  const ayer = {
    ...registroVacio('2026-11-08', cfg),
    usadoDia: 9,
    usadoSemana: 20,
    agotadoDia: true,
    limites: { diario: 50, semanal: 200, origen: 'manual' },
  }
  const hoy = alDia(ayer, '2026-11-09')
  expect(hoy.usadoDia).toBe(0)
  expect(hoy.agotadoDia).toBe(false)
  expect(hoy.usadoSemana).toBe(0) // el lunes empieza semana
  expect(hoy.limites.diario).toBe(50)
  const mismoDia = normalizarRegistro({ dia: '2026-11-09', semana: '2026-W46', usadoDia: 3, usadoSemana: 5 }, '2026-11-09', cfg)
  expect(mismoDia.usadoDia).toBe(3)
  expect(mismoDia.limites.origen).toBe('por defecto')
})

test('Cupo: niveles y aviso previo', () => {
  const base = registroVacio('2026-11-09', cfg)
  expect(situacionCupo({ ...base, usadoDia: 2, usadoSemana: 2 }, cfg).nivel).toBe('holgado')
  expect(situacionCupo({ ...base, usadoDia: 5, usadoSemana: 5 }, cfg).nivel).toBe('atento')
  const aviso = situacionCupo({ ...base, usadoDia: 7.5, usadoSemana: 7.5 }, cfg)
  expect(aviso.nivel).toBe('aviso')
  expect(aviso.quedan).toBe(2.5)
  expect(avisoAntesDeLlamada(aviso, 3)).toContain('gasta 3 y hoy solo quedan 2,5')
  expect(avisoAntesDeLlamada(aviso, 1)).toBe(null)
  // La semana manda si le queda menos.
  const semana = situacionCupo({ ...base, usadoDia: 1, usadoSemana: 29 }, cfg)
  expect(semana.periodo).toBe('esta semana')
  expect(semana.nivel).toBe('aviso')
  expect(situacionCupo({ ...base, limites: { diario: null, semanal: null, origen: 'manual' } }, cfg).nivel).toBe('sinLimite')
})

test('Cupo: el aviso de Jurisprudenciator se distingue de una norma que habla de límites', () => {
  const senal = leerSenalCupo('Has agotado el cupo de lectura de hoy. Tu plan Gratis incluye 10 sentencias al día y 30 a la semana.', true)
  expect(senal).toEqual({ semanal: false, limiteDiario: 10, limiteSemanal: 30 })
  expect(leerSenalCupo('Has alcanzado el límite semanal de lecturas de tu plan.', false)?.semanal).toBe(true)
  const norma = '【LEC — Artículo 1】\nCuando se haya superado el límite de la cuantía…\n\nFuente: BOE consolidado BOE-A-2000-323'
  expect(leerSenalCupo(norma, false)).toBe(null)
  expect(leerSenalCupo('=== STS 1/2020  |  ECLI:ES:TS:2020:1 ===\nel cupo de pesca quedó agotado hoy', false)).toBe(null)
})

test('Cupo: anotar llamadas, agotamiento y límite superado', () => {
  let r = registroVacio('2026-11-09', cfg)
  r = anotarLlamada(r, { herramienta: 'leer_sentencias', peso: 3, subagente: true, hora: '10:00', texto: 'ok', isError: false }).registro
  expect(r.usadoDia).toBe(3)
  expect(r.ultimas[0]?.subagente).toBe(true)
  // Un error que no es de cupo no gasta.
  r = anotarLlamada(r, { herramienta: 'leer_sentencias', peso: 2, subagente: false, hora: '10:01', texto: 'Timeout', isError: true }).registro
  expect(r.usadoDia).toBe(3)
  // El aviso de agotado se apunta (y no suma).
  const agotado = anotarLlamada(r, {
    herramienta: 'leer_sentencias',
    peso: 1,
    subagente: false,
    hora: '10:02',
    texto: 'Cupo diario agotado: 10 sentencias al día.',
    isError: true,
  }).registro
  expect(agotado.agotadoDia).toBe(true)
  expect(agotado.usadoDia).toBe(10)
  expect(situacionCupo(agotado, cfg).nivel).toBe('agotado')
  // Pasar de 10 sin que nadie corte: el límite no era el real.
  const lleno = { ...registroVacio('2026-11-09', cfg), usadoDia: 9.5, usadoSemana: 9.5 }
  const pasado = anotarLlamada(lleno, { herramienta: 'leer_sentencias', peso: 1, subagente: false, hora: '11:00', texto: 'ok', isError: false })
  expect(pasado.registro.limites.diario).toBe(null)
  expect(pasado.aviso).toContain('tu cupo diario es mayor que 10')
})

test('Cupo: argumentos de /cupo', () => {
  expect(leerArgumentosCupo('')).toEqual({ tipo: 'ver' })
  expect(leerArgumentosCupo('reiniciar')).toEqual({ tipo: 'reiniciar' })
  expect(leerArgumentosCupo('20 60')).toEqual({ tipo: 'limites', diario: 20, semanal: 60 })
  expect(leerArgumentosCupo('sin límite')).toEqual({ tipo: 'limites', diario: null, semanal: null })
  expect(leerArgumentosCupo('mucho').tipo).toBe('error')
})

test('Contrario: cuándo un escrito está terminado', () => {
  const ok = '{"ok": true, "word": "C:\\\\exp\\\\x.docx", "errores": [], "pendientes": []}'
  const ensamblar = { tool: 'Bash', command: 'python escrito.py ensamblar "." --salida "C:/exp/lopez/recurso-de-apelacion-lopez-20261110.docx"' }
  expect(detectarEscritoTerminado(ensamblar, ok, false)?.ruta).toBe('C:/exp/lopez/recurso-de-apelacion-lopez-20261110.docx')
  expect(detectarEscritoTerminado(ensamblar, '{"ok": true, "errores": ["falta DOC. 3"]}', false)).toBe(null)
  expect(detectarEscritoTerminado(ensamblar, '{"ok": false}', false)).toBe(null)
  expect(detectarEscritoTerminado({ tool: 'Bash', command: 'python escrito.py iniciar --tipo demanda' }, ok, false)).toBe(null)
  // Sin --salida, el campo "word" del resultado.
  expect(detectarEscritoTerminado({ tool: 'PowerShell', command: 'python escrito.py ensamblar .' }, ok, false)?.ruta).toBe('C:/exp/x.docx')
  // Entregar un Word con nombre de escrito también cuenta; un informe no.
  expect(detectarEscritoTerminado({ tool: 'SendUserFile', files: ['C:\\exp\\demanda-garcia.docx'] }, '', false)?.via).toBe('entrega')
  expect(detectarEscritoTerminado({ tool: 'SendUserFile', files: ['C:/x/informe-mensual.pdf'] }, '', false)).toBe(null)
  expect(rutaSalida("--salida 'C:/a b/c.docx'")).toBe('C:/a b/c.docx')
  expect(nombreLegible('C:/x/demanda-de-desahucio-por-falta-de-pago-lopez-20261109.docx')).toBe('Demanda de desahucio por falta de pago · López')
})
