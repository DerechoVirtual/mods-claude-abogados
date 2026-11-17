// ─────────────────────────────────────────────────────────────────────────────
// pastilla.tsx · Una pastilla de la banda que se puede pulsar
//
// En el terminal, la pastilla es un botón cuyo contenido son los textos de
// color (cliente, plazo, citas, cupo, ficha): se pulsa y abre su panel.
// La app de escritorio dibuja sus botones NATIVOS con la etiqueta del botón y
// no con esos textos de color: la banda enseñaba «Cambiar de cliente» en vez de
// «● García · 0123/2026». Por eso allí la pastilla es texto de color, sin
// botón; sus paneles siguen a mano con /cliente, /plazos, /citas, /ficha y /cupo.
// ─────────────────────────────────────────────────────────────────────────────

import type { RenderChildren } from 'claude-code'
import { estado, type Motor } from './lib/estado'

type Tabla = ReturnType<Motor['ui']['resolve']>

export function pulsable(tabla: Tabla, clave: string, etiqueta: string, alPulsar: () => void, contenido: RenderChildren) {
  const { Box, Button } = tabla
  if (estado.superficie === 'desktop') {
    return (
      <Box key={clave} flexDirection="row">
        {contenido}
      </Box>
    )
  }
  return (
    <Button key={clave} label={etiqueta} plain onPress={() => alPulsar()}>
      {contenido}
    </Button>
  )
}
