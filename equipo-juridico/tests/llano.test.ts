// Pruebas del lenguaje llano: nombres de documentos sin jerga, normas sin
// cortar y descripciones sin el nombre de quien las lleva delante.

import { describe, expect, test } from 'claude-code/testing'

import { conTildes, documentoEnFrase, nombreDocumento, nombreLey, recortar, sinNombreDelante } from '../hooks/llano'

describe('recortar por palabras enteras', () => {
  test('nunca a mitad de palabra ni con un «de» colgando', () => {
    expect(recortar('Demanda', 20)).toBe('Demanda')
    expect(recortar('Contestación a la demanda de divorcio', 28)).toBe('Contestación a la demanda…')
    expect(recortar('Contestación a la demanda de divorcio', 18)).toBe('Contestación…')
    expect(recortar('Decreto Legislativo 1/2011 Código del Derecho Foral de Aragón', 40)).toBe('Decreto Legislativo 1/2011 Código…')
    expect(recortar('Recurso de apelación en tan solo un minuto', 26).endsWith('…')).toBe(true)
    for (const largo of [8, 12, 16, 20, 30, 40]) {
      const corto = recortar('Demanda de reclamación de cantidad contra la aseguradora', largo)
      expect(corto.length).toBeLessThanOrEqual(largo)
      expect(corto).not.toMatch(/ (de|la|el|y|a)…$/)
    }
    // Una sola palabra que no cabe: no queda más remedio que cortarla.
    expect(recortar('Supercalifragilístico', 8)).toBe('Superca…')
  })
})

describe('los documentos, como los diría una persona', () => {
  test('sin carpetas, sin extensión, sin número delante, sin guiones', () => {
    expect(nombreDocumento('C:/casos/01/partes/02-encabezamiento-y-hechos.md')).toBe('encabezamiento y hechos')
    expect(nombreDocumento('CONTESTACION-DEMANDA-DIVORCIO-Ibanez-Cortes.md')).toBe('contestación demanda divorcio Ibanez Cortes')
    expect(nombreDocumento('03_cuadro_economico.xlsx')).toBe('cuadro económico')
    expect(nombreDocumento('demanda-de-desahucio-lopez-20261109.docx')).toBe('demanda de desahucio lopez')
    expect(nombreDocumento('indice.md')).toBe('índice')
    expect(conTildes('contestacion a la demanda y alegaciones')).toBe('contestación a la demanda y alegaciones')
  })

  test('dentro de una frase: la sección, el escrito o su nombre entre comillas', () => {
    expect(documentoEnFrase('C:/casos/x/secciones/03-fondo.md')).toBe('la sección 03')
    expect(documentoEnFrase('C:/casos/x/caso.md')).toBe('el plan del escrito')
    expect(documentoEnFrase('C:/casos/x/escrito.md')).toBe('el escrito')
    expect(documentoEnFrase('C:/casos/x/fuentes/02.md')).toBe('las fuentes')
    expect(documentoEnFrase('C:/casos/x/CONTESTACION-DEMANDA-DIVORCIO-Ibanez-Cortes.md')).toBe('la contestación')
    expect(documentoEnFrase('C:/casos/x/recurso-apelacion.docx')).toBe('el recurso')
    expect(documentoEnFrase('C:/casos/x/demanda.pdf')).toBe('la demanda')
    // Un documento del expediente numerado («01-demanda…») no es nuestro escrito: va con su nombre.
    expect(documentoEnFrase('C:/casos/x/01-demanda-contraria.pdf')).toBe('«demanda contraria»')
    expect(documentoEnFrase('C:/casos/x/02-encabezamiento-y-hechos.md')).toBe('«encabezamiento y hechos»')
  })
})

describe('las normas, cortas y enteras', () => {
  test('siglas, nombre propio o rango con número', () => {
    expect(nombreLey('LEC')).toBe('LEC')
    expect(nombreLey('Ley de Enjuiciamiento Civil')).toBe('LEC')
    expect(nombreLey('Ley 1/2000, de 7 de enero, de Enjuiciamiento Civil')).toBe('LEC')
    expect(nombreLey('Código Civil')).toBe('CC')
    expect(nombreLey('Decreto Legislativo 1/2011 Código del Derecho Foral de Aragón')).toBe('Código del Derecho Foral de Aragón')
    expect(nombreLey('Ley Orgánica 1/2025, de 2 de enero, de medidas en materia de eficiencia del Servicio Público de Justicia')).toBe('LO 1/2025')
    expect(nombreLey('Real Decreto Legislativo 2/2015, de 23 de octubre, por el que se aprueba el texto refundido de la Ley del Estatuto de los Trabajadores')).toBe('ET')
    expect(nombreLey('Real Decreto-ley 6/2023, de 19 de diciembre, por el que se aprueban medidas urgentes')).toBe('RDL 6/2023')
    // Lo que no se reconoce se corta por una palabra entera.
    const rara = nombreLey('Ordenanza municipal reguladora de la ocupación de la vía pública con terrazas y veladores')
    expect(rara.length).toBeLessThanOrEqual(40)
    expect(rara).toMatch(/[a-záéíóú]…$/)
  })
})

describe('la descripción, sin el nombre delante', () => {
  const equipo = ['María', 'Juan', 'Luis', 'Clara', 'Alberto', 'Elena', 'Pablo', 'Carmen', 'Rufino']
  test('«Elena: revisar…» → «Revisar…», y dice de quién es', () => {
    expect(sinNombreDelante('Elena: revisar coherencia y cifras', equipo)).toEqual({ texto: 'Revisar coherencia y cifras', nombre: 'Elena' })
    expect(sinNombreDelante('maria — ordenar el expediente', equipo)).toEqual({ texto: 'Ordenar el expediente', nombre: 'María' })
    expect(sinNombreDelante('Sección 03 — Fundamento de fondo', equipo)).toEqual({ texto: 'Sección 03 — Fundamento de fondo' })
    expect(sinNombreDelante('Marta: revisar', equipo)).toEqual({ texto: 'Marta: revisar' })
    expect(sinNombreDelante('Redactar la demanda', equipo)).toEqual({ texto: 'Redactar la demanda' })
  })
})
