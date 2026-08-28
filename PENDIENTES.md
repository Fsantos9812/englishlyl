# Pendientes

Lo que quedó sin hacer, con el contexto necesario para retomarlo sin depender de
ninguna conversación. Se tacha o se borra a medida que se cierra.

---

## 1. Decisiones que dependen de vos

Nada de esto se puede resolver mirando el código: hay que elegir.

### Las mismas 22 frases aparecen dos veces

`repeat` y `type` de `leccion-01-familia-edades` usan **exactamente las mismas 22
oraciones**. La lección dice "44 ejercicios" pero son 22 frases en dos
modalidades.

Puede ser deliberado — pronunciar y reconocer escrito se olvidan a ritmos
distintos, que es el argumento de `assets/srs.js`. El problema es que **el alumno
no se entera**: ve la frase por segunda vez y parece relleno.

- Si es a propósito → falta decirlo en la interfaz, una línea bajo cada `<h2>`.
- Si no lo es → hay que cambiar el Markdown fuente y regenerar.

### La meta diaria de XP quedó chica

`META_DIARIA = 50` en `assets/xp.js` se calibró cuando una sesión eran 10
ejercicios. Ahora son 44, y con el combo una racha larga da 20 XP por acierto:
una pasada completa son **500-800 XP**, así que la meta se cumple **al cuarto
ejercicio**.

Si el objetivo es media hora por lección, la meta debería estar cerca de una
pasada completa: unos 400-500.

---

## 2. Modo sesión

### Intercalar Repeat y Type

`armarCola()` en `assets/sesion.js` pone todo lo pendiente junto, y como
`repeat` va antes que `type`, una lección nueva da **22 Repeat seguidos y después
22 Type seguidos**. Eso es práctica en bloque: más monótona y peor para retener
que alternar. Intercalar es un cambio chico y no toca nada más.

### El contador reinicia al volver

Si el alumno sale a la mitad y vuelve, la cola se rearma entera y el contador
muestra `1 / 44` en vez de retomar en `6 / 44`. No se pierde progreso — cada
respuesta se guarda al momento — pero visto de golpe parece que sí.

Alternativa: mostrar lo hecho de la lección (`28 / 44`) en vez de la posición en
la cola. El costo es que la barra deja de llenarse de izquierda a derecha en una
sola pasada.

---

## 3. Aviso de versión nueva en la PWA

**El más urgente de la lista.** Hoy, cuando se publica una versión, el alumno
entra, ve la anterior y cree que no se actualizó — pasó de verdad. El service
worker hace `skipWaiting()` y `clients.claim()`, pero la página ya cargada sigue
con los archivos viejos hasta que se recarga.

Falta que `assets/pwa.js` detecte la versión nueva y muestre
*"Hay una versión nueva · Actualizar"* con un botón que recargue. Son pocas
líneas y es lo que hace cualquier PWA seria.

Mientras no esté: hay que recargar dos veces, o cerrar la app instalada del todo.

---

## 4. Panel del profe

De la auditoría, ordenado por lo que más cambia el trabajo diario:

1. **Detalle por ejercicio.** Hoy sólo se ve "Familia y edades · 15 · 42%" y no
   hay nada clickeable. Los puntajes de cada frase **ya llegan al navegador** en
   `a.lecciones`: `tablaDeLecciones()` los cuenta y promedia, nada más. Es UI
   sobre datos que ya viajan.
2. **Devolución al alumno.** No existe ningún canal profe → alumno. El alumno
   graba su traducción, la escuchás, la marcás… y nunca se entera de nada.
   Listen and Translate existe para dar devolución de pronunciación y hoy es un
   buzón de una sola dirección. Alcanza con un comentario por grabación guardado
   en el blob store.
3. **Vista de clase.** Qué frase falla el curso entero, para saber qué reenseñar
   a todos en vez de uno por uno.
4. **`?accion=alumnos` recorre todas las grabaciones del store.**
   `resumenDeAlumnos()` llama a `listarAudios(store)` sin prefijo sólo para armar
   contadores. Con un año de clase son miles de claves, y se paga en cada carga.
   Todavía no duele, pero crece solo.
5. **Sesión vencida muestra dos estados a la vez.** Con el token de 12 h vencido
   aparecen el formulario de login *y* un "No se pudo cargar: Sesión vencida."
   suelto en la lista, sin explicación en el login.

---

## 5. Sin verificar nunca

### Las funciones de Netlify contra el servidor real

El login del alumno, las entregas y el panel se probaron **siempre con un
servidor falso en el navegador**, porque `python -m http.server` no corre
funciones. Con la CLI instalada ya se puede: `netlify dev` las levanta de verdad.

### Listen and Repeat dentro de la sesión

El navegador de pruebas no da micrófono, así que se verificó por código y por la
cola, pero **nunca con voz real**. Vale una pasada en Chrome antes de dárselo a
un alumno.

---

## 6. Contenido

El repaso de vocabulario funciona pero hoy tiene **5 palabras**, todas de una
lección. Antes de cargar a mano, mirar el conversor de `.apkg` que ya existe en
`ARTEFACTOS ANKI\reproductor-flashcards`.

---

## Notas de operación

**Verificar el deploy después de cada push.** Hubo cinco commits seguidos que
fallaron con `Skipped due to account credit usage exceeded` y producción quedó
clavada sin que nada avisara:

```bash
netlify api listSiteDeploys --data '{"site_id":"c7d1e067-fccf-4ca1-9b71-7ae82aa7d32c"}'
```

El estado que importa es `ready`. Cualquier otra cosa —`error`, `rejected`—
significa que lo que pusheaste **no está en producción**, aunque el push haya
salido bien. Más rápido todavía: `netlify open --admin`.

**`netlify-cli` está fijado en 27.1.2.** De 27.3.0 en adelante no instalan:
dependen de `@netlify/ai@^1.0.1` y la versión más alta publicada es `1.0.0`.
Cuando publiquen 1.0.1 se puede volver a la última.

**Apareció una vez** un deploy rechazado con *"Build blocked: This commit is from
an unrecognized Git contributor"*. No volvió a pasar, pero conviene tenerlo en el
radar.
