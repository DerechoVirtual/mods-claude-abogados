// Pruebas del revisor de citas (hooks/lib/citas.ts): detección y semáforo.

import { describe, expect, test } from 'claude-code/testing'
import {
  crearEvidencia,
  esHerramientaVerificacion,
  extraerCitas,
  peticionVerificacion,
  resumir,
  revisarCitas,
  type ConfigRevisor,
} from '../hooks/lib/citas'

const HOY = '2026-11-08'
const CONFIG: ConfigRevisor = {
  herramientasVerificacion: ['buscar_articulo', 'buscar_sentencias', 'buscar_por_cita', 'leer_sentencias', 'verificar'],
  excluirHerramientas: [],
  analizarArchivosEscritos: true,
  leyes: [
    { clave: 'CE', nombre: 'Constitución Española', alias: ['CE', 'Constitución Española', 'Constitución'], maxArticulo: 169 },
    { clave: 'CC', nombre: 'Código Civil', alias: ['CC', 'C.C.', 'Código Civil'], maxArticulo: 1976 },
    { clave: 'LEC', nombre: 'Ley de Enjuiciamiento Civil', alias: ['LEC', 'Ley de Enjuiciamiento Civil'], numeros: ['Ley 1/2000'], maxArticulo: 827 },
    { clave: 'LOPJ', nombre: 'Ley Orgánica del Poder Judicial', alias: ['LOPJ'], numeros: ['LO 6/1985'] },
  ],
}

const textoDeEjemplo = `
Conforme al art. 24 CE y al artículo 1902 del Código Civil, procede la reclamación
(arts. 399 y ss. LEC). Véase también el art. 14 de la Ley 35/2015.
La STS 123/2020 y la STS de 12 de marzo de 2020 lo confirman, igual que la
SAP Madrid, sec. 14.ª, de 5 de mayo de 2021 y la STC 31/2010
(ECLI:ES:TS:2020:1234, rec. 1234/2019, ROJ: STS 4786/2014).
`

describe('detección de citas', () => {
  const citas = extraerCitas(textoDeEjemplo, CONFIG, HOY)
  const textos = citas.map(c => c.texto)

  test('artículos con su norma', () => {
    const arts = citas.filter(c => c.tipo === 'articulo')
    expect(arts.map(a => `${a.articulo}|${a.ley}`).join(',')).toBe('24|CE,1902|CC,399|LEC,14|Ley 35/2015')
    expect(textos).toContain('artículo 1902 del Código Civil')
  })

  test('sentencias por número, por fecha y con tribunal, sección y lugar', () => {
    const res = citas.filter(c => c.tipo === 'resolucion')
    expect(res.some(r => r.organo === 'STS' && r.numero === '123' && r.anio === 2020)).toBe(true)
    expect(res.some(r => r.organo === 'STS' && r.fecha === '2020-03-12')).toBe(true)
    expect(res.some(r => r.organo === 'SAP' && r.lugar === 'Madrid' && r.fecha === '2021-05-05')).toBe(true)
    expect(res.some(r => r.organo === 'STC' && r.numero === '31' && r.anio === 2010)).toBe(true)
  })

  test('ECLI, número de recurso y referencia CENDOJ (ROJ)', () => {
    expect(citas.some(c => c.tipo === 'ecli' && c.ecli === 'ECLI:ES:TS:2020:1234')).toBe(true)
    expect(citas.some(c => c.tipo === 'recurso' && c.numero === '1234' && c.anio === 2019)).toBe(true)
    expect(citas.some(c => c.tipo === 'cendoj' && c.numero === '4786')).toBe(true)
    // La «STS 4786/2014» de dentro del ROJ no se cuenta dos veces.
    expect(citas.filter(c => c.numero === '4786').length).toBe(1)
  })

  test('autos (ATS) y forma larga «Sentencia del Tribunal Supremo»', () => {
    const otras = extraerCitas('El ATS 512/2022 y la Sentencia del Tribunal Supremo de 3 de mayo de 2019.', CONFIG, HOY)
    expect(otras.some(c => c.organo === 'ATS' && c.numero === '512')).toBe(true)
    expect(otras.some(c => c.tribunal === 'TS' && c.fecha === '2019-05-03')).toBe(true)
  })

  test('sin citas: lista vacía', () => {
    expect(extraerCitas('Hola, ¿en qué puedo ayudarte con el escrito?', CONFIG, HOY).length).toBe(0)
  })
})

