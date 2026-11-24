# Equipo jurídico: un mod de Claude Code

Cuando Claude lanza tareas en segundo plano o subagentes (investigar, redactar secciones, revisar citas, ordenar…), este mod las convierte en un **despacho con 8 personas**.

- **La oficina empieza vacía.** Cada persona entra cuando le llega su primera tarea («📝 Luis entra en la oficina»). Si Claude lanza más tareas que personas, la misma persona lleva varias («Luis lleva 3 tareas»).
- **Vista Oficina en pixel art isométrico** (app de escritorio), al estilo de un juego de gestión retro:
  - el despacho del director (Carlos) a la izquierda y 8 cubículos;
  - **cada persona tiene su propio personaje**: María, Clara, Elena y Carmen son mujeres; Juan, Luis, Alberto y Pablo, hombres; cada uno con su pelo, su ropa y su cara. Se sientan de espaldas en su silla, el director está de frente en su sillón y Rufino, de pie ante la puerta con los brazos cruzados;
  - cada persona entra por la puerta, camina hasta su silla y, mientras trabaja, se balancea y su monitor brilla; quien lleva un rato sin trabajo se ve atenuado;
  - **etiquetas flotantes** encima de cada cabeza, con su cara, su nombre y su estado en color: TRABAJANDO verde, ESPERANDO amarillo, TERMINÓ ✓ cian, ERROR rojo parpadeando. Las etiquetas nunca se pisan entre sí ni tapan una cabeza;
  - una **ventana de chat** donde el director pregunta («Luis, ¿cómo va la demanda?») y la persona contesta con su última frase real, cada uno con su cara;
  - un **tablero de control** con las personas trabajando, el escrito en curso, el avance total y el estado.

  El fondo y los personajes se generaron con gpt-image-2.5-flare (calidad low), sin texto dentro. Todo el texto lo dibuja el mod encima. En la terminal se dibujan puestos de texto, con el chat y el tablero en una línea cada uno.
- **Pulsa a cualquier persona y verás su ficha**:
  - cada tarea, con un **avance honesto**: palabras escritas frente a las pedidas, herramientas, búsquedas, resoluciones que han salido, archivos con su tamaño, tiempo y estado;
  - la **cronología en directo** de lo que hace;
  - lo que va diciendo;
  - su respuesta al terminar.

  **Ver más** despliega la ficha entera: arriba del todo salen un resumen («📋 Ficha completa: 2 tareas · 14 pasos dados · 2 documentos preparados»), las instrucciones que recibió y los documentos que ha preparado. **Ver menos** la recoge. El «Ver más» de una fila de la conversación abre la ficha ya desplegada.
- **Frases en directo, divertidas y basadas en hechos reales**: «¡Buah! Acabo de encontrar la STS 323/2017 del Supremo, es la hostia. Con ella vamos a machacar a la parte contraria». Salen de lo que devuelven de verdad las herramientas, nunca inventado.
- **Barra del escrito.** Al pedir redactar un escrito judicial aparece **una sola barra del trabajo total**, desde que se empieza a investigar hasta que se entrega el documento final, con el paso actual aparte: «📝 Demanda de reclamación ████░░░░ 40 % · ahora: el equipo redacta las secciones · 3 de 6 hechas».
  - **El título es el tipo de escrito, limpio y corto**: «Recurso de apelación», «Contestación a la demanda», «Carta al cliente». Nunca un trozo de tu frase («Recurso de apelación en tan s…») ni el nombre de una skill.
  - **Llega al 100 % con el Word o con el PDF**, se entreguen como se entreguen: montados con la redacción rápida, generados por otra vía o enviados directamente por Claude.
  - **Nunca se queda colgada.** Si Claude termina su turno sin entregar el documento y ya no trabaja nadie, la barra se retira al minuto (o al escribir otra cosa) y vuelve sola si se sigue con el escrito. El ataque de Rufino no cuenta como trabajo del equipo.

  | Tramo | Qué cubre |
  |---|---|
  | 0–5 % | Arranque: `estado` de Jurisprudenciator y `escrito.py iniciar` |
  | 5–15 % | Consultas previas y `caso.md` con el plan |
  | 15–20 % | Lanzamiento del equipo |
  | 20–75 % | Secciones: palabras escritas frente a la extensión pedida a cada una (con su peso) y trabajo de cada redactor |
  | 75–90 % | `escrito.py ensamblar` y corrección de sus errores |
  | 90–97 % | Lectura de coherencia y reensamblado |
  | 100 % | Solo cuando existe el documento final (Word o PDF) y Claude lo entrega |

  Ninguna fase llega al 100 % por sí sola, y el porcentaje nunca retrocede.

