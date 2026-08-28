/*
  Lecciones interactivas — lógica compartida por todas las lecciones.
  Los datos propios de cada lección viven en el <script type="application/json" id="lesson-data">
  de la página. Este archivo no contiene contenido, sólo comportamiento.
*/
(function () {
  'use strict';

  /* ---------- Datos de la lección ---------- */
  const dataEl = document.getElementById('lesson-data');
  if (!dataEl) { console.error('[leccion] Falta el bloque #lesson-data.'); return; }

  let DATA;
  try { DATA = JSON.parse(dataEl.textContent); }
  catch (err) { console.error('[leccion] #lesson-data no es JSON valido:', err); return; }

  const LESSON_ID         = DATA.id || 'leccion';
  const LANG_EN           = DATA.langEn || 'en-US';
  const LANG_ES           = DATA.langEs || 'es-419';
  const REPEAT_PHRASES    = Array.isArray(DATA.repeat) ? DATA.repeat : [];
  const TYPE_PHRASES      = Array.isArray(DATA.type) ? DATA.type : [];
  const TRANSLATE_PHRASES = Array.isArray(DATA.translate) ? DATA.translate : [];
  const TOTAL_SCORED      = REPEAT_PHRASES.length + TYPE_PHRASES.length;
  const TOTAL_EJERCICIOS  = TOTAL_SCORED + TRANSLATE_PHRASES.length;

  // Las traducciones grabadas NO van a `results`. Si fueran ahi le inflarian el
  // promedio al alumno y al panel del profe, que promedian todo valor numerico
  // que encuentran. Se cuentan aparte, derivadas de las grabaciones que existen:
  // la grabacion es la fuente de verdad, esto es solo el conteo.
  let translateConGrabacion = {};
  function translateHechas() { return Object.keys(translateConGrabacion).length; }
  let refrescarGrabaciones = null;   // lo completa la seccion de Translate si existe

  /* ---------- Progreso persistente ---------- */
  const STORAGE_KEY = 'lecciones:progreso:' + LESSON_ID;
  let results = {};

  (function loadResults() {
    let parsed = null;
    try { parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'); }
    catch (err) { parsed = null; }
    if (!parsed || typeof parsed !== 'object') return;
    // Descarta claves que ya no existen (por si la leccion se regenero con menos frases).
    const limits = { repeat: REPEAT_PHRASES.length, type: TYPE_PHRASES.length };
    for (const key of Object.keys(parsed)) {
      const parts = key.split(':');
      const section = parts[0];
      const idx = Number(parts[1]);
      const score = parsed[key];
      if (limits[section] === undefined) continue;
      if (!Number.isInteger(idx) || idx < 0 || idx >= limits[section]) continue;
      if (typeof score !== 'number' || !isFinite(score)) continue;
      results[key] = score;
    }
  })();

  function persist() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(results)); } catch (err) {}
  }
  function setResult(key, score) {
    results[key] = score;
    persist();
    updateSummary();
    repintar();
    marcarRacha();
    // Repetición espaciada: deja la huella por tarjeta. Todavía no se muestra
    // nada, pero sin esto la historia no existiría el día que haya repaso.
    if (window.SRS) window.SRS.registrar(LESSON_ID, key, score);
    if (window.Sync) window.Sync.programar();
  }

  /* ---------- Normalizacion y puntaje ---------- */
  // Vive en assets/texto.js: lo comparten esta pantalla y la de repaso. Con dos
  // copias, agregar una contraccion en una sola haria que la misma respuesta
  // sacara notas distintas segun donde se escriba.
  const similarity = window.Texto.similitud;
  const verdictFor = window.Texto.veredicto;

  function updateSummary() {
    const keys = Object.keys(results);
    const progressEl = document.getElementById('progress');
    const scoreEl = document.getElementById('score');
    if (progressEl) progressEl.textContent = (keys.length + translateHechas()) + ' / ' + TOTAL_EJERCICIOS;
    if (!scoreEl) return;
    if (!keys.length) { scoreEl.textContent = '—'; return; }
    const avg = keys.reduce(function (sum, k) { return sum + results[k]; }, 0) / keys.length;
    scoreEl.textContent = Math.round(avg * 100) + '%';
  }

  /* ---------- Racha ---------- */
  // El chip vive en la barra inferior; el aviso sale sólo cuando la racha sube.
  let chipRacha = null;

  function pintarRacha() {
    if (!chipRacha || !window.Racha) return;
    const r = window.Racha.leer();
    chipRacha.textContent = r.actual ? '🔥 ' + r.actual : '🔥 0';
    chipRacha.title = r.faltaHoy
      ? 'Para sumar el día de hoy te falta ' + r.faltaHoy
      : (r.actual
          ? 'Llevás ' + r.actual + (r.actual === 1 ? ' día' : ' días') + ' seguidos practicando'
          : 'Hacé un ejercicio para empezar tu racha');
  }

  function avisar(texto) {
    const t = document.createElement('div');
    t.className = 'toast';
    t.setAttribute('role', 'status');
    t.textContent = texto;
    if (document.body.classList.contains('sesion-abierta')) {
      // Con la sesion abierta el aviso iba al fondo, detras del overlay, y no
      // se veia nunca. Arriba hay lugar: solo esta la barra de progreso.
      t.style.top = '68px';
      t.style.bottom = 'auto';
    } else {
      // Justo encima de la barra inferior: en pantallas angostas envuelve a dos
      // lineas y un valor fijo la taparia.
      const barra = document.querySelector('.summary');
      if (barra) t.style.bottom = (barra.offsetHeight + 16) + 'px';
    }
    document.body.appendChild(t);
    // Reflow forzado en vez de requestAnimationFrame: rAF no dispara si la
    // pestaña esta en segundo plano y el aviso quedaria invisible para siempre.
    void t.offsetWidth;
    t.classList.add('show');
    setTimeout(function () {
      t.classList.remove('show');
      setTimeout(function () { t.remove(); }, 300);
    }, 3800);
  }

  function marcarRacha() {
    if (!window.Racha) return;
    const r = window.Racha.registrar('leccion');
    pintarRacha();
    if (r.subio) {
      if (r.record) avisar('🏆 ¡Nuevo récord! ' + r.actual + ' días seguidos');
      else if (r.actual === 1) avisar('🔥 ¡Arrancaste tu racha! Volvé mañana para seguirla');
      else avisar('🔥 ¡' + r.actual + ' días seguidos!');
      return;
    }
    // Si hizo su mitad hay que decirle que falta la otra: si no, practica,
    // no ve el fuego y cree que la racha esta rota. Solo la primera vez.
    if (r.nuevo && r.falta) avisar('✅ Lección hecha. Te falta ' + r.falta + ' para sumar el día');
  }

  /* ---------- Sintesis de voz ---------- */
  // Vive en assets/voz.js: lo comparten esta pantalla y la de repaso. Lo dificil
  // no es hablar sino elegir la voz ("es-419" no existe como voz instalada), y
  // con dos copias arreglarla en un lado dejaba el otro con otro acento.
  const speak = window.Voz.decir;

  /* ---------- Helpers de DOM (textContent, nunca innerHTML con contenido) ---------- */
  function el(tag, cls, text) {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  }
  function actionButton(cls, label, action, idx, aria) {
    const b = el('button', cls, label);
    b.type = 'button';
    b.dataset.action = action;
    b.dataset.idx = String(idx);
    // Una leccion puede tener 40 botones "Escuchar" identicos: sin un nombre
    // propio, un lector de pantalla lista 40 items indistinguibles.
    if (aria) b.setAttribute('aria-label', aria);
    return b;
  }
  function statusBox(id) {
    const s = el('div', 'status');
    s.id = id;
    s.setAttribute('aria-live', 'polite');
    return s;
  }
  function showVerdict(statusEl, score, prefix) {
    const v = verdictFor(score);
    statusEl.className = 'status ' + v.cls;
    statusEl.textContent = (prefix ? prefix + ' — ' : '') + v.text + ' (' + Math.round(score * 100) + '%)';
    marcarTarjeta(statusEl, v.cls);
  }
  // Con 44 tarjetas iguales, la unica forma de ver que falta es que la resuelta
  // se distinga. Requiere que el statusEl ya este dentro de su .card.
  const CLASES_HECHA = ['hecha', 'hecha-good', 'hecha-warn', 'hecha-bad', 'hecha-grabada'];
  function marcarTarjeta(statusEl, cls) {
    const card = statusEl.closest('.card');
    if (!card) return;
    card.classList.remove.apply(card.classList, CLASES_HECHA);
    card.classList.add('hecha', 'hecha-' + cls);
  }
  function desmarcarTarjeta(statusEl) {
    const card = statusEl.closest('.card');
    if (card) card.classList.remove.apply(card.classList, CLASES_HECHA);
  }
  function desmarcarTarjetas() {
    document.querySelectorAll('.card.hecha').forEach(function (c) {
      c.classList.remove.apply(c.classList, CLASES_HECHA);
    });
  }

  /* ---------- Bloques: una seccion larga no se muestra entera ---------- */
  // Una leccion de 22 frases por seccion es un muro: se abre y no se ve el
  // final. Se parte en bloques plegables y arranca abierto el primero que
  // tenga algo sin hacer. Las secciones cortas quedan como estaban.
  const TAMANIO_BLOQUE = 6;
  const MINIMO_PARA_PARTIR = 9;   // 8 frases entran de una; 9 ya se parten
  const NOMBRE_SECCION = { repeat: 'Listen and Repeat', type: 'Listen and Type',
                           translate: 'Listen and Translate' };
  let hayBloques = false;

  // Devuelve idx -> nodo donde va esa tarjeta. Sin bloques, siempre el mismo.
  function repartidor(contenedor, total, seccion) {
    if (total < MINIMO_PARA_PARTIR) return function () { return contenedor; };
    hayBloques = true;
    const cuerpos = [];
    for (let desde = 0; desde < total; desde += TAMANIO_BLOQUE) {
      const hasta = Math.min(desde + TAMANIO_BLOQUE, total);
      const det = document.createElement('details');
      det.className = 'bloque';
      det.dataset.seccion = seccion;
      det.dataset.desde = String(desde);
      det.dataset.hasta = String(hasta);
      const cab = el('summary', 'bloque-cab');
      const titulo = el('span', 'bloque-nombre');
      // "Frases 1-6" existía dos veces por lección, una por sección. El prefijo
      // sólo lo oye el lector de pantalla: en la pantalla sobra, ya está el <h2>.
      titulo.appendChild(el('span', 'solo-lectores', NOMBRE_SECCION[seccion] + ', '));
      titulo.appendChild(document.createTextNode('Frases ' + (desde + 1) + '-' + hasta));
      cab.appendChild(titulo);
      cab.appendChild(el('span', 'bloque-estado'));
      const cuerpo = el('div', 'bloque-cuerpo');
      det.appendChild(cab);
      det.appendChild(cuerpo);
      contenedor.appendChild(det);
      cuerpos.push(cuerpo);
    }
    return function (idx) { return cuerpos[Math.floor(idx / TAMANIO_BLOQUE)]; };
  }

  function pintarBloques() {
    document.querySelectorAll('.bloque').forEach(function (det) {
      const seccion = det.dataset.seccion;
      const desde = Number(det.dataset.desde);
      const hasta = Number(det.dataset.hasta);
      let hechos = 0, suma = 0;
      for (let i = desde; i < hasta; i++) {
        const s = results[seccion + ':' + i];
        if (typeof s === 'number') { hechos++; suma += s; }
      }
      const total = hasta - desde;
      const completo = hechos === total;
      det.classList.toggle('completo', completo);
      det.querySelector('.bloque-estado').textContent = hechos
        ? hechos + ' / ' + total + ' · ' + Math.round(suma / hechos * 100) + '%'
        : 'sin empezar';
    });
  }

  // Solo al cargar: despues manda lo que el alumno abrio o cerro a mano.
  function abrirPrimerPendiente() {
    ['repeat', 'type'].forEach(function (seccion) {
      const bloques = document.querySelectorAll('.bloque[data-seccion="' + seccion + '"]');
      if (!bloques.length) return;
      let abierto = false;
      bloques.forEach(function (det) {
        if (abierto || det.classList.contains('completo')) return;
        det.open = true;
        abierto = true;
      });
      // Seccion terminada: se abre la ultima para que no quede todo cerrado.
      if (!abierto) bloques[bloques.length - 1].open = true;
    });
  }

  // Translate no guarda puntaje: se da por hecha si tiene grabacion.
  function estaHecha(sec, i) {
    if (sec === 'translate') return !!translateConGrabacion[i];
    return typeof results[sec + ':' + i] === 'number';
  }

  function primeraPendiente() {
    const secciones = [['repeat', REPEAT_PHRASES.length], ['type', TYPE_PHRASES.length],
                       ['translate', TRANSLATE_PHRASES.length]];
    for (const par of secciones) {
      for (let i = 0; i < par[1]; i++) {
        if (!estaHecha(par[0], i)) return { sec: par[0], idx: i };
      }
    }
    return null;
  }

  function irA(sec, idx) {
    const st = document.getElementById(sec + '-status-' + idx);
    const card = st ? st.closest('.card') : null;
    if (!card) return;
    const bloque = card.closest('.bloque');
    if (bloque) bloque.open = true;
    const quieto = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    // 'center' y no 'start': la barra fija de abajo tapa el borde inferior.
    card.scrollIntoView({ behavior: quieto ? 'auto' : 'smooth', block: 'center' });
    const foco = card.querySelector('input, button');
    if (foco) foco.focus({ preventScroll: true });
  }

  let nodoContinuar = null;

  function montarContinuar() {
    if (!hayBloques) return;
    const wrap = document.querySelector('.wrap');
    const header = wrap ? wrap.querySelector('header') : null;
    if (!header) return;
    nodoContinuar = el('div', 'continuar');
    const boton = el('button', 'btn-listen', '▶ Seguir con lo que falta');
    boton.type = 'button';
    boton.addEventListener('click', function () {
      const p = primeraPendiente();
      if (p) irA(p.sec, p.idx);
    });
    nodoContinuar.appendChild(boton);
    nodoContinuar.appendChild(el('span', 'continuar-donde'));
    wrap.insertBefore(nodoContinuar, header.nextSibling);
  }

  function pintarContinuar() {
    if (!nodoContinuar) return;
    const p = primeraPendiente();
    // Recien sirve cuando ya hay algo hecho: en la frase 1 no hay nada que retomar.
    const sirve = !!p && (Object.keys(results).length + translateHechas()) > 0;
    nodoContinuar.hidden = !sirve;
    if (!sirve) return;
    nodoContinuar.querySelector('.continuar-donde').textContent =
      NOMBRE_SECCION[p.sec] + ' · frase ' + (p.idx + 1);
  }

  function repintar() { pintarBloques(); pintarContinuar(); }

  /* ---------- Listen and Repeat ---------- */
  const repeatContainer = document.getElementById('phrases');
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;

  if (repeatContainer) {
    const dondeRepeat = repartidor(repeatContainer, REPEAT_PHRASES.length, 'repeat');
    REPEAT_PHRASES.forEach(function (p, idx) {
      const card = el('div', 'card');
      const en = el('div', 'phrase-en', p.en);
      en.lang = 'en';
      const es = el('div', 'phrase-es', p.es);
      const row = el('div', 'row');
      row.appendChild(actionButton('btn-listen', '🔊 Escuchar', 'listen', idx, 'Escuchar: ' + p.en));
      row.appendChild(actionButton('btn-record', '🎤 Grabar mi intento', 'record', idx, 'Grabar mi intento de: ' + p.en));
      const st = statusBox('repeat-status-' + idx);
      card.appendChild(en); card.appendChild(es); card.appendChild(row); card.appendChild(st);
      dondeRepeat(idx).appendChild(card);
      // Despues de insertar: showVerdict marca la .card y necesita encontrarla.
      const saved = results['repeat:' + idx];
      if (typeof saved === 'number') showVerdict(st, saved, 'Último intento guardado');
    });

    // Listen and Repeat necesita reconocimiento de voz (sólo Chromium) e
    // internet, porque Chrome procesa el audio en sus servidores. Estaba en el
    // README: el alumno se enteraba recién al tocar Grabar y recibir un error.
    let avisoRepeat = null;
    function pintarAvisoRepeat() {
      let texto = '';
      if (!SR) {
        texto = 'Tu navegador no reconoce la voz, así que esta sección no puede puntuarte.'
              + ' Probá en Chrome o Edge. Escuchar y el resto de la lección andan igual.';
      } else if (navigator.onLine === false) {
        texto = 'Sin internet no se puede puntuar la pronunciación: el reconocimiento de voz'
              + ' procesa el audio en los servidores de Google. Escuchar, escribir y grabar andan igual.';
      }
      if (!texto) {
        if (avisoRepeat) { avisoRepeat.remove(); avisoRepeat = null; }
        return;
      }
      if (!avisoRepeat) {
        avisoRepeat = el('p', 'aviso');
        avisoRepeat.setAttribute('role', 'status');
        repeatContainer.parentNode.insertBefore(avisoRepeat, repeatContainer);
      }
      avisoRepeat.textContent = '⚠️ ' + texto;
    }
    pintarAvisoRepeat();
    window.addEventListener('online', pintarAvisoRepeat);
    window.addEventListener('offline', pintarAvisoRepeat);

    repeatContainer.addEventListener('click', function (e) {
      const btn = e.target.closest('button');
      if (!btn) return;
      const idx = Number(btn.dataset.idx);
      const target = REPEAT_PHRASES[idx];
      const statusEl = document.getElementById('repeat-status-' + idx);
      if (!target || !statusEl) return;

      if (btn.dataset.action === 'listen') { speak(target.en, LANG_EN); return; }
      if (btn.dataset.action !== 'record') return;

      if (!SR) {
        statusEl.className = 'status warn';
        statusEl.textContent = 'El reconocimiento de voz no está disponible en este navegador. Probá en Chrome o Edge.';
        return;
      }
      const rec = new SR();
      rec.lang = LANG_EN;
      rec.interimResults = false;
      rec.maxAlternatives = 1;
      btn.classList.add('recording');
      statusEl.className = 'status';
      statusEl.textContent = '🎙️ Escuchando...';
      rec.onresult = function (ev) {
        const said = ev.results[0][0].transcript;
        const score = similarity(said, target.en, 'en');
        setResult('repeat:' + idx, score);
        showVerdict(statusEl, score, 'Dijiste: "' + said + '"');
      };
      rec.onerror = function (ev) {
        statusEl.className = 'status bad';
        statusEl.textContent = 'No se pudo escuchar (' + ev.error + '). Revisá el permiso de micrófono.';
      };
      rec.onend = function () { btn.classList.remove('recording'); };
      try { rec.start(); }
      catch (err) {
        btn.classList.remove('recording');
        statusEl.className = 'status bad';
        statusEl.textContent = 'No se pudo iniciar el micrófono.';
      }
    });
  }

  /* ---------- Listen and Type ---------- */
  const typeContainer = document.getElementById('type-exercises');

  if (typeContainer) {
    const dondeType = repartidor(typeContainer, TYPE_PHRASES.length, 'type');
    TYPE_PHRASES.forEach(function (p, idx) {
      const card = el('div', 'card');
      const rowTop = el('div', 'row');
      rowTop.appendChild(actionButton('btn-listen', '🔊 Escuchar', 'listen-type', idx, 'Escuchar la frase ' + (idx + 1)));
      const input = el('input', 'type-input');
      input.type = 'text';
      input.id = 'type-input-' + idx;
      input.placeholder = 'Escribí en español lo que escuchaste';
      // El placeholder NO es nombre accesible: se borra al escribir y deja 22
      // campos que un lector de pantalla anuncia igual, sin decir cuál es cuál.
      input.setAttribute('aria-label',
        'Frase ' + (idx + 1) + ': escribí en español lo que escuchaste');
      input.autocomplete = 'off';
      input.lang = 'es';
      const rowBottom = el('div', 'row');
      rowBottom.appendChild(actionButton('btn-record', '✔️ Revisar', 'check-type', idx, 'Revisar la frase ' + (idx + 1)));
      const st = statusBox('type-status-' + idx);
      card.appendChild(rowTop); card.appendChild(input); card.appendChild(rowBottom); card.appendChild(st);
      dondeType(idx).appendChild(card);
      const saved = results['type:' + idx];
      if (typeof saved === 'number') showVerdict(st, saved, 'Último intento guardado');
    });

    const checkTypeAnswer = function (idx) {
      const target = TYPE_PHRASES[idx];
      const input = document.getElementById('type-input-' + idx);
      const statusEl = document.getElementById('type-status-' + idx);
      if (!target || !input || !statusEl) return;
      const score = similarity(input.value, target.es, 'es');
      setResult('type:' + idx, score);
      showVerdict(statusEl, score);
      if (score < 0.85) statusEl.textContent += ' — Se esperaba: "' + target.es + '"';
    };

    typeContainer.addEventListener('click', function (e) {
      const btn = e.target.closest('button');
      if (!btn) return;
      const idx = Number(btn.dataset.idx);
      if (btn.dataset.action === 'listen-type') { speak(TYPE_PHRASES[idx].en, LANG_EN); return; }
      if (btn.dataset.action === 'check-type') checkTypeAnswer(idx);
    });
    typeContainer.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && e.target.classList.contains('type-input')) {
        e.preventDefault();
        const idx = Number(e.target.id.replace('type-input-', ''));
        checkTypeAnswer(idx);
        // Enter revisa y baja al siguiente: es el ritmo de un dictado. Sólo si
        // el siguiente está a la vista, para no saltar a un bloque plegado.
        const siguiente = document.getElementById('type-input-' + (idx + 1));
        if (siguiente && siguiente.checkVisibility && siguiente.checkVisibility()) siguiente.focus();
      }
    });
  }

  /* ---------- Listen and Translate: grabacion guardada en IndexedDB ---------- */
  const translateContainer = document.getElementById('translate-exercises');

  if (translateContainer && TRANSLATE_PHRASES.length) {
    let dbPromise = null;
    const openDB = function () {
      if (dbPromise) return dbPromise;
      dbPromise = new Promise(function (resolve, reject) {
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
      return dbPromise;
    };
    const saveRecording = async function (rec) {
      const db = await openDB();
      return new Promise(function (resolve, reject) {
        const tx = db.transaction('grabaciones', 'readwrite');
        tx.objectStore('grabaciones').add(rec);
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function () { reject(tx.error); };
      });
    };
    const loadRecordings = async function (lessonId) {
      const db = await openDB();
      return new Promise(function (resolve, reject) {
        const tx = db.transaction('grabaciones', 'readonly');
        const req = tx.objectStore('grabaciones').index('lessonId').getAll(IDBKeyRange.only(lessonId));
        req.onsuccess = function () { resolve(req.result); };
        req.onerror = function () { reject(req.error); };
      });
    };
    const deleteRecording = async function (id) {
      const db = await openDB();
      return new Promise(function (resolve, reject) {
        const tx = db.transaction('grabaciones', 'readwrite');
        tx.objectStore('grabaciones').delete(id);
        tx.oncomplete = function () { resolve(); };
        tx.onerror = function () { reject(tx.error); };
      });
    };

    const canRecord = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia
                         && window.MediaRecorder && window.indexedDB);
    let activeRecorder = null;

    const pickMimeType = function () {
      const candidates = ['audio/webm', 'audio/mp4', 'audio/ogg'];
      for (const c of candidates) {
        if (MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(c)) return c;
      }
      return '';
    };
    // Safari graba en audio/mp4: la extension tiene que seguir al blob real.
    const extensionFor = function (mime) {
      const m = (mime || '').toLowerCase();
      if (m.indexOf('mp4') >= 0 || m.indexOf('aac') >= 0 || m.indexOf('m4a') >= 0) return 'm4a';
      if (m.indexOf('ogg') >= 0) return 'ogg';
      if (m.indexOf('wav') >= 0) return 'wav';
      if (m.indexOf('mpeg') >= 0) return 'mp3';
      return 'webm';
    };

    // Los object URLs del panel se revocan antes de redibujar: si no, se acumulan.
    let objectUrls = [];
    const releaseObjectUrls = function () {
      objectUrls.forEach(function (u) { URL.revokeObjectURL(u); });
      objectUrls = [];
    };
    window.addEventListener('pagehide', releaseObjectUrls);

    const setRecCount = function (n) {
      const main = document.getElementById('rec-count');
      const footer = document.getElementById('rec-count-footer');
      if (main) main.textContent = String(n);
      if (footer) footer.textContent = String(n);
    };

    const refreshRecordingsPanel = async function () {
      const listEl = document.getElementById('recordings-list');
      if (!listEl) return;
      let recs;
      try { recs = await loadRecordings(LESSON_ID); }
      catch (err) {
        listEl.textContent = 'No se pudieron cargar grabaciones previas (' + err.message + ').';
        return;
      }
      releaseObjectUrls();
      listEl.textContent = '';
      setRecCount(recs.length);

      // Una frase cuenta como hecha por tener grabacion, no por cuantas tenga.
      // Se recalcula desde cero para que borrar un audio la vuelva a destildar.
      translateConGrabacion = {};
      recs.forEach(function (r) {
        const i = Number(r.phraseIdx);
        if (Number.isInteger(i) && i >= 0 && i < TRANSLATE_PHRASES.length) translateConGrabacion[i] = true;
      });
      TRANSLATE_PHRASES.forEach(function (p, i) {
        const st = document.getElementById('translate-status-' + i);
        if (!st) return;
        if (translateConGrabacion[i]) marcarTarjeta(st, 'grabada');
        else desmarcarTarjeta(st);
      });
      updateSummary();
      repintar();

      recs.sort(function (a, b) { return a.timestamp < b.timestamp ? 1 : -1; });
      recs.forEach(function (r) {
        const url = URL.createObjectURL(r.blob);
        objectUrls.push(url);
        const row = el('div', 'rec-row');
        const frase = el('span', 'rec-phrase', '"' + r.phraseEs + '"');
        if (r.falloPermanente) {
          row.classList.add('rec-fallida');
          frase.appendChild(el('span', 'rec-aviso', '⚠️ no se pudo enviar'));
        }
        row.appendChild(frase);
        const audio = document.createElement('audio');
        audio.controls = true;
        audio.preload = 'none';
        audio.src = url;
        const dl = el('a', 'rec-download', '💾');
        dl.href = url;
        dl.download = 'grabacion_' + LESSON_ID + '_' + (Number(r.phraseIdx) + 1) + '.' + extensionFor(r.mimeType);
        dl.title = 'Descargar';
        dl.setAttribute('aria-label', 'Descargar la grabación de: ' + r.phraseEs);
        const del = el('button', 'rec-delete', '🗑️');
        del.type = 'button';
        del.dataset.id = String(r.id);
        del.title = 'Borrar';
        del.setAttribute('aria-label', 'Borrar la grabación de: ' + r.phraseEs);
        row.appendChild(audio); row.appendChild(dl); row.appendChild(del);
        listEl.appendChild(row);
      });
    };

    // --- Ventana de grabacion ---------------------------------------------
    // Una frase traducida dura unos segundos. Sin tope, un MediaRecorder que
    // el alumno se olvida de parar genera un archivo de megas que el servidor
    // rechaza con 413, y esa grabacion terminaba trabando todo el envio.
    const TOPE_MS = 8000;        // ventana maxima por frase
    const SILENCIO_MS = 1200;    // pausa que se lee como "ya termino la frase"
    const UMBRAL_VOZ = 0.015;    // RMS a partir del cual se considera que hay voz

    // Corta sola a los 8 s, o antes si el alumno dejo de hablar. Devuelve la
    // funcion de limpieza. Si no hay Web Audio queda solo el tope de tiempo.
    const vigilarGrabacion = function (stream, rec, alSegundo) {
      let cortado = false;
      const parar = function () {
        if (cortado) return;
        cortado = true;
        if (rec.state === 'recording') rec.stop();
      };
      const tope = setTimeout(parar, TOPE_MS);
      const arranque = Date.now();

      let ctx = null;
      let analizador = null;
      let datos = null;
      try {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (AC) {
          ctx = new AC();
          analizador = ctx.createAnalyser();
          analizador.fftSize = 1024;
          ctx.createMediaStreamSource(stream).connect(analizador);
          datos = new Uint8Array(analizador.fftSize);
        }
      } catch (err) { ctx = null; analizador = null; }

      let hablo = false;
      let calladoDesde = 0;
      let ultimoSeg = -1;

      // setInterval y no requestAnimationFrame: rAF se congela con la pestaña
      // en segundo plano y la grabacion seguiria corriendo sin vigilancia.
      const tic = setInterval(function () {
        if (cortado) return;

        const seg = Math.ceil((TOPE_MS - (Date.now() - arranque)) / 1000);
        if (alSegundo && seg !== ultimoSeg) { ultimoSeg = seg; alSegundo(Math.max(0, seg)); }

        if (!analizador) return;
        analizador.getByteTimeDomainData(datos);
        let suma = 0;
        for (let i = 0; i < datos.length; i++) {
          const v = (datos[i] - 128) / 128;
          suma += v * v;
        }
        const rms = Math.sqrt(suma / datos.length);
        const ahora = Date.now();

        if (rms > UMBRAL_VOZ) { hablo = true; calladoDesde = 0; return; }
        // Solo corta por silencio si ya hablo: si no, cortaria en el primer
        // instante, antes de que el alumno arranque.
        if (!hablo) return;
        if (!calladoDesde) calladoDesde = ahora;
        else if (ahora - calladoDesde > SILENCIO_MS) parar();
      }, 100);

      return function limpiar() {
        cortado = true;
        clearTimeout(tope);
        clearInterval(tic);
        if (ctx) { try { ctx.close(); } catch (err) {} }
      };
    };

    const toggleRecording = async function (idx, target, btn, statusEl) {
      if (!canRecord) {
        statusEl.className = 'status warn';
        statusEl.textContent = 'Grabar no está disponible en este navegador (necesita micrófono + IndexedDB). Probá en Chrome, Edge o Safari.';
        return;
      }
      if (activeRecorder && activeRecorder.state === 'recording') { activeRecorder.stop(); return; }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const mimeType = pickMimeType();
        const rec = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
        const chunks = [];
        activeRecorder = rec;
        let soltarVigilancia = null;
        rec.ondataavailable = function (e) { if (e.data.size > 0) chunks.push(e.data); };
        rec.onstop = async function () {
          if (soltarVigilancia) soltarVigilancia();
          stream.getTracks().forEach(function (t) { t.stop(); });
          btn.classList.remove('recording');
          btn.textContent = '🎤 Grabar mi traducción';
          btn.setAttribute('aria-label', 'Grabar mi traducción de: ' + target.es);
          activeRecorder = null;
          const blob = new Blob(chunks, { type: mimeType || 'audio/webm' });
          try {
            await saveRecording({
              lessonId: LESSON_ID, phraseIdx: idx, phraseEs: target.es, phraseEn: target.en,
              blob: blob, mimeType: blob.type, timestamp: new Date().toISOString()
            });
            statusEl.className = 'status good';
            statusEl.textContent = '✅ Grabación guardada — ' + new Date().toLocaleString();
            await refreshRecordingsPanel();
            marcarRacha();
            if (window.Sync) window.Sync.programar();
          } catch (err) {
            statusEl.className = 'status bad';
            statusEl.textContent = 'No se pudo guardar la grabación (' + err.message + ').';
          }
        };
        rec.start();
        btn.classList.add('recording');
        // El aria-label queda fijo: si le metieras la cuenta atras, el lector de
        // pantalla la cantaria una vez por segundo.
        btn.setAttribute('aria-label', 'Detener la grabación de: ' + target.es);
        btn.textContent = '⏹ Detener (8s)';
        soltarVigilancia = vigilarGrabacion(stream, rec, function (seg) {
          btn.textContent = '⏹ Detener (' + seg + 's)';
        });
        statusEl.className = 'status';
        statusEl.textContent = '🎙️ Grabando… se corta sola a los 8 segundos, o antes si dejás de hablar.';
      } catch (err) {
        statusEl.className = 'status bad';
        statusEl.textContent = 'No se pudo acceder al micrófono (' + err.message + ').';
      }
    };

    TRANSLATE_PHRASES.forEach(function (p, idx) {
      const card = el('div', 'card');
      card.appendChild(el('div', 'phrase-en', p.es));
      const row = el('div', 'row');
      row.appendChild(actionButton('btn-listen', '🔊 Escuchar (español)', 'listen-translate', idx, 'Escuchar en español: ' + p.es));
      row.appendChild(actionButton('btn-record', '🎤 Grabar mi traducción', 'toggle-record', idx, 'Grabar mi traducción de: ' + p.es));
      card.appendChild(row);
      card.appendChild(statusBox('translate-status-' + idx));
      translateContainer.appendChild(card);
    });

    translateContainer.addEventListener('click', function (e) {
      const btn = e.target.closest('button');
      if (!btn) return;
      const idx = Number(btn.dataset.idx);
      const target = TRANSLATE_PHRASES[idx];
      const statusEl = document.getElementById('translate-status-' + idx);
      if (!target || !statusEl) return;
      if (btn.dataset.action === 'listen-translate') { speak(target.es, LANG_ES); return; }
      if (btn.dataset.action === 'toggle-record') toggleRecording(idx, target, btn, statusEl);
    });

    const recList = document.getElementById('recordings-list');
    if (recList) {
      recList.addEventListener('click', async function (e) {
        const btn = e.target.closest('.rec-delete');
        if (!btn) return;
        // Es lo unico irrecuperable de la app y el boton esta pegado al de descargar.
        const fila = btn.closest('.rec-row');
        const frase = fila ? fila.querySelector('.rec-phrase') : null;
        if (!window.confirm('¿Borrar esta grabación? No se puede deshacer. '
              + (frase ? frase.textContent : ''))) return;
        await deleteRecording(Number(btn.dataset.id));
        await refreshRecordingsPanel();
      });
    }

    refrescarGrabaciones = refreshRecordingsPanel;
    refreshRecordingsPanel();
  }

  /* ---------- Barra inferior ---------- */
  const summaryBar = document.querySelector('.summary');
  if (summaryBar && TOTAL_EJERCICIOS && window.Racha) {
    const cont = el('span', 'racha');
    chipRacha = el('strong');
    cont.appendChild(chipRacha);
    summaryBar.appendChild(cont);
    pintarRacha();
  }
  if (summaryBar && TOTAL_EJERCICIOS) {
    const reset = el('button', 'btn-reset', '↺ Reiniciar');
    reset.type = 'button';
    reset.title = 'Borrar el progreso guardado de esta lección';
    reset.addEventListener('click', function () {
      if (!window.confirm('¿Borrar los puntajes guardados de esta lección?'
            + ' Las grabaciones no se borran.')) return;
      results = {};
      try { localStorage.removeItem(STORAGE_KEY); } catch (err) {}
      document.querySelectorAll('.status').forEach(function (s) {
        s.className = 'status';
        s.textContent = '';
      });
      desmarcarTarjetas();
      translateConGrabacion = {};
      updateSummary();
      repintar();
      // Las grabaciones siguen ahi: se vuelven a contar y a marcar.
      if (refrescarGrabaciones) refrescarGrabaciones();
    });
    summaryBar.appendChild(reset);
  }

  // La barra es fixed y en pantallas angostas envuelve a dos o tres lineas:
  // el hueco de abajo se calcula, si no tapa el footer.
  if (summaryBar) {
    const wrap = document.querySelector('.wrap');
    const syncOffset = function () {
      if (!wrap) return;
      wrap.style.paddingBottom = (summaryBar.offsetHeight + 32) + 'px';
    };
    syncOffset();
    window.addEventListener('resize', syncOffset);
    if (window.ResizeObserver) new ResizeObserver(syncOffset).observe(summaryBar);
  }

  /* ---------- Navegacion entre lecciones ---------- */
  // El orden sale de lessons.json, la misma fuente que usa el indice.
  // Si el manifiesto falta o falla, la leccion sigue funcionando sin navegacion.
  function buildNav(lecciones) {
    const pos = lecciones.findIndex(function (l) { return l.id === LESSON_ID; });
    if (pos === -1) return;
    const wrap = document.querySelector('.wrap');
    const header = wrap ? wrap.querySelector('header') : null;
    if (!wrap || !header) return;

    const anterior = pos > 0 ? lecciones[pos - 1] : null;
    const siguiente = pos < lecciones.length - 1 ? lecciones[pos + 1] : null;

    // Arriba: volver al indice + en que lugar de la serie estamos.
    const top = el('div', 'topnav');
    const back = el('a', null, '← Todas las lecciones');
    back.href = './';
    top.appendChild(back);
    top.appendChild(el('span', 'pos', 'Lección ' + (pos + 1) + ' de ' + lecciones.length));
    wrap.insertBefore(top, header);

    // Abajo: anterior / siguiente, justo antes del pie.
    const nav = el('nav', 'lessonnav');
    nav.setAttribute('aria-label', 'Navegación entre lecciones');
    const tarjeta = function (leccion, clase, etiqueta) {
      const a = el('a', clase);
      a.href = leccion.archivo;
      a.appendChild(el('span', 'dir', etiqueta));
      a.appendChild(el('span', 'name', leccion.titulo));
      return a;
    };
    if (anterior) nav.appendChild(tarjeta(anterior, 'prev', '← Anterior'));
    if (siguiente) nav.appendChild(tarjeta(siguiente, 'next', 'Siguiente →'));
    if (!nav.children.length) return;

    const footer = wrap.querySelector('footer');
    if (footer) wrap.insertBefore(nav, footer);
    else wrap.appendChild(nav);
  }

  fetch('lessons.json', { cache: 'no-cache' })
    .then(function (r) { return r.ok ? r.json() : Promise.reject(new Error(r.status)); })
    .then(function (m) { if (m && Array.isArray(m.lecciones)) buildNav(m.lecciones); })
    .catch(function (err) { console.warn('[leccion] Sin navegación: no se pudo leer lessons.json —', err.message); });

  /* ---------- Puerta de entrada a la sesion ---------- */
  // La sesion no tiene datos propios: los pide aca. Registrar por este camino
  // hace que la tarjeta de la leccion, el bloque, la barra, la racha y el
  // envio al profe se actualicen igual que si hubiera respondido en la lista.
  window.Leccion = {
    id: LESSON_ID,
    langEn: LANG_EN,
    repeat: REPEAT_PHRASES,
    type: TYPE_PHRASES,
    puntajeDe: function (sec, i) { return results[sec + ':' + i]; },
    registrar: function (sec, i, puntaje) {
      setResult(sec + ':' + i, puntaje);
      const st = document.getElementById(sec + '-status-' + i);
      if (st) showVerdict(st, puntaje);
    }
  };

  function montarBotonSesion() {
    if (!window.Sesion || !TOTAL_SCORED) return;
    const wrap = document.querySelector('.wrap');
    const header = wrap ? wrap.querySelector('header') : null;
    if (!header) return;

    const caja = el('div', 'empezar');
    const boton = el('button', 'btn-listen btn-empezar', '▶ Practicar');
    boton.type = 'button';
    boton.addEventListener('click', function () { window.Sesion.abrir(); });
    caja.appendChild(boton);

    // Sin contador de pendientes: "te quedan 44 de 44" abruma antes de empezar.
    // Lo que hizo ya se ve en la barra de abajo, y adentro de la sesion hay
    // barra de progreso.
    const pintar = function () {
      const r = window.Sesion.resumen();
      caja.hidden = !r.total;
      if (!r.total) return;
      boton.textContent = r.pendientes ? '▶ Practicar' : '▶ Repasar todo';
    };
    window.Sesion.alCerrar = pintar;
    wrap.insertBefore(caja, header.nextSibling);
    pintar();
  }

  updateSummary();
  pintarBloques();
  abrirPrimerPendiente();
  montarContinuar();
  pintarContinuar();
  montarBotonSesion();
})();
