// Pruebas del cómputo de plazos (hooks/lib/plazos.ts). Se ejecutan con:
//   claude plugin test        (desde la carpeta del plugin)
// Los festivos van escritos aquí mismo: las pruebas no leen archivos.

import { describe, expect, test } from 'claude-code/testing'
import {
  calcularPlazo,
  calcularTodos,
  diasHabilesRestantes,
  estadoPorDias,
  leerArgumentosPlazo,
  leerFechaUsuario,
  motivoInhabil,
  plazosDeEjemplo,
  REGLAS_POR_DEFECTO,
  agruparDesglose,
  fechaCorta,
  type Festivo,
  type ReglasComputo,
} from '../hooks/lib/plazos'

const FESTIVOS: Festivo[] = [
  { fecha: '2026-10-12', nombre: 'Fiesta Nacional de España' },
  { fecha: '2026-12-08', nombre: 'Inmaculada Concepción' },
  { fecha: '2026-12-25', nombre: 'Natividad del Señor' },
  { fecha: '2027-01-01', nombre: 'Año Nuevo' },
  { fecha: '2027-08-15', nombre: 'Asunción de la Virgen' },
]
const R = REGLAS_POR_DEFECTO
const CON_LEXNET: ReglasComputo = { ...R, lexnet15h: true }

describe('reglas básicas', () => {
  test('el día de la notificación no cuenta', () => {
    // Notificado el lunes 09/11/2026, plazo de 1 día → martes 10/11.
    const c = calcularPlazo({ notificacion: '2026-11-09', dias: 1, jurisdiccion: 'civil' }, FESTIVOS, R)
    expect(c.vencimiento).toBe('2026-11-10')
    expect(c.desglose[0]!.fecha).toBe('2026-11-10')
  })

  test('cruza un fin de semana: sábado y domingo no cuentan', () => {
    // Viernes 06/11/2026 + 3 días hábiles → lun 9 (1), mar 10 (2), mié 11 (3).
    const c = calcularPlazo({ notificacion: '2026-11-06', dias: 3, jurisdiccion: 'civil' }, FESTIVOS, R)
    expect(c.vencimiento).toBe('2026-11-11')
    expect(c.desglose.find(d => d.fecha === '2026-11-07')?.motivo).toBe('sábado')
    expect(c.desglose.find(d => d.fecha === '2026-11-08')?.motivo).toBe('domingo')
    expect(c.desglose.filter(d => d.habil).length).toBe(3)
  })

  test('cruza un festivo: el 8 de diciembre no cuenta', () => {
    // Viernes 04/12/2026 + 3 → lun 7 (1), [mar 8 festivo], mié 9 (2), jue 10 (3).
    const c = calcularPlazo({ notificacion: '2026-12-04', dias: 3, jurisdiccion: 'civil' }, FESTIVOS, R)
    expect(c.vencimiento).toBe('2026-12-10')
    expect(c.desglose.find(d => d.fecha === '2026-12-08')?.motivo).toBe('festivo: Inmaculada Concepción')
  })

  test('20 días hábiles que cruzan el 12 de octubre', () => {
    // Miércoles 07/10/2026 + 20 hábiles civil, con el 12-O festivo → 05/11/2026.
    const c = calcularPlazo({ notificacion: '2026-10-07', dias: 20, jurisdiccion: 'civil' }, FESTIVOS, R)
    expect(c.vencimiento).toBe('2026-11-05')
  })
})

