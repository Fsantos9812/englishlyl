/*
  Pruebas de assets/voz.js: cuándo suena el mp3 grabado y cuándo la síntesis
  del navegador.

      node tools/probar-voz.mjs

  Carga assets/voz.js de verdad, con un `fetch`, un `Audio` y un
  `speechSynthesis` de mentira. Lo que se cuida acá es que la caída a la voz del
  navegador nunca deje al alumno en silencio: sin audios.json, sin el archivo, o
  con el navegador bloqueando la reproducción, algo tiene que sonar igual.
*/
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const FUENTE = fs.readFileSync(path.join(RAIZ, 'assets', 'voz.js'), 'utf8');

const MAPA = {
  voces: { en: 'en-US-Neural2-F', es: 'es-US-Neural2-A' },
  en: { 'Nice to meet you.': 'nice-to-meet-you.mp3' },
  es: { 'Me encantan los días soleados.': 'me-encantan-los-dias-soleados.mp3' }
};

/**
 * Carga voz.js con el entorno de mentira y devuelve el registro de lo que sonó.
 * `mapa` null simula que audios.json no existe (404).
 */
function montar(mapa, { fallaPlay = false } = {}) {
  const registro = [];

  globalThis.window = globalThis;
  globalThis.alert = () => registro.push({ tipo: 'alerta' });
  globalThis.fetch = () => Promise.resolve(
    mapa
      ? { ok: true, json: () => Promise.resolve(mapa) }
      : { ok: false, json: () => Promise.reject(new Error('404')) }
  );
  globalThis.Audio = function () {
    this.pause = function () {};
    this.play = function () {
      registro.push({ tipo: 'mp3', src: this.src });
      return fallaPlay ? Promise.reject(new Error('bloqueado')) : Promise.resolve();
    };
  };
  globalThis.SpeechSynthesisUtterance = function (texto) { this.text = texto; };
  globalThis.speechSynthesis = {
    cancel() {},
    getVoices() { return [{ lang: 'en-US', name: 'Test', localService: true }]; },
    speak(u) { registro.push({ tipo: 'tts', texto: u.text }); },
    addEventListener() {}
  };

  new Function(FUENTE)();
  return { Voz: globalThis.Voz, registro };
}

// El mapa se pide con fetch: hay que dejar correr las promesas pendientes.
const asentar = () => new Promise((r) => setTimeout(r, 0));

let ok = 0, mal = 0;
function afirmar(nombre, condicion, detalle) {
  if (condicion) { ok++; console.log('  OK   ' + nombre); }
  else { mal++; console.log('  FALLA ' + nombre + (detalle ? '  -> ' + detalle : '')); }
}
function igual(nombre, obtenido, esperado) {
  afirmar(nombre, obtenido === esperado, 'esperaba "' + esperado + '" y dio "' + obtenido + '"');
}

console.log('\n--- Con audio grabado ---');
let { Voz, registro } = montar(MAPA);
await asentar();
Voz.decir('Nice to meet you.', 'en-US');
await asentar();
igual('suena el mp3, no la síntesis', registro[0] && registro[0].tipo, 'mp3');
igual('y desde la ruta del idioma', registro[0] && registro[0].src,
  'assets/audio/en/nice-to-meet-you.mp3');

console.log('\n--- Español, con la etiqueta es-419 ---');
({ Voz, registro } = montar(MAPA));
await asentar();
Voz.decir('Me encantan los días soleados.', 'es-419');
await asentar();
igual('busca en la tabla es', registro[0] && registro[0].src,
  'assets/audio/es/me-encantan-los-dias-soleados.mp3');

console.log('\n--- Frase sin audio generado ---');
({ Voz, registro } = montar(MAPA));
await asentar();
Voz.decir('Good morning!', 'en-US');
await asentar();
igual('cae a la síntesis del navegador', registro[0] && registro[0].tipo, 'tts');
igual('con el texto completo', registro[0] && registro[0].texto, 'Good morning!');

console.log('\n--- El navegador bloquea la reproducción ---');
({ Voz, registro } = montar(MAPA, { fallaPlay: true }));
await asentar();
Voz.decir('Nice to meet you.', 'en-US');
await asentar();
igual('lo intenta con el mp3', registro[0] && registro[0].tipo, 'mp3');
igual('y al fallar habla igual', registro[1] && registro[1].tipo, 'tts');

console.log('\n--- Sin audios.json (ninguna lección tiene audio todavía) ---');
({ Voz, registro } = montar(null));
await asentar();
Voz.decir('Nice to meet you.', 'en-US');
await asentar();
igual('todo suena con la síntesis', registro[0] && registro[0].tipo, 'tts');
afirmar('y nadie alertó al alumno', !registro.some((r) => r.tipo === 'alerta'));

console.log('');
if (mal) {
  console.log('FALLARON ' + mal + ' de ' + (ok + mal) + ' pruebas');
  process.exit(1);
}
console.log('TODO OK: ' + ok + ' pruebas');
