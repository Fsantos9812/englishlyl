/*
  Exportar el progreso del alumno como un .zip que pueda mandarle al profe:
  las grabaciones de audio + un resumen de puntajes.

  Todo pasa en el navegador. No hay servidor, no se sube nada a ningún lado:
  el alumno se descarga el archivo y lo manda por donde quiera.

  El .zip se arma a mano (método "store", sin comprimir) para no depender de
  ninguna librería externa. El audio ya viene comprimido, así que no se pierde
  nada por no deflatear.
*/
(function () {
  'use strict';

  const PREFIJO_PROGRESO = 'lecciones:progreso:';

  const boton = document.getElementById('exportar');
  const estado = document.getElementById('export-status');
  const conteo = document.getElementById('export-conteo');
  if (!boton || !estado) return;

  /* ---------------- ZIP mínimo (store) ---------------- */

  const TABLA_CRC = (function () {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c >>> 0;
    }
    return t;
  })();

  function crc32(bytes) {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < bytes.length; i++) c = TABLA_CRC[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  function fechaDOS(d) {
    return {
      hora: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
      dia: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()
    };
  }

  function crearZip(archivos) {
    const codificador = new TextEncoder();
    const ahora = fechaDOS(new Date());

    const entradas = archivos.map(function (a) {
      const nombre = codificador.encode(a.nombre);
      return { nombre: nombre, datos: a.datos, crc: crc32(a.datos) };
    });

    const bytesLocales = entradas.reduce(function (s, e) { return s + 30 + e.nombre.length + e.datos.length; }, 0);
    const bytesCentral = entradas.reduce(function (s, e) { return s + 46 + e.nombre.length; }, 0);
    const buffer = new ArrayBuffer(bytesLocales + bytesCentral + 22);
    const vista = new DataView(buffer);
    const bytes = new Uint8Array(buffer);
    let pos = 0;

    entradas.forEach(function (e) {
      e.offset = pos;
      vista.setUint32(pos, 0x04034B50, true);          // firma cabecera local
      vista.setUint16(pos + 4, 20, true);              // versión necesaria
      vista.setUint16(pos + 6, 0x0800, true);          // bit 11: nombres en UTF-8
      vista.setUint16(pos + 8, 0, true);               // método 0 = sin comprimir
      vista.setUint16(pos + 10, ahora.hora, true);
      vista.setUint16(pos + 12, ahora.dia, true);
      vista.setUint32(pos + 14, e.crc, true);
      vista.setUint32(pos + 18, e.datos.length, true); // tamaño comprimido
      vista.setUint32(pos + 22, e.datos.length, true); // tamaño original
      vista.setUint16(pos + 26, e.nombre.length, true);
      vista.setUint16(pos + 28, 0, true);              // sin campo extra
      pos += 30;
      bytes.set(e.nombre, pos); pos += e.nombre.length;
      bytes.set(e.datos, pos); pos += e.datos.length;
    });

    const inicioCentral = pos;
    entradas.forEach(function (e) {
      vista.setUint32(pos, 0x02014B50, true);          // firma directorio central
      vista.setUint16(pos + 4, 20, true);              // versión que lo creó
      vista.setUint16(pos + 6, 20, true);              // versión necesaria
      vista.setUint16(pos + 8, 0x0800, true);
      vista.setUint16(pos + 10, 0, true);
      vista.setUint16(pos + 12, ahora.hora, true);
      vista.setUint16(pos + 14, ahora.dia, true);
      vista.setUint32(pos + 16, e.crc, true);
      vista.setUint32(pos + 20, e.datos.length, true);
      vista.setUint32(pos + 24, e.datos.length, true);
      vista.setUint16(pos + 28, e.nombre.length, true);
      vista.setUint16(pos + 30, 0, true);              // extra
      vista.setUint16(pos + 32, 0, true);              // comentario
      vista.setUint16(pos + 34, 0, true);              // disco
      vista.setUint16(pos + 36, 0, true);              // atributos internos
      vista.setUint32(pos + 38, 0, true);              // atributos externos
      vista.setUint32(pos + 42, e.offset, true);
      pos += 46;
      bytes.set(e.nombre, pos); pos += e.nombre.length;
    });

    vista.setUint32(pos, 0x06054B50, true);            // fin del directorio central
    vista.setUint16(pos + 4, 0, true);
    vista.setUint16(pos + 6, 0, true);
    vista.setUint16(pos + 8, entradas.length, true);
    vista.setUint16(pos + 10, entradas.length, true);
    vista.setUint32(pos + 12, pos - inicioCentral, true);
    vista.setUint32(pos + 16, inicioCentral, true);
    vista.setUint16(pos + 20, 0, true);

    return new Blob([buffer], { type: 'application/zip' });
  }

  /* ---------------- Lectura de lo guardado ---------------- */

  function abrirDB() {
    return new Promise(function (resolve, reject) {
      if (!('indexedDB' in window)) { reject(new Error('IndexedDB no disponible')); return; }
      const req = indexedDB.open('lecciones_audio', 1);
      // Mismo esquema que assets/lesson.js: si abrimos sin crearlo, una base
      // vacía en versión 1 dejaría a las lecciones sin poder guardar nunca.
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

  async function leerGrabaciones() {
    let db;
    try { db = await abrirDB(); } catch (err) { return []; }
    if (!db.objectStoreNames.contains('grabaciones')) return [];
    return new Promise(function (resolve) {
      const tx = db.transaction('grabaciones', 'readonly');
      const req = tx.objectStore('grabaciones').getAll();
      req.onsuccess = function () { resolve(req.result || []); };
      req.onerror = function () { resolve([]); };
    });
  }

  function leerManifiesto() {
    return fetch('lessons.json', { cache: 'no-cache' })
      .then(function (r) { return r.ok ? r.json() : { lecciones: [] }; })
      .then(function (m) { return (m && m.lecciones) || []; })
      .catch(function () { return []; });
  }

  function progresoDe(leccion, grabaciones) {
    const e = leccion.ejercicios || {};
    const conPuntaje = (e.repeat || 0) + (e.type || 0);
    const sinPuntaje = e.translate || 0;
    const detalle = [];
    let suma = 0;
    try {
      const crudo = localStorage.getItem(PREFIJO_PROGRESO + leccion.id);
      const guardado = crudo ? JSON.parse(crudo) : null;
      if (guardado && typeof guardado === 'object') {
        Object.keys(guardado).sort().forEach(function (k) {
          const v = guardado[k];
          if (typeof v !== 'number' || !isFinite(v)) return;
          detalle.push({ ejercicio: k, puntaje: Math.round(v * 100) });
          suma += v;
        });
      }
    } catch (err) { /* sin progreso legible */ }
    // Una traduccion grabada es trabajo hecho aunque no lleve puntaje: se cuenta
    // igual que en el indice, si no el .zip dice un numero y la app otro.
    const frases = {};
    (grabaciones || []).forEach(function (g) {
      if (!g || g.lessonId !== leccion.id) return;
      // Los intentos de Repeat no cuentan como Translate hecho.
      if (g.origen === 'repeat') return;
      const i = Number(g.phraseIdx);
      if (Number.isInteger(i) && i >= 0) frases[i] = true;
    });
    const grabadas = Math.min(Object.keys(frases).length, sinPuntaje);

    return {
      total: conPuntaje + sinPuntaje,
      hechos: Math.min(detalle.length, conPuntaje) + grabadas,
      promedio: detalle.length ? Math.round((suma / detalle.length) * 100) : null,
      detalle: detalle
    };
  }

  /* ---------------- Armado del paquete ---------------- */

  function slug(texto) {
    return (texto || '')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'sin-nombre';
  }

  // "grabación" pierde la tilde en plural: no alcanza con pegarle una "es".
  function plural(n, singular, plural_) {
    return n === 1 ? singular : plural_;
  }

  function extensionDe(mime) {
    const m = (mime || '').toLowerCase();
    if (m.indexOf('mp4') >= 0 || m.indexOf('aac') >= 0 || m.indexOf('m4a') >= 0) return 'm4a';
    if (m.indexOf('ogg') >= 0) return 'ogg';
    if (m.indexOf('wav') >= 0) return 'wav';
    if (m.indexOf('mpeg') >= 0) return 'mp3';
    return 'webm';
  }

  function armarResumenTexto(alumno, lecciones, grabaciones) {
    const lineas = [];
    lineas.push('PROGRESO DE ' + (alumno || 'alumno sin nombre').toUpperCase());
    lineas.push('Exportado el ' + new Date().toLocaleString());
    lineas.push('');
    lecciones.forEach(function (l) {
      const p = progresoDe(l, grabaciones);
      const audios = grabaciones.filter(function (g) { return g.lessonId === l.id; }).length;
      let linea = '- ' + l.titulo + ' (' + (l.nivel || 's/n') + '): ';
      if (!p.total) linea += 'sin ejercicios';
      else if (!p.hechos) linea += 'sin empezar';
      else {
        linea += p.hechos + '/' + p.total + ' ejercicios';
        // Una leccion de puras grabaciones no tiene promedio que mostrar.
        if (p.promedio !== null) linea += ' · promedio ' + p.promedio + '%';
      }
      if (audios) linea += ' · ' + audios + ' ' + plural(audios, 'grabación', 'grabaciones');
      lineas.push(linea);
    });
    lineas.push('');
    lineas.push('Total de grabaciones: ' + grabaciones.length);
    lineas.push('');
    lineas.push('Las carpetas de audios están ordenadas por lección.');
    return lineas.join('\r\n') + '\r\n';   // CRLF: se abre bien en el Bloc de notas
  }

  async function exportar() {
    // El nombre sale de la sesión; sin sesión el zip igual se arma.
    const alumno = window.Auth ? (window.Auth.nombre() || '') : '';

    estado.className = 'status';
    estado.textContent = 'Juntando tus cosas…';
    boton.disabled = true;

    try {
      const [lecciones, grabaciones] = await Promise.all([leerManifiesto(), leerGrabaciones()]);

      const progreso = lecciones.map(function (l) {
        const p = progresoDe(l, grabaciones);
        return {
          leccion: l.id, titulo: l.titulo, nivel: l.nivel,
          ejerciciosHechos: p.hechos, ejerciciosTotales: p.total,
          promedio: p.promedio, detalle: p.detalle
        };
      });

      const hayAlgo = grabaciones.length || progreso.some(function (p) { return p.ejerciciosHechos > 0; });
      if (!hayAlgo) {
        estado.className = 'status warn';
        estado.textContent = 'Todavía no hay nada para exportar: haz algún ejercicio o graba una traducción primero.';
        return;
      }

      const codificador = new TextEncoder();
      const archivos = [
        { nombre: 'resumen.txt', datos: codificador.encode(armarResumenTexto(alumno, lecciones, grabaciones)) },
        {
          nombre: 'progreso.json',
          datos: codificador.encode(JSON.stringify({
            alumno: alumno || null,
            exportado: new Date().toISOString(),
            lecciones: progreso,
            grabaciones: grabaciones.length
          }, null, 2))
        }
      ];

      // Los audios van agrupados por lección y numerados por frase.
      const usados = {};
      for (const g of grabaciones) {
        const bytes = new Uint8Array(await g.blob.arrayBuffer());
        const numero = String(Number(g.phraseIdx) + 1).padStart(2, '0');
        let nombre = 'audios/' + slug(g.lessonId) + '/' + numero + '-' + slug(g.phraseEs)
          + '.' + extensionDe(g.mimeType);
        // Dos intentos de la misma frase no se pueden pisar.
        if (usados[nombre]) {
          const n = ++usados[nombre];
          nombre = nombre.replace(/\.([a-z0-9]+)$/, '-' + n + '.$1');
        } else {
          usados[nombre] = 1;
        }
        archivos.push({ nombre: nombre, datos: bytes });
      }

      const zip = crearZip(archivos);
      const fecha = new Date().toISOString().slice(0, 10);
      const url = URL.createObjectURL(zip);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'progreso-' + slug(alumno) + '-' + fecha + '.zip';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 60000);

      const kb = Math.max(1, Math.round(zip.size / 1024));
      estado.className = 'status good';
      estado.textContent = '✅ Listo: ' + archivos.length + ' archivos (' + kb + ' KB). '
        + 'Búscalo en tus descargas y mándaselo a tu profe.';
    } catch (err) {
      console.error('[exportar]', err);
      estado.className = 'status bad';
      estado.textContent = 'No se pudo armar el archivo (' + err.message + ').';
    } finally {
      boton.disabled = false;
    }
  }

  /* ---------------- Arranque ---------------- */

  boton.addEventListener('click', exportar);

  if (conteo) {
    leerGrabaciones().then(function (gs) {
      conteo.textContent = gs.length
        ? 'Tienes ' + gs.length + ' ' + plural(gs.length, 'grabación guardada', 'grabaciones guardadas')
          + ' en este dispositivo.'
        : 'Todavía no grabaste ninguna traducción.';
    });
  }
})();
