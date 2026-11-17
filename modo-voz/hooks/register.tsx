import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Fase } from '../types'

// La escucha y la voz las hace scripts/voz.py: graba el micro con ffmpeg, detecta
// cuándo dejas de hablar, transcribe en español con OpenAI y lee las respuestas con
// la voz «nova». La clave la lee el propio script del .env global.

const CONTEXTO =
  '[Modo voz] El usuario te está hablando por voz y tu respuesta se leerá en voz alta. ' +
  'Responde en español, breve y conversacional (2 a 4 frases), sin markdown, listas, tablas ni bloques de código. ' +
  'Si te pide trabajo técnico, hazlo con normalidad y termina con un resumen hablado de lo que has hecho.'

const ETIQUETA: Record<Fase, string> = {
  off: '',
  escuchando: '🎙 Te escucho… (habla tras el pitido)',
  pensando: '💭 Claude está pensando…',
  hablando: '🔊 Claude te responde…',
  dictando: '🎙 Dictando… habla tras el pitido y lo escribo en el cuadro',
}

// Frases que la transcripción se inventa a veces con ruido de fondo.
const ALUCINACIONES = [
  'thank you so much for watching',
  'thanks for watching',
  'thank you for watching',
  'thank you',
  'you',
  'bye',
  'voilà',
  'gracias por ver',
  'gracias por ver el video',
  'gracias por ver el vídeo',
  'suscríbete',
]

const SALIR =
  /(sal(ir|te)?|termina(r)?|para(r)?|desactiva(r)?|cierra|fin)( del?| el)? modo (de )?voz/i

const fase = atom({ plugin: 'modo-voz', key: 'fase' } as const, 'off')
const activo = atom({ plugin: 'modo-voz', key: 'activo' } as const, false)

let silencios = 0

