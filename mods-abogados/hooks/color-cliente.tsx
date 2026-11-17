// ─────────────────────────────────────────────────────────────────────────────
// MOD 4 · Un color por cliente
//
//   /cliente              abre el selector (panel) con los clientes
//   /cliente <nombre>     activa uno directamente (sin tildes ni mayúsculas, parcial)
//   /cliente-nuevo        añade un cliente (nombre | expediente | carpeta | color)
//   /cliente-ninguno      vuelve a la interfaz neutra
//
// Qué cambia de color (lo que la API de mods permite de verdad):
//   · una banda propia encima del prompt con el nombre y el expediente;
//   · el ACENTO de los paneles de los Mods 1, 2 y 3 (cabecera, pestaña activa);
//   · la línea del spinner y la línea de ayuda bajo el prompt, que dibuja
//     Claude Code: se les añade delante una marca con el color del cliente;
//   · en la app de escritorio (no en el terminal), el FONDO de toda la ventana
//     con $.ui.backdrop.
// No se puede: cambiar el tema, el marco del prompt ni el aviso de permisos.
//
// Aviso de expediente cruzado: si Claude va a leer o escribir en la carpeta de
// OTRO cliente, se avisa en la banda. Solo avisa: la llamada sigue con next(e)
// sin ningún cambio.
// ─────────────────────────────────────────────────────────────────────────────

import type { On, ToolCallInput } from 'claude-code'
import {
  abrirPanel,
  anotarError,
  cargarClientes,
  colorAcento,
  conAtajo,
  estado,
  escribirJson,
  leerJson,
  panelAbierto,
  redibujar,
  type Cliente,
  type Motor,
  type Pastilla,
} from './lib/estado'
import { pulsable } from './pastilla'
import { clienteDeCarpeta, guardarClienteSesion, leerSesion, marcarJuridica } from './sesion'
import { colorParaNuevo, colorPorNombre, leerColor, nombreColor, PALETA, textoSobre } from './lib/colores'
import { estaDentro, normalizarRuta, recortar, sinTildes, unirRuta } from './lib/texto'

export const PANEL_CLIENTES = 'clientes'
const FONDO = 'cliente-activo'

const selector = {
  vista: 'lista' as 'lista' | 'nuevo',
  filtro: '',
  borrador: { nombre: '', expediente: '', carpeta: '', color: '' },
  error: null as string | null,
}

// ── Búsqueda y activación ───────────────────────────────────────────────────

/** Busca clientes de forma tolerante: sin tildes, sin mayúsculas, parcial. */
export function buscarClientes(consulta: string, clientes: readonly Cliente[]): Cliente[] {
  const q = sinTildes(consulta).trim()
  if (!q) return [...clientes]
  const texto = (c: Cliente) => sinTildes(`${c.nombre} ${c.expediente ?? ''} ${c.asunto ?? ''} ${c.jurisdiccion ?? ''}`)
  const exactos = clientes.filter(c => sinTildes(c.nombre) === q || sinTildes(c.expediente ?? '') === q)
  if (exactos.length > 0) return exactos
  const palabras = q.split(/\s+/)
  return clientes.filter(c => palabras.every(p => texto(c).includes(p)))
}

async function activarCliente($: Motor, cliente: Cliente | null): Promise<void> {
  estado.clienteActivo = cliente ? { ...cliente, color: cliente.color ?? colorPorNombre(cliente.nombre) } : null
  estado.avisoCruzado = null
  // Es el cliente de ESTA sesión: no pasa a las demás (en una sesión de marketing no debe salir).
  await guardarClienteSesion($, cliente ? cliente.nombre : null)
  if (cliente) await marcarJuridica($)
  await ponerFondo($)
  redibujar($)
}

/** Fondo de la ventana en la app de escritorio (el terminal no dibuja fondos). */
async function ponerFondo($: Motor): Promise<void> {
  try {
    if (estado.clienteActivo) await $.ui.backdrop({ id: FONDO, glass: { blur: 14, opacity: 0.84 } })
    else await $.ui.backdrop(undefined)
  } catch {
    // superficie sin fondos: no pasa nada
  }
}

// ── Aviso de expediente cruzado ─────────────────────────────────────────────

