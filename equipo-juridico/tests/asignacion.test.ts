// Pruebas del reparto: de qué oficio es cada tarea, qué persona la lleva y
// cómo se cuenta. Se ejecutan con:  claude plugin test <carpeta del mod>

import { describe, expect, test } from 'claude-code/testing'

import {
  accionDe,
  archivoDe,
  asignar,
  detalleHerramienta,
  detectarSeccion,
  duracion,
  elegirPersona,
  frase,
  generoDe,
  metaDeFlujo,
  normalizar,
  oficioDe,
  resumen,
  validarConfig,
} from '../hooks/equipo'
import { EQUIPO_POR_DEFECTO } from '../hooks/equipo-por-defecto'
import type { Persona, Tarea } from '../types'

const EQUIPO = EQUIPO_POR_DEFECTO

/** La frase de la primera persona del oficio elegido. */
function fraseDe(descripcion: string, prompt = '', tipo = 'general-purpose'): string {
  const r = asignar(EQUIPO, { descripcion, prompt, tipo })
  return frase(r.oficio.personas[0]!, accionDe(r.oficio, r.accion), 'trabajando')
}

/** [descripción, encargo, tipo, oficio, frase esperada] */
const CASOS: Array<[string, string, string, string, string]> = [
  ['Investigar jurisprudencia despido', 'Busca sentencias del Tribunal Supremo sobre despido.', 'general-purpose', 'jurisprudencia', 'Juan está buscando jurisprudencia'],
  ['Buscar sentencias del TS', '', 'general-purpose', 'jurisprudencia', 'Juan está buscando jurisprudencia'],
  ['Buscar sentencias de la Audiencia Provincial de Madrid', '', 'general-purpose', 'jurisprudencia', 'Juan está buscando jurisprudencia'],
  ['Buscar doctrina del Tribunal Constitucional', '', 'general-purpose', 'jurisprudencia', 'Juan está buscando jurisprudencia'],
  ['Repasar normativa del BOE', 'Localiza la Ley 1/2000 y su artículo 437.', 'general-purpose', 'jurisprudencia', 'Juan está repasando la normativa'],
  ['Explore codebase', 'Find where the parser lives.', 'Explore', 'jurisprudencia', 'Juan está investigando'],
  ['Redactar contestación a la demanda', 'Borrador para el cliente ficticio Pérez.', 'general-purpose', 'fondo', 'Luis está redactando la contestación'],
  ['Redactar borrador de demanda', '', 'general-purpose', 'fondo', 'Luis está redactando la demanda'],
  ['Preparar recurso de apelación', '', 'general-purpose', 'fondo', 'Luis está preparando el recurso'],
  ['Redactar y verificar', '', 'general-purpose', 'fondo', 'Luis está redactando el borrador'],
  ['Preparar interrogatorio de testigos', '', 'general-purpose', 'fondo', 'Luis está preparando la prueba'],
  ['Redactar burofax de requerimiento', '', 'general-purpose', 'fondo', 'Luis está preparando el burofax'],
  ['Analizar viabilidad del caso', '', 'general-purpose', 'fondo', 'Luis está pensando la estrategia'],
  ['Planificar la estrategia', 'Diseña el plan.', 'Plan', 'fondo', 'Luis está pensando la estrategia'],
  ['Redactar los hechos', '', 'general-purpose', 'hechos', 'Clara está redactando los hechos'],
  ['Montar cronología de hechos', '', 'general-purpose', 'hechos', 'Clara está montando la cronología'],
  ['Ordenar los archivos del expediente', 'Clasifica estos PDF ficticios.', 'general-purpose', 'secretaria', 'María está ordenando el expediente'],
  ['Revisar plazos y agenda', '', 'general-purpose', 'secretaria', 'María está calculando los plazos'],
  ['Ensamblar el Word', '', 'general-purpose', 'secretaria', 'María está montando el Word'],
  ['Recibir el asunto nuevo', '', 'general-purpose', 'secretaria', 'María está recibiendo el asunto'],
  ['Hacer algo sin relación', 'Cuenta las líneas del fichero.', 'general-purpose', 'secretaria', 'María está tramitando el expediente'],
  ['Verificar las citas del escrito', 'Comprueba que cada ECLI existe.', 'general-purpose', 'revision', 'Elena está verificando las citas'],
  ['Revisar las citas', '', 'general-purpose', 'revision', 'Elena está verificando las citas'],
  ['Revisar el escrito final', '', 'general-purpose', 'revision', 'Elena está puliendo el estilo'],
  ['Comprobar el secreto profesional', '', 'general-purpose', 'revision', 'Elena está revisando la confidencialidad'],
  ['Anonimizar los datos', '', 'general-purpose', 'revision', 'Elena está revisando la confidencialidad'],
  ['Preparar presentación en LexNET', '', 'general-purpose', 'procura', 'Pablo está preparando la presentación en LexNET'],
  ['Calcular la minuta de honorarios', '', 'general-purpose', 'contable', 'Carmen está calculando la minuta'],
  ['Tasación de costas del pleito', '', 'general-purpose', 'contable', 'Carmen está preparando la tasación de costas'],
  ['Calcular la indemnización por despido', '', 'general-purpose', 'contable', 'Carmen está calculando la indemnización'],
]

