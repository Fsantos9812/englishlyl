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
    marcarRacha();
    if (window.Sync) window.Sync.programar();
  }

  /* ---------- Normalizacion y puntaje ---------- */
  const CONTRACTIONS = [
    [/\bi'm\b/g, 'i am'], [/\bi've\b/g, 'i have'], [/\bi'll\b/g, 'i will'], [/\bi'd\b/g, 'i would'],
    [/\byou're\b/g, 'you are'], [/\byou've\b/g, 'you have'], [/\byou'll\b/g, 'you will'],
    [/\bwe're\b/g, 'we are'], [/\bwe've\b/g, 'we have'], [/\bthey're\b/g, 'they are'],
    [/\bhe's\b/g, 'he is'], [/\bshe's\b/g, 'she is'], [/\bit's\b/g, 'it is'],
    [/\bthat's\b/g, 'that is'], [/\bwhat's\b/g, 'what is'], [/\bwhere's\b/g, 'where is'],
    [/\bthere's\b/g, 'there is'], [/\bhere's\b/g, 'here is'], [/\blet's\b/g, 'let us'],
    [/\bdon't\b/g, 'do not'], [/\bdoesn't\b/g, 'does not'], [/\bdidn't\b/g, 'did not'],
    [/\bisn't\b/g, 'is not'], [/\baren't\b/g, 'are not'], [/\bwasn't\b/g, 'was not'],
    [/\bcan't\b/g, 'cannot'], [/\bwon't\b/g, 'will not'], [/\bwouldn't\b/g, 'would not'],
    [/\bcouldn't\b/g, 'could not'], [/\bshouldn't\b/g, 'should not'],
    [/\bhaven't\b/g, 'have not'], [/\bhasn't\b/g, 'has not']
  ];

  // Sin tildes a proposito: se aplican DESPUES de quitar los acentos.
  const WORD_NUMBERS = {
    en: { 0:'zero', 1:'one', 2:'two', 3:'three', 4:'four', 5:'five', 6:'six', 7:'seven', 8:'eight',
          9:'nine', 10:'ten', 11:'eleven', 12:'twelve', 13:'thirteen', 14:'fourteen', 15:'fifteen',
          16:'sixteen', 17:'seventeen', 18:'eighteen', 19:'nineteen', 20:'twenty', 30:'thirty',
          40:'forty', 50:'fifty', 60:'sixty', 70:'seventy', 80:'eighty', 90:'ninety', 100:'one hundred' },
    es: { 0:'cero', 1:'uno', 2:'dos', 3:'tres', 4:'cuatro', 5:'cinco', 6:'seis', 7:'siete', 8:'ocho',
          9:'nueve', 10:'diez', 11:'once', 12:'doce', 13:'trece', 14:'catorce', 15:'quince',
          16:'dieciseis', 17:'diecisiete', 18:'dieciocho', 19:'diecinueve', 20:'veinte', 30:'treinta',
          40:'cuarenta', 50:'cincuenta', 60:'sesenta', 70:'setenta', 80:'ochenta', 90:'noventa', 100:'cien' }
  };

  function normalize(text, lang) {
    const table = WORD_NUMBERS[lang === 'en' ? 'en' : 'es'];
    let t = (text || '').toLowerCase();
    t = t.replace(/[‘’ʼ´`]/g, "'");   // apostrofes tipograficos -> '
    // Quita tildes y la enie: "anos"/"anios" no deben fallar por un acento.
    t = t.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (lang === 'en') { for (const pair of CONTRACTIONS) t = t.replace(pair[0], pair[1]); }
    t = t.replace(/[^a-z0-9\s']/g, ' ');                              // puntuacion fuera
    t = t.replace(/\d+/g, function (n) { return table[String(Number(n))] || n; });  // 5 -> cinco / five
    t = t.replace(/'/g, '');
    return t.replace(/\s+/g, ' ').trim();
  }

  function levenshtein(a, b) {
    const m = a.length, n = b.length;
    if (!m) return n;
    if (!n) return m;
    let prev = new Array(n + 1);
    let curr = new Array(n + 1);
    for (let j = 0; j <= n; j++) prev[j] = j;
    for (let i = 1; i <= m; i++) {
      curr[0] = i;
      for (let j = 1; j <= n; j++) {
        curr[j] = a[i - 1] === b[j - 1] ? prev[j - 1]
                : 1 + Math.min(prev[j - 1], prev[j], curr[j - 1]);
      }
      const tmp = prev; prev = curr; curr = tmp;
    }
    return prev[n];
  }

  function similarity(said, target, lang) {
    const a = normalize(said, lang);
    const b = normalize(target, lang);
    if (!a.length && !b.length) return 1;
    return 1 - levenshtein(a, b) / Math.max(a.length, b.length, 1);
  }

  function verdictFor(score) {
    if (score >= 0.85) return { cls: 'good', text: '✅ ¡Muy bien!' };
    if (score >= 0.55) return { cls: 'warn', text: '🟡 Cerca, seguí practicando' };
    return { cls: 'bad', text: '🔴 Intentá de nuevo' };
  }

  function updateSummary() {
    const keys = Object.keys(results);
    const progressEl = document.getElementById('progress');
    const scoreEl = document.getElementById('score');
    if (progressEl) progressEl.textContent = keys.length + ' / ' + TOTAL_SCORED;
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
    chipRacha.title = r.actual
      ? 'Llevás ' + r.actual + (r.actual === 1 ? ' día' : ' días') + ' seguidos practicando'
      : 'Hacé un ejercicio para empezar tu racha';
  }

  function avisar(texto) {
    const t = document.createElement('div');
    t.className = 'toast';
    t.setAttribute('role', 'status');
    t.textContent = texto;
    // Justo encima de la barra inferior: en pantallas angostas envuelve a dos
    // lineas y un valor fijo la taparia.
    const barra = document.querySelector('.summary');
    if (barra) t.style.bottom = (barra.offsetHeight + 16) + 'px';
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
    const r = window.Racha.registrar();
    pintarRacha();
    if (!r.subio) return;
    if (r.record) avisar('🏆 ¡Nuevo récord! ' + r.actual + ' días seguidos');
    else if (r.actual === 1) avisar('🔥 ¡Arrancaste tu racha! Volvé mañana para seguirla');
    else avisar('🔥 ¡' + r.actual + ' días seguidos!');
  }

  /* ---------- Sintesis de voz ---------- */
  const TTS = ('speechSynthesis' in window) ? window.speechSynthesis : null;
  let voices = [];

  function refreshVoices() {
    if (!TTS) return;
    try { voices = TTS.getVoices() || []; } catch (err) { voices = []; }
  }
  if (TTS) {
    refreshVoices();
    if (TTS.addEventListener) TTS.addEventListener('voiceschanged', refreshVoices);
    else TTS.onvoiceschanged = refreshVoices;
  }

  // "es-419" no existe como voz instalada: hay que mapearlo a variantes reales
  // y preferir las latinoamericanas antes que la de Espana.
  const REGION_FALLBACKS = {
    'es-419': ['es-mx', 'es-us', 'es-ar', 'es-co', 'es-cl', 'es-pe'],
    'en-us': ['en-us', 'en-ca'],
    'en-gb': ['en-gb', 'en-ie']
  };

  // El navegador ignora u.lang bastante seguido: hay que elegir la voz a mano.
  function pickVoice(lang) {
    if (!voices.length) refreshVoices();
    const want = lang.toLowerCase().replace('_', '-');
    const base = want.split('-')[0];
    const tag = function (v) { return (v.lang || '').toLowerCase().replace('_', '-'); };

    const exact = voices.find(function (v) { return tag(v) === want; });
    if (exact) return exact;

    const preferred = REGION_FALLBACKS[want] || [];
    for (const region of preferred) {
      const hit = voices.find(function (v) { return tag(v) === region; });
      if (hit) return hit;
    }
    return voices.find(function (v) { return tag(v).indexOf(base + '-') === 0 && v.localService; })
        || voices.find(function (v) { return tag(v).indexOf(base + '-') === 0; })
        || voices.find(function (v) { return tag(v) === base; })
        || null;
  }

  function speak(text, lang) {
    if (!TTS) { alert('Tu navegador no soporta sintesis de voz (TTS).'); return; }
    TTS.cancel();
    const utter = function () {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = lang;
      const v = pickVoice(lang);
      if (v) u.voice = v;
      u.rate = 0.95;
      TTS.speak(u);
    };
    if (!voices.length) {
      refreshVoices();
      if (!voices.length) {
        // Las voces cargan async: esperamos el evento, con corte por las dudas.
        let fired = false;
        const once = function () { if (fired) return; fired = true; refreshVoices(); utter(); };
        if (TTS.addEventListener) TTS.addEventListener('voiceschanged', once, { once: true });
        setTimeout(once, 350);
        return;
      }
    }
    utter();
  }

  /* ---------- Helpers de DOM (textContent, nunca innerHTML con contenido) ---------- */
  function el(tag, cls, text) {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  }
  function actionButton(cls, label, action, idx) {
    const b = el('button', cls, label);
    b.type = 'button';
    b.dataset.action = action;
    b.dataset.idx = String(idx);
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
  }

  /* ---------- Listen and Repeat ---------- */
  const repeatContainer = document.getElementById('phrases');
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;

  if (repeatContainer) {
    REPEAT_PHRASES.forEach(function (p, idx) {
      const card = el('div', 'card');
      const en = el('div', 'phrase-en', p.en);
      en.lang = 'en';
      const es = el('div', 'phrase-es', p.es);
      const row = el('div', 'row');
      row.appendChild(actionButton('btn-listen', '🔊 Escuchar', 'listen', idx));
      row.appendChild(actionButton('btn-record', '🎤 Grabar mi intento', 'record', idx));
      const st = statusBox('repeat-status-' + idx);
      const saved = results['repeat:' + idx];
      if (typeof saved === 'number') showVerdict(st, saved, 'Último intento guardado');
      card.appendChild(en); card.appendChild(es); card.appendChild(row); card.appendChild(st);
      repeatContainer.appendChild(card);
    });

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
    TYPE_PHRASES.forEach(function (p, idx) {
      const card = el('div', 'card');
      const rowTop = el('div', 'row');
      rowTop.appendChild(actionButton('btn-listen', '🔊 Escuchar', 'listen-type', idx));
      const input = el('input', 'type-input');
      input.type = 'text';
      input.id = 'type-input-' + idx;
      input.placeholder = 'Escribí en español lo que escuchaste';
      input.autocomplete = 'off';
      input.lang = 'es';
      const rowBottom = el('div', 'row');
      rowBottom.appendChild(actionButton('btn-record', '✔️ Revisar', 'check-type', idx));
      const st = statusBox('type-status-' + idx);
      const saved = results['type:' + idx];
      if (typeof saved === 'number') showVerdict(st, saved, 'Último intento guardado');
      card.appendChild(rowTop); card.appendChild(input); card.appendChild(rowBottom); card.appendChild(st);
      typeContainer.appendChild(card);
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
        checkTypeAnswer(Number(e.target.id.replace('type-input-', '')));
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
      recs.sort(function (a, b) { return a.timestamp < b.timestamp ? 1 : -1; });
      recs.forEach(function (r) {
        const url = URL.createObjectURL(r.blob);
        objectUrls.push(url);
        const row = el('div', 'rec-row');
        row.appendChild(el('span', 'rec-phrase', '"' + r.phraseEs + '"'));
        const audio = document.createElement('audio');
        audio.controls = true;
        audio.preload = 'none';
        audio.src = url;
        const dl = el('a', 'rec-download', '💾');
        dl.href = url;
        dl.download = 'grabacion_' + LESSON_ID + '_' + (Number(r.phraseIdx) + 1) + '.' + extensionFor(r.mimeType);
        dl.title = 'Descargar';
        const del = el('button', 'rec-delete', '🗑️');
        del.type = 'button';
        del.dataset.id = String(r.id);
        del.title = 'Borrar';
        row.appendChild(audio); row.appendChild(dl); row.appendChild(del);
        listEl.appendChild(row);
      });
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
        rec.ondataavailable = function (e) { if (e.data.size > 0) chunks.push(e.data); };
        rec.onstop = async function () {
          stream.getTracks().forEach(function (t) { t.stop(); });
          btn.classList.remove('recording');
          btn.textContent = '🎤 Grabar mi traducción';
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
            if (window.Sync) window.Sync.programar();
          } catch (err) {
            statusEl.className = 'status bad';
            statusEl.textContent = 'No se pudo guardar la grabación (' + err.message + ').';
          }
        };
        rec.start();
        btn.classList.add('recording');
        btn.textContent = '⏹ Detener grabación';
        statusEl.className = 'status';
        statusEl.textContent = '🎙️ Grabando...';
      } catch (err) {
        statusEl.className = 'status bad';
        statusEl.textContent = 'No se pudo acceder al micrófono (' + err.message + ').';
      }
    };

    TRANSLATE_PHRASES.forEach(function (p, idx) {
      const card = el('div', 'card');
      card.appendChild(el('div', 'phrase-en', p.es));
      const row = el('div', 'row');
      row.appendChild(actionButton('btn-listen', '🔊 Escuchar (español)', 'listen-translate', idx));
      row.appendChild(actionButton('btn-record', '🎤 Grabar mi traducción', 'toggle-record', idx));
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
        await deleteRecording(Number(btn.dataset.id));
        await refreshRecordingsPanel();
      });
    }

    refreshRecordingsPanel();
  }

  /* ---------- Barra inferior ---------- */
  const summaryBar = document.querySelector('.summary');
  if (summaryBar && TOTAL_SCORED && window.Racha) {
    const cont = el('span', 'racha');
    chipRacha = el('strong');
    cont.appendChild(chipRacha);
    summaryBar.appendChild(cont);
    pintarRacha();
  }
  if (summaryBar && TOTAL_SCORED) {
    const reset = el('button', 'btn-reset', '↺ Reiniciar');
    reset.type = 'button';
    reset.title = 'Borrar el progreso guardado de esta lección';
    reset.addEventListener('click', function () {
      if (!window.confirm('¿Borrar el progreso guardado de esta lección?')) return;
      results = {};
      try { localStorage.removeItem(STORAGE_KEY); } catch (err) {}
      document.querySelectorAll('.status').forEach(function (s) {
        s.className = 'status';
        s.textContent = '';
      });
      updateSummary();
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

  updateSummary();
})();
