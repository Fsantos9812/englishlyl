/*
  Los intentos flojos de Listen and Repeat le llegan al profe.

  El Repeat se puntúa con reconocimiento de voz y el audio se descartaba: el
  alumno sacaba 60% y nadie —ni él ni el profe— podía escuchar QUÉ había dicho
  mal. Ahora, en paralelo a la escucha, se graba el intento; si el puntaje
  queda debajo del umbral, la grabación se guarda en IndexedDB y viaja al
  profe por el mismo camino de siempre (assets/sync.js).

  Tres reglas, y las tres salen de cosas que pueden salir mal:

  1. La grabación es BEST-EFFORT. Lo importante de la tarjeta es puntuar: si
     el micrófono no se puede abrir para grabar, el reconocimiento sigue
     igual y no se guarda nada. Nunca se frena la escucha por la grabación.
  2. Sólo se graba si el permiso de micrófono YA está dado. El reconocimiento
     tiene su propio pedido de permiso; abrir un getUserMedia al mismo tiempo
     podía duplicar el cartel en la primera clase de un alumno nuevo. El
     primer intento de la historia no se graba: a partir del segundo, el
     permiso ya quedó concedido.
  3. De cada frase se guarda sólo el ÚLTIMO intento flojo. Un alumno
     trabado en una frase podía llenarle el dispositivo (y el panel) de
     diez grabaciones de lo mismo; al profe le sirve la más reciente.

  No toca el DOM ni sabe de puntajes más allá del umbral.
*/
window.Intentos = (function () {
  'use strict';

  const UMBRAL = 0.85;   // debajo de esto, el intento le llega al profe

  function disponible() {
    return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia
      && window.MediaRecorder && window.indexedDB);
  }

  /* ---------------- IndexedDB (mismo esquema que lesson.js y sync.js) ---------------- */

  let dbPromise = null;
  function abrirDB() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise(function (resolve, reject) {
      const req = indexedDB.open('lecciones_audio', 1);
      req.onupgradeneeded = function (e) {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('grabaciones')) {
          const store = db.createObjectStore('grabaciones', { keyPath: 'id', autoIncrement: true });
          store.createIndex('lessonId', 'lessonId', { unique: false });
        }
      };
      req.onsuccess = function (e) { resolve(e.target.result); };
      req.onerror = function () { reject(req.error); };
    });
    return dbPromise;
  }

  // Sólo el último intento flojo por frase: se borran los anteriores, ya se
  // hayan enviado o no. Si ya viajaron, el profe los tiene; si no, se
  // reemplazan por la voz más fresca.
  async function reemplazarAnteriores(leccion, idx) {
    const db = await abrirDB();
    const todas = await new Promise(function (resolve, reject) {
      const tx = db.transaction('grabaciones', 'readonly');
      const req = tx.objectStore('grabaciones').index('lessonId').getAll(IDBKeyRange.only(leccion));
      req.onsuccess = function () { resolve(req.result || []); };
      req.onerror = function () { reject(req.error); };
    });
    const viejas = todas.filter(function (g) {
      return g.origen === 'repeat' && Number(g.phraseIdx) === Number(idx);
    });
    if (!viejas.length) return;
    await new Promise(function (resolve, reject) {
      const tx = db.transaction('grabaciones', 'readwrite');
      viejas.forEach(function (g) { tx.objectStore('grabaciones').delete(g.id); });
      tx.oncomplete = function () { resolve(); };
      tx.onerror = function () { reject(tx.error); };
    });
  }

  async function guardar(opts, blob) {
    await reemplazarAnteriores(opts.leccion, opts.idx);
    const db = await abrirDB();
    await new Promise(function (resolve, reject) {
      const tx = db.transaction('grabaciones', 'readwrite');
      tx.objectStore('grabaciones').add({
        lessonId: opts.leccion,
        phraseIdx: opts.idx,
        phraseEs: opts.frase.es,
        phraseEn: opts.frase.en,
        origen: 'repeat',
        puntaje: opts.puntaje,
        dicho: opts.dicho,
        blob: blob,
        mimeType: blob.type,
        timestamp: new Date().toISOString()
      });
      tx.oncomplete = function () { resolve(); };
      tx.onerror = function () { reject(tx.error); };
    });
    // Viaja al profe por el camino de siempre: la cola de sync lee la base.
    if (window.Sync) window.Sync.programar();
  }

  /* ---------------- El permiso, sin duplicar el cartel ---------------- */

  function permisoYaDado() {
    if (!navigator.permissions || !navigator.permissions.query) {
      return Promise.resolve(false);
    }
    return navigator.permissions.query({ name: 'microphone' }).then(
      function (r) { return r.state === 'granted'; },
      function () { return false; }
    );
  }

  function pickMimeType() {
    const candidatos = ['audio/webm', 'audio/mp4', 'audio/ogg'];
    for (const c of candidatos) {
      if (MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(c)) return c;
    }
    return '';
  }

  /* ---------------- API ---------------- */

  const NOP = { decidir: function () {}, cerrar: function () {} };

  /**
   * Empieza a grabar en paralelo a Voz.escuchar(). Devuelve un manejador:
   *   decidir(puntaje, dicho)  guarda si el puntaje quedó bajo, descarta si no
   *   cerrar()                 frena todo; sin decidir previa, descarta
   * Si no se puede grabar, devuelve un manejador que no hace nada: la tarjeta
   * no tiene por qué enterarse.
   */
  function empezar(opts) {
    if (!disponible()) return NOP;

    let decision = null;       // null = todavía no se sabe; {guardar, puntaje, dicho}
    let rec = null;
    let stream = null;
    let chunks = [];
    let terminado = false;

    function soltar() {
      terminado = true;
      if (stream) { stream.getTracks().forEach(function (t) { t.stop(); }); stream = null; }
      rec = null;
    }

    function alParar() {
      const blob = chunks.length ? new Blob(chunks, { type: rec.mimeType || 'audio/webm' }) : null;
      const d = decision;
      soltar();
      if (!d || !d.guardar || !blob || !blob.size) return;
      guardar({
        leccion: opts.leccion, idx: opts.idx, frase: opts.frase,
        puntaje: d.puntaje, dicho: d.dicho
      }, blob).catch(function (err) {
        console.warn('[intentos] no se pudo guardar el intento:', err);
      });
    }

    function resolver() {
      // El stream no llegó todavía: soltar marca terminado, así cuando llegue
      // se descarta en vez de quedar grabando con el micrófono abierto.
      if (!rec) { soltar(); return; }
      if (rec.state === 'recording') { rec.stop(); return; }  // sigue en alParar
      alParar();
    }

    permisoYaDado().then(function (si) {
      if (!si || terminado) return;
      return navigator.mediaDevices.getUserMedia({ audio: true }).then(function (s) {
        if (terminado) { s.getTracks().forEach(function (t) { t.stop(); }); return; }
        stream = s;
        const mime = pickMimeType();
        try {
          rec = mime ? new MediaRecorder(s, { mimeType: mime }) : new MediaRecorder(s);
        } catch (err) { soltar(); return; }
        rec.ondataavailable = function (e) { if (e.data.size > 0) chunks.push(e.data); };
        rec.onstop = alParar;
        try { rec.start(); }
        catch (err) { soltar(); }
      });
    }).catch(function () { soltar(); });

    return {
      decidir: function (puntaje, dicho) {
        if (decision) return;
        decision = { guardar: puntaje < UMBRAL, puntaje: puntaje, dicho: String(dicho || '') };
        resolver();
      },
      cerrar: function () {
        if (!decision) decision = { guardar: false };
        resolver();
      }
    };
  }

  return { empezar: empezar, UMBRAL: UMBRAL };
})();