/** Rutas que toca una llamada a herramienta (sin modificarla). */
function rutasDeLaLlamada(e: Record<string, unknown>): { rutas: string[]; comando: string } {
  const rutas: string[] = []
  for (const clave of ['file_path', 'notebook_path', 'path', 'pattern']) {
    const v = e[clave]
    if (typeof v === 'string' && v.trim()) rutas.push(v)
  }
  const comando = typeof e.command === 'string' ? e.command : ''
  return { rutas, comando }
}

/** ¿Esta llamada toca la carpeta de otro cliente? Devuelve ese cliente y la ruta. */
export function detectarCruce(
  e: Record<string, unknown>,
  activo: Cliente | null,
  clientes: readonly Cliente[],
  cwd: string,
): { cliente: Cliente; ruta: string } | null {
  if (!activo) return null
  return clienteTocado(e, clientes, cwd, activo)
}

/** ¿Esta llamada toca la carpeta de algún cliente (salvo `excluir`)? Devuelve ese cliente y la ruta. */
export function clienteTocado(
  e: Record<string, unknown>,
  clientes: readonly Cliente[],
  cwd: string,
  excluir: Cliente | null,
): { cliente: Cliente; ruta: string } | null {
  const { rutas, comando } = rutasDeLaLlamada(e)
  const comandoNormal = normalizarRuta(comando)
  for (const otro of clientes) {
    if (!otro.carpeta || (excluir && sinTildes(otro.nombre) === sinTildes(excluir.nombre))) continue
    const carpeta = unirRuta(cwd, otro.carpeta)
    for (const r of rutas) {
      const absoluta = unirRuta(cwd, r)
      if (estaDentro(absoluta, carpeta)) return { cliente: otro, ruta: r }
    }
    if (comandoNormal && (nombraCarpeta(comandoNormal, carpeta) || nombraCarpeta(comandoNormal, normalizarRuta(otro.carpeta)))) {
      return { cliente: otro, ruta: recortar(comando, 60) }
    }
  }
  return null
}

