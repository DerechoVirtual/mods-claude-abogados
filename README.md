# Mods de Claude para abogados · Derecho Virtual

Todos los **mods de Claude Code** que hemos hecho en Derecho Virtual, tal como los usamos en las clases y en los vídeos. Un mod es código que corre dentro de Claude Code, dibuja su propia interfaz (paneles, bandas, botones) y reacciona a lo que pasa en la sesión.

| Mod | Qué hace | Comandos |
| :- | :- | :- |
| [`mods-abogados`](mods-abogados/README.md) | Diez mods en uno: panel de plazos procesales (también los de un escrito judicial), revisor de citas, cuenta atrás del plazo más urgente, un color por cliente, cupo de Jurisprudenciator, «que lo ataque el contrario», semáforo MASC, procurador, copia anonimizada y siguientes pasos. | `/plazos`, `/citas`, `/cliente`, `/ficha`, `/contrario`, `/cupo`, `/siguientes` |
| [`equipo-juridico`](equipo-juridico/README.md) | Los subagentes y las tareas en segundo plano, contados como un equipo jurídico con nombre y oficio (María, Juan, Luis, Clara, Alberto, Elena, Pablo, Carmen y Rufino, el abogado contrario), en una oficina en pixel art y con la barra de avance del escrito. | `/equipo` |
| `azul-claro` | Los mensajes de Claude sobre azul claro translúcido. | `/azul` |
| `modo-voz` | Hablas y Claude te contesta en voz alta; también dictado al cuadro de texto. Necesita ffmpeg, Python y una clave de OpenAI (`OPENAI_API_KEY` en `~/.claude/.env`). | `/voz`, `/dictar` |
| `entorno-emoji` | Un emoji y el nombre de la carpeta en la que trabajas, encima del prompt. | — |

## Requisitos

- **Claude Code 2.1.287 o posterior** en el terminal (`claude --version`), o la app de escritorio de Claude con Claude Code 2.1.286 o posterior.

## Instalación

Añade este repositorio como marketplace:

```bash
claude plugin marketplace add DerechoVirtual/mods-claude-abogados
```

E instala los mods que quieras:

```bash
claude plugin install mods-abogados@mods-derecho-virtual --scope user
```

```bash
claude plugin install equipo-juridico@mods-derecho-virtual --scope user
```

```bash
claude plugin install azul-claro@mods-derecho-virtual --scope user
```

```bash
claude plugin install modo-voz@mods-derecho-virtual --scope user
```

```bash
claude plugin install entorno-emoji@mods-derecho-virtual --scope user
```

Si ya tenías Claude Code abierto, escribe `/reload-plugins` en esa sesión.

También puedes pedírselo a Claude: «instala los mods de https://github.com/DerechoVirtual/mods-claude-abogados».

## Carpeta de demostración

`demo/` trae expedientes **ficticios** para probar los mods sin tocar asuntos reales. Abre Claude Code dentro de esa carpeta (`cd demo` y `claude`).

## Antes de usarlos con expedientes reales

- Todos los datos que traen son **ficticios**: ningún nombre, importe ni asunto corresponde a personas o empresas reales.
- Un mod ejecuta código con tus permisos y ve lo que escribes. **Revisa el código** antes de usarlo en tu despacho.
- El cómputo de plazos, el semáforo de citas y los avisos de MASC y procurador son **orientativos**: un abogado debe verificar cada plazo, cada cita y cada requisito.

## Más

- Canal de YouTube: [Inteligencia Artificial para Abogados](https://www.youtube.com/channel/UCb9yL_jfH9NSxqwtl3sZM-w)
- Formación: [Derecho Virtual](https://derechovirtual.org)

Licencia MIT.
