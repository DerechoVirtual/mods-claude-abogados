// Pruebas de las frases del equipo: salen de hechos reales observados en lo
// que devuelven las herramientas, con la personalidad de cada uno y sin
// inventar identificadores. Datos ficticios.

import { describe, expect, test } from 'claude-code/testing'

import { contarPalabras, decir, esGrande, extensionPedida, extraerCitas, hechoDeHerramienta } from '../hooks/frases'
import type { Hecho } from '../hooks/frases'
import { oficioDe } from '../hooks/equipo'
import { EQUIPO_POR_DEFECTO } from '../hooks/equipo-por-defecto'
import type { Persona } from '../types'

const juan = oficioDe(EQUIPO_POR_DEFECTO, 'jurisprudencia')
const luis = oficioDe(EQUIPO_POR_DEFECTO, 'fondo')
const clara = oficioDe(EQUIPO_POR_DEFECTO, 'hechos')
const p = (o: typeof juan): Persona => o.personas[0] as Persona

const RESULTADO = [
  '1. STS 323/2017 · ECLI:ES:TS:2017:323 · Sala 1.ª · 12/03/2017 · responsabilidad extracontractual',
  '2. SAP 1234/2023 · ECLI:ES:APM:2023:1234 · Madrid',
  '3. STS 999/2020',
].join('\n')

describe('lo que sale de los resultados', () => {
  test('las resoluciones, en orden y sin duplicar ECLI y ROJ', () => {
    const citas = extraerCitas(RESULTADO, 3)
    expect(citas.map(c => c.id)).toEqual(['STS 323/2017', 'SAP 1234/2023', 'ECLI:ES:APM:2023:1234'])
    expect(citas[0]?.supremo).toBe(true)
    expect(citas[1]?.tribunal).toBe('de la Audiencia Provincial')
    expect(extraerCitas('Asunto C-311/19 del Tribunal de Justicia')[0]?.tribunal).toBe('del TJUE')
  })

  test('una búsqueda con sentencias, vacía o sin identificadores', () => {
    const b = 'mcp__plugin_x_jurisprudenciator__buscar_sentencias'
    const conCitas = hechoDeHerramienta(b, { consulta: 'x' }, true, RESULTADO)
    expect(conCitas?.tipo).toBe('sentencias')
    expect(hechoDeHerramienta(b, { consulta: 'x' }, true, 'Se han encontrado 0 resultados.')?.tipo).toBe('vacio')
    expect(hechoDeHerramienta(b, { consulta: 'x' }, false, 'error')?.tipo).toBe('vacio')
    const sinIds = hechoDeHerramienta(b, { consulta: 'x' }, true, 'Hay varias resoluciones sobre la materia, consulte el listado completo en la sede.')
    expect(sinIds?.tipo).toBe('busqueda')
  })

  test('leer una sentencia toma la cita pedida, no las que cita el texto', () => {
    const h = hechoDeHerramienta('mcp__x__leer_sentencias', { citas: 'STS 323/2017, STS 1/2020' }, true, 'La STS 999/1999 ya dijo…')
    expect(h).toEqual({ tipo: 'lectura', cita: 'STS 323/2017' })
  })

  test('un artículo vigente o derogado', () => {
    expect(hechoDeHerramienta('mcp__x__buscar_articulo', { ley: 'LCS', articulo: '20' }, true, 'Texto vigente del artículo 20…')).toEqual({
      tipo: 'articulo',
      articulo: '20',
      ley: 'LCS',
      vigencia: 'vigente',
    })
    const derogado = hechoDeHerramienta('mcp__x__buscar_articulo', { ley: 'LEC 1881', articulo: '1' }, true, 'Precepto derogado.')
    expect(derogado?.tipo === 'articulo' && derogado.vigencia).toBe('derogado')
  })

  test('un archivo escrito, unas fuentes, un retoque', () => {
    const contenido = Array.from({ length: 850 }, () => 'palabra').join(' ')
    expect(hechoDeHerramienta('Write', { file_path: 'C:\\casos\\ficticio\\secciones\\01-hechos.md', content: contenido }, true, '')).toEqual({
      tipo: 'archivo',
      ruta: 'secciones/01-hechos.md',
      doc: 'la sección 01',
      palabras: 850,
      seccion: 'Sección 01 (hechos)',
      fuentes: false,
      edicion: false,
    })
    expect(hechoDeHerramienta('Write', { file_path: '/c/fuentes/01.md', content: 'x' }, true, '')?.tipo).toBe('archivo')
    const edit = hechoDeHerramienta('Edit', { file_path: '/c/secciones/01-hechos.md' }, true, '')
    expect(edit?.tipo === 'archivo' && edit.edicion).toBe(true)
    expect(hechoDeHerramienta('Read', { file_path: 'caso.md' }, true, 'contenido')).toEqual({ tipo: 'expediente' })
    expect(hechoDeHerramienta('Read', { file_path: 'notas/borrador.ts' }, true, 'contenido')).toBeUndefined()
    expect(hechoDeHerramienta('Bash', { command: 'ls' }, false, 'error')).toEqual({ tipo: 'error', herramienta: 'Bash' })
  })

  test('palabras y extensión pedida', () => {
    expect(contarPalabras('# Índice del expediente')).toBe(3)
    expect(extensionPedida('Sección 03 — x. Extensión: 1.200 palabras.')).toBe(1200)
    expect(extensionPedida('Sin extensión')).toBeUndefined()
  })
})

