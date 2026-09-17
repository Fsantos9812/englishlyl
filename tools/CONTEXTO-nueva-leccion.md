# Contexto: `tools/nueva-leccion.py`

Documento para quien vaya a usar, revisar o modificar el script —persona o IA—
sin haber estado en la conversación donde se armó. Explica qué hace, por qué
está hecho así y qué no hay que romper.

## Qué problema resuelve

Publicar una lección del curso (englishlyl.netlify.app) eran siete pasos a mano:
escribir el Markdown con el número correcto, correr `generar-lecciones.py`,
correr el ensayo de audio, confirmar el costo, generar los audios, revisar que
`git status` no mostrara `index.html` y hacer commit, push y verificar el deploy.
Cada control dependía de que alguien se acordara, y dos ya fallaron alguna vez:
un generador externo pisó `index.html`, y cinco pushes seguidos no llegaron a
producción porque se habían agotado los créditos de Netlify.

El script encadena esos pasos con los controles incluidos. **No reemplaza a los
generadores**: los llama.

### Por qué un script y no n8n o Hermes Agent

Se evaluaron las tres opciones. El usuario trae las frases ya escritas, trabaja
desde la PC y quiere revisar antes de publicar. Con eso:

- no queda nada que un agente tenga que "pensar": todo es determinista;
- n8n agregaría un servidor y obligaría a guardar ahí la clave de Google y el
  acceso a git, en contra de cómo se maneja la clave hoy;
- si algún día hace falta lanzarlo desde el celular o con un horario, n8n o
  Hermes pueden llamar a este mismo script (ver *Cómo extenderlo*).

## Dónde encaja

```
frases.txt ──► nueva-leccion.py
                 │
                 ├─ valida las frases (no escribe nada si hay errores)
                 ├─ git: main, limpio, pull --ff-only
                 ├─ escribe lecciones-md/leccion-NN-tema.md
                 ├─► generar-lecciones.py ──► leccion-NN-tema.html
                 │        └─► generar-manifiesto.py ──► lessons.json, vocabulario.json
                 ├─► generar-audios.py --dry-run   (costo)
                 ├─► generar-audios.py             (solo con un "s") ──► assets/audio/en/*.mp3, audios.json
                 ├─ control de git status (nada ajeno, nunca index.html)
                 ├─ servidor local para revisar
                 └─ publicar (solo con un "s"): git add explícito, commit, push
                          └─► netlify api listSiteDeploys hasta "ready"
```

Documentación relacionada: `README.md` (sección *Agregar una lección*),
`PENDIENTES.md` (notas de operación de Netlify) y la skill
`~/.claude/skills/leccion-con-audio-englishlyl/SKILL.md`, que le indica a Claude
cómo usar el script.

## Uso

```bash
python tools/nueva-leccion.py frases.txt --titulo "En el restaurante" --nivel A1
python tools/nueva-leccion.py frases.txt --titulo "En el restaurante" --nivel A1 --pedir-clave
python tools/nueva-leccion.py --publicar leccion-03-en-el-restaurante
```

| Opción | Qué hace |
|---|---|
| `entrada` | Archivo de frases, `.txt` o `.md`. Es excluyente con `--publicar`. |
| `--titulo`, `--nivel` | Obligatorios, salvo que vengan en el frontmatter. La línea de comandos tiene prioridad sobre el frontmatter. |
| `--publicar ID` | Publica una lección ya generada. Acepta `leccion-NN-tema`, con `.html` o `.md` o sin extensión. |
| `--sin-pull` | No hace `git pull` antes de numerar. Sirve sin conexión, con riesgo de repetir un número. |
| `--pedir-clave`, `--clave-archivo`, `--con-translate`, `--con-vocabulario`, `--limite` | Pasan sin cambios a `generar-audios.py`. |

Códigos de salida: `0` terminó (publicada o no), `1` se cortó o el deploy falló,
`2` argumentos inválidos, `130` Ctrl+C.

## Formato de entrada

```
## Vocabulario
table = mesa

## Frases
A table for two, please. = Una mesa para dos, por favor.

## Listen and Translate
I am hungry. = Tengo hambre.
```

- Un par `inglés = español` por línea, cortado en el **primer** `=`.
- `## Frases`, o las frases sueltas antes de cualquier sección, van a **Listen and
  Repeat y a Listen and Type a la vez**. Es a propósito: la sesión presenta la
  frase con el Repeat y la pregunta con el Type emparejando por posición, y las
  dos habilidades se olvidan a ritmos distintos (PENDIENTES.md).
