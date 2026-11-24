# Mods de Claude para abogados · Derecho Virtual

Los mods que enseñamos en la conferencia, gratis y listos para instalar.

**Qué es un mod.** Es un pequeño añadido que cambia la aplicación de Claude por dentro: dibuja paneles, botones y avisos propios y reacciona a lo que pasa mientras trabajas (un escrito que se termina, una cita sin verificar, un plazo que vence). No es un prompt ni una skill: es interfaz nueva dentro de Claude.

## Qué trae

| Mod | Qué hace | Comandos |
| :- | :- | :- |
| [`equipo-juridico`](equipo-juridico/) | Convierte los subagentes de Claude en **tu equipo**: María la secretaria, Juan el buscador de jurisprudencia, Luis el picapleitos, Clara, Alberto, Elena, Pablo y Carmen, más Rufino, el abogado contrario. Cada uno aparece trabajando en su mesa de una **oficina** dibujada, habla con su personalidad y tiene su ficha. Encima del cuadro de texto, una barra con el **porcentaje del escrito hecho** y el botón **Ver equipo**. | `/equipo`, `/equipo oficina`, `/equipo lista`, `/equipo recargar`, `/equipo limpiar`, `/equipo ayuda` |
| [`mods-abogados`](mods-abogados/) | Diez mods en uno: **panel de plazos** procesales (también saca los de un escrito judicial), **revisor de citas** con semáforo, **cuenta atrás** del plazo más urgente, **un color por cliente**, cupo de Jurisprudenciator, «que lo ataque el contrario», aviso de MASC, aviso de procurador, siguientes pasos y copia anonimizada (apagada por defecto). | `/plazos`, `/plazo-nuevo`, `/plazo-borrar`, `/citas`, `/cliente`, `/cliente-nuevo`, `/cliente-ninguno`, `/ficha`, `/masc`, `/contrario`, `/cupo`, `/siguientes`, `/anonimizar` |
| [`entorno-emoji`](entorno-emoji/) | Un emoji y el nombre de la carpeta en la que trabajas, encima del cuadro de texto, para no confundirte de expediente. | No tiene |

Cada mod tiene su propia guía completa en su carpeta (`equipo-juridico/README.md` y `mods-abogados/README.md`).

## Qué necesitas

- La **aplicación de escritorio de Claude** (Windows o Mac), actualizada, con la pestaña **Code**. Los mods funcionan en esa pestaña, no en el chat normal ni en la web.
- Nada más. No hace falta saber programar ni tener cuenta de GitHub.

Quien use Claude Code en la terminal necesita la versión 2.1.287 o posterior (`claude --version`).

## Instalación

### Vía 1 · Pídeselo a Claude (la más fácil)

1. Abre la aplicación de Claude, entra en la pestaña **Code** y empieza una sesión en cualquier carpeta.
2. Escribe este mensaje:

   ```text
   Instálame este marketplace de plugins de Claude Code y sus tres mods (mods-abogados, equipo-juridico y entorno-emoji), para mi usuario: https://github.com/DerechoVirtual/mods-claude-abogados
   ```

3. Acepta los permisos que te pida. Cuando termine, escribe `/reload-plugins` (o abre una sesión nueva).
4. Compruébalo: escribe `/equipo` y `/plazos`. Si se abren sus paneles, está instalado.

### Vía 2 · A mano, con cuatro órdenes

En la pestaña **Code**, escribe estas órdenes en el cuadro de texto, una a una:

```text
/plugin marketplace add DerechoVirtual/mods-claude-abogados
```

```text
/plugin install mods-abogados@mods-derecho-virtual
```

```text
/plugin install equipo-juridico@mods-derecho-virtual
```

```text
/plugin install entorno-emoji@mods-derecho-virtual
```

Y para que la sesión abierta los cargue:

```text
/reload-plugins
```

Puedes instalar solo los que quieras. Si prefieres la terminal, son las mismas órdenes con `claude` delante y sin la barra: `claude plugin marketplace add DerechoVirtual/mods-claude-abogados` y `claude plugin install mods-abogados@mods-derecho-virtual --scope user` (igual con los otros dos).

## Primeros pasos