describe('cómo lo dicen', () => {
  const supremo = hechoDeHerramienta('mcp__x__buscar_sentencias', { consulta: 'x' }, true, RESULTADO) as Hecho

  test('Juan celebra la del Supremo, con los datos que han salido', () => {
    expect(decir(supremo, p(juan), juan, 'informal', 0)).toBe(
      '¡Buah! Acabo de encontrar la STS 323/2017 del Supremo, es la hostia. Con ella vamos a machacar a la parte contraria. Y otra más.',
    )
    expect(decir(supremo, p(juan), juan, 'informal', 1)).toBe('¡Toma ya! La STS 323/2017 del Supremo nos viene de lujo. Y otra más.')
    expect(decir(supremo, p(juan), juan, 'profesional', 0)).toBe(
      'He localizado la STS 323/2017 del Tribunal Supremo, relevante para el asunto. Y otra más.',
    )
    expect(esGrande(supremo)).toBe(true)
  })

  test('sin identificadores, la frase no menciona ninguno', () => {
    const h = hechoDeHerramienta('mcp__x__buscar_sentencias', { consulta: 'x' }, true, 'Se han encontrado 0 resultados.') as Hecho
    const dicho = decir(h, p(juan), juan, 'informal', 0)
    expect(dicho).toBe('Nada por aquí, pruebo otra búsqueda.')
    expect(/STS|SAP|ECLI|\d+\/\d{4}/.test(dicho)).toBe(false)
  })

  test('cada uno con sus coletillas, y sin repetir la frase anterior', () => {
    const seccion: Hecho = { tipo: 'archivo', ruta: 'secciones/01-hechos.md', palabras: 850, seccion: 'Sección 01 (hechos)', fuentes: false, edicion: false }
    const primera = decir(seccion, p(clara), clara, 'informal', 0)
    expect(primera).toBe('¡Sección 01 (hechos) escrita, 850 palabras! Con todo lujo de detalles.')
    expect(decir(seccion, p(clara), clara, 'informal', 0, primera)).not.toBe(primera)
    expect(decir(seccion, p(clara), clara, 'profesional', 0)).toBe('Sección 01 (hechos) redactada: 850 palabras.')
  })

  test('el artículo, el fin con orgullo y el fallo', () => {
    expect(decir({ tipo: 'articulo', articulo: '20', ley: 'LCS', vigencia: 'vigente' }, p(juan), juan, 'informal', 0)).toBe(
      'Ojo, el art. 20 LCS está vigente. ¡A tope!',
    )
    const fin: Hecho = { tipo: 'termina', descripcion: 'Sección 04', tiempo: '1 min', busquedas: 2, citas: 3, archivos: 2, palabras: 520 }
    expect(decir(fin, p(luis), luis, 'informal', 0)).toBe('¡Ya está! Terminado en 1 min: 2 búsquedas, 3 sentencias, 520 palabras. Vamos a machacarles.')
    expect(esGrande(fin)).toBe(true)
    expect(decir({ tipo: 'falla', descripcion: 'Sección 04' }, p(luis), luis, 'profesional', 0)).toBe('No he podido completar «Sección 04».')
  })
})

