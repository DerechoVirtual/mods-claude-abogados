// Contrato de tipos del mod «equipo-juridico».
//
// El despacho tiene OFICIOS (secretaría, jurisprudencia, redacción de fondo…)
// y cada oficio sus PERSONAS (por defecto, una: 8 personas en total). La
// oficina empieza vacía: cada persona entra cuando le llega su primera tarea,
// y si Claude lanza más tareas que personas, la misma persona lleva varias.
//
// Aquí se declaran esos datos y los valores que el mod guarda en `$.state`
// mientras dura la sesión. `claude plugin validate` comprueba que el código
// solo usa las claves declaradas aquí.

/** Algo que un oficio sabe hacer, con sus palabras clave. */
export type Accion = {
  /** Raíces de palabra que delatan esta acción («redact», «demanda»…). */
  claves: string[]
  /** Cómo se dice mientras trabaja: «redactando la contestación». */
  gerundio: string
  /** Cómo se dice al acabar: «ha terminado la contestación». */
  participio: string
}

/** Una persona del despacho. */
export type Persona = {
  /** Identificador único en todo el equipo, sin espacios ni tildes: «maria». */
  id: string
  nombre: string
  /** Avatar de reserva para terminales estrechas: una letra. */
  inicial: string
  /** Sus coletillas, para darle personalidad a sus frases («¡Buah!»). */
  muletillas: string[]
  /**
   * «f» si es una mujer, «m» si es un hombre: decide su personaje en la
   * oficina y las palabras que cambian («Elena está atenta», no «atento»).
   */
  genero: Genero
}

/** «f» (mujer) o «m» (hombre). */
export type Genero = 'f' | 'm'

/** Un oficio del despacho y las personas que lo ejercen. */
export type Oficio = {
  /** Identificador interno: «fondo», «secretaria»… */
  id: string
  /** Cómo se nombra a una persona del oficio: «picapleitos», «secretaria». */
  oficio: string
  /** Cómo se nombra al oficio en el panel: «Redacción de fondo». */
  grupo: string
  /** Avatar del oficio: un emoji sencillo. */
  emoji: string
  /** Color del oficio (hex o nombre de color). */
  color: string
  /** Raíces de palabra que hacen que una tarea sea de este oficio. */
  claves: string[]
  /** Tipos de subagente que le tocan siempre («Explore», «Plan»…). */
  tiposDeSubagente: string[]
  /** Si redacta secciones de un escrito (redaccion-rapida y su redactor-seccion). */
  redactaSecciones: boolean
  /** Sus acciones: se miran en orden y gana la primera que encaja. */
  acciones: Accion[]
  /** Las personas del oficio; si hay varias, las tareas simultáneas se reparten. */
  personas: Persona[]
  /**
   * Es de la PARTE CONTRARIA, no del despacho (el abogado que ataca nuestro
   * escrito): no cuenta para las 7-8 personas, espera de pie en la puerta y
   * su etiqueta dice «ATACANDO».
   */
  rival?: boolean
}

/** Tono de las frases del equipo. */
export type Tono = 'informal' | 'profesional'

/** El archivo config/equipo.json, ya validado. */
export type ConfigEquipo = {
  /** Oficio que se queda las tareas que no encajan con ninguno. */
  porDefecto: string
  /** Oficio que se queda las secciones de un escrito que no encajan con otro. */
  porDefectoSeccion: string
  /** Abre el panel solo la primera vez que alguien empieza a trabajar. */
  abrirPanelAlEmpezar: boolean
  /** «informal» (desenfadado, por defecto) o «profesional». */
  tono: Tono
  /** Avisos emergentes con los grandes momentos (sentencia del Supremo, sección escrita…). */
  avisosEmergentes: boolean
  /** El director del despacho, en su despacho de la oficina («Carlos»). */
  director: string
  /** Si quien dirige es una mujer («f»: «Directora Ana») o un hombre («m»). */
  generoDirector: Genero
  oficios: Oficio[]
}