Funciona en la pestaña Code de la app de escritorio y en la terminal. Todo es local: el mod no usa la red, no llama a modelos y no ejecuta programas. Solo **observa**: nunca bloquea ni cambia una llamada, un subagente, un prompt o un turno. Sus anotaciones van en segundo plano, sin hacer esperar a las herramientas.

## El equipo

| | Persona | Oficio | Se queda con… |
|---|---|---|---|
| 📁 | María | secretaria | expediente, archivo, plazos y agenda, recepción del asunto, hoja de encargo, montar el Word. También lo que no encaja con nadie. |
| 🔎 | Juan | buscador de jurisprudencia | jurisprudencia (Supremo, Audiencias, TSJ, TC, TJUE) y normativa (BOE, leyes, artículos); subagente `Explore` |
| 📝 | Luis | picapleitos | fundamentos de fondo, motivos, súplica y otrosíes, demanda, contestación, recurso, contrato, prueba, burofax, MASC, estrategia; subagente `Plan` |
| 📜 | Clara | redactora de hechos | encabezamiento, hechos, cronología |
| 🧩 | Alberto | procesalista | jurisdicción, competencia, legitimación, procedimiento |
| 🧐 | Elena | revisora | citas, estilo, coherencia, secreto profesional, anonimización |
| 📮 | Pablo | procurador | LexNET, presentación, notificaciones |
| 🧮 | Carmen | contable | minuta, costas, facturas, indemnizaciones, intereses, cuantía |
| 😈 | Rufino | abogado de la **parte contraria** (no es del despacho) | atacar nuestro escrito: entra cuando se pulsa «Que lo ataque el contrario» (mods-abogados) o se pide un ataque de la contraria. Se planta en la puerta con «⚔ ATACANDO» en rojo y no cuenta para las 8 personas. Habla como un juez cabrón: soez y despectivo con nuestro escrito y con el despacho («A ver qué mierda me habéis traído hoy…», «¡Ahí tenéis vuestras vergüenzas, listillos!»), nunca con colectivos ni personas reales. Con `"tono": "profesional"`, desdeñoso pero sin tacos. |

**Cómo se reparte**

- **Si Claude nombra a alguien al encargar la tarea, es suya**: «Elena: revisar la coherencia», «Juan — comprobar las citas». En pantalla sale esa persona, y la tarea se lee sin el nombre delante («Revisar la coherencia»).
- Si no nombra a nadie, manda la descripción corta que Claude pone a la tarea. Después cuentan el tipo de subagente y el principio del encargo.
- El primer verbo de la descripción decide los empates: «Revisar el escrito» va a Elena.
- Reconoce la skill `redaccion-rapida` de Jurisprudenciator: su subagente `…:redactor-seccion` y el encargo «Sección NN — nombre: …». Los hechos van a Clara, los fundamentos procesales a Alberto, y el fondo y el cierre a Luis.
- Una tarea no cambia de persona en toda la sesión.

## Dónde se ve

1. **Panel «Equipo jurídico»**, junto a la conversación, con dos pestañas:
   - **🏢 Oficina**: en la app de escritorio, la escena animada y debajo un botón por persona. En la terminal, un puesto de texto por persona, con marco de color mientras trabaja y puntos que «teclean».
   - **☰ Lista**: el equipo por oficio, una línea por persona.

   Pulsa a una persona para ver su ficha. «← Volver al equipo» regresa. El panel se abre solo la primera vez que alguien trabaja; `/equipo` lo abre o lo cierra.
