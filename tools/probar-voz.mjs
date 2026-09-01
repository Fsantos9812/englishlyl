/*
  Pruebas de assets/voz.js: hablarle al alumno y escucharlo.

      node tools/probar-voz.mjs

  Carga assets/voz.js de verdad, con un `fetch`, un `Audio`, un
  `speechSynthesis` y un `SpeechRecognition` de mentira.

  Dos cosas se cuidan acá:

  - Que la caída a la voz del navegador nunca deje al alumno en silencio: sin
    audios.json, sin el archivo, o con la reproducción bloqueada, algo suena.
  - Que haya UNA sola escucha abierta a la vez, y que los errores del micrófono
    digan lo que pasó. Dos escuchas simultáneas le daban al alumno un "aborted"
    que encima lo mandaba a revisar un permiso que ya había dado.
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
const setTimeoutReal = globalThis.setTimeout;

function montar(mapa, { fallaPlay = false } = {}) {
  const registro = [];
  const reconocimientos = [];
  const relojes = [];

  // voz.js arma un timer largo como red de seguridad. Lo interceptamos para
  // poder dispararlo a mano en vez de esperar 20 segundos.
  globalThis.setTimeout = function (fn, ms) {
    if (ms >= 2000) { relojes.push(fn); return 'reloj-' + relojes.length; }
    return setTimeoutReal(fn, ms);
  };

  // SpeechRecognition de mentira: guarda cada instancia para poder disparar a
  // mano el resultado, el error o el final, que es lo que hace el navegador.
  globalThis.SpeechRecognition = function () {
    const rec = this;
    rec.abortada = false;
    rec.arrancada = false;
    rec.start = function () { rec.arrancada = true; };
    rec.abort = function () { rec.abortada = true; };
    rec.detenida = false;
    rec.stop = function () { rec.detenida = true; };
    reconocimientos.push(rec);
  };

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
  globalThis.setTimeout = setTimeoutReal;   // sólo se intercepta durante la carga
  return { Voz: globalThis.Voz, registro, reconocimientos, relojes, interceptar() {
    globalThis.setTimeout = function (fn, ms) {
      if (ms >= 2000) { relojes.push(fn); return 'reloj-' + relojes.length; }
      return setTimeoutReal(fn, ms);
    };
  } };
}

// Un evento onresult como el del navegador: `results` es una lista acumulada y
// `resultIndex` dice desde donde hay novedades.
function resultado(desde, trozos) {
  const results = trozos.map((t) => ({ isFinal: true, 0: { transcript: t } }));
  return { resultIndex: desde, results };
}

// El arranque se difiere 200 ms cuando habia otra escucha abierta.
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

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

console.log('\n--- Escuchar: una sola a la vez ---');
let recs;
({ Voz, registro, reconocimientos: recs } = montar(MAPA));
await asentar();
Voz.escuchar('en-US', { alOir() {}, alFallar() {} });
Voz.escuchar('en-US', { alOir() {}, alFallar() {} });
await esperar(260);
igual('se crearon dos', recs.length, 2);
afirmar('la primera quedo abortada', recs[0].abortada === true);
afirmar('y la segunda arranco igual', recs[1].arrancada === true, 'no arranco');

console.log('\n--- Escuchar avisa cuando deja de oír (procesando) ---');
({ Voz, reconocimientos: recs } = montar(MAPA));
await asentar();
let proceso = false;
Voz.escuchar('en-US', {
  alOir() {},
  alFallar() {},
  alProcesar() { proceso = true; }
});
await esperar(260);
recs[recs.length - 1].onspeechend();
afirmar('onspeechend dispara alProcesar', proceso === true);

console.log('\n--- Escuchar corta el audio que estaba sonando ---');
({ Voz, registro, reconocimientos: recs } = montar(MAPA));
await asentar();
Voz.decir('Nice to meet you.', 'en-US');
await asentar();
Voz.escuchar('en-US', { alOir() {}, alFallar() {} });
await asentar();
afirmar('el mp3 sono antes', registro[0] && registro[0].tipo === 'mp3');
afirmar('y la escucha arranco', recs[0] && recs[0].arrancada === true);

console.log('\n--- Una pausa a mitad de frase no termina la escucha ---');
let relojesA, interceptarA;
({ Voz, reconocimientos: recs, relojes: relojesA, interceptar: interceptarA } = montar(MAPA));
await asentar();
interceptarA();
let oido = null, falloA = null;
Voz.escuchar('en-US', { alOir(t) { oido = t; }, alFallar(m) { falloA = m; } });
let rec = recs[0];
rec.onresult(resultado(0, ['What is']));
rec.onspeechend();                       // el alumno pausó para leer lo que sigue
afirmar('no puntúa el trozo suelto', oido === null, 'puntuó "' + oido + '"');
afirmar('y no cerró el micrófono', rec.detenida === false);
rec.onresult(resultado(1, ['What is', 'the purpose of your visit']));
relojesA[relojesA.length - 1]();         // ahora sí: se acabó el silencio
afirmar('recién ahí cierra', rec.detenida === true);
rec.onend();
igual('y puntúa la frase entera', oido, 'What is the purpose of your visit');
igual('sin ningún error', falloA, null);

console.log('\n--- no-speech después de haber dicho algo ---');
({ Voz, reconocimientos: recs, relojes: relojesA, interceptar: interceptarA } = montar(MAPA));
await asentar();
interceptarA();
oido = null; falloA = null;
Voz.escuchar('en-US', { alOir(t) { oido = t; }, alFallar(m) { falloA = m; } });
rec = recs[0];
rec.onresult(resultado(0, ['Here you go']));
rec.onerror({ error: 'no-speech' });
igual('puntúa lo que dijo', oido, 'Here you go');
igual('en vez de mandarlo a repetir', falloA, null);

console.log('\n--- El plazo máximo tampoco tira lo dicho ---');
({ Voz, reconocimientos: recs, relojes: relojesA, interceptar: interceptarA } = montar(MAPA));
await asentar();
interceptarA();
oido = null; falloA = null;
Voz.escuchar('en-US', { alOir(t) { oido = t; }, alFallar(m) { falloA = m; } });
rec = recs[0];
rec.onresult(resultado(0, ['Two weeks thank you']));
relojesA[0]();                           // el reloj de los 20 segundos
igual('se queda con lo que alcanzó a decir', oido, 'Two weeks thank you');

console.log('\n--- Los mensajes de error ---');
({ Voz, registro, reconocimientos: recs } = montar(MAPA));
await asentar();
const dichos = {};
const probarError = (codigo) => {
  Voz.cancelarEscucha();
  const antes = recs.length;
  Voz.escuchar('en-US', {
    alOir() {},
    alFallar(mensaje, cod) { dichos[cod] = mensaje; }
  });
  const rec = recs[recs.length - 1];
  if (recs.length === antes) return;
  rec.onerror({ error: codigo });
  rec.onend();
};
['aborted', 'not-allowed', 'no-speech', 'network'].forEach(probarError);
await esperar(260);
afirmar('aborted NO habla de permisos',
  dichos['aborted'] && !/permiso/i.test(dichos['aborted']), dichos['aborted']);
afirmar('aborted invita a reintentar',
  /de nuevo/i.test(dichos['aborted'] || ''), dichos['aborted']);
afirmar('not-allowed SI habla del permiso',
  /permiso/i.test(dichos['not-allowed'] || ''), dichos['not-allowed']);
afirmar('no-speech dice que no se oyo nada',
  /escuch/i.test(dichos['no-speech'] || ''), dichos['no-speech']);
afirmar('network menciona internet',
  /internet/i.test(dichos['network'] || ''), dichos['network']);

console.log('\n--- Cancelar suelta la interfaz de la que se cancela ---');
({ Voz, registro, reconocimientos: recs } = montar(MAPA));
await asentar();
let cerroPrimera = false, falloPrimera = null;
Voz.escuchar('en-US', {
  alOir() {},
  alFallar(m) { falloPrimera = m; },
  alTerminar() { cerroPrimera = true; }
});
Voz.cancelarEscucha();
afirmar('la primera se entera de que termino', cerroPrimera === true,
  'quedaria con el boton trabado y "Escuchando..." para siempre');
afirmar('y no le muestra ningun error al alumno', falloPrimera === null, falloPrimera);

console.log('\n--- Dos clicks seguidos en el microfono ---');
({ Voz, registro, reconocimientos: recs } = montar(MAPA));
await asentar();
let cerradas = 0;
const abrir = () => Voz.escuchar('en-US', {
  alOir() {}, alFallar() {}, alTerminar() { cerradas += 1; }
});
abrir();
abrir();
await esperar(260);
igual('la primera solto su interfaz', cerradas, 1);
recs[1].onend();
igual('y la segunda al terminar', cerradas, 2);

console.log('\n--- El reloj cierra una escucha colgada ---');
let relojes, interceptar;
({ Voz, registro, reconocimientos: recs, relojes, interceptar } = montar(MAPA));
await asentar();
interceptar();
let colgada = null, solto = false;
Voz.escuchar('en-US', {
  alOir() {},
  alFallar(m) { colgada = m; },
  alTerminar() { solto = true; }
});
igual('quedo un reloj armado', relojes.length, 1);
relojes[0]();                                  // se cumplio el plazo
afirmar('aborta el reconocimiento', recs[0].abortada === true);
afirmar('le dice al alumno que no se lo escucho', /escuch/i.test(colgada || ''), colgada);
afirmar('y suelta la interfaz', solto === true);
solto = false;
recs[0].onend();                               // el onend tardio, si llega
afirmar('un onend posterior no vuelve a soltarla', solto === false);
globalThis.setTimeout = setTimeoutReal;

console.log('\n--- Termina sin resultado y sin error ---');
({ Voz, registro, reconocimientos: recs } = montar(MAPA));
await asentar();
let mensajeFinal = null, termino = false;
Voz.escuchar('en-US', {
  alOir() {},
  alFallar(m) { mensajeFinal = m; },
  alTerminar() { termino = true; }
});
recs[0].onend();
afirmar('se trata como "no te escuche"', /escuch/i.test(mensajeFinal || ''), mensajeFinal);
afirmar('y avisa que termino, para rehabilitar el boton', termino === true);

console.log('\n--- Sin reconocimiento en el navegador ---');
montar(MAPA);                       // deja el entorno armado
globalThis.SpeechRecognition = undefined;   // ...y le saca el reconocimiento
globalThis.webkitSpeechRecognition = undefined;
new Function(FUENTE)();
let sinSoporte = null, cerro = false;
globalThis.Voz.escuchar('en-US', {
  alOir() {},
  alFallar(m) { sinSoporte = m; },
  alTerminar() { cerro = true; }
});
afirmar('avisa que el navegador no puede', /Chrome|Edge/.test(sinSoporte || ''), sinSoporte);
afirmar('y cierra igual', cerro === true);
igual('puedeEscuchar dice que no', globalThis.Voz.puedeEscuchar(), false);

console.log('');
if (mal) {
  console.log('FALLARON ' + mal + ' de ' + (ok + mal) + ' pruebas');
  process.exit(1);
}
console.log('TODO OK: ' + ok + ' pruebas');