export type EstadoTarea = 'trabajando' | 'terminada' | 'fallida' | 'detenida'

/** Una herramienta que ha usado (o está usando) un subagente. */
export type Actividad = {
  /** El id de la llamada, para marcarla al acabar. */
  id: string
  /** El paso contado como en un despacho: «Busca jurisprudencia del Supremo sobre «…»». */
  texto: string
  estado: 'en curso' | 'hecha' | 'error'
  hora: number
  /** Qué ha dado de sí: «han salido la STS 323/2017 del Supremo», «vigente», «667 palabras». */
  resultado?: string
}

/** Lo que ha conseguido una persona en una tarea, para contarlo en su ficha. */
export type Hallazgos = {
  /** Ha estudiado el expediente (caso.md, el escrito o los documentos del caso). */
  expediente: boolean
  /** Resoluciones encontradas en sus búsquedas: «STS 323/2017 del Supremo». */
  sentencias: string[]
  /** Sentencias que ha leído a fondo. */
  leidas: string[]
  /** Normas consultadas: «art. 27 LAU (vigente)». */
  normas: string[]
  /** Lo que ha redactado: «la sección 01: 667 palabras». */
  redactado: string[]
  /** Resultado de la última verificación de citas. */
  verificacion?: string
}

/** Lo que dice una persona, sacado de un hecho real observado. */
export type Frase = {
  texto: string
  hora: number
  /** Un gran momento (sentencia del Supremo, sección escrita, tarea terminada). */
  grande: boolean
}

/** Un archivo escrito por un subagente, con lo que se sabe de él. */
export type Archivo = {
  /** Las dos últimas partes de la ruta: «secciones/03-fondo.md». */
  ruta: string
  /** Tamaño aproximado en bytes (caracteres) la última vez que se escribió. */
  bytes: number
  /** Palabras la última vez que se escribió (0 si no se sabe). */
  palabras: number
}

/** Una tarea (un subagente) y la persona que la lleva. */
export type Tarea = {
  /** El agentId del subagente (o un id provisional si no lo hubo). */
  id: string
  /** La llamada que la lanzó: la de Agent, o la de Workflow para un flujo. */
  toolUseId: string
  /** Id del oficio y de la persona que la lleva; no cambian nunca. */
  oficio: string
  persona: string
  /** Índice de la acción del oficio que mejor describe la tarea. */
  accion: number
  /** La descripción corta que Claude dio a la tarea. */
  descripcion: string
  /** «Sección 03 — Fundamento de fondo: …» si es una sección de un escrito. */
  seccion?: string
  /** El principio del encargo que recibió el subagente. */
  encargo: string
  /** Palabras pedidas en el encargo («Extensión: 600 palabras»), si las hay. */
  extension?: number
  /** El tipo de subagente (general-purpose, …:redactor-seccion…). */
  tipo: string
  /** El runId del flujo (Workflow) al que pertenece, si es de uno. */
  flujo?: string
  estado: EstadoTarea
  /** Estado del agente según Claude Code ($.agent.list): running, waiting… */
  estadoAgente?: string
  /** Milisegundos desde 1970 en que empezó y, si acabó, en que terminó. */
  inicio: number
  fin?: number
  /** Las últimas herramientas que ha usado, la más reciente al final. */
  actividad: Actividad[]
  /** Cuántas herramientas ha usado en total. */
  herramientas: number
  /** Búsquedas de jurisprudencia o normativa hechas. */
  busquedas?: number
  /** Resoluciones distintas que han salido en sus búsquedas. */
  citas?: number
  /** Palabras del archivo de su sección (o del último que escribió). */
  palabras?: number
  /** Los archivos que ha escrito o editado. */
  archivos: Archivo[]
  /** Lo que ha ido diciendo, la más reciente al final. */
  frases?: Frase[]
  /** Lo que ha conseguido: jurisprudencia, normas, lo redactado… */
  hallazgos?: Hallazgos
  /** El principio de su respuesta final, cuando termina. */
  resumen?: string
}

