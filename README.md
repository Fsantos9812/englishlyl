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
tools/generar-manifiesto.py   regenera lessons.json leyendo las lecciones
tools/probar-logica.mjs       pruebas de las funciones, sin desplegar
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
<link rel="stylesheet" href="assets/lesson.css?v=6">
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
<script src="assets/lesson.js?v=6" defer></script>
<script src="assets/pwa.js?v=6" defer></script>
```

- `repeat` → Listen and Repeat (escuchar en inglés, repetir en voz alta, puntaje por reconocimiento de voz).
- `type` → Listen and Type (escuchar en inglés, escribir la traducción al español, autocorregido).
- `translate` → Listen and Translate (escuchar en español, grabar la traducción hablada; se guarda el audio, sin corrección).

Las secciones que no se usan se dejan como `[]` y sus bloques `<h2>` /
`<div id="...">` simplemente no se ponen en el HTML.

## Agregar una lección

1. Crear `leccion-NN-tema.html` copiando otra y cambiando maquetado + bloque de datos.
2. Regenerar el manifiesto:

```bash
python tools/generar-manifiesto.py
```

El índice, la navegación y el cache offline se actualizan solos. Los archivos se
ordenan por nombre, así que el `NN` define el orden de la serie.

## ⚠️ Al editar assets/

`assets/*` se sirve con cache de un año (`immutable`) y además lo guarda el
service worker, así que una copia vieja puede quedar pegada para siempre. Si
editás algo dentro de `assets/`, hay que hacer **las dos cosas**:

```bash
sed -i 's/?v=6/?v=7/g' *.html
```

y subir `const VERSION = '6'` a `'7'` en `sw.js` (eso cambia el nombre del cache
y descarta el viejo).

El HTML, `lessons.json` y `sw.js` se revalidan siempre, así que publicar una
lección nueva se ve al instante.

## Progreso del alumno

- Puntajes: `localStorage`, con la clave `lecciones:progreso:<id-de-leccion>`.
- Racha de días: `localStorage`, clave `lecciones:racha`.
- Grabaciones de audio: `IndexedDB`, base `lecciones_audio`.
- Sesión (token): `localStorage`, clave `lecciones:sesion`.

### Racha

`assets/racha.js` cuenta días consecutivos de práctica. La fuente de verdad es
la **lista de días**, no un contador: el número de días seguidos se calcula
siempre a partir de esa lista. Suma un día la primera vez que el alumno completa
un ejercicio con puntaje; si se saltea un día vuelve a cero y queda el récord. El índice muestra el número, una tira de los
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