describe('reparto por oficio', () => {
  for (const [descripcion, prompt, tipo, oficio, esperada] of CASOS) {
    test(`«${descripcion}» es de ${oficio}`, () => {
      const r = asignar(EQUIPO, { descripcion, prompt, tipo })
      expect(r.oficio.id).toBe(oficio)
      expect(fraseDe(descripcion, prompt, tipo)).toBe(esperada)
    })
  }

  test('ni las mayúsculas ni las tildes cambian el reparto', () => {
    expect(asignar(EQUIPO, { descripcion: 'INVESTIGACIÓN DE JURISPRUDÉNCIA' }).oficio.id).toBe('jurisprudencia')
    expect(normalizar('Señalamiento  ÁGIL')).toBe(' senalamiento agil ')
  })

  test('la misma tarea va siempre al mismo oficio y acción', () => {
    const datos = { descripcion: 'Redactar y verificar', prompt: 'Escribe la sección 3 y comprueba las citas.', tipo: 'general-purpose' }
    const primera = asignar(EQUIPO, datos)
    for (let i = 0; i < 20; i += 1) {
      const otra = asignar(EQUIPO, datos)
      expect(otra.oficio.id).toBe(primera.oficio.id)
      expect(otra.accion).toBe(primera.accion)
    }
  })

  test('lo que no encaja va al oficio por defecto', () => {
    const r = asignar(EQUIPO, { descripcion: 'xyz', prompt: '', tipo: 'general-purpose' })
    expect(r.oficio.id).toBe(EQUIPO.porDefecto)
    expect(r.puntos).toBe(0)
  })
})

describe('secciones de redaccion-rapida (redactor-seccion)', () => {
  const TIPO = 'litigacion-civil-espana:redactor-seccion'
  const encargo = (linea: string, n: string): string =>
    `Carpeta: C:/casos/ficticio (lee caso.md)\n${linea} Extensión: 600 palabras.\nBúsquedas: según el plan.\nEscribe secciones/${n}-x.md y fuentes/${n}.md.\nPerfil de estilo: no hay.`
  const SECCIONES: Array<[string, string, string, string]> = [
    ['01', 'Sección 01 — Encabezamiento y hechos: comparecencia y relato de los hechos.', 'hechos', 'Clara está redactando los hechos'],
    ['02', 'Sección 02 — Fundamentos procesales: jurisdicción, competencia, legitimación y procedimiento.', 'procesal', 'Alberto está atando la competencia y el procedimiento'],
    ['03', 'Sección 03 — Fundamento de fondo: responsabilidad extracontractual del art. 1902 CC.', 'fondo', 'Luis está redactando un fundamento de fondo'],
    ['04', 'Sección 04 — Motivo primero: infracción del art. 217 LEC.', 'fondo', 'Luis está redactando un motivo del recurso'],
    ['05', 'Sección 05 — Cierre: intereses, costas, súplica y otrosíes.', 'fondo', 'Luis está redactando la súplica y los otrosíes'],
    ['06', 'Sección 06 — Cláusulas de precio y pago.', 'fondo', 'Luis está redactando las cláusulas'],
    ['07', 'Sección 07 — Anexo: tabla de importes.', 'fondo', 'Luis está redactando el borrador'],
  ]
  for (const [n, linea, oficio, esperada] of SECCIONES) {
    test(`la sección ${n} es de ${oficio}`, () => {
      const r = asignar(EQUIPO, { descripcion: `Sección ${n}`, prompt: encargo(linea, n), tipo: TIPO })
      expect(r.oficio.id).toBe(oficio)
      expect(r.seccion?.startsWith(`Sección ${n} — `)).toBe(true)
      expect(frase(r.oficio.personas[0]!, accionDe(r.oficio, r.accion), 'trabajando')).toBe(esperada)
    })
  }

  test('la sección se lee sin la extensión', () => {
    expect(detectarSeccion(encargo('Sección 3 — Fundamento de fondo: daño moral.', '03'))).toBe('Sección 03 — Fundamento de fondo: daño moral.')
    expect(detectarSeccion('Investigar jurisprudencia')).toBeUndefined()
  })
})

