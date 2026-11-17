# mods-abogados · Diez mods de Claude Code para abogados

> **Versión 1.6.0 (09/11/2026) · pulido tras la grabación del vídeo.**
> - **`/plazos` saca los plazos del escrito** y los enseña en la pestaña nueva **Del escrito** (cartel con lo primero que vence, calendario y una tarjeta por plazo).
> - **La banda**: solo los plazos del **cliente activo**, **dos filas como mucho** y nada cortado por la derecha, también con el chat estrecho.
> - **Citas**: «art. 7.3» ya es el artículo 7 (salía como dos citas, el 7 y el 3); la petición de verificación no repite citas ni se envía dos veces.
> - **Títulos legibles**: «CONTESTACION-DEMANDA-DIVORCIO-Ibanez-Cortes.pdf» se lee «Contestación a la demanda de divorcio · Ibáñez Cortés».
> - **Etiquetas** sin repetir el atajo en la app de escritorio, pestaña activa resaltada, textos sin nombres de archivo ni jerga, y `/plazos`, `/citas`, `/ficha` y `/cliente` ya nunca cierran su panel (lo cierra `… cerrar`).
> - **El contrario**, rápido y corto; el aviso de Anonimizator, una frase.

Plugin de **mods** de Claude Code (la función de octubre de 2026: código que corre dentro de Claude Code, dibuja su propia interfaz y reacciona a eventos en vivo). Trae diez mods que se activan y desactivan por separado:

| Mod | Qué hace | Cómo se usa |
| :- | :- | :- |
| 1 · Panel de plazos procesales | **Los plazos de un escrito judicial, de un vistazo** (pestaña **Del escrito**: lo primero que vence, calendario y una tarjeta por plazo), más **Mis plazos**, **Calculadora** y **Festivos**. Cuenta solo días hábiles y enseña el desglose día a día. | `/plazos`, `/plazos <ruta>`, `/plazo-nuevo`, `/plazo-borrar` |
| 2 · Revisor de citas legales | Tras cada respuesta, semáforo de las citas (artículos, sentencias, autos, ECLI, recursos, ROJ/CENDOJ) según si una consulta real del turno las respalda. | Pastilla en la banda, `/citas`, botón «Pedir verificación» |
| 3 · Cuenta atrás de plazo | Pastilla encima del prompt con el plazo más urgente, que cambia de verde a ámbar y a rojo. | Automática; se pulsa para abrir los plazos |
| 4 · Un color por cliente | La interfaz se tiñe del color del expediente activo y avisa si Claude va a tocar archivos de otro cliente. | `/cliente`, `/cliente-nuevo`, `/cliente-ninguno` |
| 5 · Cupo de Jurisprudenciator | Cuenta las lecturas (también las de los subagentes) y avisa **antes** de agotar el cupo del día o de la semana. | Automático; `/cupo` |
| 6 · Que lo ataque el contrario | Al **terminar** un escrito aparece un botón: un subagente hace de abogado de la otra parte y saca los puntos débiles. | Botón en la banda; `/contrario` |
| 7 · Semáforo MASC | Al escribir una demanda civil del expediente activo, avisa si su ficha no acredita el intento de negociación previa de la LO 1/2025 (medio, fecha y documento). | Aviso en la banda; `/ficha`, `/masc` |
| 8 · Procurador | Avisa si el procedimiento y la cuantía de la ficha exigen procurador (arts. 23 y 31 LEC) y no lo tiene. | Aviso en la banda; `/ficha` |
| 10 · Siguientes pasos | Al terminar un escrito, un panel con las tres peticiones más probables (ordenadas por Claude y por tu historial) para lanzarlas con un clic. Incluye «Que lo ataque el contrario». | Automático al terminar el escrito; `/siguientes` |
| 9 · Copia anonimizada (**apagado por defecto**) | Al terminar un escrito con datos personales, lo pasa a tu conector de **Anonimizator** y guarda al lado una copia anonimizada. Necesita el conector con tu URL personal. | Automático al terminar el escrito; `/anonimizar` |

> ⚖️ **Las reglas de los Mods 7 y 8 son orientativas y debe validarlas un abogado.** Están en `config/masc.json` y `config/postulacion.json` (no en el código). Se comprobaron el 09/11/2026 con el texto vigente del art. 5 y del art. 10 de la LO 1/2025 y de los arts. 23 y 31 LEC (redacción de la LO 1/2025) en Jurisprudenciator, pero cada despacho debe revisarlas antes de fiarse de ellas. Los mods solo avisan: nunca bloquean una demanda.

> **Antes de nada.** Todos los datos que trae son **ficticios**. Un mod ejecuta código con tus permisos y ve tus prompts: revisa el código antes de usarlo con expedientes reales. El cómputo de plazos y el semáforo de citas son **orientativos**: un abogado debe verificar cada plazo y cada cita.

---

## 1. Requisitos

- **Claude Code 2.1.287 o posterior** en el terminal (`claude --version`), o la **app de escritorio** con Claude Code 2.1.286 o posterior (en una sesión local del Code tab, `/status` → fila *Claude Code*).
- Los mods vienen activados por defecto. Si alguien puso `"disableAllHooks": true` en `~/.claude/settings.json`, los mods no cargan.

## 2. Instalación

### Opción A · Instalado de forma permanente (lo recomendado)

Este repositorio es un **marketplace** de Claude Code (`.claude-plugin/marketplace.json`, nombre `mods-derecho-virtual`). Desde una terminal:

```bash
claude plugin marketplace add DerechoVirtual/mods-claude-abogados
```

```bash
claude plugin install mods-abogados@mods-derecho-virtual --scope user
```

Si ya tenías Claude Code abierto, escribe `/reload-plugins` en esa sesión (o abre una sesión nueva). Para comprobarlo, en el terminal escribe `/plugin`: bajo las pestañas aparece una línea con los mods activos (por ejemplo `3 mods active · …`) y `mods-abogados` tiene que estar entre ellos.

Si prefieres tocar el código, clona el repositorio y añade la carpeta clonada como marketplace (`claude plugin marketplace add <ruta>`): Claude Code lee entonces el plugin **desde esa carpeta** y, si editas un archivo, basta `/reload-plugins`.

### Opción B · Probar sin instalar (una sola sesión)

```bash
claude --plugin-dir "./mods-abogados"
```

### Activar o desactivar cada mod