describe('agosto según la jurisdicción', () => {
  // Jueves 29/07/2027 + 5 días hábiles.
  const datos = { notificacion: '2027-07-29', dias: 5 }

  test('civil: agosto inhábil → vence el lunes 06/09/2027', () => {
    const c = calcularPlazo({ ...datos, jurisdiccion: 'civil' }, FESTIVOS, R)
    expect(c.vencimiento).toBe('2027-09-06')
    expect(c.desglose.find(d => d.fecha === '2027-08-10')?.motivo).toBe('agosto (art. 183 LOPJ)')
  })

  test('contencioso y laboral: igual que civil', () => {
    expect(calcularPlazo({ ...datos, jurisdiccion: 'contencioso' }, FESTIVOS, R).vencimiento).toBe('2027-09-06')
    expect(calcularPlazo({ ...datos, jurisdiccion: 'laboral' }, FESTIVOS, R).vencimiento).toBe('2027-09-06')
  })

  test('penal (instrucción): agosto hábil → vence el jueves 05/08/2027', () => {
    const c = calcularPlazo({ ...datos, jurisdiccion: 'penal' }, FESTIVOS, R)
    expect(c.vencimiento).toBe('2027-08-05')
  })

  test('laboral con la excepción legal marcada (p. ej. despido): agosto cuenta', () => {
    const c = calcularPlazo({ ...datos, jurisdiccion: 'laboral', especialesHabiles: true }, FESTIVOS, R)
    expect(c.vencimiento).toBe('2027-08-05')
  })

  test('el ajuste por jurisdicción viene de la configuración, no del código', () => {
    const reglas: ReglasComputo = {
      ...R,
      jurisdicciones: { ...R.jurisdicciones, civil: { agostoInhabil: false, navidadInhabil: true } },
    }
    expect(calcularPlazo({ ...datos, jurisdiccion: 'civil' }, FESTIVOS, reglas).vencimiento).toBe('2027-08-05')
  })

  test('el desglose agrupa todo agosto en una sola línea', () => {
    const c = calcularPlazo({ ...datos, jurisdiccion: 'civil' }, FESTIVOS, R)
    const tramo = agruparDesglose(c.desglose).find(t => t.fecha === '2027-08-01')
    expect(tramo?.hasta).toBe('2027-08-31')
    expect(tramo?.cuantos).toBe(31)
  })
})

describe('fin de año', () => {
  test('civil: del 24 de diciembre al 6 de enero no cuenta (art. 183 LOPJ)', () => {
    // Viernes 18/12/2026 + 5 → lun 21 (1), mar 22 (2), mié 23 (3), [24/12–06/01], jue 7 (4), vie 8 (5).
    const c = calcularPlazo({ notificacion: '2026-12-18', dias: 5, jurisdiccion: 'civil' }, FESTIVOS, R)
    expect(c.vencimiento).toBe('2027-01-08')
    expect(c.desglose.find(d => d.fecha === '2026-12-29')?.motivo).toBe('24 dic–6 ene (art. 183 LOPJ)')
  })

  test('penal: cambia de año contando Navidad y saltando el 25 y el 1 de enero', () => {
    // Miércoles 30/12/2026 + 3 → jue 31 (1), [vie 1 festivo, sáb 2, dom 3], lun 4 (2), mar 5 (3).
    const c = calcularPlazo({ notificacion: '2026-12-30', dias: 3, jurisdiccion: 'penal' }, FESTIVOS, R)
    expect(c.vencimiento).toBe('2027-01-05')
    expect(c.desglose.find(d => d.fecha === '2027-01-01')?.motivo).toBe('festivo: Año Nuevo')
  })
})

describe('opción LexNET 15:00 (art. 135.5 LEC)', () => {
  test('viene DESACTIVADA por defecto', () => {
    expect(REGLAS_POR_DEFECTO.lexnet15h).toBe(false)
    const c = calcularPlazo({ notificacion: '2026-11-06', dias: 5, jurisdiccion: 'civil' }, FESTIVOS, R)
    expect(c.vencimiento).toBe('2026-11-13')
    expect(c.finPresentacion).toBeUndefined()
  })

  test('activada: hasta las 15:00 del día hábil siguiente', () => {
    const c = calcularPlazo({ notificacion: '2026-11-06', dias: 5, jurisdiccion: 'civil' }, FESTIVOS, CON_LEXNET)
    expect(c.vencimiento).toBe('2026-11-13') // viernes
    expect(c.finPresentacion).toBe('2026-11-16') // lunes
  })

  test('activada y con festivo en medio: salta al siguiente hábil', () => {
    // Vence el lunes 07/12/2026; el martes 8 es festivo → miércoles 09/12.
    const c = calcularPlazo({ notificacion: '2026-12-04', dias: 1, jurisdiccion: 'civil' }, FESTIVOS, CON_LEXNET)
    expect(c.vencimiento).toBe('2026-12-07')
    expect(c.finPresentacion).toBe('2026-12-09')
  })
})