describe('la parte contraria (Rufino)', () => {
  // El encargo que lanza «Que lo ataque el contrario» (mods-abogados): lleva
  // «demanda», «escrito», «fundamentos», «jurisprudencia», «procesales»…, que
  // son claves de Luis, Juan o Alberto. Aun así, el ataque es de Rufino.
  const ENCARGO = [
    'Eres el abogado de la parte contraria. Lee la demanda de desahucio ficticia (C:/casos/ficticio/demanda.docx) y su escrito.md, y atácala como lo haría el abogado de la otra parte:',
    '1. Excepciones procesales: jurisdicción y competencia, procedimiento y cuantía, legitimación, postulación y requisitos de procedibilidad.',
    '2. Hechos que no quedan probados con los documentos citados.',
    '3. Fundamentos débiles y los argumentos que la otra parte puede oponer a cada uno.',
    '4. Jurisprudencia citada que pueda volverse en contra: comprueba con leer_sentencias el fallo de cada sentencia.',
    'Guarda el informe en ataque-de-la-contraria.md. No modifiques el escrito: solo analízalo.',
  ].join('\n')

  for (const descripcion of [
    'Atacar como parte contraria: debilidades y grietas del caso', // la de la captura de Carlos (9/11)
    'Atacar el escrito como la parte contraria', // la que pide ahora mods-abogados
    'Ataque de la contraria a la demanda',
    'Abogado de la parte contraria',
    'Buscar las debilidades que verá la parte contraria', // un ataque gana aunque empiece por «Buscar» (Juan)
    'Hacer de abogado del diablo con la demanda',
  ]) {
    test(`«${descripcion}» es de Rufino, no de Luis`, () => {
      const r = asignar(EQUIPO, { descripcion, prompt: ENCARGO, tipo: 'general-purpose' })
      expect(r.oficio.id).toBe('contraria')
      expect(r.oficio.personas[0]?.nombre).toBe('Rufino')
      expect(frase(r.oficio.personas[0]!, accionDe(r.oficio, r.accion), 'trabajando')).toBe('Rufino está buscando grietas en nuestro escrito')
    })
  }

  test('nuestros propios escritos contra la contraria siguen siendo de Luis', () => {
    expect(asignar(EQUIPO, { descripcion: 'Redactar contestación a la demanda de la parte contraria', prompt: '', tipo: 'general-purpose' }).oficio.id).toBe('fondo')
    expect(asignar(EQUIPO, { descripcion: 'Preparar recurso de apelación contra la sentencia', prompt: '', tipo: 'general-purpose' }).oficio.id).toBe('fondo')
    // «Atacar la sentencia» es impugnarla: es nuestro recurso, no la contraria.
    expect(asignar(EQUIPO, { descripcion: 'Preparar recurso para atacar la sentencia', prompt: '', tipo: 'general-purpose' }).oficio.id).not.toBe('contraria')
    expect(asignar(EQUIPO, { descripcion: 'Redactar recurso atacando el auto', prompt: '', tipo: 'general-purpose' }).oficio.id).toBe('fondo')
  })

  test('Rufino nunca redacta una sección del escrito', () => {
    const r = asignar(EQUIPO, { descripcion: 'Sección 03', prompt: 'Sección 03 — Fondo: rebatir lo que alegará la parte contraria. Extensión: 500 palabras.', tipo: 'jurisprudenciator:redactor-seccion' })
    expect(r.oficio.id).toBe('fondo')
  })
})