Cada mod es una opción del plugin (`mod_plazos`, `mod_citas`, `mod_cuenta_atras`, `mod_color_cliente`), todas activadas. Se cambian en `/config` (una fila por mod) o desde la terminal:

```bash
claude plugin configure mods-abogados@mods-derecho-virtual
```

Tras cambiar una opción, `/reload-plugins` o sesión nueva.

---

## 3. Uso

### Solo en sesiones de trabajo jurídico

Orden de Carlos: «cuando no esté trabajando con clientes ni con escritos judiciales, no debería aparecer». Por eso:

- **El cliente activo es de cada sesión.** Ya no se guarda en un archivo común que salía en todas las sesiones, también en las de marketing. Se guarda en la memoria de la sesión: sigue ahí tras `/reload-plugins`, pero no pasa a otras sesiones.
- **El cliente se elige solo** cuando abres Claude **dentro de la carpeta de un expediente**, o cuando Claude empieza a trabajar en la carpeta de un cliente. En este segundo caso sale un aviso y `/cliente-ninguno` lo quita.
- **La banda del despacho solo sale en una sesión jurídica**. Una sesión es jurídica cuando:
  - se abre en la carpeta de un expediente;
  - tiene cliente;
  - consulta Jurisprudenciator;
  - redacta, monta o entrega un escrito (demanda, recurso…);
  - o usa un comando del plugin (`/plazos`, `/citas`, `/cliente`, `/ficha`…).
- **En cualquier otra sesión no sale nada del despacho**: ni cliente, ni color, ni fondo, ni plazos, ni el aviso de plazos al empezar. Si quieres ver los plazos en una sesión cualquiera, `/plazos` la convierte en jurídica.

### La banda encima del prompt: una o dos líneas, nunca más

Todos los mods comparten la banda y **no la llenan**:

```text
 ● García · 0123/2026   ⏳ Contestación a la demanda · 2 días hábiles · mié 11/11   § 2 citas por verificar   ⚖ Quedan 2/10 hoy
✅ Escrito terminado: «Demanda de desahucio por falta de pago · López»   [ Siguientes pasos ]   Ahora no
```

Con el chat estrecho (un panel abierto al lado), las mismas dos filas, más cortas:

```text
 ● García   ⏳ 2 días   § 2 citas
✅ Escrito terminado   [ Siguientes pasos ]   Ahora no
```

- **Línea de estado**: pastillas cortas que se pulsan (cliente → selector; avisos de la ficha → `/ficha`; plazo → panel de plazos; citas → panel de citas; cupo → resumen). Lo que no tiene nada que decir **no ocupa sitio**: sin plazos no hay pastilla de plazo, el cupo solo sale cuando queda poco, las citas solo tras una respuesta con citas.
- **Línea de acción**, solo cuando hay algo que hacer y **una sola cosa cada vez**: «Siguientes pasos» o el botón del contrario con un escrito terminado; si no, el aviso de Anonimizator con su botón; si no, cómo ver un panel que no cupo. Mientras la ocupa un escrito terminado, Anonimizator es una pastilla corta en la línea de estado («🔒 Copia anonimizada ✓», «🔒 Conectar Anonimizator»). El texto se encoge; los botones, nunca.
- El **aviso de expediente cruzado** sustituye a la pastilla del cliente (`⚠ En García, tocando López`) y se quita solo con tu siguiente mensaje; la ruta exacta va en el aviso emergente.
- **Nunca más de dos filas y nada se sale por la derecha.** Cada pastilla tiene tres tamaños; si no caben todas, se encoge primero lo que menos se echa de menos (el número de expediente, el nombre del escrito del plazo…) y, si aun así no caben, se quita la menos importante (el orden es: cliente, avisos de la ficha, plazo, citas, Anonimizator y cupo). Las pastillas no bajan de línea.
- **El plazo de la banda es el del cliente activo.** Con un cliente elegido solo se enseñan sus plazos (si no tiene, no hay pastilla): el plazo vencido de otro asunto confunde más que ayuda. Sin cliente, el más urgente del despacho, sin los vencidos de hace más de una semana. El panel `/plazos` los enseña siempre todos.
- Lo que dibujen otros mods (por ejemplo, el equipo jurídico) va debajo.

### Mod 1 · Panel de plazos procesales

| Comando | Qué hace |
| :- | :- |
| `/plazos` | Abre el panel **y saca los plazos del escrito** de la conversación (el adjunto, la ruta o el texto pegado): Claude lo lee y la pestaña **Del escrito** los enseña. Si ya hay un escrito analizado, lo enseña sin volver a pedirlo. Nunca cierra el panel. |
| `/plazos C:\casos\providencia.pdf` (o `/plazos-escrito …`) | Lo mismo, con ese archivo (PDF, Word o texto). |
| `/plazos cerrar` | Cierra el panel. |
| `/plazo-nuevo` | Sin nada más, abre un **formulario** en el panel con vista previa del vencimiento mientras escribes. |
| `/plazo-nuevo García c. Aseguradora Ficticia \| Contestación a la demanda \| civil \| 14/10/2026 \| 20 \| García` | Lo registra directamente: asunto, tipo, jurisdicción (`civil`, `contencioso`, `laboral`/`social`, `penal`), fecha de notificación, días hábiles y, opcional, cliente. Añade `\| urgente` para marcar la excepción legal (agosto y 24 dic–6 ene hábiles: despido, derechos fundamentales…). |
| `/plazo-nuevo ejemplo` | Carga 5 plazos **ficticios** calculados respecto a hoy (uno verde, uno ámbar, uno rojo, uno vencido…). Hazlo justo antes de grabar. |
| `/plazo-borrar` | Abre el panel para elegir qué plazo borrar (botón ✕ en cada fila). |
| `/plazo-borrar 3` o `/plazo-borrar López` | Prepara el borrado del plazo n.º 3 de la tabla (o del que encaje con el texto) y pide **confirmación** en el panel. Lo borrado no se pierde: queda en `papelera` dentro de `data/plazos.json`. |

**Pestañas** (con el panel enfocado, teclas `1` a `4`; la activa va resaltada):