- Si tienen que ser distintas, se usan `## Listen and Repeat` y `## Listen and Type`
  por separado, y entonces no puede haber `## Frases`.
- `## Frases` lo entiende **solo este script**. `generar-lecciones.py` no lo
  conoce: el `.md` que queda en `lecciones-md/` ya sale con las cuatro secciones
  canónicas.
- Un frontmatter con `titulo`, `nivel`, `idioma_audio` (por defecto `en-US`) e
  `idioma_audio_es` (por defecto `es-419`) es opcional. Cualquier otra clave, como
  `id`, se descarta: el id lo decide el script.
- El archivo de entrada **no puede** llamarse `lecciones-md/leccion-*.md`, porque
  ese nombre es del generador. Hay un ejemplo en
  `lecciones-md/_frases-ejemplo.txt`; el prefijo `_` hace que ningún generador lo tome.

## El flujo, paso por paso

**[1/6] Frases.** `leer_frases()` junta *todos* los errores antes de cortar:
línea sin `=`, lado vacío, sección desconocida (y lo que tenga debajo), `</script`
(cerraría el bloque de datos), frase en inglés repetida en la misma sección,
`## Frases` mezclado con Repeat o Type, o una lección sin ejercicios. Cada error
sale con su número de línea real, contando el frontmatter. Si hay errores, no se
escribe nada.

**[2/6] Git.** Exige estar en la rama `main`. Corta si hay cambios en archivos
versionados o archivos nuevos que parezcan de un generador (`leccion-*.html`,
`lecciones-md/leccion-*.md`, `assets/`, los manifiestos, `index.html`). Otros
archivos sin versionar, como el propio archivo de frases, no molestan. Después
corre `git pull --ff-only`.

**[3/6] Generar.** El número es el mayor `leccion-NN-` que aparezca en los `.html`
de la raíz y en los `.md` de `lecciones-md/`, más uno. Se miran las dos carpetas
porque la lección 01 no tiene `.md`. El slug sale de `nombre_de()` de
`generar-audios.py`. Se escribe el `.md` y se corre `generar-lecciones.py`. Si
eso falla, `deshacer()` borra el `.md` y el `.html` y vuelve los manifiestos a
`HEAD`. Es seguro hacerlo porque en el paso 2 se exigió git limpio.

**[4/6] Audios.** Corre el ensayo con `--leccion <id>` y lee de su salida
`Audios por generar: N (C caracteres)`. Si no falta ninguno, sigue. Si faltan,
pregunta. Con un sí, corre la generación real con la consola heredada, para que
`--pedir-clave` pueda leer el teclado. Si la generación falla, no es fatal: esas
frases suenan con la voz del navegador, y el script imprime el comando para
reintentar.

**[5/6] Control.** `controlar_archivos()` clasifica cada entrada de `git status`:

- **se sube**: `lecciones-md/<id>.md`, `<id>.html`, `lessons.json`,
  `vocabulario.json`, `audios.json` y los `assets/audio/**.mp3` **nuevos**, siempre
  que no sean borrados;
- **se ignora con aviso**: archivos sin versionar que no son de un generador;
- **corta**: un mp3 ya versionado que aparece modificado o borrado (`assets/` se
  cachea como inmutable un año: un `--force` para cambiar de voz es una tarea
  aparte), y todo lo demás. Si aparece `index.html`, lo explica aparte.

Acepta varios ids (`controlar_archivos(*ids)`), igual que `publicar(*ids, mensaje=)`:
así `tools/nueva-semana.py` sube una semana entera en un solo commit.

**[6/6] Revisión y publicación.** Pregunta si abrir la lección. Si la respuesta es
sí, levanta `python -m http.server` en `127.0.0.1` con un puerto libre, abre el
navegador y espera un Enter. Después pregunta si publicar. Si la respuesta es no,
imprime el comando `--publicar`.

**Publicar** (`publicar()`, también desde `--publicar`): exige `main`, que exista el
`.html` y que el control del paso 5 pase. Hace `git add --` de la lista explícita
y commitea con `Agrega lección NN: Título`, tomando el título del `<title>`.
Luego `git push`. Por último `esperar_deploy()` consulta
`netlify api listSiteDeploys` cada 10 s, durante 180 s como máximo, busca el
deploy cuyo `commit_ref` es el SHA recién pusheado e informa `ready` (salida 0) o
`error`/`rejected`/`skipped` con su `error_message` (salida 1). Si no está la CLI
o no responde, muestra el link del panel en vez de fallar.

## Reglas que no hay que romper al modificarlo