- **Ver al equipo trabajar.** Pide un escrito («redáctame una demanda de reclamación de cantidad…»). En cuanto Claude reparte el trabajo, aparece la barra con el porcentaje y el botón **Ver equipo**, que abre la oficina. También puedes abrirla con `/equipo oficina`.
- **Plazos.** `/plazo-nuevo ejemplo` carga cinco plazos ficticios para probar el panel; `/plazos` lo abre. Con una providencia o un decreto adjuntos, `/plazos` saca sus plazos.
- **Citas.** Después de cada respuesta con artículos o sentencias verás «§ 3 citas por verificar»; `/citas` las detalla.
- **Clientes.** `/cliente-nuevo` añade los tuyos; `/cliente` elige con cuál trabajas y tiñe la interfaz de su color.
- **Carpeta de prueba.** [`demo/`](demo/) trae expedientes inventados para probar sin tocar asuntos reales.

## Personalizar el equipo (nombres de los empleados)

Los nombres, el tono y el director están en el archivo `config/equipo.json` del mod `equipo-juridico`.

**La forma fácil:** pídeselo a Claude en la pestaña Code. Por ejemplo:

```text
En el mod equipo-juridico que tengo instalado, abre config/equipo.json y cambia: el director soy yo, «Ana» (generoDirector "f"); el picapleitos se llama «Marcos» en vez de Luis; y pon el tono en "profesional".
```

Después escribe `/equipo recargar`.

**A mano:** el archivo está en la carpeta de tu usuario, en `.claude/plugins/cache/mods-derecho-virtual/equipo-juridico/` (dentro, la carpeta con el número de versión) `/config/equipo.json`. Qué puedes tocar:

- `director` y `generoDirector` (`"m"` o `"f"`): quién preside la oficina. Viene «Carlos»; pon tu nombre.
- En cada persona, `nombre`, `inicial` y `muletillas` (sus coletillas). Deja el `id` como está y conservará su dibujo. Si cambias a alguien de hombre a mujer (o al revés), cambia también `genero` y el `id` (por ejemplo `"marta"`): llevará el personaje genérico de mujer o de hombre.
- `tono`: `"informal"` (el de la conferencia: desenfadado, y Rufino suelta tacos contra el escrito) o `"profesional"` (sin tacos, para usarlo delante de un cliente).
- `avisosEmergentes`: `true` o `false`.

Si el archivo queda con un error, el mod usa el equipo original y te avisa.

Ten en cuenta que tus cambios, igual que tus plazos y clientes de `mods-abogados`, se guardan dentro de la carpeta del mod instalado: antes de actualizar a una versión nueva, guarda copia de las carpetas `config` y `data`.

## Activar o desactivar cada mod

Los diez mods de `mods-abogados` se encienden y apagan por separado en `/plugin` → `mods-abogados` (o en `/config`). Después, `/reload-plugins`.

## Desinstalar

En la pestaña Code:

```text
/plugin uninstall equipo-juridico@mods-derecho-virtual
```

```text
/plugin uninstall mods-abogados@mods-derecho-virtual
```

```text
/plugin uninstall entorno-emoji@mods-derecho-virtual
```

Y, si quieres quitar también el catálogo:

```text
/plugin marketplace remove mods-derecho-virtual
```

O pídeselo a Claude: «desinstala los mods de mods-derecho-virtual».

## Antes de usarlos con expedientes reales

- Todos los datos que traen son **ficticios**: ningún nombre, importe ni asunto corresponde a personas o empresas reales.
- Un mod ejecuta código en tu ordenador con tus permisos y ve lo que escribes. El código está aquí, a la vista, para que lo revises.
- El cómputo de plazos, el semáforo de citas y los avisos de MASC y de procurador son **orientativos**: un abogado debe verificar cada plazo, cada cita y cada requisito.
- Añade los festivos de tu comunidad autónoma y de tu municipio (`mods-abogados/config/festivos.json` solo trae los nacionales).

## Jurisprudencia de verdad en tus escritos

El equipo jurídico y el revisor de citas dan lo mejor cuando Claude consulta jurisprudencia y legislación oficiales con **Jurisprudenciator**: sentencias con su párrafo literal y su ECLI, artículos vigentes y verificación de citas.

**[www.jurisprudenciator.com](https://www.jurisprudenciator.com)**

---

Hecho por [Derecho Virtual](https://www.jurisprudenciator.com). Licencia MIT.