- **Del escrito** (lo que pidió Carlos: «una interfaz con todos los plazos clave de un escrito judicial, lo más visual posible»):
  - en la app de escritorio, un **cartel** azul marino con **lo primero que vence** en grande (la cuenta atrás, el título, «Vence el viernes 13 de noviembre de 2026», el artículo y a quién afecta), el recuento por urgencia (vencidos, esta semana, con margen) y un **calendario** con cada plazo en su día; se lee igual con la app en claro y en oscuro;
  - debajo, **una tarjeta por plazo**, con el borde del color de su urgencia y la cuenta atrás en grande («4 · días hábiles», «HOY», «VENCIDO»): qué hay que hacer, cuándo vence y desde cuándo se cuenta, el artículo que lo fija, a quién afecta y la **frase literal** del escrito de la que sale;
  - el plugin **repasa cada fecha** con los festivos y las reglas del despacho; si no coincide con la de Claude, la tarjeta lo avisa («Con los festivos del despacho saldría el…: compruébalo»);
  - **Guardar en «Mis plazos»** pasa un plazo de días hábiles a la tabla, con el cliente activo; *Analizar otro escrito* y *Quitar de aquí* al pie;
  - en el terminal, lo mismo en texto (sin el cartel).
- **Mis plazos**: tabla ordenada por vencimiento con asunto, tipo, notificación, vencimiento y lo que queda (● verde, ● ámbar, ● rojo, **VENCIDO**). **Con un cliente activo, primero «De García» con los suyos y después, atenuado, «Resto del despacho»**; el número de cada fila (para `/plazo-borrar 2`) es el que se ve. Botones: *Nuevo plazo* (`n`), *Cargar ejemplos* (`e`), *Recargar* (`r`); en la app de escritorio la tecla va en una chapa junto al botón y la etiqueta no la repite.
- **Calculadora**: escribe la fecha de notificación y los días y verás el desglose: cada día hábil numerado y cada día que no cuenta con su motivo (sábado, domingo, festivo, agosto, 24 dic–6 ene). Todo agosto aparece en una línea. Botón *Guardar como plazo*.
- **Festivos**: los festivos cargados y las reglas de cómputo, para que compruebes los de tu localidad (se guardan en `config/festivos.json` y `config/computo.json`).

Siempre se ve la nota: *«Cálculo orientativo. Verifica el plazo según la norma aplicable y el calendario de tu órgano judicial.»*

**Reglas de cómputo** (configurables, ver §4):

- El día de la notificación no cuenta: se empieza al día siguiente.
- No cuentan sábados, domingos ni los festivos de `config/festivos.json` (arts. 182.1 LOPJ y 130.2 LEC).
- Agosto y del 24 de diciembre al 6 de enero inhábiles en civil, contencioso y laboral (art. 183 LOPJ, red. LO 14/2022; arts. 130.2 LEC, 128.2 LJCA, 43.4 LRJS). En penal, hábiles para la instrucción (art. 201 LECrim). Excepción por plazo con `urgente` o la casilla del formulario.
- Opcional, **desactivado** por defecto: margen hasta las 15:00 del día hábil siguiente (art. 135.5 LEC, presentación telemática por LexNET).

### Mod 2 · Revisor de citas legales

Cuando Claude termina de responder, aparece en la banda **`§ 2 citas por verificar`**, del color de la peor (ámbar o rojo), o **`§ 5 citas verificadas`** en verde. Al pulsarla se abre el detalle; si hay sitio, al lado sale **Pedir verificación**.

- **Verde (verificada)**: la cita aparece en el resultado (o en la consulta) de una **herramienta de verificación usada en ese mismo turno**, por ejemplo `buscar_por_cita` o `buscar_articulo` de Jurisprudenciator. El panel dice de qué herramienta salió.
- **Ámbar (sin verificar)**: el formato es correcto, pero ninguna consulta del turno la respalda: es texto escrito por el modelo.
- **Rojo (sospechosa)**: formato imposible o sospechoso: año futuro, fecha que no existe (31 de febrero), artículo por encima del último de la norma (p. ej. art. 2500 CC), ECLI mal formado, STC anterior a 1981, año del número distinto del de la fecha.

`/citas` abre el panel con cada cita, su estado y el motivo. Botones:

- **Pedir verificación** (`v`): envía a Claude un mensaje con las citas ámbar y rojas para que las compruebe con las herramientas configuradas. Esa respuesta vuelve a pasar por el semáforo.
- **Copiar petición** (`c`): copia ese mensaje; si no hay portapapeles disponible, lo deja escrito en el cuadro de texto para que lo revises antes de enviarlo.

**El mod no sabe Derecho y no lo finge**: no comprueba que una sentencia diga lo que Claude afirma; solo enseña qué citas tienen respaldo en una consulta real y cuáles no.

Qué detecta: `art. 24 CE`, `artículo 1902 del Código Civil`, `arts. 399 y ss. LEC`, `art. 14 de la Ley 35/2015`, `STS 123/2020`, `STS de 12 de marzo de 2020`, `SAP Madrid, sec. 14.ª, de 5 de mayo de 2021`, `STC 31/2010`, `ATS 512/2022`, `Sentencia del Tribunal Supremo de 3 de mayo de 2019`, `ECLI:ES:TS:2020:1234`, `rec. 1234/2019`, `ROJ: STS 4786/2014`, `Id Cendoj: …` (20 dígitos). Una sigla sola sin número ni fecha («la STS») no se cuenta: no es comprobable.

De dónde saca el texto: la respuesta final del turno (`e.answer` de `turn.complete`), los demás textos de Claude de ese turno (`$.session.messages()`) y, si `analizarArchivosEscritos` está activo, lo que Claude escribe en archivos con `Write`/`Edit`/`MultiEdit` durante el turno.

### Mod 3 · Cuenta atrás de plazo

Pastilla en la banda con el plazo más urgente (se pulsa para abrir el panel de plazos):

```text
⏳ García c. Aseguradora Ficticia · 3 días hábiles · mié 11/11  +4 más        (sin cliente activo)
⏳ Contestación a la demanda · 3 días hábiles · mié 11/11                      (con García activo: solo los suyos)
```

- Verde con más de 5 días hábiles; ámbar de 2 a 5; rojo con 1 día o el mismo día («vence HOY»); **fondo rojo** si está vencido.
- **Con un cliente activo (Mod 4), solo sus plazos**: si no tiene ninguno, no hay pastilla. Sin cliente, los de todo el despacho, sin los vencidos de hace más de 7 días (siguen en el panel).
- Se recalcula al empezar la sesión, al cambiar un plazo, al terminar cada turno y cada minuto (el cambio de día se ve sin reiniciar; también recoge cambios hechos a mano en `data/plazos.json`).
- Al empezar la sesión, si hay plazos en rojo o vencidos, salta un aviso emergente.
- Al pulsarla se abre el panel del Mod 1. Sin plazos no ocupa sitio.

