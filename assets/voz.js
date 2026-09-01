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

  /* ---------- Escuchar al alumno ---------- */

  /*
    Vive acá, y no en cada pantalla, por el mismo motivo que `decir`: había dos
    copias del reconocimiento —la tarjeta de la lección y la sesión— y ninguna
    sabía de la otra. De ahí salían los "aborted" al azar.

    Dos causas, las dos reales:

    1. Nadie cancelaba el reconocimiento anterior. Si el alumno abría el
       micrófono, no decía nada y pasaba al ejercicio siguiente, ese primero
       seguía vivo escuchando. Al abrir el segundo, Chrome aborta uno de los
       dos: el alumno ve "aborted" sin haber hecho nada.
    2. Escuchar con la frase todavía sonando. Ahora que hay mp3, el audio puede
       seguir reproduciéndose cuando el alumno aprieta 🎤.

    Y `aborted` NUNCA fue un problema de permiso. Decirle "revisá el permiso de
    micrófono" a alguien que ya lo dio lo manda a buscar donde no hay nada.
  */

  const REC = window.SpeechRecognition || window.webkitSpeechRecognition;
  let escucha = null;                 // la única activa, si hay alguna

  // Red de seguridad. Chrome corta solo a los pocos segundos de silencio, pero
  // hay casos —la pestaña pasa a segundo plano, el celular se duerme— en los
  // que `onend` no llega nunca y el alumno se queda con el micrófono abierto y
  // el botón trabado. Pasado esto, lo cerramos nosotros.
  const LIMITE_ESCUCHA = 20000;

  // Cuánto silencio se espera antes de dar por terminada la frase.
  //
  // Chrome, con `continuous` en falso, cierra en la PRIMERA pausa y devuelve lo
  // que llevaba. Un alumno de A1 leyendo "What is the purpose of your visit?"
  // hace una pausa a mitad de frase, y ahí Chrome puntuaba "what is" contra la
  // oración entera. Por eso fallaba en las largas y no en las cortas.
  //
  // Ahora escuchamos en continuo y el corte lo decidimos nosotros. 2,5 segundos
  // es más de lo que dura una pausa de alguien que está leyendo con esfuerzo, y
  // menos de lo que se siente como que la app se colgó — sobre todo porque al
  // dejar de hablar la pantalla ya dice "Procesando…".
  const PAUSA_FINAL = 2500;

  const MOTIVOS = {
    'no-speech':           'No te escuché. Prueba de nuevo, más cerca del micrófono.',
    'aborted':             'Se cortó la escucha. Prueba de nuevo.',
    'audio-capture':       'No encontré micrófono en este dispositivo.',
    'not-allowed':         'El navegador bloqueó el micrófono. Revisá el permiso del sitio.',
    'service-not-allowed': 'El navegador bloqueó el micrófono. Revisá el permiso del sitio.',
    'network':             'El reconocimiento necesita internet: Chrome procesa el audio en sus servidores.'
  };

  function callar() {
    turno += 1;                       // invalida el error tardío del audio
    if (reproductor) reproductor.pause();
    if (TTS) TTS.cancel();
  }

  /**
   * Corta la escucha en curso sin puntuar ni mostrar error.
   *
   * Pero SI le avisa que termino. Anular los tres handlers y nada mas dejaba a
   * la pantalla que la habia abierto con el boton deshabilitado y un
   * "Escuchando..." eterno: el microfono ya estaba cerrado y ella no se
   * enteraba nunca.
   */
  function cancelarEscucha() {
    if (!escucha) return false;
    const r = escucha;
    escucha = null;
    r.onresult = null; r.onerror = null; r.onend = null;
    if (r.__reloj) { clearTimeout(r.__reloj); r.__reloj = null; }
    try { r.abort(); } catch (err) {}
    const cerrarUI = r.__alTerminar;
    r.__alTerminar = null;
    if (cerrarUI) cerrarUI();
    return true;
  }

  /**
   * Escucha una vez y avisa por callbacks.
   *   alOir(texto)              lo que entendió
   *   alFallar(mensaje, codigo) mensaje ya listo para mostrarle al alumno
   *   alTerminar()              siempre al final, para volver a habilitar el botón
   *   alProcesar()              opcional: dejó de oír y está pensando. Sin esto,
   *                             entre la última palabra y el veredicto la pantalla
   *                             decía "Escuchando…" y parecía trabada.
   */
  function escuchar(idioma, cb) {
    const fallar = function (mensaje, codigo) {
      if (cb.alFallar) cb.alFallar(mensaje, codigo);
    };
    if (!REC) {
      fallar('El reconocimiento de voz no está disponible en este navegador. Prueba en Chrome o Edge.', 'no-soportado');
      if (cb.alTerminar) cb.alTerminar();
      return;
    }

    const habiaOtra = cancelarEscucha();
    callar();

    const rec = new REC();
    rec.lang = idioma;
    // En continuo, y con parciales, para que una pausa a mitad de frase no
    // termine la escucha. Si un navegador ignora `continuous` --Android lo hizo
    // durante anos-- se comporta como antes: se resuelve igual con lo que haya
    // llegado, porque el resultado se arma al cerrar y no en el primer onresult.
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;

    let cerrado = false;
    let dicho = '';                   // lo final acumulado, no el primer trozo
    let pausa = null;
    // Lo guarda el propio reconocimiento para que cancelarEscucha() pueda
    // soltarle la interfaz aunque le haya anulado los handlers.
    rec.__alTerminar = cb.alTerminar || null;

    const terminar = function () {
      if (escucha === rec) escucha = null;
      if (pausa) { clearTimeout(pausa); pausa = null; }
      if (rec.__reloj) { clearTimeout(rec.__reloj); rec.__reloj = null; }
      const cerrarUI = rec.__alTerminar;
      rec.__alTerminar = null;          // una sola vez, venga por donde venga
      if (cerrarUI) cerrarUI();
    };

    // Chrome avisa cuando dejó de oír voz, antes de tener el resultado: es el
    // momento de cambiar "Escuchando…" por "Procesando…". Si el evento no
    // llega (nunca habló, o el navegador no lo tira), no pasa nada.
    // Cierra la escucha por silencio. `stop()` y no `abort()`: stop deja llegar
    // el último resultado, abort lo tira.
    const cerrarPorPausa = function () {
      pausa = null;
      if (escucha !== rec) return;
      try { rec.stop(); } catch (err) {}
    };
    const esperarMas = function () {
      if (pausa) clearTimeout(pausa);
      pausa = setTimeout(cerrarPorPausa, PAUSA_FINAL);
    };

    // Resuelve una sola vez, con TODO lo que se acumuló.
    const resolver = function () {
      if (cerrado) return;
      cerrado = true;
      const texto = dicho.trim();
      if (texto) cb.alOir(texto);
      else fallar(MOTIVOS['no-speech'], 'no-speech');
    };

    rec.onspeechstart = function () { esperarMas(); };
    // Chrome avisa cuando dejó de oír voz, antes de tener el resultado: es el
    // momento de cambiar "Escuchando…" por "Procesando…". Pero NO se cierra acá:
    // esto también se dispara en una pausa a mitad de frase, y cerrar en ese
    // punto es exactamente el bug que había. Decide el reloj de la pausa.
    rec.onspeechend = function () {
      if (cb.alProcesar) cb.alProcesar();
      esperarMas();
    };
    rec.onresult = function (ev) {
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        if (ev.results[i].isFinal) {
          dicho += (dicho ? ' ' : '') + String(ev.results[i][0].transcript).trim();
        }
      }
      esperarMas();                   // sigue hablando: se corre el corte
    };
    rec.onerror = function (ev) {
      // Un 'no-speech' después de haber dicho algo no es un fracaso: se puntúa
      // lo que dijo en vez de mandarlo a repetir toda la frase.
      if (ev.error === 'no-speech' && dicho.trim()) { resolver(); return; }
      cerrado = true;
      fallar(MOTIVOS[ev.error] || ('No se pudo escuchar (' + ev.error + ').'), ev.error);
    };
    rec.onend = function () {
      // Terminar sin nada dicho y sin error se trata como "no te escuché",
      // que es lo que el alumno vivió.
      resolver();
      terminar();
    };

    escucha = rec;
    const arrancar = function () {
      if (escucha !== rec) return;    // lo cancelaron mientras esperábamos
      try { rec.start(); }
      catch (err) {
        escucha = null;
        cerrado = true;
        fallar('No se pudo iniciar el micrófono.', 'start');
        terminar();
        return;
      }
      rec.__reloj = setTimeout(function () {
        if (escucha !== rec) return;
        // Se acabó el plazo, pero si alcanzó a decir algo se puntúa igual: es
        // suyo y perderlo sería peor que cortarlo.
        resolver();
        escucha = null;
        try { rec.abort(); } catch (err2) {}
        terminar();
      }, LIMITE_ESCUCHA);
    };
    // Arrancar en el mismo tick en que se abortó la anterior vuelve a dar
    // "aborted": Chrome necesita un respiro para soltar el micrófono.
    if (habiaOtra) setTimeout(arrancar, 200);
    else arrancar();
  }

  function disponible() { return !!TTS; }
  function puedeEscuchar() { return !!REC; }

  // En segundo plano los temporizadores se congelan y el reloj de seguridad de
  // 20 s nunca llega: el micrófono quedaba abierto para siempre. Cortamos acá.
  if (typeof document !== 'undefined' && document.addEventListener) {
    document.addEventListener('visibilitychange', function () {
      if (document.hidden && escucha) cancelarEscucha();
    });
  }
  if (typeof window !== 'undefined' && window.addEventListener) {
    window.addEventListener('pagehide', cancelarEscucha);
  }

  return {
    decir: decir,
    disponible: disponible,
    escuchar: escuchar,
    cancelarEscucha: cancelarEscucha,
    puedeEscuchar: puedeEscuchar
  };
})();