describe('lenguaje llano: ni nombres de archivo ni normas cortadas', () => {
  test('retocar un documento se dice sin su nombre de archivo', () => {
    // 9/11/2026: salía «Pulo un detalle de «02-encabezamiento-y-hechos.md»» y «Retocando «CONTESTACION-DEMANDA-DIVORCIO-Ibanez-Cortes.md»».
    const hechos = hechoDeHerramienta('Edit', { file_path: 'C:/casos/01/partes/02-encabezamiento-y-hechos.md' }, true, '') as Hecho
    const escrito = hechoDeHerramienta('Edit', { file_path: 'C:/casos/01/CONTESTACION-DEMANDA-DIVORCIO-Ibanez-Cortes.md' }, true, '') as Hecho
    expect(decir(hechos, p(clara), clara, 'informal', 1)).toBe('Pulo un detalle de «encabezamiento y hechos».')
    expect(decir(escrito, p(luis), luis, 'informal', 0)).toBe('Retoco la contestación.')
    expect(decir(escrito, p(luis), luis, 'informal', 1)).toBe('Pulo un detalle de la contestación.')
    const recurso = hechoDeHerramienta('Edit', { file_path: 'C:/casos/02/recurso-apelacion.md' }, true, '') as Hecho
    expect(decir(recurso, p(luis), luis, 'informal', 1)).toBe('Pulo un detalle del recurso.')
    const nuevo = hechoDeHerramienta('Write', { file_path: 'C:/casos/01/03-cuadro_economico.md', content: 'uno dos tres' }, true, '') as Hecho
    expect(decir(nuevo, p(luis), luis, 'profesional', 0)).toBe('He redactado «cuadro económico»: 3 palabras.')
    for (const h of [hechos, escrito, recurso, nuevo]) {
      for (const turno of [0, 1, 2, 3]) {
        for (const tono of ['informal', 'profesional'] as const) expect(decir(h, p(luis), luis, tono, turno)).not.toMatch(/\.md|\.docx|\d\d-|_|[A-Z]{6,}/)
      }
    }
  })

  test('una norma de nombre largo no se corta a mitad de palabra', () => {
    // 9/11/2026: salía «Art. 82 Decreto Legislativo 1/2011 Código del De comprobado: vigente».
    const foral = hechoDeHerramienta('mcp__x__buscar_articulo', { articulo: '82', ley: 'Decreto Legislativo 1/2011 Código del Derecho Foral de Aragón' }, true, 'Texto vigente.') as Hecho
    expect(decir(foral, p(luis), luis, 'informal', 1)).toBe('Art. 82 Código del Derecho Foral de Aragón comprobado: vigente. Esto lo ganamos.')
    const lec = hechoDeHerramienta('mcp__x__buscar_articulo', { articulo: '438', ley: 'Ley 1/2000, de 7 de enero, de Enjuiciamiento Civil' }, true, 'Vigente.') as Hecho
    expect(decir(lec, p(luis), luis, 'profesional', 0)).toBe('El art. 438 LEC está vigente.')
    const organica = hechoDeHerramienta('mcp__x__buscar_articulo', { articulo: '5', ley: 'Ley Orgánica 1/2025, de 2 de enero, de medidas en materia de eficiencia del Servicio Público de Justicia' }, true, 'Vigente.') as Hecho
    expect(decir(organica, p(luis), luis, 'profesional', 0)).toBe('El art. 5 LO 1/2025 está vigente.')
  })
})