### Mod 4 · Un color por cliente

| Comando | Qué hace |
| :- | :- |
| `/cliente` | Abre el selector con los clientes de `config/clientes.json` (teclas `1`–`9`, `0` = ninguno, `n` = nuevo). |
| `/cliente garcia` | Activa directamente: sin tildes ni mayúsculas, parcial o por número de expediente. Si encajan varios, abre el selector filtrado. |
| `/cliente-nuevo Martínez \| 0999/2026 \| expedientes/martinez \| violeta` | Añade un cliente (nombre, expediente, carpeta opcional, color opcional: `#RRGGBB` o un nombre de la paleta). Sin color, se asigna uno **estable** a partir del nombre que no repita el de los 5 clientes más recientes. Sin nada, abre un formulario. |
| `/cliente-ninguno` | Vuelve a la interfaz neutra. |

**Qué cambia de color** (lo que la API de mods permite de verdad):

1. Una pastilla en la banda con fondo del color del cliente: `● García · 0123/2026` (al pulsarla, el selector).
2. El acento de los paneles de los Mods 1 y 2 (cabecera y pestaña activa) y la marca de los plazos en el Mod 3. Los colores de estado (verde, ámbar, rojo) mandan siempre.
3. La línea del spinner («Pensando…») y la línea de ayuda bajo el prompt, que dibuja Claude Code: se les antepone una marca con el color y el nombre del cliente.
4. **Solo en la app de escritorio**: el fondo de toda la ventana (`$.ui.backdrop`) con el color del cliente, con los paneles de Claude Code esmerilados encima. El terminal no dibuja fondos.

El color nunca es la única señal: el nombre del cliente siempre aparece escrito. Los colores de la paleta se han comprobado con contraste WCAG ≥ 4,5 frente al texto que llevan encima.

**Aviso de expediente cruzado**: si un cliente tiene `carpeta` y Claude va a leer, escribir o buscar en la carpeta de **otro** cliente distinto del activo (rutas de Read/Write/Edit/Glob/Grep y comandos de Bash), la pastilla del cliente pasa a *«⚠ En García, tocando López»* y salta un aviso emergente con la ruta. **Solo avisa**: la llamada sigue exactamente igual. El aviso se quita al pulsarlo o con tu siguiente mensaje.

El cliente activo es **de cada sesión**: lo eliges con `/cliente`, se elige solo si abres Claude en la carpeta de un expediente o Claude trabaja en ella, y no pasa a otras sesiones.

### Mod 5 · Contador del cupo de Jurisprudenciator

Jurisprudenciator limita las lecturas por día y por semana según el plan. El mod cuenta lo gastado **en este ordenador**, también por los subagentes (los redactores de una demanda gastan casi todo), y avisa **antes** de agotarlo:

- Un aviso emergente si la siguiente consulta no cabe en lo que queda («esta consulta gasta 4 y hoy solo quedan 3»).
- Otro al entrar en la zona de aviso (quedan 3 o menos) y otro si se lanza un subagente con el cupo casi agotado.
- La pastilla `⚖ Quedan 2/10 hoy` solo aparece cuando queda poco (ámbar) o no queda (rojo).

Cómo cuenta (editable en `config/cupo.json`): `leer_sentencias` 1 por sentencia pedida; `buscar_articulo` 0,5; `buscar_sentencias` y `buscar_por_cita` 0. Las herramientas se reconocen por su nombre, sea cual sea el conector (también el de claude.ai, que se llama con un código).

**Límites.** Parte de los del plan Gratis (10 al día, 30 a la semana) y se corrige solo:
- si Jurisprudenciator sigue respondiendo después de pasar el límite, ese límite no era el real: lo dice una vez y deja de avisar con él;
- si Jurisprudenciator contesta «cupo agotado», lo apunta (y aprende los límites si el mensaje los trae).

| Comando | Qué hace |
| :- | :- |
| `/cupo` | Lo gastado hoy y esta semana, los límites y de dónde salen, y las últimas consultas. |
| `/cupo 50 200` | Fija tu límite diario y semanal. |
| `/cupo sin limite` | Deja solo el contador, sin avisos. |
| `/cupo reiniciar` | Pone a cero lo de hoy (si consultaste en otro sitio y quieres empezar de nuevo). |

No ve lo consultado desde otros equipos, la web o el Mac. Nunca bloquea una consulta: solo avisa.

### Mod 6 · Que lo ataque el contrario

Solo aparece con el escrito **terminado**: cuando el ensamblador de la redacción rápida acaba con `"ok": true` y sin errores, o cuando Claude te entrega un Word o PDF con nombre de escrito (demanda, recurso, contestación, querella…). La línea sale al acabar ese turno; mientras se corrige (otro ensamblado) se oculta.

Al pulsar **Que lo ataque el contrario**, Claude lanza un subagente con la descripción «Atacar el escrito como la parte contraria» (con el mod equipo jurídico, en la oficina aparece **Rufino**, el abogado rival) que hace de abogado de la otra parte: excepciones procesales, hechos sin prueba, fundamentos débiles, jurisprudencia citada cuyo **fallo** pueda volverse en contra y jurisprudencia contraria (leída con Jurisprudenciator). Devuelve los ataques ordenados por riesgo, con cómo reforzar el escrito, y guarda `ataque-de-la-contraria.md` junto al Word. **No toca el escrito.** Sus búsquedas gastan cupo de Jurisprudenciator.

**Rápido y corto** (desde la v1.6.0): se le pide un informe de una página, con seis ataques como mucho, un máximo de seis consultas a Jurisprudenciator y entre tres y cuatro minutos; si no le da tiempo, entrega lo que tenga. La petición no se envía dos veces aunque se pulse dos.

**Ahora no** oculta la línea; si no se usa, se va sola a los dos mensajes. `/contrario` deja la petición escrita en el cuadro de texto para el último escrito terminado (pulsa Intro para enviarla).

### Mod 10 · Siguientes pasos

Al **terminar** un escrito, y solo en una sesión de trabajo jurídico, se abre un panel con las **tres peticiones más probables**. Por ejemplo:

```text
 ➡  SIGUIENTES PASOS · «Demanda de desahucio por falta de pago lopez»
López · 0456/2026 · Demanda de desahucio. Ordenadas por Claude para este escrito, con lo que sueles elegir.
[ 1. Preparar la vista del juicio verbal ]
   Si hay oposición, la vista se celebra como mucho en un mes desde la citación (art. 440 LEC)…
   ⏳ La vista, dentro de un mes desde la citación (art. 440 LEC)
[ 2. Pedir la ejecución de las rentas tras el decreto ]
[ 3. Carta al cliente explicando el escrito ]
[ ⚔ Que lo ataque el contrario (c) ]   [ Ninguno (0) ]
```

