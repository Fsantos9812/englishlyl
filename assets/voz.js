/*
  Síntesis de voz del navegador.

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

  function decir(texto, idioma) {
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

  function disponible() { return !!TTS; }

  return {
    decir: decir,
    disponible: disponible
  };
})();
