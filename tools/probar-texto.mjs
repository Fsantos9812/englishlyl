/*
  Pruebas de la normalización y el puntaje de respuestas escritas.

      node tools/probar-texto.mjs

  A diferencia de probar-srs.mjs, esto NO replica el código: carga
  assets/texto.js de verdad. El módulo es puro (no toca el DOM ni guarda nada),
  así que alcanza con darle un `window` y evaluarlo. Si el archivo se rompe,
  estas pruebas se enteran; una copia no se enteraría.
*/
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
globalThis.window = globalThis;
new Function(fs.readFileSync(path.join(RAIZ, 'assets', 'texto.js'), 'utf8'))();
const T = globalThis.Texto;

let ok = 0, mal = 0;
function afirmar(nombre, condicion, detalle) {
  if (condicion) { ok++; console.log('  OK   ' + nombre); }
  else { mal++; console.log('  FALLA ' + nombre + (detalle ? '  -> ' + detalle : '')); }
}
function igual(nombre, obtenido, esperado) {
  afirmar(nombre, obtenido === esperado, 'esperaba "' + esperado + '" y dio "' + obtenido + '"');
}

console.log('\n--- Números en español ---');
igual('0', T.enPalabras(0, 'es'), 'cero');
igual('7', T.enPalabras(7, 'es'), 'siete');
igual('15', T.enPalabras(15, 'es'), 'quince');
igual('16 sin tilde', T.enPalabras(16, 'es'), 'dieciseis');
igual('20', T.enPalabras(20, 'es'), 'veinte');
igual('21 en una palabra', T.enPalabras(21, 'es'), 'veintiuno');
igual('22 sin tilde', T.enPalabras(22, 'es'), 'veintidos');
igual('29', T.enPalabras(29, 'es'), 'veintinueve');
igual('30', T.enPalabras(30, 'es'), 'treinta');
igual('31 con "y"', T.enPalabras(31, 'es'), 'treinta y uno');
igual('45 (el caso que fallaba)', T.enPalabras(45, 'es'), 'cuarenta y cinco');
igual('48', T.enPalabras(48, 'es'), 'cuarenta y ocho');
igual('61', T.enPalabras(61, 'es'), 'sesenta y uno');
igual('99', T.enPalabras(99, 'es'), 'noventa y nueve');
igual('100 es "cien"', T.enPalabras(100, 'es'), 'cien');
igual('101 ya es "ciento"', T.enPalabras(101, 'es'), 'ciento uno');
igual('115', T.enPalabras(115, 'es'), 'ciento quince');
igual('200', T.enPalabras(200, 'es'), 'doscientos');
igual('500 es "quinientos"', T.enPalabras(500, 'es'), 'quinientos');
igual('999', T.enPalabras(999, 'es'), 'novecientos noventa y nueve');
igual('1000 es "mil", no "uno mil"', T.enPalabras(1000, 'es'), 'mil');
igual('2000', T.enPalabras(2000, 'es'), 'dos mil');
igual('1990', T.enPalabras(1990, 'es'), 'mil novecientos noventa');

console.log('\n--- Números en inglés ---');
igual('0', T.enPalabras(0, 'en'), 'zero');
igual('13', T.enPalabras(13, 'en'), 'thirteen');
igual('20', T.enPalabras(20, 'en'), 'twenty');
igual('45 con espacio, no guion', T.enPalabras(45, 'en'), 'forty five');
igual('40 se escribe "forty"', T.enPalabras(40, 'en'), 'forty');
igual('99', T.enPalabras(99, 'en'), 'ninety nine');
igual('100', T.enPalabras(100, 'en'), 'one hundred');
igual('101', T.enPalabras(101, 'en'), 'one hundred one');
igual('999', T.enPalabras(999, 'en'), 'nine hundred ninety nine');
igual('1000', T.enPalabras(1000, 'en'), 'one thousand');

console.log('\n--- Fuera de rango: se deja el número como vino ---');
afirmar('negativo', T.enPalabras(-5, 'es') === null);
afirmar('con decimales', T.enPalabras(1.5, 'es') === null);
afirmar('un millón', T.enPalabras(1000000, 'es') === null);
igual('en una frase queda el dígito', T.normalizar('cuesta 2000000 pesos', 'es'), 'cuesta 2000000 pesos');

console.log('\n--- El caso real que motivó todo ---');
const frase = 'Mi mamá tiene 45 años.';
igual('el dígito se deletrea',
  T.normalizar(frase, 'es'), 'mi mama tiene cuarenta y cinco anos');
afirmar('escribirlo en letras da 100%',
  Math.round(T.similitud('Mi mamá tiene cuarenta y cinco años.', frase, 'es') * 100) === 100,
  Math.round(T.similitud('Mi mamá tiene cuarenta y cinco años.', frase, 'es') * 100) + '%');
afirmar('escribirlo en dígitos también da 100%',
  Math.round(T.similitud('Mi mama tiene 45 anos', frase, 'es') * 100) === 100);
afirmar('un número equivocado no pasa',
  T.similitud('Mi mamá tiene cuarenta y seis años.', frase, 'es') < 0.95);

console.log('\n--- Lo que ya andaba no se rompió ---');
afirmar('sin tildes', T.similitud('Mi mama tiene 45 anos', frase, 'es') === 1);
igual('contracción en inglés',
  T.normalizar("I'm fine, thank you", 'en'), 'i am fine thank you');
igual('apóstrofe tipográfico',
  T.normalizar('I’m fine', 'en'), 'i am fine');
igual('la puntuación se va',
  T.normalizar('Hello, how are you?', 'en'), 'hello how are you');
afirmar('vacío contra vacío es 1', T.similitud('', '', 'es') === 1);
afirmar('respuesta mala puntúa bajo', T.similitud('cualquier cosa', frase, 'es') < 0.5);

console.log('\n--- Los cortes del veredicto ---');
igual('0.90 es bien', T.veredicto(0.90).cls, 'good');
igual('0.85 justo entra', T.veredicto(0.85).cls, 'good');
igual('0.84 es "cerca"', T.veredicto(0.84).cls, 'warn');
igual('0.55 justo es "cerca"', T.veredicto(0.55).cls, 'warn');
igual('0.54 es mal', T.veredicto(0.54).cls, 'bad');

console.log('');
if (mal) {
  console.log('FALLARON ' + mal + ' de ' + (ok + mal) + ' pruebas');
  process.exit(1);
}
console.log('TODO OK: ' + ok + ' pruebas');
