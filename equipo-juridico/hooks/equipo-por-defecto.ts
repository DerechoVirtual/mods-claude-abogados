// Equipo de reserva del despacho: 8 personas, una por oficio, que cubren todo
// el flujo de una demanda. La oficina empieza vacía y cada una entra cuando le
// llega su primera tarea; si Claude lanza más tareas que personas, la misma
// persona lleva varias («Luis lleva 4 secciones»).
//
// Es una copia de config/equipo.json escrita en código. El mod la usa cuando
// ese archivo no se puede leer o no es válido, y las pruebas la importan
// (las pruebas no tienen acceso al disco). Si cambias el equipo, edita
// config/equipo.json: este archivo solo es el plan B.
//
// El ORDEN importa en los empates: gana el oficio que va antes. Por eso Luis
// (lo genérico de redactar es suyo) va delante de Clara y de Alberto.

import type { ConfigEquipo } from '../types'

export const EQUIPO_POR_DEFECTO: ConfigEquipo = {
  porDefecto: 'secretaria',
  porDefectoSeccion: 'fondo',
  abrirPanelAlEmpezar: true,
  tono: 'informal',
  avisosEmergentes: true,
  director: 'Carlos',
  generoDirector: 'm',
  oficios: [
    {
      id: 'secretaria',
      oficio: 'secretaria',
      grupo: 'Secretaría',
      emoji: '📁',
      color: '#d4559c',
      claves: [
        'organiz', 'orden', 'archiv', 'clasific', 'renombr', 'expediente', 'carpeta', 'inventario', 'indice', 'listar', 'lista de',
        'agenda', 'plazo', 'vencim', 'calendario', 'señalamiento', 'comput', 'caducidad', 'prescrip',
        'intake', 'recepcion', 'recib', 'asunto nuevo', 'nuevo asunto', 'entrevista', 'datos del cliente', 'hoja de encargo', 'conflicto de interes',
        'word', 'docx', 'maquet', 'formato', 'ensambl', 'plantilla', 'pdf', 'membrete',
      ],
      tiposDeSubagente: [],
      redactaSecciones: false,
      acciones: [
        { claves: ['orden', 'organiz', 'clasific', 'expediente', 'carpeta', 'renombr', 'inventario', 'indice', 'archiv'], gerundio: 'ordenando el expediente', participio: 'ha ordenado el expediente' },
        { claves: ['plazo', 'vencim', 'comput', 'caducidad', 'prescrip', 'agenda', 'calendario', 'señalamiento'], gerundio: 'calculando los plazos', participio: 'ha calculado los plazos' },
        { claves: ['intake', 'recepcion', 'recib', 'asunto nuevo', 'nuevo asunto', 'entrevista', 'datos del cliente', 'hoja de encargo', 'conflicto de interes'], gerundio: 'recibiendo el asunto', participio: 'ha abierto el asunto' },
        { claves: ['ensambl', 'word', 'docx', 'maquet', 'formato', 'plantilla', 'pdf', 'membrete'], gerundio: 'montando el Word', participio: 'ha dejado listo el Word' },
        { claves: [], gerundio: 'tramitando el expediente', participio: 'ha despachado el trámite' },
      ],
      personas: [{ id: 'maria', nombre: 'María', inicial: 'M', genero: 'f', muletillas: ['¡Hecho y archivado!', 'Todo en su carpeta.', 'Apuntado en la agenda.'] }],
    },
    {
      id: 'jurisprudencia',
      oficio: 'buscador de jurisprudencia',
      grupo: 'Jurisprudencia y normativa',
      emoji: '🔎',
      color: '#10b981',
      claves: [
        'investig', 'busc', 'busqueda', 'jurisprudencia', 'sentencia', 'doctrina', 'precedente', 'cendoj', 'supremo', 'tribunal supremo',
        'audiencia provincial', 'tsj', 'tribunal superior', 'constitucional', 'amparo', 'tjue', 'europe', 'prejudicial', 'directiva',
        'normativa', 'legislacion', 'boe', 'articulo', 'ley', 'reglamento', 'real decreto', 'codigo civil', 'convenio colectivo',
        'research', 'explor', 'averigu', 'consulta',
      ],
      tiposDeSubagente: ['Explore'],
      redactaSecciones: false,
      acciones: [
        { claves: ['jurisprudencia', 'sentencia', 'doctrina', 'precedente', 'cendoj', 'supremo', 'audiencia provincial', 'tsj', 'constitucional', 'tjue'], gerundio: 'buscando jurisprudencia', participio: 'ha encontrado la jurisprudencia' },
        { claves: ['normativa', 'legislacion', 'boe', 'articulo', 'ley', 'reglamento', 'real decreto', 'codigo civil', 'convenio'], gerundio: 'repasando la normativa', participio: 'ha localizado la normativa' },
        { claves: [], gerundio: 'investigando', participio: 'ha terminado de investigar' },
      ],
      personas: [{ id: 'juan', nombre: 'Juan', inicial: 'J', genero: 'm', muletillas: ['¡Buah!', '¡Toma ya!', 'Ojo a esto:'] }],
    },
    {
      id: 'fondo',
      oficio: 'picapleitos',
      grupo: 'Redacción de fondo',
      emoji: '📝',
      color: '#3b82f6',
      claves: [
        'redact', 'borrador', 'fondo', 'fundamento', 'motivo', 'alegacion', 'demanda', 'contestacion', 'recurso', 'apelacion', 'casacion', 'reposicion',
        'escrito', 'querella', 'denuncia', 'contrato', 'clausula', 'estipulacion', 'escribir', 'escribe', 'draft',
        'suplica', 'solicito', 'otrosi', 'petitum', 'cierre',
        'estrategia', 'subsuncion', 'viabilidad', 'dictamen', 'informe juridico', 'planific', 'plan de', 'analiz',
        'prueba', 'interrogatorio', 'testig', 'pericial', 'perito',
        'masc', 'negocia', 'acuerdo', 'mediacion', 'conciliacion', 'transaccion', 'burofax', 'requerimiento', 'extrajudicial',
      ],
      tiposDeSubagente: ['Plan'],
      redactaSecciones: true,
      acciones: [
        { claves: ['motivo'], gerundio: 'redactando un motivo del recurso', participio: 'ha terminado su motivo' },
        { claves: ['fundamento', 'fondo', 'alegacion'], gerundio: 'redactando un fundamento de fondo', participio: 'ha terminado su fundamento' },
        { claves: ['suplica', 'solicito', 'otrosi', 'petitum', 'cierre'], gerundio: 'redactando la súplica y los otrosíes', participio: 'ha cerrado la súplica' },
        { claves: ['clausula', 'estipulacion'], gerundio: 'redactando las cláusulas', participio: 'ha terminado las cláusulas' },
        { claves: ['contestacion'], gerundio: 'redactando la contestación', participio: 'ha terminado la contestación' },
        { claves: ['demanda'], gerundio: 'redactando la demanda', participio: 'ha terminado la demanda' },
        { claves: ['recurso', 'apelacion', 'casacion', 'reposicion'], gerundio: 'preparando el recurso', participio: 'ha terminado el recurso' },
        { claves: ['contrato'], gerundio: 'redactando el contrato', participio: 'ha terminado el contrato' },
        { claves: ['burofax', 'requerimiento'], gerundio: 'preparando el burofax', participio: 'ha preparado el burofax' },
        { claves: ['masc', 'negocia', 'acuerdo', 'mediacion', 'conciliacion', 'transaccion', 'extrajudicial'], gerundio: 'preparando el intento de acuerdo', participio: 'ha preparado la propuesta de acuerdo' },
        { claves: ['prueba', 'interrogatorio', 'testig', 'pericial', 'perito'], gerundio: 'preparando la prueba', participio: 'ha preparado la prueba' },
        { claves: ['estrategia', 'subsuncion', 'viabilidad', 'dictamen', 'informe juridico', 'planific', 'plan de', 'analiz'], gerundio: 'pensando la estrategia', participio: 'ha trazado la estrategia' },
        { claves: [], gerundio: 'redactando el borrador', participio: 'ha terminado el borrador' },
      ],
      personas: [{ id: 'luis', nombre: 'Luis', inicial: 'L', genero: 'm', muletillas: ['Vamos a machacarles.', 'Esto lo ganamos.', 'Con esto no tienen nada que hacer.'] }],
    },
    {
      id: 'hechos',
      oficio: 'redactora de hechos',
      grupo: 'Hechos',
      emoji: '📜',
      color: '#2563eb',
      claves: ['redact', 'encabezamiento', 'comparecencia', 'hechos', 'antecedentes', 'relato', 'cronolog', 'linea temporal', 'linea de tiempo', 'timeline', 'fechas clave'],
      tiposDeSubagente: [],
      redactaSecciones: true,
      acciones: [
        { claves: ['cronolog', 'linea temporal', 'linea de tiempo', 'timeline', 'fechas clave'], gerundio: 'montando la cronología', participio: 'ha montado la cronología' },
        { claves: [], gerundio: 'redactando los hechos', participio: 'ha terminado los hechos' },
      ],
      personas: [{ id: 'clara', nombre: 'Clara', inicial: 'C', genero: 'f', muletillas: ['Con todo lujo de detalles.', 'Esto ya se lee solo.'] }],
    },
    {
      id: 'procesal',
      oficio: 'procesalista',
      grupo: 'Procesal',
      emoji: '🧩',
      color: '#7c3aed',
      claves: ['redact', 'procesal', 'fundamentos procesales', 'jurisdiccion', 'competencia', 'legitimacion', 'postulacion', 'procedimiento', 'requisitos previos', 'admisib', 'declinatoria', 'acumulacion'],
      tiposDeSubagente: [],
      redactaSecciones: true,
      acciones: [{ claves: [], gerundio: 'atando la competencia y el procedimiento', participio: 'ha cerrado lo procesal' }],
      personas: [{ id: 'alberto', nombre: 'Alberto', inicial: 'A', genero: 'm', muletillas: ['Competencia atada y bien atada.', 'Ni una grieta procesal.'] }],
    },
    {
      id: 'revision',
      oficio: 'revisora',
      grupo: 'Revisión: citas y estilo',
      emoji: '🧐',
      color: '#f59e0b',
      claves: [
        'revis', 'verific', 'comprob', 'contrast', 'cotej', 'citas', 'cita', 'ecli', 'roj',
        'corrig', 'correccion', 'errata', 'estilo', 'coherencia', 'pulir', 'lectura final', 'review', 'calidad',
        'secreto profesional', 'confidencial', 'proteccion de datos', 'rgpd', 'anonimiz', 'cumplimiento', 'compliance',
      ],
      tiposDeSubagente: [],
      redactaSecciones: false,
      acciones: [
        { claves: ['secreto profesional', 'confidencial', 'proteccion de datos', 'rgpd', 'anonimiz', 'cumplimiento', 'compliance'], gerundio: 'revisando la confidencialidad', participio: 'ha revisado la confidencialidad' },
        { claves: ['citas', 'cita', 'verific', 'ecli', 'roj', 'contrast', 'cotej', 'comprob'], gerundio: 'verificando las citas', participio: 'ha verificado las citas' },
        { claves: ['coherencia'], gerundio: 'leyendo la coherencia del escrito', participio: 'ha comprobado la coherencia' },
        { claves: [], gerundio: 'puliendo el estilo', participio: 'ha dado el visto bueno' },
      ],
      personas: [{ id: 'elena', nombre: 'Elena', inicial: 'E', genero: 'f', muletillas: ['Ni una errata se me escapa.', 'Lupa en mano.'] }],
    },
    {
      id: 'procura',
      oficio: 'procurador',
      grupo: 'Procura',
      emoji: '📮',
      color: '#8b5cf6',
      claves: ['present', 'lexnet', 'notific', 'juzgado', 'registro', 'sede judicial', 'emplazamiento', 'traslado', 'firma', 'enviar', 'envio'],
      tiposDeSubagente: [],
      redactaSecciones: false,
      acciones: [
        { claves: ['lexnet', 'present', 'registro', 'sede judicial', 'firma'], gerundio: 'preparando la presentación en LexNET', participio: 'ha dejado lista la presentación' },
        { claves: [], gerundio: 'tramitando las notificaciones', participio: 'ha tramitado las notificaciones' },
      ],
      personas: [{ id: 'pablo', nombre: 'Pablo', inicial: 'P', genero: 'm', muletillas: ['Sellado y presentado.', 'LexNET, allá vamos.'] }],
    },
    {
      id: 'contable',
      oficio: 'contable',
      grupo: 'Cuentas y cálculos',
      emoji: '🧮',
      color: '#06b6d4',
      claves: [
        'calcul', 'minuta', 'honorario', 'factur', 'costas', 'tasacion', 'presupuest', 'provision de fondos', 'gasto', 'cobro', 'iva', 'irpf', 'pago', 'coste', 'precio', 'contab',
        'intereses', 'indemnizacion', 'cuantia', 'liquidacion', 'salario', 'importe', 'cifra', 'ipc',
      ],
      tiposDeSubagente: [],
      redactaSecciones: false,
      acciones: [
        { claves: ['indemnizacion'], gerundio: 'calculando la indemnización', participio: 'ha calculado la indemnización' },
        { claves: ['intereses'], gerundio: 'calculando los intereses', participio: 'ha calculado los intereses' },
        { claves: ['cuantia'], gerundio: 'fijando la cuantía', participio: 'ha fijado la cuantía' },
        { claves: ['minuta', 'honorario', 'presupuest', 'provision de fondos'], gerundio: 'calculando la minuta', participio: 'ha cerrado la minuta' },
        { claves: ['costas', 'tasacion'], gerundio: 'preparando la tasación de costas', participio: 'ha calculado las costas' },
        { claves: [], gerundio: 'cuadrando las cuentas', participio: 'ha cuadrado las cuentas' },
      ],
      personas: [{ id: 'carmen', nombre: 'Carmen', inicial: 'C', genero: 'f', muletillas: ['Las cuentas claras.', 'Cuadra al céntimo.'] }],
    },
    {
      // No es del despacho: es el abogado de la otra parte. Aparece cuando se
      // pide que ataquen nuestro escrito («Que lo ataque el contrario»).
      id: 'contraria',
      oficio: 'abogado de la parte contraria',
      grupo: 'Parte contraria',
      emoji: '😈',
      color: '#dc2626',
      claves: ['parte contraria', 'contrari', 'abogado del diablo', 'atac', 'ataque', 'rebat', 'puntos debiles', 'debilidades', 'grietas', 'adversari', 'rival'],
      tiposDeSubagente: [],
      redactaSecciones: false,
      rival: true,
      acciones: [{ claves: [], gerundio: 'buscando grietas en nuestro escrito', participio: 'ha atacado nuestro escrito' }],
      personas: [{ id: 'rufino', nombre: 'Rufino', inicial: 'R', genero: 'm', muletillas: ['¡Me cago en la leche!', 'Joder, qué nivelazo.', 'Menuda chapuza, hostia.'] }],
    },
  ],
}