1. **Nunca escribir `index.html`, `assets/` (salvo los mp3) ni `lessons.json` a mano.**
   El índice tiene login, racha y PWA, y la lista de lecciones sale de
   `lessons.json`. El control del paso 5 existe por eso.
2. **Nunca `git add -A`.** `netlify.toml` publica la raíz entera (`publish = "."`):
   un archivo de frases o con la clave que entre al commit queda descargable.
3. **Un fin de archivo en stdin es NO.** `preguntar()` devuelve `False` ante
   `EOFError`. Así un agente o una tarea sin teclado nunca gasta cuota ni publica.
   No se adivina con `isatty()`, que miente en Git Bash y en los agentes
   (`generar-audios.py` documenta el mismo problema).
4. **La clave de Google nunca pasa por este script.** Solo se reenvían las
   opciones; la clave la resuelve `generar-audios.py`.
5. **Validar antes de escribir** y **deshacer si falla la generación**: nada puede
   quedar a medio hacer.
6. **Solo biblioteca estándar de Python**, como el resto de `tools/`.

## Decisiones de diseño

| Decisión | Por qué |
|---|---|
| `nombre_de()` se importa de `generar-audios.py` con `importlib` | Una sola implementación del normalizado: dos copias terminan desincronizadas en silencio. |
| `generar-lecciones.py` se llama con subprocess | Ese archivo ejecuta `main()` al importarse, porque no tiene guard `__main__`. |
| Revisión con servidor local y no con deploy preview | No gasta créditos de Netlify. Las lecciones andan sin login; solo quedan afuera las funciones. El puerto al azar cambia el origen, así que el service worker no sirve copias viejas de otra revisión. |
| `git status --porcelain -z` y `core.quotepath=false` | Las rutas con espacios o acentos llegan tal cual, sin comillas ni escapes octales. |
| `PYTHONIOENCODING=utf-8` en los hijos | Con la salida en un pipe, Python usa cp1252 y los acentos llegan rotos. |
| `sys.stdout.reconfigure(line_buffering=True)` | Sin esto, en un pipe la salida de los hijos aparece antes que los encabezados `[n/6]`. |
| `netlify` se busca con `shutil.which` | En Windows es `netlify.CMD`; con la ruta completa, subprocess lo ejecuta sin `shell=True`. |
| Site id leído de `.netlify/state.json`, con uno fijo de respaldo | Ese archivo está en `.gitignore`: un clon nuevo no lo tiene hasta correr `netlify link`. |
| El commit no lleva `Co-Authored-By` | Lo ejecuta el usuario: el commit es suyo. |
| Una frase duplicada corta en vez de avisar | Casi siempre es un error al pegar, y un aviso se pierde entre el resto de la salida. |

## Uso desde un agente (Claude u otro)

```bash
python tools/nueva-leccion.py lecciones-md/_frases-tema.txt --titulo "..." --nivel A1 < /dev/null
```

El `< /dev/null` es obligatorio: todas las preguntas reciben un NO. El script
genera la lección, muestra el costo y se detiene, sin audios, sin publicar y con
todo sin commitear. Generar audios con `--pedir-clave` lo hace el usuario en su
terminal, porque sin consola real `getpass` se queda esperando. `--publicar` solo
se corre con el visto bueno explícito del usuario.

## Verificado y pendiente

Se probó el 16/09/2026, sin tocar Google ni producción:

- frases con errores: se listaron 5 fallas con su línea y no se escribió nada;
- recorrido completo sin teclado: numeró 03, puso las mismas frases en Repeat y
  Type, mostró 3 audios y 60 caracteres, y no publicó;
- `index.html` modificado: `controlar_archivos()` cortó y lo nombró;
- arranque con una lección a medio hacer, `--publicar` con un id inexistente o
  inválido, archivo de entrada con nombre `leccion-*.md`: los tres cortaron;
- frontmatter completo y mezcla de `## Frases` con Repeat: se parsearon como se esperaba;
- `esperar_deploy()` contra un commit ya publicado: `ready`, con `netlify.CMD` y
  el JSON como argumento;
- servidor de revisión: respondió 200 y se apagó.

**Sin probar todavía:**

- la generación real de audio pasando por el script (usar `--limite 3` la primera vez);
- una publicación real completa: `git push` con credenciales y espera del deploy nuevo;
- el nombre exacto del estado que usa Netlify cuando se agotan los créditos. Se
  asume `error`, `rejected` o `skipped`. Si fuera otro, el script esperaría los
  180 s y mandaría a mirar el panel, sin dar un falso "ready".

## Una semana entera: `tools/nueva-semana.py`