describe('días restantes y semáforo', () => {
  const hoy = '2026-11-08' // domingo
  test('cuenta solo días hábiles desde mañana', () => {
    expect(diasHabilesRestantes(hoy, '2026-11-11', 'civil', FESTIVOS, R)).toBe(3)
    expect(diasHabilesRestantes(hoy, '2026-11-09', 'civil', FESTIVOS, R)).toBe(1)
    expect(diasHabilesRestantes('2026-11-11', '2026-11-11', 'civil', FESTIVOS, R)).toBe(0)
    expect(diasHabilesRestantes(hoy, '2026-11-06', 'civil', FESTIVOS, R)).toBeLessThan(0)
  })

  test('verde > 5, ámbar 2–5, rojo 1 o el mismo día, vencido < 0', () => {
    expect(estadoPorDias(6, R)).toBe('verde')
    expect(estadoPorDias(5, R)).toBe('ambar')
    expect(estadoPorDias(2, R)).toBe('ambar')
    expect(estadoPorDias(1, R)).toBe('rojo')
    expect(estadoPorDias(0, R)).toBe('rojo')
    expect(estadoPorDias(-1, R)).toBe('vencido')
  })

  test('los plazos se ordenan por vencimiento', () => {
    const lista = calcularTodos(
      [
        { id: 'b', asunto: 'B', tipo: 't', jurisdiccion: 'civil', notificacion: '2026-11-02', dias: 20 },
        { id: 'a', asunto: 'A', tipo: 't', jurisdiccion: 'civil', notificacion: '2026-10-14', dias: 20 },
      ],
      hoy,
      FESTIVOS,
      R,
    )
    expect(lista.map(p => p.id).join(',')).toBe('a,b')
    expect(lista[0]!.estado).toBe('ambar')
  })

  test('los plazos de ejemplo dan verde, ámbar, rojo y vencido hoy', () => {
    const ejemplos = plazosDeEjemplo(hoy, FESTIVOS, R, Date.UTC(2026, 10, 8, 11))
    const estados = new Set(calcularTodos(ejemplos, hoy, FESTIVOS, R).map(p => p.estado))
    for (const e of ['verde', 'ambar', 'rojo', 'vencido'] as const) expect(estados.has(e)).toBe(true)
  })
})

describe('lectura de lo que escribe el abogado', () => {
  test('fechas en formatos habituales y fechas imposibles', () => {
    expect(leerFechaUsuario('14/11/2026', '2026-11-08')).toBe('2026-11-14')
    expect(leerFechaUsuario('14-11-26', '2026-11-08')).toBe('2026-11-14')
    expect(leerFechaUsuario('2026-11-14', '2026-11-08')).toBe('2026-11-14')
    expect(leerFechaUsuario('hoy', '2026-11-08')).toBe('2026-11-08')
    expect(leerFechaUsuario('31/02/2026', '2026-11-08')).toBeNull()
  })

  test('/plazo-nuevo con argumentos en una línea', () => {
    const r = leerArgumentosPlazo('García c. Aseguradora Ficticia | Contestación a la demanda | civil | 14/10/2026 | 20 | García', '2026-11-08')
    expect(r.error).toBeUndefined()
    expect(r.plazo?.notificacion).toBe('2026-10-14')
    expect(r.plazo?.dias).toBe(20)
    expect(r.plazo?.cliente).toBe('García')
  })

  test('/plazo-nuevo marca la excepción legal con «urgente»', () => {
    const r = leerArgumentosPlazo('Pérez | Demanda de despido | social | 01/08/2027 | 20 | | urgente', '2026-11-08')
    expect(r.plazo?.jurisdiccion).toBe('laboral')
    expect(r.plazo?.especialesHabiles).toBe(true)
  })

  test('/plazo-nuevo avisa de lo que falta', () => {
    expect(leerArgumentosPlazo('Solo el asunto', '2026-11-08').error).toContain('Faltan datos')
    expect(leerArgumentosPlazo('A | B | marítima | 01/01/2027 | 5', '2026-11-08').error).toContain('no reconocida')
  })

  test('motivo de inhábil y fecha corta en español', () => {
    expect(motivoInhabil('2026-11-08', 'civil', FESTIVOS, R)).toBe('domingo')
    expect(motivoInhabil('2026-11-10', 'civil', FESTIVOS, R)).toBeNull()
    expect(fechaCorta('2026-11-13')).toBe('vie 13/11')
  })
})
