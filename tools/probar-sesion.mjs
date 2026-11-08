/*
  Pruebas de la cola de la sesión: qué se presenta, qué se pregunta y en qué
  orden.

      node tools/probar-sesion.mjs

  Carga assets/sesion.js de verdad, no una copia. El módulo sólo toca el DOM
  cuando se abre la sesión; para mirar la cola alcanza con `Sesion.orden()`.

  Lo que se cuida acá es una regla fácil de romper sin notarlo: una frase que el
  alumno nunca vio se PRESENTA (Repeat) antes de que se le PREGUNTE (Type), y
  una que ya vio se pregunta antes de reforzarla, porque la tarjeta de Repeat
  muestra la respuesta del Type. "Ya vio" incluye haber puntuado el mismo texto
  en OTRA lección del dispositivo: así funcionan las lecciones de repaso.
*/
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const FUENTE = fs.readFileSync(path.join(RAIZ, 'assets', 'sesion.js'), 'utf8');

globalThis.window = globalThis;

const FRASES = Array.from({ length: 8 }, (_, i) => ({
  en: 'phrase ' + i, es: 'frase ' + i
}));
const ACTUAL = 'leccion-actual';

/**
 * Un localStorage de mentira con la API que usa el módulo. Los valores que no
 * son texto se guardan en JSON, igual que los escribe assets/lesson.js.
 */
function almacen(datos = {}) {
  const m = new Map(Object.entries(datos).map(([k, v]) =>
    [k, typeof v === 'string' ? v : JSON.stringify(v)]));
  return {
    get length() { return m.size; },
    key: (n) => [...m.keys()][n] ?? null,
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); }
  };
}

/**
 * Otra lección guardada en el dispositivo, como la deja assets/lesson.js: la
 * copia de sus frases en inglés y sus puntajes por posición.
 */
const otraLeccion = (id, textos, puntajes) => ({
  ['lecciones:frases:' + id]: { repeat: textos, type: textos },
  ['lecciones:progreso:' + id]: puntajes
});

/**
 * Arma la cola con un estado de progreso dado.
 * `puntajes` va con claves "type:3" / "repeat:0"; lo que no está, nunca se hizo.
 * `guardado` es el localStorage del dispositivo (o uno ya armado), para las
 * frases vistas en otras lecciones.
 * El módulo lee SpeechRecognition al cargarse, así que para probar el navegador
 * sin voz hay que volver a cargarlo.
 */
function cola(puntajes, conVoz = true, guardado = {}) {
  if (conVoz) globalThis.SpeechRecognition = function () {};
  else delete globalThis.SpeechRecognition;
  // defineProperty y no una asignación: hay versiones de Node que traen su
  // propio localStorage como getter.
  Object.defineProperty(globalThis, 'localStorage', {
    value: typeof guardado.getItem === 'function' ? guardado : almacen(guardado),
    configurable: true, writable: true
  });
  globalThis.Leccion = {
    id: ACTUAL,
    type: FRASES,
    repeat: FRASES,
    langEn: 'en-US',
    puntajeDe: (sec, i) => puntajes[sec + ':' + i]
  };
  new Function(FUENTE)();
  return globalThis.Sesion.orden();
}

const puntajesDe = (sec, valor) => Object.fromEntries(
  FRASES.map((_, i) => [sec + ':' + i, valor])
);

let ok = 0, mal = 0;
function afirmar(nombre, condicion, detalle) {
  if (condicion) { ok++; console.log('  OK   ' + nombre); }
  else { mal++; console.log('  FALLA ' + nombre + (detalle ? '  -> ' + detalle : '')); }
}
function igual(nombre, obtenido, esperado) {
  afirmar(nombre, obtenido === esperado, 'esperaba "' + esperado + '" y dio "' + obtenido + '"');
}

const soloDe = (c, sec) => c.filter((e) => e.startsWith(sec + ':'));
const pos = (c, clave) => c.indexOf(clave);

console.log('\n--- Lección nueva: se presenta, no se pregunta ---');
let c = cola({});
igual('la cola son las 8 frases', c.length, 8);
igual('y son todas Repeat', soloDe(c, 'repeat').length, 8);
igual('ningún Type en frío', soloDe(c, 'type').length, 0);
igual('en el orden de la lección', c.join(' '),
  FRASES.map((_, i) => 'repeat:' + i).join(' '));

console.log('\n--- Segunda pasada: ahora sí se pregunta ---');
c = cola(puntajesDe('repeat', 0.9));
igual('entran los dos modos', c.length, 16);
igual('el primero es un Type', c[0].split(':')[0], 'type');
afirmar('cada Type va antes que su Repeat',
  FRASES.every((_, i) => pos(c, 'type:' + i) < pos(c, 'repeat:' + i)),
  c.join(' '));
