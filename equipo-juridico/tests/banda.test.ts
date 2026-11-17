// Pruebas de la banda de encima del prompt: SIEMPRE una fila. Lo que no cabe
// entero en el presupuesto de caracteres no entra (está en el panel).

import { describe, expect, test } from 'claude-code/testing'

import { nuevaRedaccion } from '../hooks/avance'
import { presupuestoDeLaBanda, textoDeLaBanda } from '../hooks/banda'
import type { DatosBanda, TextoBanda } from '../hooks/banda'
import type { Redaccion } from '../types'

/** El texto entero de la fila, como se lee. */
function fila(t: TextoBanda): string {
  return t.soloEquipo ?? `${t.icono} ${t.titulo} ${t.llena}${t.vacia} ${t.porcentaje}${t.resto}`
}

const EQUIPO = [
  { nombre: 'Luis', haciendo: 'redactando la contestación', tareas: 2 },
  { nombre: 'Clara', haciendo: 'montando la cronología', tareas: 1 },
  { nombre: 'Alberto', haciendo: 'atando la competencia y el procedimiento', tareas: 1 },
  { nombre: 'Juan', haciendo: 'investigando', tareas: 1 },
  { nombre: 'Carmen', haciendo: 'cuadrando las cuentas', tareas: 1 },
]
const FRASE = { quien: 'Luis', texto: 'Ojo, el art. 82 Código del Derecho Foral de Aragón está vigente. ¡A tope!' }

function escrito(porcentaje: number, extra: Partial<Redaccion> = {}): Redaccion {
  return { ...nuevaRedaccion('Contestación a la demanda de divorcio', 0), porcentaje, fase: 'el equipo redacta · 0 de 5 partes hechas', ...extra }
}

describe('el presupuesto', () => {
  test('en la app de escritorio es prudente y fijo; en la terminal, el ancho menos los botones', () => {
    // Con el panel abierto, junto a los botones caben unos 46 caracteres.
    expect(presupuestoDeLaBanda(80, true)).toBe(46)
    expect(presupuestoDeLaBanda(200, true)).toBe(46)
    expect(presupuestoDeLaBanda(120, false)).toBe(96)
    expect(presupuestoDeLaBanda(50, false)).toBe(32)
    expect(presupuestoDeLaBanda(30, false)).toBe(24)
  })
})

