// Pruebas de la oficina isométrica: personas en sus sillas, entrada caminando,
// etiquetas con el color de su estado, director, chat, tablero y fondo.

import { describe, expect, test } from 'claude-code/testing'

import { ASIENTOS, TOPE_SVG, escenaSvg, escenaTexto, leerPersonajes, preguntaDelDirector } from '../hooks/escena'
import type { DatosEscena, PersonaEscena } from '../hooks/escena'

function persona(extra: Partial<PersonaEscena>): PersonaEscena {
  return {
    id: 'luis',
    nombre: 'Luis',
    inicial: 'L',
    oficio: 'picapleitos',
    emoji: '📝',
    color: '#3b82f6',
    estado: 'trabajando',
    actividad: 'está redactando un fundamento de fondo',
    indicador: '3 pasos · 20 s',
    enCurso: 1,
    recienEntrado: false,
    asiento: 2,
    esperando: false,
    msDesdeEntrada: 60_000,
    rival: false,
    genero: 'm',
    ...extra,
  }
}

const BASE: DatosEscena = {
  personas: [],
  director: 'Carlos',
  tablero: { trabajando: 0, estado: 'EN ESPERA' },
}

describe('la oficina isométrica', () => {
  test('cada estado con su etiqueta y su color', () => {
    const svg = escenaSvg({
      ...BASE,
      personas: [
        persona({ id: 'juan', nombre: 'Juan', asiento: 1 }),
        persona({ id: 'clara', nombre: 'Clara', asiento: 3, esperando: true }),
        persona({ id: 'elena', nombre: 'Elena', asiento: 5, estado: 'terminado' }),
        persona({ id: 'pablo', nombre: 'Pablo', asiento: 6, estado: 'fallo' }),
        persona({ id: 'luis', nombre: 'Luis', enCurso: 3 }),
      ],
      tablero: { trabajando: 3, escrito: 'Demanda de reclamación de cantidad', porcentaje: 40, estado: 'OPERATIVO' },
    })
    expect(svg).toContain('JUAN')
    expect(svg).toContain('LUIS ×3')
    expect(svg).toContain('#4ade80">TRABAJANDO')
    expect(svg).toContain('#facc15">ESPERANDO')
    expect(svg).toContain('#22d3ee">TERMINÓ ✓')
    expect(svg).toMatch(/#f87171"><animate[^>]*opacity[^>]*\/>\[ ERROR \]/)
    expect(svg).toContain('DIRECTOR CARLOS')
    expect(svg).toContain('SUPERVISANDO')
    expect(svg).toContain('TABLERO DE CONTROL')
    expect(svg).toContain('PERSONAS TRABAJANDO: <tspan fill="#facc15" font-weight="700">3</tspan>')
    expect(svg).toContain('ESCRITO: Demanda de reclamación…')
    expect(svg).toContain('40 %')
    expect(svg).toContain('OPERATIVO')
  })

  test('quien descansa se atenúa, pero su etiqueta se sigue leyendo', () => {
    // 9/11/2026: las etiquetas de quien descansaba (gris al 55 %) no se leían.
    const svg = escenaSvg({ ...BASE, personas: [persona({ id: 'juan', nombre: 'Juan', asiento: 1, estado: 'descansando' })] })
    // El gris claro de la etiqueta va a plena opacidad; lo atenuado es el personaje.
    expect(svg).toContain('#cbd5e1">JUAN')
    expect(svg).toContain('#cbd5e1">TERMINÓ ✓')
    expect(svg).toMatch(/<g transform="[^"]*" opacity="0\.6">/)
    expect(svg).not.toMatch(/<g opacity="0\.55">/)
    // Los textos son más grandes que antes (se leen a tamaño real del panel).
    expect(svg).toContain('font-size="12"')
    expect(svg).not.toContain('font-size="9"')
  })

  test('el estado vale igual para Elena que para Luis: «TERMINÓ», no «terminado»', () => {
    const svg = escenaSvg({ ...BASE, personas: [persona({ id: 'elena', nombre: 'Elena', asiento: 5, estado: 'terminado', genero: 'f' })] })
    expect(svg).toContain('TERMINÓ ✓')
    expect(svg).not.toContain('TERMINADO')
    expect(escenaTexto({ ...BASE, director: 'Ana', generoDirector: 'f' })).toContain('con la directora Ana')
    expect(escenaSvg({ ...BASE, director: 'Ana', generoDirector: 'f' })).toContain('DIRECTORA ANA')
  })

  test('quien acaba de entrar va caminando de la puerta a su silla, sin reiniciar el paseo', () => {
    const entrando = escenaSvg({ ...BASE, personas: [persona({ msDesdeEntrada: 1200 })] })
    expect(entrando).toContain('<animateMotion dur="3s" begin="-1.20s"')
    const sentado = escenaSvg({ ...BASE, personas: [persona({ msDesdeEntrada: 9000 })] })
    expect(sentado).not.toContain('animateMotion')
  })

  test('el chat: el director pregunta y contesta quien habló el último', () => {
    const svg = escenaSvg({
      ...BASE,
      chat: { director: 'Carlos', pregunta: 'Luis, ¿cómo va la demanda?', quien: 'Luis', respuesta: '¡Buah! Acabo de encontrar la STS 323/2017 del Supremo.' },
    })
    expect(svg).toContain('CHAT DEL DESPACHO')
    expect(svg).toContain('Luis, ¿cómo va la demanda?')
    expect(svg).toContain('¡Buah! Acabo de encontrar la STS')
    expect(preguntaDelDirector('Luis', 'Demanda de reclamación de cantidad')).toBe('Luis, ¿cómo va la demanda?')
    expect(preguntaDelDirector('Juan', 'Recurso de apelación')).toBe('Juan, ¿cómo va el recurso?')
    expect(preguntaDelDirector('Clara', 'Contestación a la demanda')).toBe('Clara, ¿cómo va la contestación?')
    expect(preguntaDelDirector('Elena', undefined, 'Sección 04')).toBe('Elena, ¿cómo va «Sección 04»?')
    // Con un escrito en plural, la pregunta concuerda.
    expect(preguntaDelDirector('Luis', 'Alegaciones al recurso')).toBe('Luis, ¿cómo van las alegaciones?')
    expect(preguntaDelDirector('Rufino', 'Contestación a la demanda', undefined, true)).toBe('Rufino, ¿qué te parece nuestra contestación?')
    expect(preguntaDelDirector('Rufino', 'Medidas cautelares', undefined, true)).toBe('Rufino, ¿qué te parecen nuestras medidas?')
    // Una frase larga se corta por una palabra entera, nunca a medias.
    const largo = escenaSvg({
      ...BASE,
      chat: {
        director: 'Carlos',
        pregunta: 'Luis, ¿cómo va la demanda?',
        quien: 'Luis',
        respuesta: 'Uno dos tres cuatro cinco seis siete ocho nueve diez once doce trece catorce quince dieciséis diecisiete dieciocho diecinueve veinte veintiuno veintidós veintitrés veinticuatro veinticinco veintiséis veintisiete veintiocho veintinueve treinta.',
      },
    })
    expect(largo).toMatch(/ [a-záéíóú]+…</)
    expect(largo).not.toMatch(/(veint|trein|diec)…</)
  })

  test('el fondo: solo una imagen embebida válida; si no, la oficina sencilla', () => {
    const fondo = `data:image/jpeg;base64,${'A'.repeat(62_000)}`
    const conFondo = escenaSvg({ ...BASE, fondo, personas: Array.from({ length: 8 }, (_, i) => persona({ id: `p${i}`, nombre: `P${i}`, asiento: i })) })
    expect(conFondo).toContain('<image href="data:image/jpeg;base64,')
    expect(conFondo.length).toBeLessThan(131_072)
    expect(escenaSvg({ ...BASE, fondo: 'https://ejemplo.com/a.png' })).not.toContain('<image')
    expect(escenaSvg({ ...BASE, fondo: 'data:image/jpeg;base64,"><script>' })).not.toContain('<script')
  })

  test('escapa los nombres y aguanta más de 8 personas', () => {
    const svg = escenaSvg({ ...BASE, director: 'A&B', personas: [persona({ nombre: 'X<y>', asiento: 11 })] })
    expect(svg).toContain('DIRECTOR A&amp;B')
    expect(svg).toContain('X&lt;Y&gt;')
    expect(svg).not.toContain('X<Y>')
    expect(escenaTexto({ ...BASE })).toContain('la oficina está vacía')
  })
})

// --- Los personajes: cada persona, el suyo ----------------------------------

/** Una imagen WebP falsa pero con forma válida (empieza por «UklGR») y el peso que se le pida. */
function imagenDe(peso: number): string {
  return `UklGR${'A'.repeat(peso - 5)}`
}

const CLAVES = ['maria', 'juan', 'luis', 'clara', 'alberto', 'elena', 'pablo', 'carmen', 'rufino', 'director', 'mujer', 'hombre']

/** Un archivo de personajes como el real (assets/personajes.json), con imágenes del peso indicado. */
function archivoDePersonajes(pesoCuerpo: number, pesoCara: number): unknown {
  return {
    version: 1,
    mime: 'image/webp',
    cuerpo: { ancho: 88, alto: 113, dibujarAncho: 47.7, dibujarAlto: 61.2, ancla: [27.1, 61.2] },
    cara: { ancho: 36, alto: 36, dibujarLado: 18 },
    cuerpos: Object.fromEntries(CLAVES.map(c => [c, imagenDe(pesoCuerpo)])),
    caras: Object.fromEntries(CLAVES.map(c => [c, imagenDe(pesoCara)])),
    sitios: {
      asientos: [[366, 177], [457, 205], [545, 234], [634, 262], [289, 281], [377, 314], [467, 346], [556, 378]],
      director: [127, 150],
      rival: [330, 441],
    },
  }
}

/** La oficina llena: las 8 personas del despacho, el abogado contrario y el director. */
const EQUIPO: Array<[string, string, 'f' | 'm']> = [
  ['maria', 'María', 'f'],
  ['juan', 'Juan', 'm'],
  ['luis', 'Luis', 'm'],
  ['clara', 'Clara', 'f'],
  ['alberto', 'Alberto', 'm'],
  ['elena', 'Elena', 'f'],
  ['pablo', 'Pablo', 'm'],
  ['carmen', 'Carmen', 'f'],
]
function oficinaLlena(estados: Partial<Record<string, PersonaEscena['estado']>> = {}): PersonaEscena[] {
  return [
    ...EQUIPO.map(([id, nombre, genero], i) => persona({ id, nombre, genero, asiento: i, estado: estados[id] ?? 'terminado', enCurso: id === 'luis' ? 3 : 1 })),
    persona({ id: 'rufino', nombre: 'Rufino', genero: 'm', asiento: 8, rival: true }),
  ]
}
const CHAT = { director: 'Carlos', pregunta: 'Elena, ¿cómo va la contestación?', quien: 'Elena', id: 'elena', genero: 'f' as const, respuesta: 'Citas comprobadas: todo vigente y bien citado.' }
/** El fondo real pesa 45.188 caracteres en base64. */
const FONDO = `data:image/webp;base64,${'A'.repeat(45_200)}`

describe('los personajes de la oficina', () => {
  test('cada persona lleva SU imagen, en su silla, y su cara en la etiqueta y en el chat', () => {
    // Carlos (9/11/2026): «en la oficina Elena es un hombre». Todos llevaban el mismo muñeco.
    const personajes = leerPersonajes({
      ...(archivoDePersonajes(200, 100) as object),
      cuerpos: Object.fromEntries(CLAVES.map((c, i) => [c, imagenDe(200 + i)])),
      caras: Object.fromEntries(CLAVES.map((c, i) => [c, imagenDe(100 + i)])),
    })
    expect(personajes).toBeDefined()
    if (personajes === undefined) return
    const svg = escenaSvg({ ...BASE, fondo: FONDO, personajes, personas: oficinaLlena(), chat: CHAT })
    // Cada uno, su cuerpo (ninguno repetido) y su cara.
    for (const [id] of [...EQUIPO, ['rufino'], ['director']]) {
      expect(svg.split(`${personajes.cuerpos[id as string]}"`).length - 1).toBe(1)
    }
    // El cuerpo de Elena (silla 6) va con su ancla en la base de su silla: x = 377 − 27,1; y = 314 − 61,2.
    expect(svg).toContain(`<image href="${personajes.cuerpos.elena}" x="349.9" y="252.8" width="47.7" height="61.2"`)
    // Su cara sale dos veces: en su etiqueta y en el chat (es quien contesta).
    expect(svg.split(`${personajes.caras.elena}"`).length - 1).toBe(2)
    expect(svg.split(`${personajes.caras.director}"`).length - 1).toBe(1)
    // 1 fondo + 10 cuerpos + 9 caras en etiquetas + 2 en el chat.
    expect(svg.match(/<image /g)?.length).toBe(22)
  })

  test('quien se añade al equipo sin imagen propia usa la de «mujer» u «hombre» según su género', () => {
    const personajes = leerPersonajes({
      ...(archivoDePersonajes(200, 100) as object),
      cuerpos: { mujer: imagenDe(301), hombre: imagenDe(302) },
      caras: { mujer: imagenDe(151), hombre: imagenDe(152) },
    })
    if (personajes === undefined) throw new Error('sin personajes')
    const svg = escenaSvg({
      ...BASE,
      personajes,
      personas: [persona({ id: 'rosa', nombre: 'Rosa', genero: 'f', asiento: 0 }), persona({ id: 'andres', nombre: 'Andrés', genero: 'm', asiento: 1 })],
    })
    expect(svg).toContain(`<image href="${personajes.cuerpos.mujer}" x="338.9" y="115.8"`)
    expect(svg).toContain(`<image href="${personajes.cuerpos.hombre}" x="429.9" y="143.8"`)
    expect(svg).toContain(`${personajes.caras.mujer}"`)
  })

  test('sin el archivo de imágenes, cada uno se dibuja distinto: ellas con melena o moño, ellos con traje y corbata', () => {
    const una = (id: string, genero: 'f' | 'm') => escenaSvg({ ...BASE, personas: [persona({ id, nombre: id, genero, asiento: 0 })] })
    const elena = una('elena', 'f')
    const luis = una('luis', 'm')
    // No hay imágenes: todo dibujado aquí.
    expect(elena).not.toContain('<image')
    // Elena no lleva la corbata de un hombre, ni Luis el pañuelo de ella; y sus dibujos no son el mismo.
    const dibujo = (svg: string): string => svg.slice(svg.indexOf('<ellipse', svg.indexOf('SUPERVISANDO')), svg.indexOf('CHAT DEL DESPACHO'))
    expect(dibujo(elena)).not.toBe(dibujo(luis).replace(/LUIS/g, 'ELENA'))
    expect(dibujo(luis)).toContain('fill="#f8fafc"') // camisa blanca bajo la corbata
    expect(dibujo(elena)).not.toContain('fill="#f8fafc"')
    // Los ocho del despacho, todos distintos entre sí.
    const dibujos = EQUIPO.map(([id, , genero]) => dibujo(una(id, genero)).replace(new RegExp(id, 'gi'), ''))
    expect(new Set(dibujos).size).toBe(8)
    // Alguien nuevo: según su género.
    expect(dibujo(una('rosa', 'f'))).not.toContain('fill="#f8fafc"')
    expect(dibujo(una('andres', 'm'))).toContain('fill="#f8fafc"')
  })

  test('solo entran imágenes de verdad (WebP o PNG en base64 limpio)', () => {
    expect(leerPersonajes(undefined)).toBeUndefined()
    expect(leerPersonajes({ cuerpos: { maria: 'hola' }, caras: {} })).toBeUndefined()
    expect(leerPersonajes({ cuerpos: { maria: `UklGR"><script>alert(1)</script>${'A'.repeat(80)}` } })).toBeUndefined()
    expect(leerPersonajes({ cuerpos: { 'ma ria': imagenDe(100) } })).toBeUndefined()
    const p = leerPersonajes({ cuerpos: { maria: imagenDe(100), juan: `iVBORw0KGgo${'A'.repeat(100)}` }, caras: {} })
    expect(p?.cuerpos.maria).toBe(`data:image/webp;base64,${imagenDe(100)}`)
    expect(p?.cuerpos.juan?.startsWith('data:image/png;base64,iVBORw0KGgo')).toBe(true)
    // Sin medidas ni sitios en el archivo, se usan los de serie.
    expect(p?.sitios.asientos.length).toBe(8)
    expect(p?.cara.lado).toBe(18)
  })
})

describe('ni etiquetas pisadas ni cabezas tapadas', () => {
  type Caja = { x: number; y: number; ancho: number; alto: number }
  const seTocan = (a: Caja, b: Caja): boolean => a.x < b.x + b.ancho && b.x < a.x + a.ancho && a.y < b.y + b.alto && b.y < a.y + a.alto
  /** Las cajas de las etiquetas, en el orden en que se dibujan. */
  const etiquetas = (svg: string): Caja[] =>
    [...svg.matchAll(/<rect x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="26" rx="3" fill="#0b1220"/g)].map(m => ({
      x: Number(m[1]),
      y: Number(m[2]),
      ancho: Number(m[3]),
      alto: 26,
    }))

  test('con la oficina llena y las imágenes de los personajes', () => {
    const personajes = leerPersonajes(archivoDePersonajes(200, 100))
    if (personajes === undefined) throw new Error('sin personajes')
    // El peor caso: todos con la etiqueta más ancha («LUIS ×3», «TRABAJANDO», «⚔ ATACANDO»).
    for (const estado of ['trabajando', 'terminado', 'descansando', 'fallo'] as const) {
      const svg = escenaSvg({ ...BASE, personajes, personas: oficinaLlena(Object.fromEntries(EQUIPO.map(([id]) => [id, estado]))), chat: CHAT })
      const cajas = etiquetas(svg)
      // La del director y las nueve de las personas.
      expect(cajas.length).toBe(10)
      for (let i = 0; i < cajas.length; i += 1) {
        for (let j = i + 1; j < cajas.length; j += 1) expect(seTocan(cajas[i] as Caja, cajas[j] as Caja)).toBe(false)
      }
      // Ninguna etiqueta tapa la cabeza de nadie (la cabeza: unos 20 × 22 px en lo alto de cada cuerpo).
      const cabezas: Caja[] = [...personajes.sitios.asientos, personajes.sitios.rival, personajes.sitios.director].map(s => ({ x: s.x - 10, y: s.y - 59, ancho: 20, alto: 22 }))
      for (const caja of cajas) for (const cabeza of cabezas) expect(seTocan(caja, cabeza)).toBe(false)
      // Ni la ventana de chat (de x = 5 a 405, hasta y ≈ 80) pisa una etiqueta o una cabeza.
      const chat = /<rect x="5" y="4" width="400" height="(\d+)" rx="4" fill="#0f172a"/.exec(svg)
      const cajaChat: Caja = { x: 5, y: 4, ancho: 400, alto: Number(chat?.[1] ?? 0) }
      expect(cajaChat.alto).toBeGreaterThan(30)
      for (const otra of [...cajas, ...cabezas]) expect(seTocan(cajaChat, otra)).toBe(false)
    }
  })

  test('con los personajes dibujados (sin imágenes) tampoco', () => {
    const svg = escenaSvg({ ...BASE, personas: oficinaLlena({ luis: 'trabajando', alberto: 'trabajando' }) })
    const cajas = etiquetas(svg)
    expect(cajas.length).toBe(10)
    for (let i = 0; i < cajas.length; i += 1) {
      for (let j = i + 1; j < cajas.length; j += 1) expect(seTocan(cajas[i] as Caja, cajas[j] as Caja)).toBe(false)
    }
    const cabezas: Caja[] = ASIENTOS.map(s => ({ x: s.x - 7, y: s.y - 40, ancho: 14, alto: 16 }))
    for (const caja of cajas) for (const cabeza of cabezas) expect(seTocan(caja, cabeza)).toBe(false)
  })
})

describe('el dibujo nunca pasa del tope de la app (131.072 caracteres)', () => {
  test('la oficina llena, con las imágenes reales, cabe entera', () => {
    // Pesos de assets/personajes.json (el cuerpo que más pesa, 4.080; la cara que más, 2.008) y del fondo (45.188).
    const personajes = leerPersonajes(archivoDePersonajes(4100, 2050))
    if (personajes === undefined) throw new Error('sin personajes')
    const svg = escenaSvg({ ...BASE, fondo: FONDO, personajes, personas: oficinaLlena({ luis: 'trabajando', alberto: 'trabajando' }), chat: CHAT })
    expect(svg.length).toBeLessThanOrEqual(TOPE_SVG)
    // Nada se ha quitado: fondo, 10 cuerpos, 9 caras en etiquetas y 2 en el chat.
    expect(svg.match(/<image /g)?.length).toBe(22)
    // Y aún sobra sitio (si esto falla, hay que aligerar las imágenes).
    expect(TOPE_SVG - svg.length).toBeGreaterThan(8_000)
  })

  test('si las imágenes pesaran demasiado, se quitan por orden y el dibujo sigue cabiendo', () => {
    const personas = oficinaLlena({ luis: 'trabajando', alberto: 'trabajando', juan: 'descansando', pablo: 'descansando' })
    const cuenta = (svg: string, trozo: string): number => svg.split(trozo).length - 1
    const con = (pesoCuerpo: number, pesoCara: number) => {
      const personajes = leerPersonajes(archivoDePersonajes(pesoCuerpo, pesoCara))
      if (personajes === undefined) throw new Error('sin personajes')
      const svg = escenaSvg({ ...BASE, fondo: FONDO, personajes, personas, chat: CHAT })
      expect(svg.length).toBeLessThanOrEqual(TOPE_SVG)
      return { svg, cuerpos: cuenta(svg, 'width="47.7"'), caras: cuenta(svg, `base64,${imagenDe(pesoCara)}"`) }
    }
    // Todo cabe: 10 cuerpos y 11 caras.
    expect(con(4100, 2050)).toMatchObject({ cuerpos: 10, caras: 11 })
    // Un poco de más: primero se van las caras de quien ya descansa (Juan y Pablo).
    expect(con(4100, 3600)).toMatchObject({ cuerpos: 10, caras: 9 })
    // Más: luego, las del chat.
    expect(con(4100, 4400)).toMatchObject({ cuerpos: 10, caras: 7 })
    // Más aún: todas las caras fuera (se dibujan), los cuerpos siguen.
    expect(con(4100, 7000)).toMatchObject({ cuerpos: 10, caras: 0 })
    // Y si ni los cuerpos caben, se dibuja a cada persona aquí mismo (nunca queda la oficina sin gente).
    const sinNada = con(9000, 7000)
    expect(sinNada).toMatchObject({ cuerpos: 0, caras: 0 })
    expect(sinNada.svg).toContain('ELENA')
    expect(sinNada.svg).toContain('<image href="data:image/webp;base64,AAAA')
  })
})
