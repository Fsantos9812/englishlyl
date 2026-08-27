/*
  Repetición espaciada: el registro.

  Esta pieza NO muestra nada todavía. Su único trabajo es que cada respuesta
  con puntaje deje una huella duradera por tarjeta, para que el día que exista
  la pantalla de repaso haya historia de dónde partir. La historia que no se
  registra hoy no se puede recuperar después.

  Una tarjeta es una frase EN UN MODO: la misma frase practicada en
  Listen and Repeat y en Listen and Type son dos tarjetas distintas, porque
  pronunciarla y reconocerla escrita se olvidan a ritmos distintos.

    id de tarjeta = "<leccion>:<modo>:<indice>"   ej. "leccion-01-familia:repeat:3"

  El algoritmo es SM-2, el mismo del reproductor de flashcards. La diferencia
  con Anki es que acá la calidad NO la elige el alumno: sale del puntaje que ya
  calcula la lección, así que no depende de que sea honesto consigo mismo.
*/
window.SRS = (function () {
  'use strict';

  const CLAVE = 'lecciones:srs';

  /* ---------- Fechas, en hora local igual que la racha ---------- */

  function iso(d) {
    return d.getFullYear() + '-'
      + String(d.getMonth() + 1).padStart(2, '0') + '-'
      + String(d.getDate()).padStart(2, '0');
  }
  function hoy() { return iso(new Date()); }

  function aFecha(s) {
    const p = String(s).split('-');
    return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
  }
  function sumarDias(fechaISO, dias) {
    const d = aFecha(fechaISO);
    return iso(new Date(d.getFullYear(), d.getMonth(), d.getDate() + dias));
  }
  function diasEntre(desde, hasta) {
    return Math.round((aFecha(hasta) - aFecha(desde)) / 86400000);
  }

  /* ---------- Puntaje automático -> calidad de SM-2 ---------- */

  // SM-2 espera 0..5. Los cortes son los mismos que ya usa la lección para
  // decir "¡Muy bien!" (85%) y "Intentá de nuevo" (55%), así lo que ve el
  // alumno y lo que decide el algoritmo no se contradicen.
  function calidadDe(puntaje) {
    const p = Number(puntaje);
    if (!isFinite(p)) return 0;
    if (p >= 0.85) return 5;
    if (p >= 0.70) return 4;
    if (p >= 0.55) return 3;   // 3 es el mínimo que NO reinicia la tarjeta
    if (p >= 0.40) return 2;
    return 1;
  }

  /* ---------- SM-2 (mismo que reproductor-flashcards/site/app.js) ---------- */

  function programar(estado, q) {
    let ease = estado ? estado.e : 2.5;
    let reps = estado ? estado.r : 0;
    let interval = estado ? estado.i : 0;

    if (q < 3) {
      reps = 0;
      interval = 1;
    } else {
      reps = reps + 1;
      if (reps === 1) interval = 1;
      else if (reps === 2) interval = 6;
      else interval = Math.round(interval * ease);
      if (interval < 1) interval = 1;
    }
    ease = Math.max(1.3, ease + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)));

    return { i: interval, e: ease, r: reps, d: sumarDias(hoy(), interval) };
  }

  /* ---------- Almacenamiento ---------- */

  // Las claves son cortas a propósito. El servidor rechaza payloads de más de
  // 256 KB, y un curso de 15 lecciones son ~660 tarjetas: con nombres largos
  // el envío se acerca demasiado a ese techo.
  //   i intervalo · e facilidad · r repeticiones · d vence
  //   v vistas · u último repaso (ISO) · p último puntaje · b mejor puntaje

  function leerTodo() {
    try {
      const g = JSON.parse(localStorage.getItem(CLAVE) || 'null');
      if (g && typeof g === 'object') return g;
    } catch (err) {}
    return {};
  }

  function guardarTodo(mapa) {
    try { localStorage.setItem(CLAVE, JSON.stringify(mapa)); } catch (err) {}
  }

  function idDeTarjeta(leccion, clave) {
    return String(leccion || 'leccion') + ':' + String(clave || '');
  }

  /* ---------- API ---------- */

  /**
   * Registra una respuesta corregida. La llama la lección en cada resultado.
   * @param {string} leccion  id de la lección
   * @param {string} clave    "repeat:3" | "type:0"
   * @param {number} puntaje  0..1
   */
  function registrar(leccion, clave, puntaje) {
    const id = idDeTarjeta(leccion, clave);
    const mapa = leerTodo();
    const previo = mapa[id] || null;

    const q = calidadDe(puntaje);
    const nuevo = programar(previo, q);

    nuevo.v = (previo && Number(previo.v) || 0) + 1;
    nuevo.u = new Date().toISOString();
    nuevo.p = Math.round(Number(puntaje) * 1000) / 1000;
    nuevo.b = Math.max(previo && Number(previo.b) || 0, nuevo.p);

    mapa[id] = nuevo;
    guardarTodo(mapa);
    return nuevo;
  }

  function estadoDe(leccion, clave) {
    return leerTodo()[idDeTarjeta(leccion, clave)] || null;
  }

  /** Tarjetas que vencen hoy o antes. La va a usar la pantalla de repaso. */
  function vencidas(fechaISO) {
    const limite = fechaISO || hoy();
    const mapa = leerTodo();
    return Object.keys(mapa)
      .filter(function (id) {
        const t = mapa[id];
        return t && t.d && diasEntre(t.d, limite) >= 0;
      })
      .map(function (id) {
        const partes = id.split(':');
        return {
          id: id,
          leccion: partes[0],
          modo: partes[1],
          indice: Number(partes[2]),
          estado: mapa[id]
        };
      })
      .sort(function (a, b) { return a.estado.d < b.estado.d ? -1 : 1; });
  }

  /**
   * Contadores para el tracker.
   * @param {string} [modo] "vocab" | "repeat" | "type". Sin modo, todas.
   *   Hace falta porque una leccion de 22 frases deja 44 tarjetas de ejercicio,
   *   y un contador que dice "vocabulario" no puede estar contando esas.
   */
  function resumen(modo) {
    const mapa = leerTodo();
    const ids = Object.keys(mapa).filter(function (id) {
      return !modo || id.split(':')[1] === modo;
    });
    const h = hoy();
    let vencen = 0;
    let maduras = 0;
    for (const id of ids) {
      const t = mapa[id];
      if (t.d && diasEntre(t.d, h) >= 0) vencen++;
      if (Number(t.i) >= 21) maduras++;      // criterio de Anki para "madura"
    }
    return { tarjetas: ids.length, vencenHoy: vencen, maduras: maduras };
  }

  /* ---------- Sincronización entre dispositivos ---------- */

  function paraEnviar() { return leerTodo(); }

  /**
   * Une lo del servidor con lo local. Gana el repaso más reciente de cada
   * tarjeta: si practicó en el celular después que en la compu, vale el celular.
   * Devuelve true si algo cambió.
   */
  function adoptar(remoto) {
    if (!remoto || typeof remoto !== 'object') return false;
    const local = leerTodo();
    let cambio = false;

    for (const id of Object.keys(remoto)) {
      const r = remoto[id];
      const l = local[id];
      if (!r || typeof r !== 'object') continue;
      if (!l || String(r.u || '') > String(l.u || '')) {
        local[id] = r;
        cambio = true;
      }
    }
    if (cambio) guardarTodo(local);
    return cambio;
  }

  function borrar() {
    try { localStorage.removeItem(CLAVE); } catch (err) {}
  }

  return {
    registrar: registrar,
    estadoDe: estadoDe,
    vencidas: vencidas,
    resumen: resumen,
    paraEnviar: paraEnviar,
    adoptar: adoptar,
    borrar: borrar,
    calidadDe: calidadDe,
    hoy: hoy
  };
})();
