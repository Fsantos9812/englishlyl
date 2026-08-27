# Lecciones interactivas

Lecciones de inglés con voz del navegador. Es una PWA: se instala en el celular
y funciona sin internet.

Las **lecciones** son estáticas y andan solas, sin servidor. Encima de eso hay
una capa opcional de **cuentas**: si el alumno entra con su usuario, su progreso
y sus grabaciones le llegan al profe. Esa parte sí necesita las funciones de
Netlify, o sea un deploy con build (ver más abajo).

## Estructura

```
index.html                    índice: lista, progreso y exportación
leccion-NN-tema.html          una lección = maquetado + datos JSON
lessons.json                  manifiesto: orden, títulos y cantidad de ejercicios
manifest.webmanifest          identidad de la PWA (nombre, colores, iconos)
sw.js                         service worker: cachea todo para uso offline
assets/lesson.css             estilos compartidos
assets/lesson.js              lógica compartida de las lecciones
assets/index.js               lógica del índice
assets/racha.js               racha de días consecutivos
assets/export.js              exportar progreso + grabaciones como .zip
assets/pwa.js                 registra el service worker y el botón de instalar
assets/auth.js                sesión del alumno (login, token)
assets/sync.js                envía progreso y grabaciones al profe
assets/profe.js               lógica del panel del profe
profe.html                    panel del profe (crear alumnos, ver entregas)
netlify/functions/            auth, entregas y administración
assets/icon-*.png             iconos de la app
tools/generar-lecciones.py    de Markdown a lección + regenera el manifiesto
tools/convertir-leccion.py    pasa lecciones autocontenidas al formato del proyecto
tools/generar-manifiesto.py   regenera lessons.json leyendo las lecciones
lecciones-md/                 el Markdown fuente de cada lección
tools/probar-logica.mjs       pruebas de usuarios y sesiones
tools/probar-audios.mjs       pruebas de la organización de grabaciones
package.json                  dependencia de las funciones (@netlify/blobs)
netlify.toml                  cache, headers y URLs cortas
404.html                      página de error
```

`lessons.json` es la **única fuente de verdad** del orden de las lecciones: el
índice arma la lista con él, cada lección arma su navegación (← anterior /
siguiente →) con el mismo archivo, y el service worker decide qué cachear
leyéndolo también.

## Anatomía de una lección

Una lección **no** lleva JS ni CSS propio: sólo un bloque de datos que
`assets/lesson.js` lee al cargar.

```html
<link rel="stylesheet" href="assets/lesson.css?v=23">
...
<script type="application/json" id="lesson-data">
{
  "id": "leccion-05-compras",
  "langEn": "en-US",
  "langEs": "es-419",
  "repeat":    [{"en": "...", "es": "..."}],
  "type":      [{"en": "...", "es": "..."}],
  "translate": [{"en": "...", "es": "..."}]
}
</script>
<script src="assets/lesson.js?v=23" defer></script>
<script src="assets/pwa.js?v=23" defer></script>
```

- `repeat` → Listen and Repeat (escuchar en inglés, repetir en voz alta, puntaje por reconocimiento de voz).
- `type` → Listen and Type (escuchar en inglés, escribir la traducción al español, autocorregido).
- `translate` → Listen and Translate (escuchar en español, grabar la traducción hablada; se guarda el audio, sin corrección).

Las secciones que no se usan se dejan como `[]` y sus bloques `<h2>` /
`<div id="...">` simplemente no se ponen en el HTML.

### Lecciones largas

Una sección de 9 frases o más **se parte sola en bloques plegables de 6**. No hay
que tocar el Markdown ni el HTML: lo arma `assets/lesson.js` al cargar, así que
vale para las lecciones que ya existen y para las que vengan.

Al abrir la lección queda abierto el **primer bloque con algo sin hacer** de cada
sección, y los demás plegados con su resumen (`4 / 6 · 88%` o `sin empezar`).
Después manda el alumno: abrir y cerrar a mano no se pisa nunca, porque el
estado inicial se decide una sola vez al cargar.

Cada tarjeta resuelta queda con una **franja de color al costado** según el
puntaje (verde / ámbar / rojo), para ver de un vistazo qué falta. Eso aplica a
todas las lecciones, largas o cortas.

Cuando hay bloques y ya hay progreso, arriba aparece **▶ Seguir con lo que
falta**: abre el bloque de la primera frase sin hacer y le pone el foco.

Debajo de 9 frases la sección se muestra entera, como siempre. Listen and
Translate no se parte todavía: no tiene puntaje, así que no hay con qué decidir
qué bloque está hecho.

## Agregar una lección

Se escribe un Markdown en `lecciones-md/` y se corre un script:

```bash
python tools/generar-lecciones.py
```

Genera el `.html` y regenera `lessons.json`. El índice, la navegación y el cache
offline se actualizan solos. Los archivos se ordenan por nombre, así que el `NN`
define el orden de la serie. Hay una plantilla en `lecciones-md/_plantilla.md`.