describe('personas del oficio', () => {
  const fondo = oficioDe(EQUIPO, 'fondo')
  const tarea = (id: string, persona: string, estado: Tarea['estado'] = 'trabajando'): Tarea => ({
    id,
    toolUseId: 't',
    oficio: 'fondo',
    persona,
    accion: 0,
    descripcion: id,
    encargo: '',
    tipo: 'x',
    estado,
    inicio: 0,
    actividad: [],
    herramientas: 0,
    archivos: [],
  })

  test('con una persona por oficio, la misma persona lleva varias tareas', () => {
    const lista: Tarea[] = []
    for (let i = 0; i < 5; i += 1) lista.push(tarea(`s${i}`, elegirPersona(fondo, lista).id))
    expect(lista.map(t => t.persona)).toEqual(['luis', 'luis', 'luis', 'luis', 'luis'])
  })

  test('si se añaden personas a un oficio en el JSON, se reparten', () => {
    const conDos = { ...fondo, personas: [...fondo.personas, { id: 'andres', nombre: 'Andrés', inicial: 'A', muletillas: [], genero: 'm' as const }] }
    const lista: Tarea[] = []
    const elegidas: string[] = []
    for (let i = 0; i < 4; i += 1) {
      const p = elegirPersona(conDos, lista)
      elegidas.push(p.nombre)
      lista.push(tarea(`s${i}`, p.id))
    }
    expect(elegidas).toEqual(['Luis', 'Andrés', 'Luis', 'Andrés'])
    expect(elegirPersona(conDos, [tarea('a', 'luis', 'terminada'), tarea('b', 'andres')]).nombre).toBe('Luis')
  })
})

describe('herramientas de cada subagente', () => {
  test('se cuentan en lenguaje del despacho', () => {
    expect(
      detalleHerramienta('mcp__plugin_litigacion-civil-espana_jurisprudenciator__buscar_sentencias', {
        consulta: 'responsabilidad extracontractual',
        base: 'TS',
      }),
    ).toBe('buscar_sentencias «responsabilidad extracontractual» (TS)')
    expect(detalleHerramienta('mcp__x__buscar_articulo', { ley: 'CC', articulo: '1902' })).toBe('buscar_articulo art. 1902 CC')
    expect(detalleHerramienta('mcp__x__leer_sentencias', { citas: 'STS 1234/2023', parrafos: 3 })).toBe('leer_sentencias STS 1234/2023')
    expect(detalleHerramienta('mcp__x__verificar_escrito', { texto: 'abc' })).toBe('verificar_escrito (3 caracteres)')
    expect(detalleHerramienta('Write', { file_path: 'C:\\casos\\ficticio\\secciones\\03-fondo.md', content: 'x' })).toBe('Write secciones/03-fondo.md')
    expect(detalleHerramienta('Read', { file_path: '/casos/ficticio/caso.md' })).toBe('Read ficticio/caso.md')
    expect(detalleHerramienta('mcp__otro__lo_que_sea', { termino: 'arras penitenciales' })).toBe('lo_que_sea «arras penitenciales»')
  })

  test('solo las que escriben dejan archivo', () => {
    expect(archivoDe('Write', { file_path: 'secciones/03-fondo.md' })).toBe('secciones/03-fondo.md')
    expect(archivoDe('Edit', { file_path: 'fuentes/03.md' })).toBe('fuentes/03.md')
    expect(archivoDe('Read', { file_path: 'caso.md' })).toBeUndefined()
  })
})