- **Al pulsar una opción** (o las teclas 1, 2 y 3) se envía a Claude la petición completa, como si la escribieras tú: la actuación, el cliente y el expediente, la ficha (procedimiento, cuantía, procurador, MASC) y el escrito recién hecho. Así el equipo jurídico arranca sin más preguntas.
- **Cada opción** lleva su porqué y, si lo hay, su plazo («5 días desde el traslado de la contestación (art. 438.8 LEC) · si el traslado fuera hoy, vencería el lun 16/11»), calculado con las funciones del Mod 1.
- **«Que lo ataque el contrario»** va dentro de este panel, y no en la banda. Mientras hay siguientes pasos, la banda solo dice «✅ Escrito terminado: «…» [Siguientes pasos] Ahora no».
- **El panel se retira** al pulsar «Ninguno» o en cuanto escribes otra cosa. `/siguientes` lo vuelve a abrir mientras siga pendiente.

**Cómo se eligen las tres:**

1. Una **tabla** por tipo de escrito, en `config/siguientes.json`. Por ejemplo:
   - demanda de desahucio → preparar la vista, ejecución de las rentas tras el decreto y carta al cliente;
   - demanda de verbal → proposición de prueba (5 días, art. 438.8 LEC);
   - demanda de ordinario → audiencia previa (art. 414 LEC);
   - recurso de apelación → oposición de la contraria (10 días, art. 461 LEC);
   - burofax → demanda si no responde (30 días naturales, art. 10.4.a LO 1/2025).
2. **Claude con el modelo pequeño** (haiku) las ordena y concreta para este escrito, con la ficha y el principio del texto. Hace **una sola llamada por escrito terminado**, que se guarda: el bucle de correcciones no vuelve a preguntar. **Gasta un poco de uso**, una llamada corta.
3. Tu **historial**: lo que eliges otras veces sube puestos. Se guarda entre sesiones, solo como recuentos.
4. **Si el modelo falla**, se muestran las tres primeras de la tabla, con tu historial.

> ⚖️ La tabla es orientativa y debe validarla un abogado. Sus plazos y artículos se comprobaron el 09/11/2026 con el texto vigente en Jurisprudenciator (arts. 407, 414, 438, 440, 458 y 461 LEC; art. 10 LO 1/2025).

### Mod 9 · Copia anonimizada con Anonimizator

> 🔒 **Qué hace el Mod 9 y qué no.** Crea una **copia anonimizada** del escrito, para compartirlo, publicarlo, archivarlo o pasárselo a otra IA. **El original no se toca**, porque al juzgado van los nombres reales. Con el conector de **URL personal**, el texto va de Claude a Anonimizator, que lo procesa en la UE sin guardarlo. No oculta nada a Claude, que ya ha escrito el escrito. Si un documento no debe salir del ordenador, usa el **conector local** o la aplicación de escritorio de Anonimizator: si el conector local está, el mod lo usa con el Word. Nunca guarda ni enseña un dato personal: solo recuentos.

**Viene apagado**, porque a muchos abogados no les hace falta. Se enciende en `/plugin` → mods-abogados → «Mod 9 · Copia anonimizada con Anonimizator».

**Requisito: el conector de Anonimizator en Claude.** Copia tu URL personal en **anonimizator.org/conector** y añádela en Claude → Ajustes → Conectores → «Añadir conector personalizado». El conector necesita un **plan de pago** de Anonimizator. Sin el conector, el mod no hace nada hasta que hay un escrito con datos. Entonces la línea de acción dice «🔒 «Demanda…»: 2 nombres y 1 DNI · conecta Anonimizator», con un botón **Cómo conectarlo**.

**Cómo funciona:**

1. Mientras Claude redacta, el mod solo apunta qué escrito se está haciendo: el Word que se monta, un escrito que te entrega o un borrador que escribe.
2. **Al acabar el turno**, en segundo plano para no frenar a Claude, lee el texto del escrito y busca datos personales: DNI y NIE con su letra, cuentas bancarias, teléfonos, correos y nombres con tratamiento («DON ANDRÉS…», «D.ª Lucía…»). **Si no hay ninguno, no manda nada.**
3. Si hay datos, lo pasa **directamente** al conector de Anonimizator y guarda `escrito.ANONIMIZADO.md` al lado del original. Después pasa el control de calidad de Anonimizator (`verificar_anonimizado`).
4. La línea de acción dice, por ejemplo, «🔒 Copia anonimizada: 9 datos sustituidos · verificada». El botón **Word anonimizado** pide a Claude el Word a partir de la copia; Claude trabaja solo con ese texto ya anonimizado.
5. Con el **conector local** de Anonimizator, el mod le pasa directamente el **Word**. Se anonimiza en el ordenador y se guarda `….ANONIMIZADO.docx`.

Cada envío cuenta en tu plan de Anonimizator, así que el mismo texto no se manda dos veces. Los errores salen en llano, por ejemplo «Tu plan de Anonimizator no incluye el conector: hace falta un plan de pago». `/anonimizar` dice qué conector tienes y vuelve a anonimizar el último escrito; `/anonimizar <ruta>` anonimiza el que le indiques (`.md` con el conector de URL personal, `.docx` o `.pdf` con el local).

### Mods 7 y 8 · Ficha del expediente: Semáforo MASC y procurador

> ⚖️ **Las reglas de los Mods 7 y 8 son orientativas y debe validarlas un abogado.** Están en `config/masc.json` y `config/postulacion.json` (no en el código). Se comprobaron el 09/11/2026 con el texto vigente del art. 5 y del art. 10 de la LO 1/2025 y de los arts. 23 y 31 LEC (redacción de la LO 1/2025) en Jurisprudenciator, pero cada despacho debe revisarlas antes de fiarse de ellas. Los mods solo avisan: nunca bloquean una demanda.

Cada expediente tiene una **ficha** en `data/fichas.json` (por número de expediente): procedimiento, cuantía, procurador e intento de negociación previa. Se edita en el panel **`/ficha`** del cliente activo.