### ⚠️ No uses generadores de lecciones de propósito general

Los generadores que producen "un sitio de lecciones" **escriben su propio
`index.html`** y te pisan el de este proyecto, que tiene el login, la racha y la
exportación. El listado de lecciones no vive en `index.html`: lo arma
`assets/index.js` leyendo `lessons.json`.

Si igual quedó una lección autocontenida (con `<style>` y `<script>` adentro),
se convierte al formato del proyecto con:

```bash
python tools/convertir-leccion.py
```

Es idempotente: saltea las que ya están bien.

## ⚠️ Al editar assets/

`assets/*` se sirve con cache de un año (`immutable`) y además lo guarda el
service worker, así que una copia vieja puede quedar pegada para siempre. Si
editás algo dentro de `assets/`, hay que hacer **las dos cosas**:

```bash
sed -i 's/?v=23/?v=24/g' *.html
```

y subir `const VERSION = '23'` a `'24'` en `sw.js` (eso cambia el nombre del cache
y descarta el viejo).

El HTML, `lessons.json` y `sw.js` se revalidan siempre, así que publicar una
lección nueva se ve al instante.

## Modo oscuro

Sigue al sistema (`prefers-color-scheme`). No hay interruptor ni preferencia
guardada: el que tiene el celular en oscuro ve la app en oscuro y listo.

Todo sale de los **tokens** del `:root` de `assets/lesson.css`. Ninguna hoja
escribe un color a mano, así que el modo oscuro es un solo bloque que redefine
esas variables. Si agregás un color nuevo, **agregalo como token** y dale su
valor oscuro; si lo escribís literal, esa parte queda rota de noche.

| Token | Para qué |
|---|---|
| `--accent` | color de **texto**: links, títulos de lección, chips |
| `--accent-fill` / `--on-accent` | fondo del **botón lleno** y su texto |
| `--toast-bg` / `--toast-ink` | el aviso de racha, **invertido** en cada modo |
| `--surface-2` | hover de los botones fantasma |

En claro `--accent` y `--accent-fill` son el mismo índigo. En oscuro se separan:
el índigo claro que hace falta para leerse sobre negro no aguanta texto blanco
encima. Por eso un botón lleno nunca usa `--accent`.

`:root` también declara `color-scheme: light dark`, que es lo que hace que el
navegador pinte en oscuro los inputs, las barras de scroll y el reproductor
`<audio>` de las grabaciones.

## Progreso del alumno

- Puntajes: `localStorage`, con la clave `lecciones:progreso:<id-de-leccion>`.
- Racha de días: `localStorage`, clave `lecciones:racha`.
- Grabaciones de audio: `IndexedDB`, base `lecciones_audio`.
- Sesión (token): `localStorage`, clave `lecciones:sesion`.

### Qué cuenta como hecho

**Hecho** y **bien hecho** son dos cosas distintas y se muestran distinto.

*Hecho* son todos los ejercicios: Repeat y Type cuando tienen un intento
guardado, y **Translate cuando la frase tiene al menos una grabación** — grabar
es trabajo, cuenta para el contador y para la racha igual que los demás. Una
frase cuenta una sola vez aunque tenga tres audios, y si se borran todos sus
audios se destilda sola.

*Bien hecho* es el promedio, y sale **sólo de lo que tiene puntaje**. Por eso
las grabaciones **nunca** se guardan en `lecciones:progreso:<id>`: ahí adentro
todo valor numérico se promedia, en la lección, en el índice, en el `.zip` y en
el panel del profe. Un marcador de Translate metido ahí le inflaría el promedio
al alumno en los cuatro lados. La fuente de verdad es la grabación en IndexedDB;
el conteo se recalcula desde cero cada vez que se lista el panel de grabaciones.

En el índice la barra de cada lección tiene tres estados:

| Barra | Cuándo |
|---|---|
| índigo | empezada, sin terminar |
| **ámbar** | terminada pero con promedio **abajo de 85%** — conviene repasar |
| **verde** | terminada **y** con 85% o más |

Antes se ponía verde con sólo llegar al final, aunque el promedio fuera 30%: le
decía al alumno que estaba aprendido cuando no lo estaba. El estado también va
en el `aria-label` del enlace, porque el color no puede ser el único canal.

`↺ Reiniciar` borra los **puntajes**, no las grabaciones: después de reiniciar,
las traducciones grabadas siguen contando y sus tarjetas siguen marcadas.

### Racha

`assets/racha.js` cuenta días consecutivos de práctica. La fuente de verdad es
la **lista de días**, no un contador: el número de días seguidos se calcula
siempre a partir de esa lista. Suma un día la primera vez que el alumno completa
un ejercicio — uno con puntaje, o una traducción grabada; si se saltea un día
vuelve a cero y queda el récord. El índice muestra el número, una tira de los
últimos 7 días y el récord; las lecciones muestran un 🔥 en la barra inferior y
un aviso cuando la racha sube.

Las fechas se calculan en hora **local**, no en UTC: con `toISOString()` a la
noche el día cambiaría antes de tiempo y cortaría rachas sin motivo.