describe('config/equipo.json', () => {
  test('un equipo editado se valida y se completa', () => {
    const r = validarConfig({
      porDefecto: 'nadie',
      oficios: [
        { oficio: 'pasante', personas: ['Ana', { nombre: 'Ana' }, {}], claves: ['fotocop'] },
        { oficio: 'sin gente', personas: [] },
      ],
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.config.oficios.map(o => o.id)).toEqual(['pasante'])
    expect(r.config.oficios[0]?.personas.map(p => p.id)).toEqual(['ana', 'ana-pasante-2'])
    expect(r.config.porDefecto).toBe('pasante')
    expect(r.avisos.length).toBeGreaterThan(0)
    const reparto = asignar(r.config, { descripcion: 'Fotocopiar el expediente' })
    expect(frase(reparto.oficio.personas[0]!, accionDe(reparto.oficio, reparto.accion), 'trabajando')).toBe('Ana está trabajando')
  })

  test('el formato antiguo (miembros) sigue valiendo', () => {
    const r = validarConfig({
      porDefecto: 'maria',
      miembros: [
        { id: 'maria', nombre: 'María', oficio: 'secretaria', claves: ['orden'] },
        { id: 'luis', nombre: 'Luis', oficio: 'picapleitos', claves: ['redact'] },
      ],
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.config.porDefecto).toBe('maria')
    expect(asignar(r.config, { descripcion: 'Redactar la demanda' }).oficio.personas[0]?.nombre).toBe('Luis')
  })

  test('un archivo sin oficios se rechaza', () => {
    expect(validarConfig({ oficios: [] }).ok).toBe(false)
    expect(validarConfig('hola').ok).toBe(false)
    expect(validarConfig(null).ok).toBe(false)
  })

  test('el equipo por defecto pasa su propia validación: 8 personas, tono informal', () => {
    const r = validarConfig(EQUIPO)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.avisos).toEqual([])
    // 8 del despacho; Rufino es el abogado de la parte contraria y no cuenta.
    const ids = EQUIPO.oficios.filter(o => o.rival !== true).flatMap(o => o.personas.map(p => p.id))
    expect(ids).toEqual(['maria', 'juan', 'luis', 'clara', 'alberto', 'elena', 'pablo', 'carmen'])
    expect(EQUIPO.oficios.filter(o => o.rival === true).flatMap(o => o.personas.map(p => p.id))).toEqual(['rufino'])
    expect(EQUIPO.tono).toBe('informal')
  })

  test('tono, muletillas y aviso si hay demasiada gente', () => {
    const muchas = Array.from({ length: 9 }, (_, i) => `Persona ${i}`)
    const r = validarConfig({ tono: 'gritón', oficios: [{ oficio: 'todo', personas: muchas.map(n => ({ nombre: n, muletillas: ['¡Ea!'] })) }] })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.config.tono).toBe('informal')
    expect(r.config.oficios[0]?.personas[0]?.muletillas).toEqual(['¡Ea!'])
    expect(r.avisos.some(a => a.includes('«tono»'))).toBe(true)
    expect(r.avisos.some(a => a.includes('7 u 8'))).toBe(true)
    const pro = validarConfig({ tono: 'profesional', avisosEmergentes: false, oficios: [{ oficio: 'x', personas: ['Ana'] }] })
    expect(pro.ok && pro.config.tono === 'profesional' && !pro.config.avisosEmergentes).toBe(true)
  })
})