**Mod 7 · Semáforo MASC.** En el orden civil, la demanda exige haber acudido antes a un medio adecuado de solución de controversias (art. 5.1 LO 1/2025), salvo las materias del art. 5.2 y 5.3, y el intento debe constar en un documento (art. 10). Cuando Claude **escribe una demanda en la carpeta del expediente activo**, el mod mira la ficha. Cuentan como demanda un `Write`/`Edit` sobre un archivo o carpeta con «demanda» en el nombre, las secciones de la redacción rápida y el ensamblado del Word. No cuentan una contestación ni una demanda ejecutiva. Si a la ficha le falta el medio, la fecha o el documento, sale **`⚠ Sin MASC acreditado`** y un aviso emergente. En `/ficha` hay tres botones, **Burofax (b)**, **Mediación (m)** y **Oferta vinculante (o)**, y los campos fecha, documento y nota. También se puede registrar en una línea: `/masc burofax | 25/09/2026 | DOC. 5 · burofax y certificado de entrega | sin respuesta`. Si la materia está exceptuada (juicio cambiario, tutela sumaria de la posesión…), se marca `excepcionMasc` en la ficha. Los clientes de otros órdenes (laboral, penal, contencioso) no se avisan. **El desahucio por falta de pago no está entre las excepciones.**

**Mod 8 · Procurador.** La regla está en `config/postulacion.json`, por procedimiento:

| Procedimiento | ¿Procurador? | Fundamento |
| :- | :- | :- |
| Juicio ordinario | Sí | Arts. 23.1 y 31.1 LEC |
| Verbal por razón de la **cuantía** | No si la cuantía **no excede de 2.000 €**; sí si la supera | Arts. 23.2.1.º y 31.2.1.º LEC |
| Verbal por razón de la **materia** (desahucio, precario…) | **Sí, sea cual sea la cuantía** | La exención solo alcanza a los verbales por cuantía |
| Petición inicial del monitorio | No | Arts. 23.2.1.º y 31.2.1.º LEC |
| Medidas urgentes antes del juicio | No | Arts. 23.2.3.º y 31.2.2.º LEC |
| Ficha sin procedimiento | Solo avisa si la cuantía supera 2.000 € | `umbralSinProcedimiento` |

Si hace falta y la ficha no tiene procurador: **`⚠ Postulación obligatoria (arts. 23 y 31 LEC)`**. Los dos avisos comparten **una sola pastilla** («⚠ Sin MASC acreditado · Sin procurador (arts. 23 y 31 LEC)»), que solo aparece cuando aplica y al pulsarla abre `/ficha`.

**Datos de demostración** (ficticios): López (0456/2026), desahucio por falta de pago con burofax del 25/09/2026 entregado el 28/09, con oferta de pago en dos plazos y sin respuesta, y procurador: **no avisa**. García (0123/2026), verbal de 2.340 € sin procurador ni MASC acreditado: avisa del procurador al activarlo y del MASC al escribir su demanda.

---

## 4. Configuración

Todos los archivos están en la carpeta del plugin. Tras editarlos, pulsa **Recargar** en el panel de plazos o haz `/reload-plugins`.

| Archivo | Para qué | Notas |
| :- | :- | :- |
| `config/festivos.json` | Festivos que no cuentan | Trae las fiestas **nacionales** de 2026 y 2027 (art. 45.1 RD 2001/1983). **Añade las de tu comunidad autónoma y tu municipio**, y el lunes que tu comunidad traslade cuando una fiesta cae en domingo. Fuente: Resolución anual de la Dirección General de Trabajo en el BOE (2026: BOE-A-2025-21667; 2027: BOE-A-2026-21254) y el boletín autonómico o provincial. Formato `{ "fecha": "AAAA-MM-DD", "nombre": "…", "ambito": "…" }`. |
| `config/computo.json` | Reglas por jurisdicción | `jurisdicciones.<civil\|contencioso\|laboral\|penal>.agostoInhabil` y `.navidadInhabil` (24 dic–6 ene); `lexnet15h` (margen del art. 135.5 LEC, `false` por defecto); `umbrales` de color (verde con más de `verdeMasDe`, ámbar desde `ambarDesde`). |
| `config/revisor.json` | Revisor de citas | `herramientasVerificacion`: trozos del nombre de las herramientas que cuentan como respaldo (sin distinguir mayúsculas; valen para cualquier servidor MCP) o expresiones regulares entre barras, p. ej. `"/^mcp__mi_servidor__/"`. `excluirHerramientas`: las que nunca cuentan. `analizarArchivosEscritos`. `leyes`: siglas y nombres que reconoce tras «art.», con su `maxArticulo` (último artículo, comprobado el 08/11/2026 con el BOE consolidado) para marcar en rojo un artículo imposible. |
| `config/clientes.json` | Clientes y colores | Trae 30 clientes **ficticios** de los casos de demostración de los vídeos y clases (septiembre-noviembre de 2026). Campos: `nombre`, `expediente`, `asunto`, `jurisdiccion`, `carpeta` (opcional; absoluta o relativa a la carpeta donde abres Claude Code) y `color` (opcional). En el selector, el campo «Buscar» filtra por nombre, expediente, asunto o jurisdicción. |
| `data/plazos.json` | Plazos (Mods 1 y 3) | Lo editan los comandos; también a mano. Los borrados van a `papelera`. |
| `config/cupo.json` | Cupo de Jurisprudenciator | `limitesIniciales` (diario y semanal), `avisarCuandoQueden`, `pesos` por herramienta (`"porCita"` = 1 por sentencia). |
| `config/masc.json` | Semáforo MASC (Mod 7) | Órdenes en que se exige, trozos de ruta que indican una demanda o la excluyen, medios y excepciones del art. 5.2 y 5.3. **Debe validarlo un abogado.** |
| `config/postulacion.json` | Procurador (Mod 8) | Reglas por procedimiento (`exento`, `exentoHasta`, `fundamento`) y el umbral sin procedimiento. **Debe validarlo un abogado.** |
| `data/fichas.json` | Fichas de expediente | Las editan `/ficha` y `/masc`; también a mano. Trae las fichas ficticias de López y García. |
| `config/siguientes.json` | Siguientes pasos (Mod 10) | Tipos de escrito (trozos del nombre o procedimiento de la ficha) y, para cada uno, las actuaciones en orden; cada actuación con etiqueta, porqué, plazo y la petición que se envía. **Debe validarla un abogado.** |
| `data/cupo.json` | Cuenta del cupo | La lleva el Mod 5 por día (hora de Madrid) y semana; la comparten las sesiones de este ordenador. `/cupo` para verla o corregirla. |