2. **Fila de cada subagente** en la conversación: quién lo lleva, qué hace, la tarea (una sola vez, sin repetirla en la frase), su última frase y un botón **Ver más** que abre su ficha. Con ctrl+o se ve la fila de siempre.
3. **Fila de cada Workflow**: el encargo y quién está con él.
4. **Spinner**: «Luis está redactando un fundamento de fondo (y 4 compañeros más) · escrito al 45 %».
5. **Banda encima del prompt: UNA sola fila**, para no llenar la pantalla delante de un cliente:
   - por orden de importancia: el escrito con su barra y su porcentaje, cuánta gente trabaja y, solo si cabe, la última frase y el paso actual. **Lo que no cabe entero no entra** (está en el panel): nada se parte en dos líneas ni se corta a medias;
   - en la app de escritorio la fila es corta a propósito («📝 Contestación… ███░░░ 55 % · 5 trabajando»), porque allí un texto largo saltaba a varias líneas; en una terminal ancha cabe más;
   - el detalle por persona está en el panel: botones «Ver equipo» y «Ocultar»;
   - **se retira sola**: cuando termina todo el equipo, al minuto, o antes si escribes el siguiente mensaje. Si vuelve a trabajar alguien, reaparece solo con lo nuevo;
   - no repite lo que ya enseña mods-abogados (cliente, plazos, citas, cupo).
6. **Aviso de tarea terminada**, con su frase y su botón Ver más.
7. **Avisos emergentes** para los grandes momentos: entrada en la oficina, una sentencia del Supremo, una sección escrita, una tarea o un escrito terminados. Las entradas que llegan juntas salen en un solo aviso, y los grandes momentos, como mucho uno cada 12 s.

## Las frases (en serio)

Salen de **hechos observados** en lo que devuelve cada herramienta:

- **Resoluciones que aparecen en una búsqueda** (STS, SAP, STSJ, STC, ECLI, asuntos del TJUE), con su tribunal. Al leer una sentencia, la cita sale de lo que se pidió leer, no de las que menciona el texto.
- **Un artículo vigente o derogado.**
- **Un archivo escrito**, con sus palabras.
- **Una búsqueda vacía o un error.**
- **El resumen al terminar**: búsquedas, sentencias y palabras.

Si el resultado no trae ningún identificador, la frase no menciona ninguno. Cada persona tiene sus coletillas y las frases rotan sin repetirse seguidas. Las frases salen de plantillas locales y deterministas, sin llamar a ningún modelo.

**En lenguaje llano, siempre:**

- **Ni nombres de archivo ni jerga.** Un documento se nombra como lo diría una persona: «Retoco la contestación», «Pulo un detalle de «encabezamiento y hechos»», «Lee la demanda». Nunca «02-encabezamiento-y-hechos.md».
- **Las normas, cortas y enteras**: «art. 438 LEC», «art. 5 LO 1/2025», «art. 82 Código del Derecho Foral de Aragón». Nunca cortadas a mitad de palabra.
- **Valen igual para ellas que para ellos**: ninguna frase usa una palabra que cambie con el género de quien habla.

**Advertencia**: las frases celebran lo que devolvió la herramienta. No son una valoración jurídica de la sentencia; la ficha lo recuerda.

**Tono:** `"tono": "informal"` (por defecto, desenfadado, como el ejemplo de Carlos) o `"profesional"` («He localizado la STS 323/2017 del Tribunal Supremo»). Los avisos emergentes se apagan con `"avisosEmergentes": false`.

## La ficha de cada persona, en lenguaje de despacho

Al pulsar a alguien, su ficha cuenta su trabajo como lo contaría un despacho, sin «Read», «Grep», «Bash» ni rutas. Cada tarea muestra:

