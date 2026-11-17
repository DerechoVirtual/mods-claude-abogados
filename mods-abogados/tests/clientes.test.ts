// Pruebas del Mod 4 que no necesitan interfaz: colores, búsqueda tolerante y
// aviso de expediente cruzado.

import { describe, expect, test } from 'claude-code/testing'
import { colorParaNuevo, colorPorNombre, contraste, leerColor, PALETA, textoSobre } from '../hooks/lib/colores'
import { buscarClientes, detectarCruce } from '../hooks/color-cliente'
import type { Cliente } from '../hooks/lib/estado'

const CLIENTES: Cliente[] = [
  { nombre: 'García', expediente: '0123/2026', carpeta: 'expedientes/garcia', color: '#2F6FED' },
  { nombre: 'López', expediente: '0456/2026', carpeta: 'expedientes/lopez', color: '#C2389E' },
  { nombre: 'Comunidad Calle Imaginaria', expediente: '0789/2026', carpeta: 'C:\\Despacho\\Comunidad' },
]

describe('colores', () => {
  test('el mismo nombre da siempre el mismo color', () => {
    expect(colorPorNombre('García')).toBe(colorPorNombre('garcia'))
    expect(colorPorNombre('Nuevo Cliente')).toBe(colorPorNombre('Nuevo Cliente'))
  })

  test('un cliente nuevo no repite el color de los recientes', () => {
    const suyo = colorPorNombre('Martínez')
    const otro = colorParaNuevo('Martínez', [suyo])
    expect(otro === suyo).toBe(false)
    expect(colorParaNuevo('Martínez', [])).toBe(suyo)
  })

  test('el texto sobre cada color de la paleta se lee (contraste WCAG ≥ 4.5)', () => {
    for (const c of PALETA) expect(contraste(c.hex, textoSobre(c.hex))).toBeGreaterThanOrEqual(4.5)
  })

  test('acepta #RRGGBB, #RGB y nombres de la paleta', () => {
    expect(leerColor('#2f6fed')).toBe('#2F6FED')
    expect(leerColor('26f')).toBe('#2266FF')
    expect(leerColor('Violeta')).toBe('#7C4DDB')
    expect(leerColor('rojo pasión')).toBeNull()
  })
})

describe('/cliente <nombre>: búsqueda tolerante', () => {
  test('sin tildes ni mayúsculas', () => {
    expect(buscarClientes('garcia', CLIENTES).map(c => c.nombre)).toEqual(['García'])
    expect(buscarClientes('LÓPEZ', CLIENTES).map(c => c.nombre)).toEqual(['López'])
  })

  test('coincidencia parcial, por expediente y por asunto', () => {
    expect(buscarClientes('imagin', CLIENTES).map(c => c.nombre)).toEqual(['Comunidad Calle Imaginaria'])
    expect(buscarClientes('0456/2026', CLIENTES).map(c => c.nombre)).toEqual(['López'])
    const conAsunto = [...CLIENTES, { nombre: 'Nuria Ejemplo', asunto: 'Divorcio contencioso' }]
    expect(buscarClientes('divorcio', conAsunto).map(c => c.nombre)).toEqual(['Nuria Ejemplo'])
  })

  test('varias coincidencias o ninguna', () => {
    expect(buscarClientes('2026', CLIENTES).length).toBe(3)
    expect(buscarClientes('Fernández', CLIENTES).length).toBe(0)
  })
})

describe('aviso de expediente cruzado', () => {
  const activo = CLIENTES[0]!
  const cwd = 'C:\\Users\\abogado\\demo'

  test('leer un archivo de la carpeta de otro cliente avisa', () => {
    const cruce = detectarCruce({ tool: 'Read', file_path: 'C:\\Users\\abogado\\demo\\expedientes\\lopez\\contrato.md' }, activo, CLIENTES, cwd)
    expect(cruce?.cliente.nombre).toBe('López')
  })

  test('con ruta relativa, con barras distintas y con mayúsculas también', () => {
    expect(detectarCruce({ tool: 'Write', file_path: 'Expedientes/LOPEZ/escrito.md' }, activo, CLIENTES, cwd)?.cliente.nombre).toBe('López')
    expect(detectarCruce({ tool: 'Grep', path: 'c:/despacho/comunidad' }, activo, CLIENTES, cwd)?.cliente.nombre).toBe(
      'Comunidad Calle Imaginaria',
    )
  })

  test('un comando de Bash que nombra la carpeta de otro cliente avisa', () => {
    expect(detectarCruce({ tool: 'Bash', command: 'cat expedientes/lopez/notas.txt' }, activo, CLIENTES, cwd)?.cliente.nombre).toBe('López')
    expect(detectarCruce({ tool: 'Bash', command: 'ls "expedientes/lopez"' }, activo, CLIENTES, cwd)?.cliente.nombre).toBe('López')
    // «lopezana» no es la carpeta de López
    expect(detectarCruce({ tool: 'Bash', command: 'cat expedientes/lopezana/x.txt' }, activo, CLIENTES, cwd)).toBeNull()
  })

  test('la carpeta del propio cliente activo, otra carpeta o sin cliente activo: no avisa', () => {
    expect(detectarCruce({ tool: 'Read', file_path: 'expedientes/garcia/demanda.md' }, activo, CLIENTES, cwd)).toBeNull()
    expect(detectarCruce({ tool: 'Read', file_path: 'expedientes/lopezana/x.md' }, activo, CLIENTES, cwd)).toBeNull()
    expect(detectarCruce({ tool: 'Read', file_path: 'expedientes/lopez/x.md' }, null, CLIENTES, cwd)).toBeNull()
  })
})