describe('las frases valen igual para ellas que para ellos', () => {
  test('ninguna frase del despacho usa una palabra que cambie con el género de quien habla', () => {
    // «¡Listo!» dicho por María, «estoy atento» dicho por Elena… no deben salir.
    const hechos: Hecho[] = [
      { tipo: 'empieza', descripcion: 'Revisar las citas' },
      { tipo: 'expediente' },
      { tipo: 'busqueda' },
      { tipo: 'vacio' },
      { tipo: 'lectura', cita: 'STS 323/2017' },
      { tipo: 'articulo', articulo: '21', ley: 'LPH', vigencia: 'vigente' },
      { tipo: 'verificacion', limpio: true },
      { tipo: 'verificacion', limpio: false },
      { tipo: 'archivo', ruta: 'x/indice.md', palabras: 10, fuentes: false, edicion: false },
      { tipo: 'error', herramienta: 'Bash' },
      { tipo: 'termina', descripcion: 'Revisar las citas', tiempo: '2 min', busquedas: 1, citas: 1, archivos: 1, palabras: 0 },
      { tipo: 'falla', descripcion: 'Revisar las citas' },
    ]
    const elena = oficioDe(EQUIPO_POR_DEFECTO, 'revision')
    expect(p(elena).genero).toBe('f')
    for (const h of hechos) {
      for (const tono of ['informal', 'profesional'] as const) {
        for (const turno of [0, 1, 2, 3, 4]) {
          expect(decir(h, p(elena), elena, tono, turno)).not.toMatch(/¡Listo!|\b(atento|preparado|seguro de|contento|cansado|orgulloso)\b/i)
        }
      }
    }
    // Cada persona del equipo tiene su género; ellas son cuatro.
    const generos = EQUIPO_POR_DEFECTO.oficios.flatMap(o => o.personas.map(x => `${x.nombre}:${x.genero}`))
    expect(generos).toEqual(['María:f', 'Juan:m', 'Luis:m', 'Clara:f', 'Alberto:m', 'Elena:f', 'Pablo:m', 'Carmen:f', 'Rufino:m'])
  })
})

