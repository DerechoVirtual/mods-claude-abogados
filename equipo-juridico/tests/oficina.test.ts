// Pruebas de la oficina: quién está (por orden de llegada), qué hace, cuándo
// descansa, y el dibujo SVG con el texto bien escapado.

import { describe, expect, test } from 'claude-code/testing'

import { DESCANSO_MS, escaparXml, oficinaSvg, oficinaTexto, partirTexto, puestosDe } from '../hooks/oficina'
import type { Puesto } from '../hooks/oficina'
import { EQUIPO_POR_DEFECTO } from '../hooks/equipo-por-defecto'
import type { Tarea } from '../types'

function tarea(id: string, oficio: string, persona: string, inicio: number, extra: Partial<Tarea> = {}): Tarea {
  return {
    id,
    toolUseId: id,
    oficio,
    persona,
    accion: 0,
    descripcion: id,
    encargo: '',
    tipo: 'general-purpose',
    estado: 'trabajando',
    inicio,
    actividad: [],
    herramientas: 0,
    archivos: [],
    ...extra,
  }
}

describe('quién está en la oficina', () => {
  test('vacía al principio', () => {
    expect(puestosDe(EQUIPO_POR_DEFECTO, [], 0)).toEqual([])
  })

  test('por orden de llegada, con lo que hace cada uno', () => {
    const ahora = 600 + DESCANSO_MS + 1
    const tareas = [
      tarea('c1', 'hechos', 'clara', 1000),
      tarea('l1', 'fondo', 'luis', 2000, { accion: 1 }),
      tarea('l2', 'fondo', 'luis', 2100, { accion: 1, extension: 500, palabras: 120, frases: [{ texto: '¡Zas!', hora: 2200, grande: false }] }),
      tarea('e1', 'revision', 'elena', 1500, { estado: 'terminada', fin: 3000, accion: 1 }),
      tarea('m1', 'secretaria', 'maria', 500, { estado: 'terminada', fin: 600 }),
    ]
    const puestos = puestosDe(EQUIPO_POR_DEFECTO, tareas, ahora)
    expect(puestos.map(p => p.nombre)).toEqual(['María', 'Clara', 'Elena', 'Luis'])
    const [maria, clara, elena, luis] = puestos as [Puesto, Puesto, Puesto, Puesto]
    expect(maria.estado).toBe('descansando')
    expect(clara.estado).toBe('trabajando')
    expect(elena.estado).toBe('terminado')
    expect(elena.actividad).toBe('ha verificado las citas')
    expect(luis.enCurso).toBe(2)
    expect(luis.actividad).toBe('lleva 2 tareas · redactando un fundamento de fondo')
    expect(luis.bocadillo).toBe('¡Zas!')
    expect(luis.indicador).toBe('120/500 palabras')
    expect(luis.recienEntrado).toBe(false)
    // Cada uno tiene su silla fija, según su orden en el equipo (María 0, Luis 2, Clara 3, Elena 5).
    expect(puestos.map(p => p.asiento)).toEqual([0, 3, 5, 2])
  })

  test('quien acaba de entrar aparece con animación', () => {
    const puestos = puestosDe(EQUIPO_POR_DEFECTO, [tarea('j1', 'jurisprudencia', 'juan', 10_000)], 11_000)
    expect(puestos[0]?.recienEntrado).toBe(true)
    expect(oficinaSvg(puestos)).toContain('animateTransform')
  })
})

describe('el dibujo', () => {
  const puesto: Puesto = {
    id: 'x',
    nombre: 'A&B <x>',
    inicial: 'A',
    oficio: 'picapleitos',
    emoji: '📝',
    color: 'url(javascript:alert(1))',
    estado: 'trabajando',
    genero: 'm',
    actividad: 'redactando «la demanda» & más',
    bocadillo: '¡Buah! La STS 323/2017 del Supremo <es la hostia>',
    indicador: '3 pasos · 20 s',
    enCurso: 1,
    recienEntrado: false,
    asiento: 2,
    esperando: false,
    msDesdeEntrada: 60_000,
    rival: false,
  }

  test('escapa todo lo que viene de fuera y no deja colar colores raros', () => {
    const svg = oficinaSvg([puesto])
    expect(svg).toContain('A&amp;B &lt;x&gt;')
    expect(svg).not.toContain('A&B <x>')
    expect(svg).toContain('&lt;es la hostia&gt;')
    expect(svg).not.toContain('javascript')
    expect(svg).toContain('<animate')
    expect(svg.length).toBeLessThan(131_072)
    expect(escaparXml(`"'`)).toBe('&quot;&apos;')
  })

  test('8 puestos caben de sobra y la oficina vacía tiene su dibujo', () => {
    const ocho = Array.from({ length: 8 }, (_, i) => ({ ...puesto, id: `p${i}`, nombre: `P${i}` }))
    expect(oficinaSvg(ocho).length).toBeLessThan(131_072)
    expect(oficinaSvg([])).toContain('La oficina está vacía')
    expect(oficinaTexto([])).toBe('La oficina está vacía.')
    expect(oficinaTexto([puesto])).toContain('A&B <x> (picapleitos)')
  })

  test('el texto del bocadillo se parte en líneas', () => {
    expect(partirTexto('uno dos tres cuatro cinco seis', 9, 2)).toEqual(['uno dos', 'tres…'])
    expect(partirTexto('hola', 9, 2)).toEqual(['hola'])
    expect(partirTexto('', 9, 2)).toEqual([])
  })
})