- 🎯 **Su encargo**, resumido, cuando añade algo al título de la tarea: «Redactar la Sección 01 — Encabezamiento y hechos, unas 750 palabras».
- 📈 **Avance (orientativo)**: palabras escritas frente a las pedidas.
- ⚖️ **Lo que ha conseguido**:
  - si ha estudiado el expediente;
  - la jurisprudencia encontrada («STS 323/2017 del Supremo, SAP 88/2022…») y la que ha leído a fondo;
  - las normas comprobadas («art. 27 LAU (vigente)»);
  - lo que ha redactado («la sección 01: 667 palabras»);
  - el resultado de la verificación de citas.
- 👉 **Ahora mismo**: el paso en curso, si hay alguno a medias.
- 📒 **Diario de trabajo**: cada paso narrado y lo que dio de sí, por ejemplo «Estudia el expediente del caso y el plan del escrito», «Busca jurisprudencia del Supremo sobre «desahucio por falta de pago» → han salido la STS…», «Consulta el art. 27 LAU en su redacción vigente → vigente» o «Redacta la sección 01 → 667 palabras».
- 📝 **Su informe** final, sin rutas ni comillas de código.
- **Ver más**: el diario completo, los documentos que ha preparado y las instrucciones exactas que recibió.

## El avance de cada persona (medida honesta)

No hay un porcentaje real de lo que lleva un subagente, así que la ficha enseña lo que se puede observar:

- **Palabras escritas frente a las pedidas.** Para los redactores de sección, «Extensión: N palabras» sale del encargo y las palabras se cuentan en lo que escriben. Es el único porcentaje, marcado como orientativo.
- **Herramientas usadas, búsquedas y resoluciones que han salido.**
- **Archivos escritos**, con su tamaño y sus palabras. Tras un Edit, la sección se vuelve a leer para contarla.
- **Tiempo, y estado según Claude Code**: en marcha, esperando, en pausa…
- **El último paso y la cronología.**

## Comandos

| Comando | Qué hace |
|---|---|
| `/equipo` | Abre o cierra el panel |
| `/equipo oficina` · `/equipo lista` | Abre el panel en esa vista (si ya está abierto, solo cambia de vista: nunca lo cierra) |
| `/equipo abrir` · `/equipo cerrar` | Lo mismo, de forma explícita |
| `/equipo recargar` | Vuelve a leer `config/equipo.json` (tras editarlo), el fondo y los personajes de la oficina |
| `/equipo limpiar` | Quita las tareas terminadas y la barra de un escrito ya acabado |
| `/equipo ayuda` | Las personas, a qué se dedica cada una y el tono |

## Cambiar el equipo

Edita `config/equipo.json` y escribe `/equipo recargar` (o `/reload-plugins`).

**De cada oficio puedes cambiar:**

- `oficio`, `grupo`, `emoji` y `color`;
- `personas`: cada una con `nombre`, `genero` (`"f"` si es una mujer, `"m"` si es un hombre) y sus `muletillas`, como `["¡Buah!", "¡Toma ya!"]`. Puedes poner más de una persona en un oficio; la oficina está pensada para 7 u 8 en total. El `genero` decide su personaje en la oficina; si falta, se deduce del nombre;
- `claves`: raíces de palabra, sin tildes ni mayúsculas;
- `acciones`: cada una con sus `claves`, un `gerundio` y un `participio`. Se miran en orden y la genérica (sin claves) va al final;
- `tiposDeSubagente`, para que un tipo de subagente vaya siempre a ese oficio, y `redactaSecciones`, para los oficios que redactan secciones de un escrito.

**Para todo el equipo:** `director` (quien preside la oficina; por defecto, Carlos) y `generoDirector` (`"m"` o `"f"`: «Director Carlos» o «Directora Ana»), `tono`, `avisosEmergentes`, `porDefecto`, `porDefectoSeccion` y `abrirPanelAlEmpezar`.

Si el archivo tiene un error, el mod usa el equipo de reserva (`hooks/equipo-por-defecto.ts`) y lo avisa.

## Los personajes de la oficina

Cada persona se dibuja con su propia imagen, guardada en `assets/personajes.json`: un **cuerpo** (sentada en su silla, de pie o en el sillón) y una **cara** (para su etiqueta y para el chat).

