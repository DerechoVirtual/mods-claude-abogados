// Pruebas de la narrativa jurídica: cada paso contado como en un despacho,
// sin «Read», «Grep» ni «Bash», y el informe final sin rutas.

import { describe, expect, test } from 'claude-code/testing'

import { encargoResumido, estadoLegible, informeLimpio, narrar, resultadoDe } from '../hooks/narrativa'

describe('cada paso, en lenguaje de despacho', () => {
  test('lecturas, búsquedas y redacción', () => {
    const casos: Array<[string, Record<string, unknown>, string]> = [
      ['Read', { file_path: 'C:/casos/demanda-desahucio/caso.md' }, 'Estudia el expediente del caso y el plan del escrito'],
      ['Read', { file_path: 'C:/casos/x/escrito.md' }, 'Lee el escrito completo de principio a fin'],
      ['Read', { file_path: 'C:/casos/x/contrato-arrendamiento.pdf' }, 'Lee el documento «contrato arrendamiento»'],
      ['Read', { file_path: 'C:/casos/x/01-demanda-divorcio.pdf' }, 'Lee el documento «demanda divorcio»'],
      ['Read', { file_path: 'C:/casos/x/demanda-divorcio.pdf' }, 'Lee la demanda'],
      ['Edit', { file_path: 'C:/casos/x/CONTESTACION-DEMANDA-DIVORCIO-Ibanez-Cortes.md' }, 'Corrige la contestación'],
      ['Grep', { pattern: 'art\\.\\s*\\d+|STS' }, 'Busca un dato en los documentos del expediente'],
      ['Bash', { command: 'python check.py' }, 'Hace comprobaciones y cálculos'],
      ['mcp__j__buscar_articulo', { ley: 'Decreto Legislativo 1/2011 Código del Derecho Foral de Aragón', articulo: '82' }, 'Consulta el art. 82 Código del Derecho Foral de Aragón en su redacción vigente'],
      ['Grep', { pattern: 'Fase 6' }, 'Busca «Fase 6» en los documentos del expediente'],
      ['Bash', { command: 'D="C:/Users/abogado/OneDrive/x"; wc -w "$D/secciones/01-hechos.md"' }, 'Cuenta las palabras de lo redactado'],
      ['Bash', { command: 'python "C:/x/escrito.py" ensamblar "C:/casos/x" --salida "demanda.docx"' }, 'Monta el escrito completo en Word'],
      ['Write', { file_path: 'C:/casos/x/secciones/01-hechos.md', content: '…' }, 'Redacta la sección 01'],
      ['Write', { file_path: 'C:/casos/x/fuentes/01.md', content: '…' }, 'Anota las fuentes que cita'],
      ['Edit', { file_path: 'C:/casos/x/secciones/03-fondo.md' }, 'Corrige y pule la sección 03'],
      ['mcp__plugin_x_jurisprudenciator__buscar_sentencias', { consulta: 'desahucio por falta de pago', base: 'TS' }, 'Busca jurisprudencia del Supremo sobre «desahucio por falta de pago»'],
      ['mcp__plugin_x_jurisprudenciator__buscar_sentencias', { consulta: 'enervación', base: 'AN' }, 'Busca jurisprudencia de Audiencias y TSJ sobre «enervación»'],
      ['mcp__plugin_x_jurisprudenciator__leer_sentencias', { citas: 'STS 323/2017, SAP 88/2022' }, 'Lee a fondo la STS 323/2017 y 1 más'],
      ['mcp__plugin_x_jurisprudenciator__buscar_articulo', { ley: 'LAU', articulo: '27' }, 'Consulta el art. 27 LAU en su redacción vigente'],
      ['mcp__plugin_x_jurisprudenciator__verificar_escrito', { texto: '…' }, 'Comprueba que las leyes citadas existen, están vigentes y dicen lo que se afirma'],
    ]
    for (const [herramienta, args, esperado] of casos) expect(narrar(herramienta, args)).toBe(esperado)
  })

  test('lo que ha dado de sí cada paso', () => {
    expect(resultadoDe({ tipo: 'sentencias', citas: [{ id: 'STS 323/2017', tribunal: 'del Supremo', supremo: true }] }, true)).toBe(
      'han salido la STS 323/2017 del Supremo',
    )
    expect(resultadoDe({ tipo: 'vacio' }, true)).toBe('sin resultados; probará otros términos')
    expect(resultadoDe({ tipo: 'articulo', articulo: '27', ley: 'LAU', vigencia: 'vigente' }, true)).toBe('vigente')
    expect(resultadoDe({ tipo: 'archivo', ruta: 'secciones/01-hechos.md', palabras: 667, fuentes: false, edicion: false }, true)).toBe('667 palabras')
    expect(resultadoDe(undefined, false)).toBe('no ha salido bien; lo intenta de otra forma')
    expect(resultadoDe(undefined, true)).toBeUndefined()
  })
})

describe('el informe y el encargo, sin tecnicismos', () => {
  test('el informe final pierde las rutas y las comillas de código', () => {
    const informe =
      'Escribí la sección 01 en `secciones/01-hechos.md`, con 667 palabras de las 750 pedidas (queda un 11 % por debajo, dentro del margen de ±15 %). Las fuentes están en `fuentes/01.md`.'
    expect(informeLimpio(informe)).toBe(
      'Escribí la sección 01, con 667 palabras de las 750 pedidas (queda un 11 % por debajo, dentro del margen de ±15 %). Las fuentes están anotadas.',
    )
    expect(informeLimpio('Guardado en C:/casos/x/demanda.docx')).toBe('Guardado en «demanda» (Word)')
    expect(informeLimpio('He corregido partes/02-encabezamiento-y-hechos.md y lo he dejado en C:/casos/x/CONTESTACION-DEMANDA.pdf')).toBe(
      'He corregido «encabezamiento y hechos» y lo he dejado en «contestación demanda» (PDF)',
    )
  })

  test('el encargo resumido y el estado', () => {
    expect(encargoResumido('Sección 01', 'Sección 01 — Encabezamiento y hechos: relato.', 750)).toBe(
      'Redactar la Sección 01 — Encabezamiento y hechos: relato, unas 750 palabras.',
    )
    expect(encargoResumido('Investigar jurisprudencia', undefined, undefined)).toBe('«Investigar jurisprudencia».')
    expect(estadoLegible('running', true)).toBe('sigue trabajando')
    expect(estadoLegible('waiting', true)).toBe('esperando algo para seguir')
    expect(estadoLegible(undefined, false)).toBe('ha terminado')
  })
})