describe('textos', () => {
  test('duraciones legibles', () => {
    expect(duracion(45_000)).toBe('45 s')
    expect(duracion(130_000)).toBe('2 min 10 s')
    expect(duracion(3_900_000)).toBe('1 h 5 min')
  })

  const base = { toolUseId: 't', tipo: 'general-purpose', inicio: 0, encargo: '', actividad: [], herramientas: 0, archivos: [] }

  test('con pocas personas, el resumen las nombra', () => {
    const tareas: Tarea[] = [
      { ...base, id: 'a', oficio: 'jurisprudencia', persona: 'juan', accion: 0, descripcion: 'x', estado: 'trabajando' },
      { ...base, id: 'b', oficio: 'fondo', persona: 'luis', accion: 12, descripcion: 'z', estado: 'trabajando' },
      { ...base, id: 'c', oficio: 'secretaria', persona: 'maria', accion: 0, descripcion: 'w', estado: 'terminada', fin: 10 },
    ]
    expect(resumen(EQUIPO, tareas)).toBe('Juan buscando jurisprudencia · Luis redactando el borrador · 1 terminada')
    expect(resumen(EQUIPO, tareas, true)).toBe('Juan buscando · Luis redactando · 1 terminada')
    expect(resumen(EQUIPO, [tareas[2] as Tarea])).toBe('todo el equipo ha terminado · 1 tarea hecha')
  })

  test('con muchas tareas, el resumen dice cuántas lleva cada uno', () => {
    const t = (id: string, oficio: string, persona: string, estado: Tarea['estado'] = 'trabajando'): Tarea => ({
      ...base,
      id,
      oficio,
      persona,
      accion: 0,
      descripcion: id,
      estado,
    })
    const tareas: Tarea[] = [
      t('f1', 'fondo', 'luis'),
      t('f2', 'fondo', 'luis'),
      t('f3', 'fondo', 'luis'),
      t('f4', 'fondo', 'luis'),
      t('j1', 'jurisprudencia', 'juan'),
      t('j2', 'jurisprudencia', 'juan'),
      t('c1', 'hechos', 'clara'),
      t('a1', 'procesal', 'alberto'),
      t('e1', 'revision', 'elena', 'terminada'),
    ]
    expect(resumen(EQUIPO, tareas)).toBe('8 trabajando · Luis ×4 · Juan ×2 · Clara · Alberto · 1 terminada')
  })

  test('el nombre de un Workflow sale de su bloque meta', () => {
    const script = "export const meta = { name: 'wf_mods', description: 'Informe de 50 páginas', phases: [] }"
    expect(metaDeFlujo(script, undefined)).toEqual({ nombre: 'wf_mods', descripcion: 'Informe de 50 páginas' })
    expect(metaDeFlujo(undefined, 'revisar-contrato')).toEqual({ nombre: 'revisar-contrato', descripcion: '' })
  })
})

describe('si la descripción nombra a alguien del equipo, la tarea es suya', () => {
  test('«Elena: revisar…», «Juan — comprobar…» van a quien se nombra, con sus palabras o sin ellas', () => {
    // 9/11/2026: «Juan: comprobar las seis citas de la demanda» salía como de Elena (por «citas»).
    const de = (descripcion: string) => {
      const r = asignar(EQUIPO_POR_DEFECTO, { descripcion, prompt: 'Caso ficticio.', tipo: 'general-purpose' })
      return r.oficio.personas.find(x => x.id === r.persona)?.nombre ?? `(sin nombrar: ${r.oficio.personas[0]?.nombre})`
    }
    expect(de('Juan: comprobar las seis citas de la demanda')).toBe('Juan')
    expect(de('Elena: revisar coherencia y cifras del escrito corregido')).toBe('Elena')
    expect(de('María — ordenar los 15 documentos')).toBe('María')
    expect(de('maria: redactar la demanda entera')).toBe('María')
    expect(de('Carmen, cuadro económico de ingresos y gastos')).toBe('Carmen')
    expect(de('Rufino: atacar el escrito')).toBe('Rufino')
    // Un nombre que no es del equipo, o una frase sin nombre delante, se reparte como siempre.
    expect(de('Marta: revisar las citas')).toBe('(sin nombrar: Elena)')
    expect(de('Redactar: hechos y fundamentos')).toMatch(/sin nombrar/)
    // La acción sale de lo que se le pide, no del nombre.
    const r = asignar(EQUIPO_POR_DEFECTO, { descripcion: 'Luis: redactar la contestación a la demanda', prompt: '', tipo: 'general-purpose' })
    expect(frase(r.oficio.personas[0] as Persona, accionDe(r.oficio, r.accion), 'trabajando')).toBe('Luis está redactando la contestación')
  })

  test('el género de cada persona: el del archivo o, si falta, el de su nombre', () => {
    expect(generoDe('f', 'Luis')).toBe('f')
    expect(generoDe('hombre', 'Ana')).toBe('m')
    expect(generoDe(undefined, 'Rosa')).toBe('f')
    expect(generoDe(undefined, 'Carmen')).toBe('f')
    expect(generoDe(undefined, 'Andrés')).toBe('m')
    expect(generoDe(undefined, 'Borja')).toBe('m')
    const validado = validarConfig({ oficios: [{ oficio: 'pasante', personas: ['Rosa', { nombre: 'Álex', genero: 'm' }] }], director: 'Ana', generoDirector: 'f' })
    expect(validado.ok && validado.config.oficios[0]?.personas.map(x => x.genero)).toEqual(['f', 'm'])
    expect(validado.ok && validado.config.generoDirector).toBe('f')
  })
})