El curso sigue la ruta **Ruta al Inglés**: una lección de la tabla por semana, con
tutoría guiada de 30 min lunes, miércoles y jueves (con PPTX) y sesión
independiente de 15 min martes y viernes. Cada día tiene su lección en el sitio,
así que son 5 por semana.

Correr este script cinco veces no sirve: exige git limpio para numerar, así que
habría que publicar cada lección antes de generar la siguiente, y serían cinco
deploys por semana. `nueva-semana.py` importa las funciones de este script y hace
el mismo recorrido para las cinco juntas:

```
RUTA-AL-INGLES/ (fuera del repo)                 repo
semana-NN.json ─► armar-semana.py ─► 3 PPTX
                        │
                        └─► sitio/semana.json + _frases-N-dia.txt ─► nueva-semana.py
                                                                        ├─ leer_frases() ×5, y que coincidan con semana.json
                                                                        ├─ git: main, limpio, pull --ff-only
                                                                        ├─ escribir_md() ×5 + UNA llamada a generar-lecciones.py
                                                                        ├─ paso_audios("sNN-"): un ensayo y una pregunta para las 5
                                                                        ├─ controlar_archivos(*ids)
                                                                        └─ publicar(*ids): UN commit, UN push, UN deploy
```

```bash
python tools/nueva-semana.py "<RUTA-AL-INGLES>/semanas/semana-03/sitio" --pedir-clave
python tools/nueva-semana.py --publicar-semana 3 --titulo "En el aeropuerto"
```

- **El presupuesto de carga cognitiva se valida en `armar-semana.py`**, no acá:
  frases por día, vocabulario, minutos de la clase, palabras desconocidas los días
  independientes y tarjetas duplicadas en el SRS. `nueva-semana.py` solo corta si
  un `_frases` no coincide con las cantidades de `semana.json`, porque eso quiere
  decir que alguien lo tocó después del control.
- **Los ids son `leccion-NN-sNN-dia-tema`**: los títulos empiezan con `S03 Lun · …`.
  El filtro de audio es `s03-` (sin guion adelante, porque argparse tomaría `-s03-`
  por una opción). Como `generar-audios.py` filtra con un `in` sobre el nombre,
  antes de gastar cuota se comprueba que el filtro agarre exactamente las cinco.
- **Si la semana ya tiene lecciones generadas, corta** y manda a `--publicar-semana`.
- **La revisión abre el índice**, no una lección: ahí se ven las cinco filas.

Probado el 17/09/2026 en un clon descartable sin remoto: generó las lecciones 03 a
07, calculó 18 audios para las cinco (13 frases ya tenían mp3), cortó con
`index.html` modificado, con un mp3 modificado o borrado, con un `_frases` tocado a
mano y al repetir la semana; `--publicar-semana` hizo un commit de 12 archivos, y
`nueva-leccion.py` de a una sigue igual. En el navegador: cinco filas nuevas,
`0 / 16` el lunes y `0 / 20` el viernes, sin tarjetas de vocabulario repetidas.

## Limitaciones conocidas

- La numeración es local. `git pull` evita choques con lo ya publicado, pero no
  con otra máquina que esté creando una lección al mismo tiempo.
- `--publicar` no hace pull. Si GitHub tiene commits nuevos, el push falla y el
  script indica `git pull --rebase` y `git push`.
- No hay forma de contestar "sí" sin teclado. Es deliberado (regla 3), y es lo que
  habría que agregar para dispararlo desde otro sistema.
- La revisión local no corre `netlify/functions`: login, entregas y sincronización
  no andan ahí. Para eso existe `netlify dev`.
- No cubre editar una lección ya publicada: eso sigue siendo modificar su `.md` y
  correr `generar-lecciones.py`.

## Cómo extenderlo

- **Dispararlo desde n8n, Hermes o un cron:** agregar opciones explícitas, por
  ejemplo `--si-audios` y `--si-publicar`, que reemplacen las preguntas,
  manteniendo el NO por defecto. Esa máquina necesitaría el repo, Python, las
  credenciales de git, la CLI de Netlify y la clave de TTS en una variable de
  entorno. Nunca como argumento.
- **Revisión sin publicar en producción:** en vez de pushear a `main`, empujar una
  rama y abrir un PR para obtener un deploy preview. Tener en cuenta que consume
  créditos de build.
- **Nuevas secciones de ejercicio:** hay que tocarlas en tres lugares:
  `SECCIONES` y `ENCABEZADOS` en este script, y `SECCIONES` en
  `generar-lecciones.py`.