**Añadir tus herramientas de verificación.** Mira el nombre de la herramienta en `/mcp` o en la línea de la llamada (p. ej. `mcp__mi-bd-juridica__consultar_norma`) y añade a `herramientasVerificacion` un trozo (`"consultar_norma"`) o una expresión regular (`"/^mcp__mi-bd-juridica__/"`).

---

## 5. A qué accede cada mod

`claude plugin validate ./mods-abogados` lista lo que el código pide a Claude Code. Este plugin solo usa: `$.fs.read`, `$.fs.exists`, `$.fs.write`, `$.clock.now`, `$.clock.every`, `$.command.register`, `$.session.messages`, `$.prompt.submit`, `$.prompt.fill`, `$.ui.*` (dibujar, abrir/cerrar paneles, avisos, portapapeles, fondo). **No usa `$.http` (red), ni `$.process` (programas), ni `$.env`.** El **Mod 10** usa `$.model` para una llamada corta al modelo pequeño por escrito terminado (gasta un poco de uso). La única salida es la del **Mod 9**, apagado por defecto. Mira qué herramientas tiene la sesión (`$.tool.list`) y llama a **tu** conector de Anonimizator (`$.mcp.call`) con el texto del escrito.

| Mod | Lee | Escribe | Ve de la sesión |
| :- | :- | :- | :- |
| Común | `config/festivos.json`, `config/computo.json`, `config/revisor.json`, `config/clientes.json`, `data/plazos.json` | La memoria de la sesión (cliente activo y si la sesión es jurídica) | La carpeta de la sesión (para resolver rutas y saber si es la de un expediente) y qué herramientas y comandos se usan, solo para saber si la sesión es jurídica |
| 1 · Plazos | `data/plazos.json` | `data/plazos.json` | Nada |
| 2 · Citas | — | — | El texto de las respuestas de Claude del turno, los argumentos y el resultado de las herramientas de verificación configuradas y el texto que Claude escribe con Write/Edit. Solo en memoria; no se guarda. «Pedir verificación» envía un mensaje a Claude **solo** cuando pulsas el botón. |
| 3 · Cuenta atrás | `data/plazos.json` | — | Nada |
| 4 · Cliente | — | `config/clientes.json` (al añadir clientes) | Las rutas y comandos de las llamadas a herramientas, solo para comparar con las carpetas de los clientes |
| 5 · Cupo | `config/cupo.json`, `data/cupo.json` | `data/cupo.json` | El nombre y los argumentos de las llamadas a Jurisprudenciator (y si son de un subagente) y, solo si el resultado es corto o de error, su texto para reconocer el aviso de «cupo agotado» |
| 10 · Siguientes | `config/siguientes.json`, la ficha y el principio del escrito terminado | El historial de elecciones y las respuestas ya pedidas al modelo (memoria entre sesiones del plugin; solo identificadores y recuentos) | Las órdenes que montan un escrito y los archivos que te entrego. Pide al modelo pequeño UNA ordenación por escrito y envía la petición a Claude **solo** cuando pulsas una opción |
| 9 · Anonimizar | El texto (`.md`) del escrito terminado y la lista de herramientas de la sesión | La copia `….ANONIMIZADO.md` al lado del original (nunca en la carpeta del plugin) | Las rutas de los escritos que Claude escribe o monta. Envía el texto a **tu** conector de Anonimizator solo si tiene datos personales; no guarda ni muestra ningún dato, solo recuentos |
| 7 y 8 · Ficha | `config/masc.json`, `config/postulacion.json`, `data/fichas.json` | `data/fichas.json` | Las rutas de las llamadas de escritura (y las órdenes de ensamblado), solo para saber si Claude escribe una demanda del expediente activo |
| 6 · Contrario | — | — | Las órdenes de Bash/PowerShell que ensamblan un escrito y su resultado, y los archivos que Claude te entrega. Envía un mensaje a Claude **solo** cuando pulsas el botón |

Ningún mod bloquea ni modifica llamadas a herramientas: el único `tool.call` del plugin pasa siempre el evento original a `next(e)` y devuelve su resultado tal cual. Todo hook tiene `try/catch` y un `.catch`: si algo falla, Claude Code lo omite y la sesión sigue.

---

## 6. Cómo está hecho

| Archivo | Contenido |
| :- | :- |
| `.claude-plugin/plugin.json` | Manifiesto, opciones para activar cada mod, icono |
| `hooks/hooks.json` | `"modules": ["./register.tsx"]` (la API admite un solo módulo por plugin) y un `"hooks": {}` vacío para que las versiones anteriores a los mods no marquen el plugin como «failed to load» |
| `hooks/register.tsx` | Entrada: carga común, eventos compartidos (`session.start`, `tool.call`, `turn.start`, `turn.complete`) y la banda encima del prompt |
| `hooks/plazos-panel.tsx` | Mod 1 |
| `hooks/plazos-escrito.tsx` | Mod 1 · pestaña «Del escrito»: la herramienta que recibe los plazos, el cartel y las tarjetas |
| `hooks/revisor-citas.tsx` | Mod 2 |
| `hooks/cuenta-atras.tsx` | Mod 3 |
| `hooks/color-cliente.tsx` | Mod 4 |
| `hooks/cupo.tsx` | Mod 5 |
| `hooks/contrario.tsx` | Mod 6 |
| `hooks/ficha.tsx` | Mods 7 y 8 (y el panel `/ficha`) |
| `hooks/anonimizar.tsx` | Mod 9 |
| `hooks/siguientes.tsx` | Mod 10 (y el panel «Siguientes pasos») |
| `hooks/lib/plazos.ts` | Cálculo de días hábiles: funciones puras |
| `hooks/lib/citas.ts` | Detección y semáforo de citas: funciones puras |
| `hooks/lib/cupo.ts` | Cuentas del cupo: funciones puras |
| `hooks/lib/siguientes.ts` | Tipos de escrito, candidatas, historial, respuesta del modelo y petición: funciones puras |
| `hooks/lib/anonimizar.ts` | Datos personales, conector de Anonimizator y texto del escrito: funciones puras |
| `hooks/lib/expediente.ts` | Ficha, MASC y procurador: funciones puras |
| `hooks/lib/escritos.ts` | Cuándo está terminado un escrito y la petición del contrario: funciones puras |
| `hooks/lib/colores.ts`, `hooks/lib/texto.ts` | Paleta y contraste; utilidades de texto y rutas |
| `hooks/lib/estado.ts` | Lo que comparten los mods (plazos, cliente activo, color de acento, configuración) |
| `hooks/sesion.ts` | Si la sesión es jurídica y el cliente de cada sesión |
| `types/index.d.ts` | Lo que se guarda en la memoria de cada sesión |
| `tests/*.test.ts(x)` | 108 pruebas automáticas |