Sin sesión iniciada, todo eso vive **sólo en el dispositivo del alumno**.
Con sesión, además se sincroniza (ver *Cuentas y panel del profe*).
Cada lección tiene un botón **↺ Reiniciar** en la barra inferior.

### Exportar para el profe

El índice tiene un botón **⬇️ Exportar todo (.zip)** que arma, en el navegador,
un archivo con:

```
resumen.txt                   puntajes legibles de un vistazo
progreso.json                 lo mismo, para procesar
audios/<leccion>/NN-frase.m4a  cada grabación, agrupada por lección
```

El alumno lo baja y te lo manda por donde quiera (mail, WhatsApp, Drive). El
.zip se arma a mano, sin librerías externas ni servidor.

## Cuentas y panel del profe

Los alumnos entran con **usuario y contraseña**, que creás vos. No hace falta
que tengan email. Todo lo que hacen viaja a tu panel: puntajes, racha y
grabaciones, desde cualquier dispositivo donde entren.

### Poner en marcha

1. El sitio tiene que estar **conectado a un repo de Git** (o desplegado con la
   CLI), para que Netlify corra `npm install`: las funciones dependen de
   `@netlify/blobs`, y con un arrastre de carpeta sin build no se instala.
2. En Netlify → Site settings → Environment variables, crear tres:

   | Variable | Para qué |
   |---|---|
   | `SESION_SECRETO` | Cadena larga y al azar para firmar las sesiones |
   | `PROFE_USUARIO` | Tu usuario para entrar al panel |
   | `PROFE_CLAVE` | Tu contraseña |

   Sin `SESION_SECRETO` **todas las funciones responden 503**: fallan cerradas,
   no abiertas. Cambiar el secreto invalida todas las sesiones abiertas.
3. Entrar a `https://TU-SITIO.netlify.app/profe.html` y crear los alumnos.

### Crear un alumno

Ponés el nombre y el panel devuelve **usuario y contraseña una sola vez**
(algo tipo `ana.gomez.nunez` / `gato-lento-774`). La anotás y se la das en
papel. La primera vez que entra, la app le pide que ponga una suya.

Desde el panel también podés **resetear** la contraseña de quien la perdió y
**borrar** un alumno (se lleva puestos sus puntajes y sus grabaciones).

### Cómo se guarda

```
usuarios/<usuario>.json                      nombre + hash de la contraseña
progreso/<usuario>.json                      puntajes de todas las lecciones
dias/<usuario>.json                          días practicados (para la racha)
audio/<usuario>/<leccion>-<frase>-<id>.webm  grabaciones
```

Las contraseñas se guardan con **PBKDF2-SHA256, 210.000 iteraciones y salt
propio por usuario**; nunca en claro. La sesión es un token firmado con
HMAC-SHA256: el servidor no guarda sesiones, sólo verifica firma y vencimiento
(30 días para alumnos, 12 horas para el profe).

### La racha entre dispositivos

Este es el motivo por el que la racha se guarda como **lista de días** y no como
un contador: el servidor **une** los días de todos los dispositivos del alumno
en vez de pisarlos. Si practicó en el celular y después abre la computadora,
la computadora adopta el historial completo en vez de arrancar de cero — y un
dispositivo con menos historia nunca le hace retroceder la racha.

Los días se calculan en hora **local del alumno**, no en el servidor: por eso
la unión pasa en el servidor pero el número de días seguidos lo calcula el
cliente.

### Lo que este esquema NO hace

- **No hay recuperación por email**, porque no hay email. Si un alumno pierde
  la contraseña, se la reseteás vos desde el panel.
- **No hay límite de intentos de login.** Para un curso alcanza; si el sitio
  quedara expuesto a internet abierta, conviene agregarlo.
- La autenticación es **código propio**, no de un proveedor. Está probada
  (`node tools/probar-logica.mjs`) pero es una superficie que mantenés vos.

### Probar sin desplegar

```bash
node tools/probar-logica.mjs
```

37 pruebas de contraseñas, tokens, usuarios, unión de rachas y límites, contra
un store en memoria. Incluye los casos feos: token con el rol falsificado,
token vencido, contraseña en claro filtrada al store, dispositivo sin historial
que intenta borrar la racha.

## Offline

El service worker cachea el índice, todas las lecciones, los assets y los
iconos. Sin internet funcionan la navegación, el vocabulario, **Listen and
Type** y las grabaciones.

**Listen and Repeat necesita internet**: el reconocimiento de voz de Chrome
procesa el audio en los servidores de Google. La síntesis de voz sí funciona
offline si el sistema tiene voces locales instaladas.

## Probar en local

```bash
python -m http.server 8767
```

El reconocimiento de voz y el service worker sólo funcionan en `localhost` o en
HTTPS. El reconocimiento además necesita un navegador basado en Chromium
(Chrome, Edge); Firefox y Safari en iOS no lo soportan y el resto de la lección
sigue andando igual.