describe('rojo: formato imposible o sospechoso', () => {
  const malas = extraerCitas(
    'El art. 2500 CC, la STS 45/2031, el ECLI:ES:TS:20X0:12, la STS de 31 de febrero de 2020 y la STC 4/1975.',
    CONFIG,
    HOY,
  )
  const revisadas = revisarCitas(malas, [], CONFIG)

  test('todas salen sospechosas', () => {
    expect(revisadas.length).toBe(5)
    for (const c of revisadas) expect(c.estado).toBe('sospechosa')
  })

  test('cada una con su motivo', () => {
    const motivos = revisadas.map(c => c.motivo).join(' | ')
    expect(motivos).toContain('solo tiene 1976 artículos')
    expect(motivos).toContain('Año futuro (2031)')
    expect(motivos).toContain('ECLI mal formado')
    expect(motivos).toContain('Fecha que no existe')
    expect(motivos).toContain('no dictó sentencias antes de 1981')
  })
})

describe('semáforo por trazabilidad', () => {
  // Resultado REAL (resumido) de buscar_por_cita para «STC 31/2010».
  const porCita = crearEvidencia(
    'mcp__jurisprudenciator__buscar_por_cita',
    { cita: 'STC 31/2010' },
    '1. STC 31/2010  |  ECLI:ES:TC:2010:31  |  28/06/2010  |  Pleno\n   RESUMEN: Interpuesto por noventa y nueve Diputados…',
  )
  // Resultado REAL (resumido) de buscar_articulo para el art. 183 LOPJ.
  const articulo = crearEvidencia(
    'mcp__jurisprudenciator__buscar_articulo',
    { ley: 'LOPJ', articulo: '183' },
    '【LOPJ (LO 6/1985) — Artículo ciento ochenta y tres】\nArtículo 183.\nSerán inhábiles los días del mes de agosto…',
  )
  const texto =
    'Según la STC 31/2010 (STC de 28 de junio de 2010, ECLI:ES:TC:2010:31) y el art. 183 LOPJ; ' +
    'también el art. 182 LOPJ y el art. 1902 CC.'
  const revisadas = revisarCitas(extraerCitas(texto, CONFIG, HOY), [porCita, articulo], CONFIG)
  const estadoDe = (trozo: string) => revisadas.find(c => c.texto.includes(trozo))?.estado

  test('verde: aparece en el resultado de una consulta del turno', () => {
    expect(estadoDe('STC 31/2010')).toBe('verificada')
    expect(estadoDe('28 de junio de 2010')).toBe('verificada')
    expect(estadoDe('ECLI:ES:TC:2010:31')).toBe('verificada')
    expect(estadoDe('art. 183 LOPJ')).toBe('verificada')
    expect(revisadas.find(c => c.texto.includes('183'))?.herramienta).toBe('buscar_articulo')
  })

  test('ámbar: formato correcto pero ninguna consulta la respalda', () => {
    expect(estadoDe('art. 182 LOPJ')).toBe('sin_verificar')
    expect(estadoDe('art. 1902 CC')).toBe('sin_verificar')
  })

  test('sin consultas en el turno, todo lo plausible queda ámbar', () => {
    const r = resumir(revisarCitas(extraerCitas(texto, CONFIG, HOY), [], CONFIG))
    expect(r.verificadas).toBe(0)
    expect(r.sinVerificar).toBe(6)
    expect(r.sospechosas).toBe(0)
  })

  test('la petición «Pedir verificación» lista solo las pendientes', () => {
    const peticion = peticionVerificacion(revisadas, CONFIG)
    expect(peticion).toContain('art. 182 LOPJ')
    expect(peticion).toContain('art. 1902 CC')
    expect(peticion.includes('ECLI:ES:TC:2010:31')).toBe(false)
  })
})

describe('herramientas de verificación configurables', () => {
  test('por trozo del nombre, con cualquier servidor MCP', () => {
    expect(esHerramientaVerificacion('mcp__6fa064c5__buscar_por_cita', CONFIG)).toBe(true)
    expect(esHerramientaVerificacion('mcp__otro__verificar_jurisprudencia', CONFIG)).toBe(true)
    expect(esHerramientaVerificacion('Bash', CONFIG)).toBe(false)
  })

  test('por expresión regular y con exclusiones', () => {
    const config: ConfigRevisor = { ...CONFIG, herramientasVerificacion: ['/^mcp__mi_bd__/'], excluirHerramientas: ['borrar'] }
    expect(esHerramientaVerificacion('mcp__mi_bd__consultar', config)).toBe(true)
    expect(esHerramientaVerificacion('mcp__mi_bd__borrar', config)).toBe(false)
  })
})