/** ¿El comando nombra esa carpeta como carpeta (no como trozo de otro nombre)? */
function nombraCarpeta(comando: string, carpeta: string): boolean {
  if (!carpeta) return false
  const escapada = carpeta.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(^|[\\s"'=(/])${escapada}(/|[\\s"';)]|$)`).test(comando)
}

// ── Registro de hooks ───────────────────────────────────────────────────────

// ── Manejadores que llama register.tsx (ninguno lanza errores) ──────────────

/** MOD 4 · Al iniciar la sesión: comandos y cliente activo de la vez anterior. */
export async function iniciarColorCliente($: Motor): Promise<void> {
  try {
    await $.command.register({
      name: 'cliente',
      description: 'Elige el expediente activo (colorea la interfaz con su color)',
      argumentHint: '[nombre o expediente]',
      immediate: true,
    })
    await $.command.register({
      name: 'cliente-nuevo',
      description: 'Añade un cliente con su color',
      argumentHint: 'Nombre | Expediente | carpeta | color',
    })
    await $.command.register({ name: 'cliente-ninguno', description: 'Vuelve a la interfaz neutra (sin cliente activo)', immediate: true })

    // El cliente es de cada sesión: el que ya tenía ESTA sesión (tras /reload-plugins)
    // o, si se abre dentro de la carpeta de un expediente, ese cliente. Si no, ninguno.
    const memoria = await leerSesion($)
    const deMemoria = memoria.cliente
      ? (estado.clientes.find(c => sinTildes(c.nombre) === sinTildes(memoria.cliente!)) ?? { nombre: memoria.cliente })
      : null
    const cliente = deMemoria ?? clienteDeCarpeta(estado.cwd, estado.clientes, estado.cwd)
    if (cliente) {
      estado.clienteActivo = { ...cliente, color: cliente.color ?? colorPorNombre(cliente.nombre) }
      if (!deMemoria) await guardarClienteSesion($, cliente.nombre)
    }
    await ponerFondo($)
  } catch (error) {
    anotarError(`Mod 4: ${String(error).slice(0, 100)}`)
  }
}

/**
 * MOD 4 · Aviso de expediente cruzado, ANTES de que la herramienta se ejecute.
 * SOLO avisa: register.tsx deja pasar la llamada con next(e) sin cambios.
 */
export function vigilarHerramientaCliente($: Motor, e: ToolCallInput): void {
  try {
    // Sin cliente activo: si Claude trabaja en la carpeta de un cliente, ese es el de esta sesión.
    if (!estado.clienteActivo) {
      const tocado = clienteTocado(e as unknown as Record<string, unknown>, estado.clientes, estado.cwd, null)
      if (tocado) {
        void activarCliente($, tocado.cliente)
        $.ui.toast(`Cliente de esta sesión: ${tocado.cliente.nombre} (Claude trabaja en su carpeta). /cliente-ninguno lo quita.`, { timeoutMs: 8000 })
      }
      return
    }
    const cruce = detectarCruce(e as unknown as Record<string, unknown>, estado.clienteActivo, estado.clientes, estado.cwd)
    if (cruce && estado.clienteActivo) {
      estado.avisoCruzado = {
        clienteActivo: estado.clienteActivo.nombre,
        otroCliente: cruce.cliente.nombre,
        herramienta: String(e.tool),
        ruta: cruce.ruta,
      }
      $.ui.toast(`⚠ Estás con ${estado.clienteActivo.nombre}, pero Claude va a tocar archivos de ${cruce.cliente.nombre}. Solo es un aviso: no se ha bloqueado nada.`, { timeoutMs: 9000 })
      redibujar($)
    }
  } catch {
    // un fallo al comprobar no afecta a la herramienta
  }
}

/** MOD 4 · Comandos, selector y tinte de la interfaz (hooks con filtro propio). */
export function registrarHooksColorCliente(on: On): void {
  on('command.run', { command: 'cliente' }, async ($, e) => {
    const consulta = e.args.trim()
    // /cliente siempre ABRE el selector (y lo pone delante); /cliente cerrar lo cierra.
    if (/^cerrar$/i.test(consulta)) {
      if (await panelAbierto($, PANEL_CLIENTES)) await $.ui.close({ id: PANEL_CLIENTES })
      return { text: 'Selector de clientes cerrado.' }
    }
    if (!consulta) {
      selector.vista = 'lista'
      selector.filtro = ''
      await abrirPanel($, PANEL_CLIENTES, 'Clientes', true)
      return {}
    }
    const encontrados = buscarClientes(consulta, estado.clientes)
    if (encontrados.length === 1) {
      await activarCliente($, encontrados[0]!)
      return { text: `Cliente activo: ${encontrados[0]!.nombre}${encontrados[0]!.expediente ? ' · Exp. ' + encontrados[0]!.expediente : ''}.` }
    }
    if (encontrados.length > 1) {
      selector.vista = 'lista'
      selector.filtro = consulta
      await abrirPanel($, PANEL_CLIENTES, 'Clientes', true)
      return { text: `Hay ${encontrados.length} clientes que encajan con «${consulta}»: elige en el panel.` }
    }
    return { text: `No hay ningún cliente que encaje con «${consulta}». Añádelo con /cliente-nuevo.` }
  }).catch(() => ({ text: 'mods-abogados: no se pudo cambiar de cliente.' }))

  on('command.run', { command: 'cliente-ninguno' }, async $ => {
    await activarCliente($, null)
    return { text: 'Sin cliente activo: interfaz neutra.' }
  }).catch(() => ({ text: 'mods-abogados: no se pudo quitar el cliente activo.' }))

  on('command.run', { command: 'cliente-nuevo' }, async ($, e) => {
    const args = e.args.trim()
    if (!args) {
      selector.vista = 'nuevo'
      selector.borrador = { nombre: '', expediente: '', carpeta: '', color: '' }
      selector.error = null
      await abrirPanel($, PANEL_CLIENTES, 'Clientes', true)
      return {}
    }
    const [nombre = '', expediente = '', carpeta = '', color = ''] = args.split(/[|;]/).map(t => t.trim())
    const resultado = await guardarClienteNuevo($, { nombre, expediente, carpeta, color })
    return { text: resultado.error ?? resultado.texto ?? '' }
  }).catch(() => ({ text: 'mods-abogados: no se pudo añadir el cliente.' }))

  // ── Tinte de lo que dibuja Claude Code ────────────────────────────────────
  // Spinner («Pensando…»): marca de color del cliente delante.
  on('ui.render', { component: 'Spinner' }, async ($, e, next) => {
    const suyo = await next(e)
    const color = colorAcento()
    if (!color || !estado.clienteActivo) return suyo
    const { Box, Text } = $.ui.resolve(e)
    return (
      <Box flexDirection="row">
        <Text color={color} bold>
          ● {recortar(estado.clienteActivo.nombre, 24)}{' '}
        </Text>
        {suyo}
      </Box>
    )
  }).catch(($, e, next) => next(e))

  // Línea de ayuda bajo el prompt: marca de color del cliente delante.
  on('ui.render', { component: 'PromptHint' }, async ($, e, next) => {
    const suyo = await next(e)
    const color = colorAcento()
    if (!color || !estado.clienteActivo) return suyo
    const { Box, Text } = $.ui.resolve(e)
    return (
      <Box flexDirection="row">
        <Text color={color} bold>
          ▌{recortar(estado.clienteActivo.nombre, 20)}{' '}
        </Text>
        {suyo}
      </Box>
    )
  }).catch(($, e, next) => next(e))

  // Fondo de toda la ventana (solo la app de escritorio dibuja este sitio).
  on('ui.render', { component: 'Backdrop' }, async ($, e, next) => {
    const color = colorAcento()
    if (e.props.plugin !== $.plugin.name || e.props.id !== FONDO || !color) return next(e)
    const { Box } = $.ui.resolve(e)
    return <Box width="100%" height="100%" backgroundColor={color} />
  }).catch(($, e, next) => next(e))

  // ── Selector de clientes ──────────────────────────────────────────────────
  on('ui.render', { component: 'Pane', requestId: PANEL_CLIENTES }, async ($, e) => {
    const tabla = $.ui.resolve(e)
    const { Box, Text, Button } = tabla
    const ancho = Math.max(30, e.props.bodyColumns)
    const activo = estado.clienteActivo
    const color = colorAcento()
    const cabeceraTexto = activo ? ` ●  CLIENTE ACTIVO: ${activo.nombre} ` : ' ○  SIN CLIENTE ACTIVO '

    const cabecera = (
      <Text backgroundColor={color ?? 'subtle'} color={color ? textoSobre(color) : 'inverseText'} bold wrap="truncate-end">
        {cabeceraTexto.padEnd(ancho, ' ')}
      </Text>
    )

    if (selector.vista === 'nuevo') {
      if (!('Input' in tabla)) return <Text>Usa /cliente-nuevo Nombre | Expediente | carpeta | color</Text>
      const b = selector.borrador
      const campo = (clave: keyof typeof b, etiqueta: string, ayuda: string, foco = false) => (
        <tabla.Input
          key={`cliente-${clave}`}
          label={etiqueta}
          placeholder={ayuda}
          value={b[clave]}
          submitLabel="guardar"
          {...(foco ? { autoFocus: true as const } : {})}
          onInput={valor => {
            selector.borrador = { ...selector.borrador, [clave]: valor }
            redibujar($)
          }}
          onSubmit={async valor => {
            selector.borrador = { ...selector.borrador, [clave]: valor }
            const r = await guardarClienteNuevo($, selector.borrador)
            selector.error = r.error ?? null
            if (!r.error) selector.vista = 'lista'
            redibujar($)
          }}
        />
      )
      const muestra = leerColor(b.color) ?? (b.nombre.trim() ? colorParaNuevo(b.nombre, estado.clientes.slice(-5).map(c => c.color ?? '')) : null)
      return (
        <Box flexDirection="column">
          {cabecera}
          <Text bold>Nuevo cliente</Text>
          {campo('nombre', 'Nombre', 'García', true)}
          {campo('expediente', 'Expediente', '0123/2026')}
          {campo('carpeta', 'Carpeta (opcional)', 'expedientes/garcia')}
          {campo('color', 'Color (opcional)', `#2F6FED o ${PALETA.slice(0, 3).map(p => p.nombre).join(', ')}…`)}
          {muestra && (
            <Text>
              Color: <Text backgroundColor={muestra} color={textoSobre(muestra)}>{`  ${nombreColor(muestra)}  `}</Text>
            </Text>
          )}
          {selector.error && <Text color="error">{selector.error}</Text>}
          <Box flexDirection="row" columnGap={2}>
            <Button
              key="cliente-guardar"
              label="Guardar cliente"
              variant="primary"
              onPress={async () => {
                const r = await guardarClienteNuevo($, selector.borrador)
                selector.error = r.error ?? null
                if (!r.error) selector.vista = 'lista'
                redibujar($)
              }}
            />
            <Button
              key="cliente-cancelar"
              label="Cancelar"
              onPress={() => {
                selector.vista = 'lista'
                redibujar($)
              }}
            />
          </Box>
        </Box>
      )
    }

    const lista = buscarClientes(selector.filtro, estado.clientes)
    // Con muchos clientes: un campo que filtra mientras se escribe (Tab para llegar a él).
    const buscador =
      'Input' in tabla ? (
        <tabla.Input
          key="cliente-buscar"
          label="Buscar"
          placeholder="nombre, expediente o asunto"
          value={selector.filtro}
          submitLabel="activar"
          onInput={valor => {
            selector.filtro = valor
            redibujar($)
          }}
          onSubmit={async valor => {
            selector.filtro = valor
            const encontrados = buscarClientes(valor, estado.clientes)
            if (encontrados.length === 1) {
              await activarCliente($, encontrados[0]!)
              $.ui.toast(`Cliente activo: ${encontrados[0]!.nombre}`)
              await $.ui.close({ id: PANEL_CLIENTES })
            } else redibujar($)
          }}
        />
      ) : null
    return (
      <Box flexDirection="column">
        {cabecera}
        {buscador}
        <Text dimColor>
          {selector.filtro ? `${lista.length} de ${estado.clientes.length} clientes` : `${estado.clientes.length} clientes`}
          {e.surface === 'terminal' ? ' · teclas 1–9 o Tab y Enter' : ' · pulsa uno para trabajar con él'}
        </Text>
        {lista.map((c, i) => {
          const es = activo !== null && sinTildes(activo.nombre) === sinTildes(c.nombre)
          const col = c.color ?? colorPorNombre(c.nombre)
          return (
            <Button
              key={`cliente-${i}`}
              // La app de escritorio dibuja la etiqueta (no los textos de color): allí va todo en ella.
              label={
                e.surface === 'terminal'
                  ? c.nombre
                  : `${es ? '✓ ' : ''}${c.nombre}${c.asunto ? ' — ' + recortar(c.asunto, 46) : c.expediente ? ' · ' + recortar(c.expediente, 30) : ''}`
              }
              plain
              {...(es ? { variant: 'primary' as const } : {})}
              {...(i < 9 ? { hotkey: String(i + 1) } : {})}
              onPress={async () => {
                await activarCliente($, c)
                $.ui.toast(`Cliente activo: ${c.nombre}`)
                await $.ui.close({ id: PANEL_CLIENTES })
              }}
            >
              <Text color={col}>██ </Text>
              <Text bold={es}>{c.nombre}</Text>
              <Text dimColor>
                {c.expediente ? ` · Exp. ${c.expediente}` : ''}
                {c.asunto ? ` · ${recortar(c.asunto, 60)}` : c.carpeta ? ` · ${recortar(c.carpeta, 40)}` : ''}
                {es ? '  ✓ activo' : ''}
              </Text>
            </Button>
          )
        })}
        {lista.length === 0 && <Text dimColor>No hay clientes. Añade uno con «Nuevo cliente».</Text>}
        <Text> </Text>
        <Box flexDirection="row" columnGap={2}>
          <Button
            key="cliente-nuevo-boton"
            label={conAtajo('Nuevo cliente', 'n', e.surface)}
            hotkey="n"
            onPress={() => {
              selector.vista = 'nuevo'
              selector.borrador = { nombre: '', expediente: '', carpeta: '', color: '' }
              selector.error = null
              redibujar($)
            }}
          />
          <Button
            key="cliente-ninguno-boton"
            label={conAtajo('Ninguno', '0', e.surface)}
            hotkey="0"
            onPress={async () => {
              await activarCliente($, null)
              await $.ui.close({ id: PANEL_CLIENTES })
            }}
          />
          {selector.filtro ? (
            <Button
              key="cliente-quitar-filtro"
              label="Ver todos"
              onPress={() => {
                selector.filtro = ''
                redibujar($)
              }}
            />
          ) : null}
        </Box>
        <Text dimColor wrap="wrap">El color nunca es la única señal: el nombre del cliente siempre aparece escrito.</Text>
      </Box>
    )
  }).catch(($, e, next) => next(e))
}

/** Valida y guarda un cliente nuevo en config/clientes.json. */
async function guardarClienteNuevo(
  $: Motor,
  datos: { nombre: string; expediente: string; carpeta: string; color: string },
): Promise<{ texto?: string; error?: string }> {
  const nombre = datos.nombre.trim()
  if (!nombre) return { error: 'Falta el nombre. Formato: /cliente-nuevo Nombre | Expediente | carpeta | color' }
  if (estado.clientes.some(c => sinTildes(c.nombre) === sinTildes(nombre))) return { error: `Ya existe un cliente «${nombre}».` }
  let color: string
  if (datos.color.trim()) {
    const leido = leerColor(datos.color)
    if (!leido) return { error: `Color «${datos.color}» no válido: usa #RRGGBB o ${PALETA.map(p => p.nombre).join(', ')}.` }
    color = leido
  } else {
    // Estable a partir del nombre, evitando el color de los 5 clientes más recientes.
    color = colorParaNuevo(nombre, estado.clientes.slice(-5).map(c => c.color ?? ''))
  }
  const nuevo: Cliente = {
    nombre,
    ...(datos.expediente.trim() ? { expediente: datos.expediente.trim() } : {}),
    ...(datos.carpeta.trim() ? { carpeta: datos.carpeta.trim() } : {}),
    color,
  }
  const archivo = await leerJson<Record<string, unknown> & { clientes?: Cliente[] }>($, 'config/clientes.json', {})
  const ok = await escribirJson($, 'config/clientes.json', { ...archivo, clientes: [...(archivo.clientes ?? []), nuevo] })
  if (!ok) return { error: 'No se pudo guardar el cliente.' }
  await cargarClientes($)
  redibujar($)
  return { texto: `Cliente añadido: ${nombre} (${nombreColor(color)}). Actívalo con /cliente ${nombre}.` }
}

/**
 * Pastilla del Mod 4 en la banda: el cliente activo o, en su lugar, el aviso de
 * expediente cruzado. `nivel`: 0, nombre y expediente; 1, el nombre; 2, el
 * nombre recortado.
 */
export function chipCliente($: Motor, tabla: ReturnType<Motor['ui']['resolve']>, nivel: 0 | 1 | 2): Pastilla | null {
  try {
    const { Text } = tabla
    const aviso = estado.avisoCruzado
    if (aviso) {
      // El aviso de expediente cruzado ocupa el sitio del cliente: no añade filas.
      // Se quita al pulsarlo o al empezar el siguiente mensaje.
      const texto =
        nivel === 0
          ? ` ⚠ En ${recortar(aviso.clienteActivo, 18)}, tocando ${recortar(aviso.otroCliente, 18)} `
          : nivel === 1
            ? ` ⚠ Tocando ${recortar(aviso.otroCliente, 18)} `
            : ' ⚠ Otro cliente '
      const nodo = pulsable(
        tabla,
        'banda-cliente-aviso',
        'Entendido: quitar el aviso de expediente cruzado',
        () => {
          estado.avisoCruzado = null
          redibujar($)
        },
        <Text backgroundColor="warning" color="inverseText" bold wrap="truncate-end">
          {texto}
        </Text>,
      )
      return { nodo, ancho: texto.length + 1 }
    }
    const activo = estado.clienteActivo
    const color = colorAcento()
    if (!activo || !color) return null
    // El expediente suele ser largo («Divorcio contencioso 1452/2026 (TI…)»): solo su número.
    const numero = /\d+\s*\/\s*\d{2,4}/.exec(activo.expediente ?? '')?.[0]?.replace(/\s+/g, '') ?? ''
    const texto =
      nivel === 0
        ? ` ● ${recortar(activo.nombre, 24)}${numero ? ' · ' + numero : ''} `
        : nivel === 1
          ? ` ● ${recortar(activo.nombre, 18)} `
          : ` ● ${recortar(activo.nombre, 11)} `
    const nodo = pulsable(
      tabla,
      'banda-cliente',
      'Cambiar de cliente',
      () => void abrirPanel($, PANEL_CLIENTES, 'Clientes', true),
      <Text backgroundColor={color} color={textoSobre(color)} bold wrap="truncate-end">
        {texto}
      </Text>,
    )
    return { nodo, ancho: texto.length }
  } catch {
    return null
  }
}