**Cambios respecto a la estructura pedida y por qué** (manda la documentación de mods):

1. `hooks/hooks.json` admite **un único módulo**: `register.tsx` es la entrada y cada mod sigue en su archivo; se activan por separado con las opciones del plugin, no quitando archivos.
2. Un mismo evento sin filtro solo puede registrarse **una vez** por plugin: `session.start`, `tool.call`, `turn.start` y `turn.complete` se registran en `register.tsx`, que llama a las funciones de cada mod.
3. Se añadió `config/computo.json` (reglas por jurisdicción, LexNET, umbrales) para no mezclarlo con los festivos.
4. No existe un elemento «pestañas»: las pestañas son botones; la activa va subrayada y en el color de acento.

Eventos y componentes usados: `session.start`, `command.run` (13 comandos), `tool.call` (solo observación), `turn.start`, `turn.complete`, `ui.close`, `ui.render` en `Pane` (3 paneles), `AbovePrompt` (banda), `Spinner`, `PromptHint`, `Backdrop`; llamadas `$.ui.open/close/panes/toast/invalidate/copy/backdrop`, `$.command.register`, `$.prompt.submit/fill`, `$.session.messages`, `$.clock.now/every`, `$.fs.read/exists/write`.

---

## 7. Pruebas

Desde la carpeta del plugin:

```bash
claude plugin test
```

```bash
claude plugin validate .
```

Las pruebas cubren el cómputo (fin de semana, festivo, agosto por jurisdicción, fin de año, LexNET desactivado por defecto y activado, ordenación, semáforo, lectura de fechas y argumentos), la detección y el semáforo de citas (con resultados reales de Jurisprudenciator), colores, búsqueda de clientes, aviso de expediente cruzado, el cupo (subagentes, aviso previo, límite corregido, «cupo agotado», `/cupo`), el botón del contrario (no sale con errores ni antes de acabar el turno; «Ahora no»; `/contrario`), el procurador (desahucio de 1.200 € → aviso; verbal por cuantía de 1.500 € → sin aviso; ordinario de 8.000 € → aviso; petición inicial de monitorio → sin aviso; el umbral exacto de 2.000 €), el MASC (acreditado, incompleto, excepciones, orden laboral) y la detección del archivo de demanda (secciones, Word, contestación y demanda ejecutiva excluidas, otro expediente), el recorrido completo en la banda y en `/ficha`, la copia anonimizada (apagada por defecto; sin conector, los pasos; con el de URL personal, el texto exacto, la copia al lado y el original intacto; sin plan de pago, el error en llano; con el local, el Word; sin datos, nada; el mismo escrito, una sola vez; ningún aviso con un dato personal), los siguientes pasos (solo en sesión jurídica y al terminar el escrito; tres opciones; reserva sin modelo; una sola llamada por escrito; el botón envía la petición completa como si la escribiera el abogado; el historial sube puestos; «Ninguno», un mensaje nuevo o el contrario retiran el panel), la regla de **dos líneas como máximo** con todas las señales a la vez, la de **solo en sesiones jurídicas** (marketing: nada; carpeta de un expediente: su cliente; trabajar en la carpeta de un cliente: ese cliente; Jurisprudenciator o un comando: la banda), y el dibujo de la banda y de los tres paneles en las superficies **terminal** y **desktop**.

---

## 8. Limitaciones

- **Terminal estrecha**: un panel que el usuario abre aparece a cualquier anchura; si alguno quedara en espera, la banda (que siempre se ve) explica cómo verlo: ampliar a 110 columnas o usar pantalla completa. Los paneles se acoplan al lado de la conversación en pantalla completa desde 110 columnas; si no, salen encima del prompt.
- **Recolorear**: no se puede cambiar el tema de Claude Code, el marco del prompt ni el aviso de permisos. El fondo de toda la ventana solo lo dibuja la app de escritorio.
- **Citas**: no se ven las citas de documentos que Claude genere con scripts (por ejemplo un `.docx` creado con Python desde Bash); solo el texto del chat y lo escrito con Write/Edit/MultiEdit. Una cita verificada en un turno anterior vuelve a salir ámbar si se repite sin consultarla (por diseño: «en ese mismo turno»). El número de un ROJ de CENDOJ no es el número propio de la sentencia: si Claude cita uno y la consulta devuelve el otro, la cita queda ámbar (nunca verde por error).
- **Varias sesiones a la vez**: `data/plazos.json` se escribe entero; si dos sesiones guardan a la vez, gana la última. Cada minuto se relee el archivo.
- **`claude -p`**: los mods cargan, pero no dibujan, y un `/comando` del plugin no se ejecuta como comando.
- **Parpadeo**: la API no tiene texto parpadeante; el plazo vencido se destaca con fondo rojo.
- **Festivos**: solo trae los nacionales; los autonómicos y locales los añade cada despacho.
- **Cupo**: cuenta lo de este ordenador; no ve lo consultado desde la web, otro equipo o la vía HTTP directa. El peso de `buscar_por_cita` no consta (0 por defecto; cámbialo en `config/cupo.json` si tu plan lo cobra).
- **Copia anonimizada**: es una copia para compartir o publicar; no oculta nada a Claude, porque con el conector de URL personal el texto pasa por Claude. La detección propia (DNI, NIE, cuentas, teléfonos, correos y nombres con tratamiento) solo decide si se llama a Anonimizator: un escrito cuyos únicos datos sean nombres sin «D.»/«Don» no se envía solo (usa `/anonimizar`). No se ha podido probar con el conector real: en este ordenador no está conectado.
- **MASC y procurador**: el mod no lee el escrito; mira la **ficha**. Si la ficha está vacía o mal rellenada, el aviso también lo estará. La detección de «demanda» es por el nombre de la ruta. Las reglas son orientativas y debe validarlas un abogado.
- **Contrario**: un comando no puede enviar un mensaje a Claude mientras se ejecuta; por eso `/contrario` deja la petición en el cuadro de texto y el botón de la banda sí la envía directamente.

Licencia MIT · Derecho Virtual · Datos de ejemplo ficticios.