describe('una sola fila, pase lo que pase', () => {
  test('la captura de Carlos (9/11/2026): 5 personas, el escrito al 55 % y una frase larga', () => {
    // Se partía en cinco líneas: «Contestación de la demanda de… ▓▓ 55 % · ahora: el equipo trabajando (0 de 5) ·
    // 👥 Equipo: 5 trabajando · Luis ×2 · Clara · Alberto · Juan · 💬 Luis: Art. 82 Decreto Legislativo…».
    const datos: DatosBanda = { red: escrito(55), trabajando: 5, hechas: 0, quienes: EQUIPO, frase: FRASE, ahora: 600_000 }
    const escritorio = fila(textoDeLaBanda(datos, presupuestoDeLaBanda(80, true)))
    expect(escritorio).toBe('📝 Contestación… ███░░░ 55 % · 5 trabajando')
    // En una terminal ancha cabe más, pero siempre en una fila.
    const terminal = fila(textoDeLaBanda(datos, presupuestoDeLaBanda(200, false)))
    expect(terminal).toContain('Contestación a la demanda de divorcio')
    expect(terminal).toContain('· 5 trabajando')
    expect(terminal).toContain('💬 Luis: Ojo, el art. 82')
    expect(terminal.length).toBeLessThanOrEqual(200 - 24)
    // Con menos sitio, la frase (que es larga) se queda fuera entera y entra el paso actual.
    const media = fila(textoDeLaBanda(datos, presupuestoDeLaBanda(160, false)))
    expect(media).not.toContain('💬')
    expect(media).toContain('· ahora: el equipo redacta · 0 de 5 partes hechas')
  })

  test('nunca pasa del presupuesto, sea cual sea el ancho', () => {
    const casos: DatosBanda[] = [
      { red: escrito(0), trabajando: 0, hechas: 0, quienes: [], ahora: 1000 },
      { red: escrito(55), trabajando: 5, hechas: 3, quienes: EQUIPO, frase: FRASE, ahora: 600_000 },
      { red: escrito(75), trabajando: 1, hechas: 7, quienes: EQUIPO.slice(0, 1), frase: FRASE, ahora: 600_000 },
      { red: escrito(100, { terminado: true, docx: true, fin: 87_000 }), trabajando: 0, hechas: 8, quienes: [], ahora: 90_000 },
      { red: escrito(100, { terminado: true, pdf: true, fin: 4_000_000 }), trabajando: 0, hechas: 8, quienes: [], ahora: 4_000_000 },
      { trabajando: 5, hechas: 2, quienes: EQUIPO, frase: FRASE, ahora: 1000 },
      { trabajando: 1, hechas: 0, quienes: [{ nombre: 'Rufino', haciendo: 'buscando grietas en nuestro escrito', tareas: 1 }], frase: { quien: 'Rufino', texto: 'A ver qué mierda me habéis traído hoy…' }, ahora: 1000 },
      { trabajando: 0, hechas: 12, quienes: [], ahora: 1000 },
    ]
    for (const datos of casos) {
      for (const presupuesto of [24, 32, 46, 60, 96, 140]) {
        const t = textoDeLaBanda(datos, presupuesto)
        // Lo que cuenta la banda para no pasarse: las casillas de la barra abultan algo más que una letra.
        const ancho = t.soloEquipo !== undefined ? t.soloEquipo.length : 3 + t.titulo.length + 1 + Math.ceil((t.llena.length + t.vacia.length) * 1.2) + 1 + t.porcentaje.length + t.resto.length
        // (con menos de 32 caracteres ya no cabe ni el título más corto con su barra: es el mínimo)
        expect(ancho).toBeLessThanOrEqual(Math.max(presupuesto, 32))
        // Nada cortado a medias: ni puntos suspensivos en mitad de una palabra ni separadores colgando.
        expect(fila(t)).not.toMatch(/ ·\s*$/)
        expect(fila(t)).not.toMatch(/[a-záéíóú]…\S/)
      }
    }
  })

  test('el escrito entregado: sin la «s» suelta de «1 min 27 s» en otra línea', () => {
    const entregado = escrito(100, { titulo: 'Recurso de apelación', terminado: true, docx: true, fin: 87_000 })
    const escritorio = fila(textoDeLaBanda({ red: entregado, trabajando: 0, hechas: 0, quienes: [], ahora: 90_000 }, 46))
    expect(escritorio).toBe('✅ Recurso… ██████ 100 % · Word entregado')
    // La primera palabra del título, siempre entera (salía «Contestació…»): si no cabe todo, se acorta lo de detrás.
    const largo = escrito(100, { terminado: true, pdf: true, fin: 87_000 })
    expect(fila(textoDeLaBanda({ red: largo, trabajando: 0, hechas: 0, quienes: [], ahora: 90_000 }, 46))).toBe('✅ Contestación… ██████ 100 % · entregado')
    const terminal = fila(textoDeLaBanda({ red: entregado, trabajando: 0, hechas: 0, quienes: [], ahora: 90_000 }, 96))
    expect(terminal).toBe('✅ Recurso de apelación ██████████████ 100 % · Word entregado en 1 min 27 s')
    expect(fila(textoDeLaBanda({ red: { ...entregado, docx: false, pdf: true }, trabajando: 0, hechas: 0, quienes: [], ahora: 90_000 }, 96))).toContain('PDF entregado')
  })

  test('solo el equipo: qué hace cada uno si cabe; si no, cuántos y quiénes', () => {
    const uno = [{ nombre: 'Juan', haciendo: 'buscando jurisprudencia', tareas: 1 }]
    expect(fila(textoDeLaBanda({ trabajando: 1, hechas: 0, quienes: uno, ahora: 0 }, 46))).toBe('👥 Equipo: Juan buscando jurisprudencia')
    expect(fila(textoDeLaBanda({ trabajando: 5, hechas: 0, quienes: EQUIPO, ahora: 0 }, 46))).toBe('👥 Equipo: 5 trabajando · Luis ×2 y 4 más')
    const rufino = [{ nombre: 'Rufino', haciendo: 'buscando grietas en nuestro escrito', tareas: 1 }]
    expect(fila(textoDeLaBanda({ trabajando: 1, hechas: 0, quienes: rufino, ahora: 0 }, 46))).toBe('👥 Equipo: Rufino buscando grietas en nuestro…')
    expect(fila(textoDeLaBanda({ trabajando: 5, hechas: 0, quienes: EQUIPO, ahora: 0 }, 96))).toBe('👥 Equipo: 5 trabajando · Luis ×2, Clara, Alberto, Juan, Carmen')
    expect(fila(textoDeLaBanda({ trabajando: 0, hechas: 5, quienes: [], ahora: 0 }, 46))).toBe('👥 Equipo: ha terminado · 5 tareas hechas')
    expect(fila(textoDeLaBanda({ trabajando: 0, hechas: 5, quienes: [], ahora: 0 }, 96))).toBe('👥 Equipo: todo el equipo ha terminado · 5 tareas hechas')
    // Con sitio, la frase de quien habla (sin repetir su nombre si ya se le acaba de nombrar).
    const conFrase = fila(textoDeLaBanda({ trabajando: 1, hechas: 0, quienes: uno, frase: { quien: 'Juan', texto: '¡Buah! La STS 323/2017 nos viene de lujo.' }, ahora: 0 }, 96))
    expect(conFrase).toBe('👥 Equipo: Juan buscando jurisprudencia · 💬 ¡Buah! La STS 323/2017 nos viene de lujo.')
  })
})
