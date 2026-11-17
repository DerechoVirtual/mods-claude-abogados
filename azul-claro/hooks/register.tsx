import type { EngineInterface, Register } from 'claude-code'

const PLUGIN = 'azul-claro'
const BACKDROP = 'azul-claro'

// Azul claro translúcido detrás de cada mensaje (tuyo y de Claude): se ve azul
// tanto con el tema claro como con el oscuro, y el texto se sigue leyendo.
const AZUL_MENSAJE = '#4DA3FF33'

// Fondo de toda la ventana: esta versión de la app de escritorio todavía no lo
// dibuja, pero queda preparado para cuando lo haga.
const BANDAS = [
  '#EAF5FF',
  '#E3F1FF',
  '#DCEDFF',
  '#D5EAFF',
  '#CEE6FF',
  '#C7E2FF',
  '#C0DEFF',
  '#B9DAFF',
]
const GLASS = { blur: 0, tint: '#E6F2FF', opacity: 0.85 }

let isOn = true

async function pintarFondo($: EngineInterface) {
  return isOn ? $.ui.backdrop({ id: BACKDROP, glass: GLASS }) : $.ui.backdrop(undefined)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'azul',
      description: 'Enciende o apaga el azul claro de Claude',
    })
    await pintarFondo($).catch(() => undefined)

    return next(e)
  })

  on('command.run', { command: 'azul' }, async $ => {
    isOn = !isOn
    await pintarFondo($).catch(() => undefined)
    $.ui.invalidate('ui.render')

    return {
      text: isOn
        ? 'Azul claro encendido.'
        : 'Azul claro apagado. Escribe /azul para volver a encenderlo.',
    }
  })

  // Los mensajes, en azul claro (en la app de escritorio).
  on('ui.render', { component: 'UserMessage' }, async ($, e, next) => {
    if (!isOn || e.surface !== 'desktop') {
      return next(e)
    }

    const { Box } = $.ui.resolve(e)

    return <Box backgroundColor={AZUL_MENSAJE} paddingX={1}>{await next(e)}</Box>
  })

  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    if (!isOn || e.surface !== 'desktop') {
      return next(e)
    }

    const { Box } = $.ui.resolve(e)

    return <Box backgroundColor={AZUL_MENSAJE} paddingX={1}>{await next(e)}</Box>
  })

  on('ui.render', { component: 'Backdrop' }, ($, e, next) => {
    if (e.props.plugin !== PLUGIN || e.props.id !== BACKDROP) {
      return next(e)
    }

    const { Box } = $.ui.resolve(e)

    return (
      <Box flexDirection="column" width="100%" height="100%">
        {BANDAS.map((color, i) => (
          <Box key={`banda-${i}`} flexGrow={1} width="100%" backgroundColor={color} />
        ))}
      </Box>
    )
  })
}