- **Quién lleva qué imagen.** La clave es el `id` de la persona (`maria`, `juan`, `luis`, `clara`, `alberto`, `elena`, `pablo`, `carmen`, `rufino`) y `director` para quien dirige. Quien se añada al equipo sin imagen propia lleva la de `mujer` o la de `hombre`, según su `genero`.
- **Dónde se coloca cada cuerpo.** El mismo archivo dice el punto de cada silla en el fondo (`sitios`) y qué punto de la imagen va ahí (`cuerpo.ancla`: el centro de la base de la silla, o los pies).
- **Para cambiar un personaje**: sustituye su imagen dentro de `assets/personajes.json` (van incrustadas en base64) y escribe `/equipo recargar`.
- **El dibujo no puede pasar de 131.072 caracteres** (es el tope de la app). La oficina llena (las 8 personas, Rufino y el director, con sus caras, el chat y el fondo) ocupa unos 108.500: sobran unos 22.500. Una prueba lo vigila. Si alguna vez no cupiera, el mod quita por este orden las caras de quien ya descansa, las del chat, las demás caras y, por último, los cuerpos; lo que quita lo dibuja él mismo.
- **Si falta `personajes.json`**, la oficina dibuja ella misma a cada persona, distinta según su género, su peinado y su ropa: nunca todas iguales.

## Qué se puede y qué no se puede cambiar de la interfaz

Con la API de mods de Claude Code (versión 2.1.317):

- **Se puede:**
  - crear paneles y bandas propios con botones, y dibujar SVG animado en la app de escritorio (SMIL, sin scripts);
  - redibujar la fila de una llamada a herramienta, el spinner, el aviso de tarea terminada y los mensajes;
  - lanzar avisos emergentes.
- **No se puede:**
  - redibujar, renombrar ni hacer pulsable el panel nativo **«Tareas en segundo plano»** de la app de escritorio; no es un sitio de dibujo de la API. Su sustituto es la oficina;
  - poner botones *dentro* del SVG (no admite scripts), así que en escritorio van debajo de la escena;
  - cambiar el aviso de permisos.

## Instalación

Desde una terminal (hace falta Claude Code 2.1.287 o posterior; `claude --version`):

```bash
claude plugin marketplace add DerechoVirtual/mods-claude-abogados
```

```bash
claude plugin install equipo-juridico@mods-derecho-virtual --scope user
```

Para que lo cargue una sesión abierta, escribe **`/reload-plugins`**; una sesión nueva lo carga sola.

## Archivos

| Archivo | Para qué |
|---|---|
| `config/equipo.json` | El equipo, el tono y los avisos (editable) |
| `hooks/register.tsx` | Los hooks: lo que observa y lo que dibuja |
| `hooks/equipo.ts` | Reparto, frases de estado, validación del JSON |
| `hooks/frases.ts` | Hechos sacados de los resultados y frases con personalidad |
| `hooks/narrativa.ts` | Cada paso contado en lenguaje jurídico, su resultado, el encargo y el informe sin tecnicismos |
| `hooks/oficina.ts` | Puestos de la oficina (quién está, su silla, su estado) y la oficina compacta |
| `hooks/escena.ts` | La oficina isométrica: personajes, etiquetas, director, chat y tablero en SVG |
| `assets/oficina-isometrica.webp` | Fondo de la oficina (gpt-image-2.5-flare, low, sin texto) |
| `assets/personajes.json` | El cuerpo y la cara de cada persona, y el sitio de cada silla (gpt-image-2.5-flare, low) |
| `hooks/avance.ts` | Barra del escrito: cuándo se pide uno, su título y su porcentaje |
| `hooks/banda.ts` | Qué cabe en la única fila de la banda |
| `hooks/llano.ts` | Lenguaje llano: nombres de documentos y de normas, recortes por palabras enteras |
| `hooks/equipo-por-defecto.ts` | Equipo de reserva (igual que el JSON) |
| `types/index.d.ts` | Contrato de tipos y del estado |
| `tests/*.test.ts(x)` | 150 pruebas: `claude plugin test <esta carpeta>` |