function mensaje(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

async function ponerFase($: EngineInterface, f: Fase) {
  await update($, fase, () => f)
  $.ui.status(f === 'off' ? undefined : ETIQUETA[f])
}

type Respuesta = { text?: string; error?: string }

// Ejecuta scripts/voz.py con python (o py -3 si python no está en el PATH).
async function voz(
  $: EngineInterface,
  args: readonly string[],
  init: { stdin?: string; timeoutMs: number },
): Promise<Respuesta> {
  const script = `${$.plugin.root}/scripts/voz.py`
  let r
  try {
    r = await $.process.run(['python', script, ...args], init)
  } catch {
    r = await $.process.run(['py', '-3', script, ...args], init)
  }

  let datos: Respuesta = {}
  const json = r.stdout.match(/\{[\s\S]*\}\s*$/)?.[0]
  if (json) {
    try {
      datos = JSON.parse(json) as Respuesta
    } catch {
      // se trata abajo como error
    }
  }

  if (datos.error || r.exitCode !== 0) {
    throw new Error(datos.error ?? (r.stderr.trim().slice(-300) || `voz.py salió con ${r.exitCode}`))
  }

  return datos
}

export function limpiarOido(texto: string): string {
  const dicho = texto.trim()
  const limpio = dicho.toLowerCase().replace(/^[\s¡¿.,!?…"']+|[\s¡¿.,!?…"']+$/g, '')

  if (limpio.length < 2 || ALUCINACIONES.includes(limpio) || limpio.includes('amara.org')) {
    return ''
  }

  return dicho
}

async function escuchar($: EngineInterface, esperaSegundos: number): Promise<string> {
  const { text } = await voz($, ['escuchar', '--espera', String(esperaSegundos)], {
    timeoutMs: 150_000,
  })

  return limpiarOido(text ?? '')
}

async function hablar($: EngineInterface, texto: string) {
  await voz($, ['hablar'], { stdin: texto, timeoutMs: 240_000 })
}

// Convierte la respuesta de Claude (markdown) en texto que se pueda leer en voz alta.
export function paraHablar(md: string): string {
  let texto = md
    .replace(/```[\s\S]*?```/g, ' (te dejo el código en pantalla) ')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/https?:\/\/\S+/g, 'el enlace')
    .replace(/^\s*\|.*\|\s*$/gm, '')
    .replace(/^\s{0,3}#{1,6}\s*/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/[*_~>#|]/g, '')
    .replace(/\s+/g, ' ')
    .trim()

  if (texto.length > 1200) {
    const corte = texto.slice(0, 1200)
    const fin = Math.max(corte.lastIndexOf('. '), 800)
    texto = `${corte.slice(0, fin + 1)} El resto lo tienes en pantalla.`
  }

  return texto || 'Hecho.'
}

async function apagar($: EngineInterface, aviso: string) {
  silencios = 0
  await update($, activo, () => false)
  await ponerFase($, 'off')
  $.ui.toast(aviso)
}

// Dice `frase` (si hay), escucha y envía lo oído a Claude.
async function conversar($: EngineInterface, frase: string | undefined): Promise<void> {
  if (!(await read($, activo))) {
    return
  }

  let dicho = ''

  try {
    if (frase) {
      await ponerFase($, 'hablando')
      await hablar($, frase)
      if (!(await read($, activo))) {
        return
      }
    }
    await ponerFase($, 'escuchando')
    dicho = await escuchar($, 12)
  } catch (err) {
    await apagar($, `Modo voz parado: ${mensaje(err)}`)
    return
  }

  // Si mientras tanto se pulsó "Salir", no se envía nada.
  if (!(await read($, activo))) {
    return
  }

  if (!dicho) {
    silencios += 1
    if (silencios >= 2) {
      await apagar($, 'Modo voz en pausa: no te he oído.')
      return
    }
    return conversar($, 'No te he oído. ¿Me lo repites?')
  }

  silencios = 0

  if (SALIR.test(dicho)) {
    await apagar($, 'Modo voz desactivado.')
    void hablar($, 'Modo voz desactivado.').catch(() => undefined)
    return
  }

  await ponerFase($, 'pensando')
  void $.prompt.submit({ text: dicho }).catch(async err => {
    await apagar($, `No he podido enviar lo que dijiste: ${mensaje(err)}`)
  })
}

async function encender($: EngineInterface) {
  if (await read($, activo)) {
    return
  }

  silencios = 0
  await update($, activo, () => true)
  void conversar($, 'Modo voz activado.')
}

async function dictar($: EngineInterface) {
  if ((await read($, fase)) !== 'off') {
    return
  }

  await ponerFase($, 'dictando')

  try {
    const dicho = await escuchar($, 15)
    if (dicho) {
      await $.prompt.fill({ text: dicho, mode: 'append' })
    } else {
      $.ui.toast('No te he oído.')
    }
  } catch (err) {
    $.ui.toast(`Dictado: ${mensaje(err)}`)
  } finally {
    await ponerFase($, 'off')
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    // Tras una recarga no queda ninguna escucha en marcha: se empieza apagado.
    await update($, activo, () => false)
    await ponerFase($, 'off')
    await $.command.register({
      name: 'voz',
      description: 'Activa o desactiva el modo voz (hablas y Claude te contesta en voz alta)',
    })
    await $.command.register({
      name: 'dictar',
      description: 'Dicta por voz y lo escribe en el cuadro de texto',
    })

    return next(e)
  })

  on('command.run', { command: 'voz' }, async $ => {
    if (await read($, activo)) {
      await apagar($, 'Modo voz desactivado.')
      return { text: 'Modo voz desactivado.' }
    }

    await encender($)
    return {
      text: 'Modo voz activado: habla tras el pitido. Di «salir del modo voz» para terminar.',
    }
  })

  on('command.run', { command: 'dictar' }, async $ => {
    void dictar($)
    return { text: 'Dictando: habla tras el pitido y lo escribo en el cuadro de texto.' }
  })

  // Mientras el modo voz está activo, Claude sabe que su respuesta se va a oír.
  on('prompt.submit', async ($, e, next) => {
    if (!(await read($, activo))) {
      return next(e)
    }

    return next({ ...e, context: [...(e.context ?? []), CONTEXTO] })
  }).catch(($, e, next) => next(e))

  // Al terminar cada respuesta del hilo principal: leerla en voz alta y volver a escuchar.
  on('turn.complete', async ($, e, next) => {
    const result = await next(e)

    if (e.agentId === undefined && (await read($, activo))) {
      if (e.reason === 'answer') {
        void conversar($, paraHablar(e.answer))
      } else {
        await apagar(
          $,
          e.reason === 'aborted' ? 'Modo voz en pausa: respuesta interrumpida.' : 'Modo voz en pausa.',
        )
      }
    }

    return result
  })

  // Botones sobre el cuadro de texto, como el micro y la onda del chat.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) {
      return next(e)
    }

    // Lo que dibujan los demás mods en la banda (equipo jurídico, plazos…)
    // se conserva debajo de los botones de voz, en vez de taparlo.
    const deOtros = await next(e)
    const f = await read($, fase)
    const isOn = await read($, activo)
    const { Box, Button, Text } = $.ui.resolve(e)

    if (!isOn && f === 'off') {
      return (
        <Box flexDirection="column">
          <Box gap={1}>
            <Button key="dictar" label="🎙 Dictar" onPress={() => void dictar($)} />
            <Button key="voz" label="〰 Modo voz" onPress={() => void encender($)} />
          </Box>
          {deOtros}
        </Box>
      )
    }

    return (
      <Box flexDirection="column">
        <Box gap={1}>
          <Text color="suggestion">{ETIQUETA[f] || '〰 Modo voz activo'}</Text>
          {isOn && (
            <Button
              key="salir"
              label="Salir del modo voz"
              onPress={() => apagar($, 'Modo voz desactivado.')}
            />
          )}
        </Box>
        {deOtros}
      </Box>
    )
  })
}