afirmar('y nunca la misma frase dos veces seguidas',
  c.every((e, n) => n === 0 || e.split(':')[1] !== c[n - 1].split(':')[1]),
  c.join(' '));

console.log('\n--- Media lección hecha ---');
c = cola({ 'repeat:0': 0.9, 'repeat:1': 0.4, 'repeat:2': 0.9, 'repeat:3': 0.9 });
igual('las 4 nuevas se presentan primero', c.slice(0, 4).join(' '),
  'repeat:4 repeat:5 repeat:6 repeat:7');
igual('sólo se pregunta lo visto', soloDe(c, 'type').length, 4);
afirmar('y no se pregunta ninguna frase nueva',
  !c.includes('type:4') && !c.includes('type:7'), c.join(' '));

console.log('\n--- Haberla visto de un lado alcanza ---');
c = cola({ 'type:3': 0.5 });
afirmar('con el Type hecho, la frase ya no es nueva: su Repeat se intercala',
  pos(c, 'type:3') < pos(c, 'repeat:3'), c.join(' '));
afirmar('las demás siguen siendo presentación', !c.includes('type:0'), c.join(' '));

console.log('\n--- Navegador sin reconocimiento de voz ---');
c = cola({}, false);
igual('no hay Repeat que presente', soloDe(c, 'repeat').length, 0);
igual('así que pasan los Type igual', soloDe(c, 'type').length, 8);

console.log('\n--- Vista en otra lección: el repaso pregunta, no vuelve a presentar ---');
// Una lección anterior tiene "phrase 2" en otra posición y con puntaje.
c = cola({}, true, otraLeccion('leccion-anterior', ['otra frase', 'phrase 2'], { 'repeat:1': 0.9 }));
igual('la frase vista arranca por el Type', c.find((e) => e.endsWith(':2')), 'type:2');
afirmar('y su Repeat llega después', pos(c, 'type:2') >= 0
  && pos(c, 'type:2') < pos(c, 'repeat:2'), c.join(' '));
igual('las nuevas de verdad siguen entrando por Repeat, en orden', c.slice(0, 7).join(' '),
  'repeat:0 repeat:1 repeat:3 repeat:4 repeat:5 repeat:6 repeat:7');
igual('y a ninguna nueva se la pregunta', soloDe(c, 'type').join(' '), 'type:2');

console.log('\n--- Vale cualquier modo, en cualquier otra lección ---');
c = cola({}, true, {
  ...otraLeccion('leccion-a', ['phrase 5'], { 'type:0': 0.3 }),
  ...otraLeccion('leccion-b', ['nada', 'nada', 'phrase 6'], { 'repeat:2': 1 })
});
afirmar('vista sólo en el Type de otra: se pregunta', pos(c, 'type:5') >= 0
  && pos(c, 'type:5') < pos(c, 'repeat:5'), c.join(' '));
afirmar('vista en una tercera lección también', pos(c, 'type:6') >= 0
  && pos(c, 'type:6') < pos(c, 'repeat:6'), c.join(' '));

console.log('\n--- El mismo texto, recortado; parecido no alcanza ---');
c = cola({}, true, otraLeccion('leccion-anterior',
  ['  phrase 4 ', 'Phrase 6', 'phrase 7.'], { 'repeat:0': 0.9, 'repeat:1': 0.9, 'repeat:2': 0.9 }));
afirmar('con espacios de más es la misma frase', pos(c, 'type:4') >= 0, c.join(' '));
afirmar('otra mayúscula u otra puntuación no es la misma',
  !c.includes('type:6') && !c.includes('type:7'), c.join(' '));

console.log('\n--- Si no hay de dónde saberlo, sigue siendo nueva ---');
c = cola({}, true, otraLeccion('leccion-anterior', ['phrase 3'], {}));
afirmar('está en otra lección pero sin puntaje: se presenta', !c.includes('type:3'), c.join(' '));
c = cola({}, true, { 'lecciones:progreso:leccion-vieja': { 'repeat:3': 0.9 } });
afirmar('otra lección con puntaje pero sin copia de sus frases: no se adivina',
  soloDe(c, 'type').length === 0, c.join(' '));
const roto = { getItem() { throw new Error('bloqueado'); }, key() { throw new Error('bloqueado'); },
  get length() { throw new Error('bloqueado'); } };
c = cola({}, true, roto);
igual('con localStorage bloqueado, todo como antes', c.join(' '),
  FRASES.map((_, i) => 'repeat:' + i).join(' '));

console.log('');
if (mal) {
  console.log('FALLARON ' + mal + ' de ' + (ok + mal) + ' pruebas');
  process.exit(1);
}
console.log('TODO OK: ' + ok + ' pruebas');
