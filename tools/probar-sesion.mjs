/*
  Pruebas de la cola de la sesión: qué se presenta, qué se pregunta y en qué
  orden.

      node tools/probar-sesion.mjs

  Carga assets/sesion.js de verdad, no una copia. El módulo sólo toca el DOM
  cuando se abre la sesión; para mirar la cola alcanza con `Sesion.orden()`.

  Lo que se cuida acá es una regla fácil de romper sin notarlo: una frase que el
  alumno nunca vio se PRESENTA (Repeat) antes de que se le PREGUNTE (Type), y
  una que ya vio se pregunta antes de reforzarla, porque la tarjeta de Repeat
  muestra la respuesta del Type.
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

/**
 * Arma la cola con un estado de progreso dado.
 * `puntajes` va con claves "type:3" / "repeat:0"; lo que no está, nunca se hizo.
 * El módulo lee SpeechRecognition al cargarse, así que para probar el navegador
 * sin voz hay que volver a cargarlo.
 */
function cola(puntajes, conVoz = true) {
  if (conVoz) globalThis.SpeechRecognition = function () {};
  else delete globalThis.SpeechRecognition;
  globalThis.Leccion = {
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

console.log('');
if (mal) {
  console.log('FALLARON ' + mal + ' de ' + (ok + mal) + ' pruebas');
  process.exit(1);
}
console.log('TODO OK: ' + ok + ' pruebas');
