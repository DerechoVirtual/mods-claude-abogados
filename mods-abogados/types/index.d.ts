// Contrato de lo que el plugin guarda en la memoria de CADA sesión ($.state):
// sobrevive a /reload-plugins dentro de esa sesión, pero no pasa a otras.
//   · cliente: el cliente activo de esta sesión (o null).
//   · juridica: si en esta sesión se está trabajando en algo jurídico (clientes,
//     escritos, jurisprudencia o comandos del plugin). Si no, la banda no sale.
//   · plazosEscrito: los plazos del último escrito analizado con /plazos en
//     esta sesión (o null), para que la pestaña «Del escrito» no se vacíe al
//     recargar el plugin.

export type NombreCliente = string

/** Un plazo sacado de un escrito judicial (lo entrega Claude a la herramienta del plugin). */
export type PlazoDelEscrito = {
  titulo: string // «Contestación a la demanda»
  accion: string // qué hay que hacer exactamente
  dias?: number // duración
  computo?: 'hábiles' | 'naturales' | 'meses' | 'fecha fija'
  fecha_inicio?: string // «AAAA-MM-DD»: desde cuándo se cuenta (la notificación)
  fecha_vencimiento?: string // «AAAA-MM-DD»
  fundamento?: string // artículo que lo fija
  cita?: string // frase literal del escrito
  parte?: string // a quién afecta
}

/** Los plazos de un escrito, listos para dibujar. */
export type InformePlazosEscrito = {
  documento: string
  procedimiento?: string
  organo?: string
  jurisdiccion?: 'civil' | 'contencioso' | 'laboral' | 'penal'
  fecha_notificacion?: string
  resumen?: string
  avisos: string[]
  plazos: PlazoDelEscrito[]
  hora: string // «HH:MM» en que se analizó
}

declare module 'claude-code' {
  interface PluginState {
    'mods-abogados': { cliente: NombreCliente | null; juridica: boolean; plazosEscrito: InformePlazosEscrito | null }
  }
}