describe('Rufino, el abogado de la parte contraria, habla como un juez cabrón', () => {
  const rufino = oficioDe(EQUIPO_POR_DEFECTO, 'contraria')
  const TACOS = /joder|hostia|mierda|me cago|coño|me meo/i
  const supremo = hechoDeHerramienta('mcp__x__buscar_sentencias', { consulta: 'x' }, true, RESULTADO) as Hecho
  const hechos: Hecho[] = [
    { tipo: 'empieza', descripcion: 'Atacar el escrito como la parte contraria' },
    { tipo: 'expediente' },
    supremo,
    { tipo: 'sentencias', citas: [{ id: 'SAP 1234/2023', tribunal: 'de la Audiencia Provincial', supremo: false }] },
    { tipo: 'busqueda' },
    { tipo: 'vacio' },
    { tipo: 'lectura', cita: 'STS 323/2017' },
    { tipo: 'articulo', articulo: '21', ley: 'LPH', vigencia: 'vigente' },
    { tipo: 'articulo', articulo: '1', ley: 'LEC 1881', vigencia: 'derogado' },
    { tipo: 'articulo', articulo: '9', ley: 'LPH', vigencia: 'desconocida' },
    { tipo: 'verificacion', limpio: true },
    { tipo: 'verificacion', limpio: false },
    { tipo: 'archivo', ruta: 'ataque/grietas.md', palabras: 420, fuentes: false, edicion: false },
    { tipo: 'archivo', ruta: 'secciones/09-ataque.md', palabras: 420, seccion: 'Sección 09 (ataque)', fuentes: false, edicion: false },
    { tipo: 'archivo', ruta: 'fuentes/09.md', palabras: 10, fuentes: true, edicion: false },
    { tipo: 'archivo', ruta: 'ataque/grietas.md', palabras: 0, fuentes: false, edicion: true },
    { tipo: 'error', herramienta: 'Bash' },
    { tipo: 'termina', descripcion: 'Atacar el escrito', tiempo: '2 min', busquedas: 2, citas: 1, archivos: 1, palabras: 0 },
    { tipo: 'falla', descripcion: 'Atacar el escrito' },
  ]

  test('lo que dice al empezar, mientras trabaja y al acabar es soez', () => {
    expect(rufino.rival).toBe(true)
    const r = p(rufino)
    expect(decir(hechos[0] as Hecho, r, rufino, 'informal', 0)).toBe('A ver qué mierda me habéis traído hoy…')
    expect(decir(supremo, r, rufino, 'informal', 0)).toBe('¡Toma! La STS 323/2017 del Supremo os revienta el escrito, listillos. Y otra más.')
    const fin = hechos[hechos.length - 2] as Hecho
    expect(decir(fin, r, rufino, 'informal', 0)).toBe('¡Ahí tenéis vuestras vergüenzas, listillos!')
    expect(decir(fin, r, rufino, 'informal', 1)).toBe('Escrito destrozado en 2 min. De nada.')
    // Al empezar y al acabar, en cualquier turno, suelta algún taco o desprecia el escrito.
    for (let turno = 0; turno < 8; turno++) {
      for (const h of [hechos[0], fin] as Hecho[]) expect(decir(h, r, rufino, 'informal', turno)).toMatch(/joder|hostia|mierda|me cago|coño|listillos|bodrio|engendro|vergüenzas|destrozado|os comen|llorar/i)
    }
    // Y en conjunto, mucho taco.
    const todas = hechos.flatMap(h => [0, 1, 2, 3].map(turno => decir(h, r, rufino, 'informal', turno)))
    expect(todas.filter(f => TACOS.test(f)).length).toBeGreaterThanOrEqual(15)
  })

  test('cada hecho tiene su frase, distinta de la del despacho, corta y que varía', () => {
    const r = p(rufino)
    for (const h of hechos) {
      const dicho = decir(h, r, rufino, 'informal', 0)
      expect(dicho).not.toBe('')
      expect(dicho).not.toBe(decir(h, p(luis), luis, 'informal', 0))
      // Cabe en la banda de una sola fila.
      expect(dicho.length).toBeLessThanOrEqual(90)
    }
    // Varía como las del resto del equipo y nunca repite la anterior.
    const empieza = hechos[0] as Hecho
    expect(new Set([0, 1, 2, 3].map(turno => decir(empieza, r, rufino, 'informal', turno))).size).toBe(4)
    const primera = decir(empieza, r, rufino, 'informal', 0)
    expect(decir(empieza, r, rufino, 'informal', 0, primera)).not.toBe(primera)
  })

  test('cuenta hechos reales: las citas son las que han salido, sin inventar', () => {
    const r = p(rufino)
    for (let turno = 0; turno < 4; turno++) {
      const dicho = decir(supremo, r, rufino, 'informal', turno)
      expect(dicho).toContain('STS 323/2017')
      expect(dicho.match(/\b(STS|SAP|STC)\s+\d+\/\d{4}/g)).toEqual(['STS 323/2017'])
    }
    const vacio = decir({ tipo: 'vacio' }, r, rufino, 'informal', 0)
    expect(/STS|SAP|ECLI|\d+\/\d{4}/.test(vacio)).toBe(false)
  })

  test('los insultos van contra el escrito y el despacho, nunca contra colectivos', () => {
    const r = p(rufino)
    const todas = hechos.flatMap(h => [0, 1, 2, 3].map(turno => decir(h, r, rufino, 'informal', turno)))
    const prohibido = /\b(maric|mariquit|gay|negr|moro|sudaca|gitan|puta (madre|mujer)|subnormal|retrasad|mongol|minusv|zorra|travelo|judí|chin[oa]s?\b|mujeres|catalan|vasco|andaluz)/i
    for (const f of todas) expect(f).not.toMatch(prohibido)
    // Nadie real: ni Carlos ni nombres del equipo.
    for (const f of todas) expect(f).not.toMatch(/Carlos|Luis|Juan|María|Clara|Alberto|Elena|Pablo|Carmen/)
  })

  test('en tono profesional, desdeñoso pero sin tacos', () => {
    const r = p(rufino)
    for (const h of hechos) {
      const dicho = decir(h, r, rufino, 'profesional', 0)
      expect(dicho).not.toBe('')
      expect(dicho).not.toMatch(TACOS)
    }
    expect(decir(hechos[0] as Hecho, r, rufino, 'profesional', 0)).toBe('Veamos qué han presentado.')
  })
})
