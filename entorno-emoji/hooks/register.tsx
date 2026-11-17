import type { Register } from 'claude-code'

// Emoji fijo por entorno conocido (por nombre de carpeta, en minúsculas).
const FIJOS: Record<string, string> = {
  // Pon aquí tus carpetas: 'nombre de la carpeta': 'emoji'
  'expedientes': '⚖️',
  'clientes': '👔',
  'facturas': '🧾',
  'plantillas': '📝',
  'jurisprudencia': '📚',
}

// Para cualquier otro entorno: emoji de objeto estable según el nombre.
const OBJETOS = ['📦', '🔧', '🔑', '💡', '📌', '🧲', '🔭', '🧪', '🎯', '🧩', '📎', '🔔', '🗂️', '🪄', '🧭', '🛠️', '💼', '📐', '🔬', '🗝️']

function emojiDe(nombre: string): string {
  const k = nombre.toLowerCase()
  if (FIJOS[k]) return FIJOS[k]
  let h = 0
  for (const c of k) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return OBJETOS[h % OBJETOS.length]
}

export const register: Register = on => {
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    // Lo que dibujan los demás mods en la banda (equipo jurídico, plazos…) se
    // conserva debajo: antes este mod lo tapaba al no llamar a next(e).
    const deOtros = await next(e)
    const cwd = await $.session.cwd()
    const partes = cwd.split(/[\\/]/).filter(Boolean)
    const nombre = partes[partes.length - 1] ?? cwd
    const emoji = emojiDe(nombre)
    $.ui.status(`${emoji} ${nombre}`)
    const { Box, Text } = $.ui.resolve(e)
    return (
      <Box flexDirection="column">
        <Text bold wrap="truncate-end">
          {emoji} Entorno: {nombre}
        </Text>
        {deOtros}
      </Box>
    )
  })
}
