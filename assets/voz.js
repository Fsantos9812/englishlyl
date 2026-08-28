/*
  La voz de las lecciones.

  Dos fuentes, en este orden:

  1. Un .mp3 grabado con Google Cloud TTS, si existe para esa frase. Los genera
     `tools/generar-audios.py` y viven en assets/audio/<idioma>/. Qué frase
     tiene archivo lo dice `audios.json`: el nombre sale de normalizar la frase,
     y ese normalizado se calcula UNA sola vez, en el generador. Acá no se
     recalcula nada — dos implementaciones del mismo normalizado se
     desincronizan en silencio el día que una arregle un caso raro.
  2. La síntesis del navegador, como siempre. Es lo que suena en las lecciones
     sin audio generado, y el paracaídas si el archivo no baja.

  Vivía adentro de assets/lesson.js. Salió de ahí cuando la pantalla de repaso
  necesitó hacer hablar al navegador igual que Listen and Type. Lo delicado no es
  hablar: es ELEGIR LA VOZ. El navegador ignora `utterance.lang` bastante seguido,
  y "es-419" no existe como voz instalada en ningún lado. Con dos copias de esa
  lógica, arreglar la voz en una pantalla dejaba la otra sonando en otro acento.

  No toca el DOM ni guarda nada.
*/
window.Voz = (function () {
  'use strict';

  const TTS = ('speechSynthesis' in window) ? window.speechSynthesis : null;
  let voces = [];

  function refrescar() {
    if (!TTS) return;
    try { voces = TTS.getVoices() || []; } catch (err) { voces = []; }
  }
  if (TTS) {
    refrescar();
    if (TTS.addEventListener) TTS.addEventListener('voiceschanged', refrescar);
    else TTS.onvoiceschanged = refrescar;
  }

  // "es-419" no existe como voz instalada: hay que mapearlo a variantes reales
  // y preferir las latinoamericanas antes que la de Espana.
  const REGIONES = {
    'es-419': ['es-mx', 'es-us', 'es-ar', 'es-co', 'es-cl', 'es-pe'],
    'en-us': ['en-us', 'en-ca'],
    'en-gb': ['en-gb', 'en-ie']
  };

  // El navegador ignora u.lang bastante seguido: hay que elegir la voz a mano.
  function elegirVoz(idioma) {
    if (!voces.length) refrescar();
    const quiero = idioma.toLowerCase().replace('_', '-');
    const base = quiero.split('-')[0];
    const tag = function (v) { return (v.lang || '').toLowerCase().replace('_', '-'); };

    const exacta = voces.find(function (v) { return tag(v) === quiero; });
    if (exacta) return exacta;

    const preferidas = REGIONES[quiero] || [];
    for (const region of preferidas) {
      const hit = voces.find(function (v) { return tag(v) === region; });
      if (hit) return hit;
    }
    return voces.find(function (v) { return tag(v).indexOf(base + '-') === 0 && v.localService; })
        || voces.find(function (v) { return tag(v).indexOf(base + '-') === 0; })
        || voces.find(function (v) { return tag(v) === base; })
        || null;
  }

  /* ---------- Audio grabado ---------- */

  let mapa = null;          // { en: {frase: archivo}, es: {...} }
  let pedido = null;
  let reproductor = null;
  let turno = 0;            // corta los errores tardíos del audio anterior

  function cargarMapa() {
    if (mapa) return Promise.resolve(mapa);
    if (pedido) return pedido;
    // Sin audios.json el sitio funciona igual: se cae a la síntesis del
    // navegador, que es como funcionaban todas las lecciones hasta ahora.
    pedido = fetch('audios.json')
      .then(function (r) { return r.ok ? r.json() : null; })
      .catch(function () { return null; })
      .then(function (m) { mapa = (m && typeof m === 'object') ? m : {}; return mapa; });
    return pedido;
  }
  cargarMapa();

  function archivoDe(texto, idioma) {
    if (!mapa) return null;
    const base = String(idioma || '').toLowerCase().split('-')[0];
    const tabla = mapa[base];
    if (!tabla) return null;
    const nombre = tabla[texto] || tabla[String(texto).trim()];
    return nombre ? 'assets/audio/' + base + '/' + encodeURIComponent(nombre) : null;
  }

  function reproducir(url, alFallar) {
    const mio = ++turno;
    const fallar = function () { if (mio === turno) alFallar(); };
    if (TTS) TTS.cancel();
    if (!reproductor) reproductor = new Audio();
    reproductor.pause();
    reproductor.onerror = fallar;
    reproductor.src = url;
    const p = reproductor.play();
    if (p && p.catch) p.catch(fallar);
  }

  /* ---------- Síntesis del navegador ---------- */

  function sintetizar(texto, idioma) {
    if (!TTS) { alert('Tu navegador no soporta sintesis de voz (TTS).'); return; }
    TTS.cancel();
    const hablar = function () {
      const u = new SpeechSynthesisUtterance(texto);
      u.lang = idioma;
      const v = elegirVoz(idioma);
      if (v) u.voice = v;
      u.rate = 0.95;
      TTS.speak(u);
    };
    if (!voces.length) {
      refrescar();
      if (!voces.length) {
        // Las voces cargan async: esperamos el evento, con corte por las dudas.
        let disparo = false;
        const unaVez = function () { if (disparo) return; disparo = true; refrescar(); hablar(); };
        if (TTS.addEventListener) TTS.addEventListener('voiceschanged', unaVez, { once: true });
        setTimeout(unaVez, 350);
        return;
      }
    }
    hablar();
  }

  /* ---------- La entrada de siempre ---------- */

  function decir(texto, idioma) {
    if (turno) { turno += 1; }            // silencia el mp3 que estuviera sonando
    if (reproductor) reproductor.pause();

    const arrancar = function () {
      const url = archivoDe(texto, idioma);
      if (url) reproducir(url, function () { sintetizar(texto, idioma); });
      else sintetizar(texto, idioma);
    };

    // Con el mapa ya cargado se decide en el acto. Meter un `then` en el medio
    // haría que play() corra fuera del gesto del usuario, y algunos navegadores
    // lo bloquean por autoplay.
    if (mapa) arrancar();
    else cargarMapa().then(arrancar);
  }

  function disponible() { return !!TTS; }

  return {
    decir: decir,
    disponible: disponible
  };
})();