/** Un escrito judicial que se ha pedido redactar y su avance. */
export type Redaccion = {
  /** «Demanda de reclamación de cantidad», sacado de lo que se pidió. */
  titulo: string
  inicio: number
  /** Última señal de trabajo (para olvidar redacciones abandonadas). */
  ultimo: number
  /** Porcentaje mostrado (múltiplo de 5); nunca retrocede. */
  porcentaje: number
  /** Qué se está haciendo, en palabras: «redactando: 3 de 6 secciones terminadas». */
  fase: string
  /** Herramientas usadas por la conversación principal desde que se pidió. */
  herramientas: number
  /** Búsquedas y lecturas de jurisprudencia o normativa. */
  investigaciones: number
  /** Se cargó una skill de redactar escritos. */
  skill: boolean
  /** Se escribió el caso.md (plan de redaccion-rapida). */
  casoMd: boolean
  /** Arranque: `estado` de Jurisprudenciator o `escrito.py iniciar`. */
  arranque: boolean
  /** Escrituras del borrador por la conversación principal (antes de ensamblar). */
  borrador: number
  /** Veces que se ha lanzado el ensamblado (`escrito.py ensamblar`). */
  ensamblados: number
  /** Ensamblados que salieron bien (dejan el Word escrito). */
  ensamblesOk: number
  /** Correcciones entre un ensamblado con errores y el primero que sale bien. */
  correcciones: number
  /** Lectura de coherencia (`escrito.md`) tras ensamblar bien. */
  coherencia: boolean
  /** Correcciones después del primer ensamblado bueno. */
  retoques: number
  /** Se pasó verificar_escrito. */
  verificado: boolean
  /** Hay Word (.docx). */
  docx: boolean
  /** Hay PDF del escrito (generado o enviado por otra vía que el ensamblador). */
  pdf?: boolean
  terminado: boolean
  fin?: number
  /**
   * Hora en que el turno principal terminó sin entregar el escrito y sin nadie
   * trabajando: la barra se retira de la banda (no se queda colgada) y vuelve
   * sola si se sigue trabajando en el escrito.
   */
  pausa?: number
}

/** Un encargo grande: una llamada a la herramienta Workflow. */
export type Encargo = {
  toolUseId: string
  nombre: string
  descripcion: string
  inicio: number
}

/** Vista del panel. */
export type Vista = 'oficina' | 'lista'

declare module 'claude-code' {
  interface PluginState {
    'equipo-juridico': {
      /** Todas las tareas de la sesión, la más reciente al final. */
      tareas: Shaped<Tarea[]>
      /** El equipo en uso (config/equipo.json o el de reserva). */
      config: Shaped<ConfigEquipo>
      /** Los encargos (Workflow) de la sesión. */
      encargos: Shaped<Encargo[]>
      /** Marca de tiempo que avanza cada pocos segundos mientras hay trabajo. */
      reloj: number
      /** La banda de encima del prompt, ocultada por la persona. */
      bandaOculta: boolean
      /**
       * Hora del último mensaje de la persona: lo que terminó antes ya no sale
       * en la banda (la banda se retira sola al empezar el siguiente mensaje).
       */
      retirada: number
      /** El panel ya se abrió solo una vez en esta sesión. */
      panelAutoAbierto: boolean
      /** La persona cuya ficha está desplegada en el panel ('' = ninguna). */
      seleccion: string
      /** La ficha desplegada con «Ver más». */
      fichaAmpliada: boolean
      /** Vista del panel: la oficina o la lista. */
      vista: Shaped<Vista>
      /** El escrito que se está redactando y su avance (null = ninguno). */
      redaccion: Shaped<Redaccion | null>
    }
  }
}
