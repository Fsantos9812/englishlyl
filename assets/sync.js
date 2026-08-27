/*
  Envío del progreso y las grabaciones al servidor del profe.

  Diseño: nada se pierde si no hay señal. El progreso vive en localStorage y se
  manda entero cada vez (es chico e idempotente: el servidor pisa lo anterior,
  salvo la racha, que se une entre dispositivos).
  Las grabaciones ya están en IndexedDB, así que en vez de duplicarlas en una
  cola aparte se les marca un campo `enviado` y se reintenta lo que falte.

  Sin sesión iniciada esto no hace absolutamente nada: las lecciones andan
  igual, sólo que el progreso no sale del dispositivo.
*/
window.Sync = (function () {
  'use strict';

  const ENDPOINT = window.SYNC_ENDPOINT || '/.netlify/functions/entregar';
  const CLAVE_ESTADO = 'lecciones:sync';
  const PREFIJO_PROGRESO = 'lecciones:progreso:';
  const ESPERA = 3000;             // junta varios ejercicios seguidos en un envío

  const oyentes = [];
  let temporizador = null;
  let corriendo = false;

  // La identidad sale de la sesion: sin login no se manda nada a ningun lado.
  function configurado() {
    return !!(window.Auth && window.Auth.activa() && window.Auth.rol() === 'alumno');
  }
  function alumno() { return window.Auth ? window.Auth.nombre() : ''; }

  function estado() {
    try {
      const g = JSON.parse(localStorage.getItem(CLAVE_ESTADO) || 'null');
      if (g && typeof g === 'object') return g;
    } catch (err) {}
    return { ultimo: null, error: null, pendientes: 0, fallidas: 0 };
  }

  function guardarEstado(parcial) {
    const nuevo = Object.assign(estado(), parcial);
    try { localStorage.setItem(CLAVE_ESTADO, JSON.stringify(nuevo)); } catch (err) {}
    oyentes.forEach(function (fn) { try { fn(nuevo); } catch (err) {} });
    return nuevo;
  }

  function alCambiar(fn) { oyentes.push(fn); fn(estado()); }

  /* ---------------- IndexedDB (mismo esquema que lesson.js) ---------------- */

  function abrirDB() {
    return new Promise(function (resolve, reject) {
      if (!('indexedDB' in window)) { reject(new Error('IndexedDB no disponible')); return; }
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
  }

  async function clasificarGrabaciones() {
    let db;
    try { db = await abrirDB(); } catch (err) { return { pendientes: [], fallidas: [] }; }
    if (!db.objectStoreNames.contains('grabaciones')) return { pendientes: [], fallidas: [] };
    const todas = await new Promise(function (resolve) {
      const tx = db.transaction('grabaciones', 'readonly');
      const req = tx.objectStore('grabaciones').getAll();
      req.onsuccess = function () { resolve(req.result || []); };
      req.onerror = function () { resolve([]); };
    });
    const pendientes = [];
    const fallidas = [];
    todas.forEach(function (g) {
      if (g.enviado) return;
      // Las que fallaron con un error que no se arregla reintentando salen de
      // la cola: si no, la misma grabacion vuelve a trabar el envio cada vez.
      if (g.falloPermanente) fallidas.push(g);
      else pendientes.push(g);
    });
    return { pendientes: pendientes, fallidas: fallidas };
  }

  async function grabacionesPendientes() {
    return (await clasificarGrabaciones()).pendientes;
  }

  async function marcarGrabacion(id, cambios) {
    const db = await abrirDB();
    return new Promise(function (resolve, reject) {
      const tx = db.transaction('grabaciones', 'readwrite');
      const store = tx.objectStore('grabaciones');
      const req = store.get(id);
      req.onsuccess = function () {
        const rec = req.result;
        if (!rec) { resolve(); return; }
        Object.assign(rec, cambios);
        store.put(rec);
      };
      tx.oncomplete = function () { resolve(); };
      tx.onerror = function () { reject(tx.error); };
    });
  }

  function marcarEnviada(id) {
    return marcarGrabacion(id, { enviado: true, enviadoEn: new Date().toISOString() });
  }

  function marcarFallida(id, motivo) {
    return marcarGrabacion(id, { falloPermanente: motivo || 'no se pudo enviar',
                                 falloEn: new Date().toISOString() });
  }

  // 413 = mas grande que el tope; 400/422 = el servidor no lo acepta como viene.
  // Reintentar cualquiera de esos da exactamente el mismo resultado.
  const ERRORES_PERMANENTES = [400, 413, 422];
  function esPermanente(err) { return ERRORES_PERMANENTES.indexOf(err && err.status) >= 0; }

  /* ---------------- Envío ---------------- */

  function base64De(buffer) {
    const bytes = new Uint8Array(buffer);
    let bin = '';
    const paso = 0x8000;   // de a pedazos: String.fromCharCode revienta con arrays enormes
    for (let i = 0; i < bytes.length; i += paso) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + paso));
    }
    return btoa(bin);
  }

  async function postear(cuerpo) {
    const r = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + (window.Auth ? window.Auth.token() : '')
      },
      body: JSON.stringify(cuerpo)
    });
    let datos = {};
    try { datos = await r.json(); } catch (err) {}
    if (!r.ok) {
      // 401 = token vencido o revocado: se cierra la sesion y se deja de reintentar.
      if (r.status === 401 && window.Auth) window.Auth.vencida();
      const e = new Error(datos.error || ('HTTP ' + r.status));
      e.status = r.status;
      throw e;
    }
    return datos;
  }

  function juntarProgreso() {
    const lecciones = {};
    try {
      for (const clave of Object.keys(localStorage)) {
        if (clave.indexOf(PREFIJO_PROGRESO) !== 0) continue;
        const id = clave.slice(PREFIJO_PROGRESO.length);
        try { lecciones[id] = JSON.parse(localStorage.getItem(clave)); } catch (err) {}
      }
    } catch (err) {}

    // La racha viaja como lista de dias, no como contador: asi el servidor
    // puede unir el historial de varios dispositivos sin pisar nada.
    const racha = window.Racha ? window.Racha.paraEnviar() : null;

    // El estado de repeticion espaciada viaja entero: es chico y el servidor
    // lo une tarjeta por tarjeta, quedandose con el repaso mas reciente.
    const srs = window.SRS ? window.SRS.paraEnviar() : null;

    // El XP mide esfuerzo por dia. Viaja entero porque es chico: un año de
    // clase son 365 numeros.
    const xp = window.XP ? window.XP.paraEnviar() : null;

    return { lecciones: lecciones, racha: racha, srs: srs, xp: xp,
             enviadoEn: new Date().toISOString() };
  }

  async function sincronizar() {
    if (corriendo || !configurado()) return estado();
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      return guardarEstado({ error: 'sin conexión' });
    }

    corriendo = true;

    try {
      const respuesta = await postear({ tipo: 'progreso', datos: juntarProgreso() });

      // El servidor devuelve los dias de TODOS los dispositivos del alumno.
      if (respuesta && respuesta.racha && window.Racha) {
        if (window.Racha.adoptar(respuesta.racha)) guardarEstado({ rachaCambio: Date.now() });
      }
      if (respuesta && respuesta.srs && window.SRS) {
        window.SRS.adoptar(respuesta.srs);
      }
      if (respuesta && respuesta.xp && window.XP) {
        window.XP.adoptar(respuesta.xp);
      }

      const cola = await clasificarGrabaciones();
      guardarEstado({ pendientes: cola.pendientes.length, fallidas: cola.fallidas.length });

      let quedan = cola.pendientes.length;
      let ultimoError = null;

      for (const g of cola.pendientes) {
        // El try va ADENTRO del for a proposito. Estaba afuera, y entonces la
        // primera grabacion que fallaba abortaba el bucle entero: las que
        // venian atras no se intentaban nunca, ni en ese envio ni en ninguno
        // despues, porque la cola se rearmaba en el mismo orden y volvia a
        // morir en la misma. Un alumno entrego 4 de 10 por esto.
        try {
          const buffer = await g.blob.arrayBuffer();
          await postear({
            tipo: 'audio',
            id: String(g.id) + '-' + String(g.timestamp || ''),
            leccion: g.lessonId,
            frase: g.phraseIdx,
            textoEs: g.phraseEs,
            mime: g.mimeType || g.blob.type,
            grabadoEn: g.timestamp,
            audio: base64De(buffer)
          });
          await marcarEnviada(g.id);
        } catch (err) {
          if (err && err.status === 401) throw err;   // sesion muerta: no seguir
          if (esPermanente(err)) await marcarFallida(g.id, err.message);
          ultimoError = err;
        }
        quedan -= 1;
        guardarEstado({ pendientes: quedan });
      }

      // Se recuenta contra la base en vez de llevar la cuenta a mano: es la
      // unica forma de que el numero que ve el alumno sea el real.
      const despues = await clasificarGrabaciones();
      return guardarEstado({
        ultimo: new Date().toISOString(),
        error: despues.pendientes.length && ultimoError ? (ultimoError.message || 'no se pudo enviar') : null,
        pendientes: despues.pendientes.length,
        fallidas: despues.fallidas.length
      });
    } catch (err) {
      // 401 ya cerró la sesión más arriba. Lo demás casi siempre es falta de red.
      return guardarEstado({ error: err.message || 'no se pudo enviar' });
    } finally {
      corriendo = false;
    }
  }

  function programar() {
    if (!configurado()) return;
    clearTimeout(temporizador);
    temporizador = setTimeout(sincronizar, ESPERA);
  }

  /* ---------------- Disparadores ---------------- */

  window.addEventListener('online', function () { programar(); });
  window.addEventListener('load', function () { if (configurado()) sincronizar(); });
  // Recien logueado: subir lo que se hizo antes de entrar.
  if (window.Auth) {
    let habiaSesion = window.Auth.activa();
    window.Auth.alCambiar(function (s2) {
      const hay = !!s2;
      if (hay && !habiaSesion) sincronizar();
      habiaSesion = hay;
    });
  }

  return {
    grabacionesFallidas: async function () { return (await clasificarGrabaciones()).fallidas; },
    programar: programar,
    sincronizar: sincronizar,
    configurado: configurado,
    estado: estado,
    alCambiar: alCambiar,
    alumno: alumno
  };
})();
