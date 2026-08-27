/*
  Puntos de experiencia.

  Miden ESFUERZO, no dominio. El dominio ya lo miden el puntaje de cada
  ejercicio y el SRS; si el XP también premiara acertar, un alumno flojo que
  practica todos los días vería siempre cero y dejaría de practicar. Por eso
  hasta una respuesta a medias suma algo.

  Se guarda por día, no como un total suelto: así existe la meta diaria, y el
  total sale de sumar. Las fechas son locales, igual que en racha.js — con
  toISOString() el día cambiaría a la noche y cortaría la meta antes de tiempo.
*/
window.XP = (function () {
  'use strict';

  const CLAVE = 'lecciones:xp';
  const MAX_DIAS = 400;
  const META_DIARIA = 50;

  // Lo que vale un ejercicio, según los mismos cortes que usa el veredicto.
  const POR_ACIERTO = 10;   // >= 85%
  const POR_CERCA = 5;      // >= 55%
  const POR_INTENTO = 2;    // debajo de eso: intentarlo también cuenta
  const COMBO_DESDE = 3;    // a partir de la 3ra seguida
  const COMBO_EXTRA = 2;    // XP extra por cada una, con tope
  const COMBO_TOPE = 10;

  function iso(d) {
    return d.getFullYear() + '-'
      + String(d.getMonth() + 1).padStart(2, '0') + '-'
      + String(d.getDate()).padStart(2, '0');
  }
  function hoy() { return iso(new Date()); }
  function esFecha(s) { return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s); }

  function crudo() {
    try {
      const g = JSON.parse(localStorage.getItem(CLAVE) || 'null');
      if (g && typeof g === 'object' && g.dias && typeof g.dias === 'object') return g;
    } catch (err) {}
    return { dias: {} };
  }

  function guardar(dias) {
    // Se recorta el historial como la racha: el envío al servidor tiene tope.
    const fechas = Object.keys(dias).filter(esFecha).sort().slice(-MAX_DIAS);
    const limpio = {};
    fechas.forEach(function (f) {
      const n = Math.round(Number(dias[f]));
      if (isFinite(n) && n > 0) limpio[f] = n;
    });
    try { localStorage.setItem(CLAVE, JSON.stringify({ dias: limpio })); } catch (err) {}
    return limpio;
  }

  /**
   * Cuánto vale una respuesta.
   * @param {number} puntaje 0..1
   * @param {number} combo   respuestas buenas seguidas ANTES de ésta
   */
  function valeIntento(puntaje, combo) {
    const p = Number(puntaje);
    let base = POR_INTENTO;
    if (p >= 0.85) base = POR_ACIERTO;
    else if (p >= 0.55) base = POR_CERCA;

    // El combo sólo premia aciertos: si "cerca" lo alimentara, se podría
    // farmear respondiendo a medias sin aprender nada.
    if (p < 0.85 || combo + 1 < COMBO_DESDE) return { base: base, extra: 0 };
    const extra = Math.min((combo + 2 - COMBO_DESDE) * COMBO_EXTRA, COMBO_TOPE);
    return { base: base, extra: extra };
  }

  function sumar(n) {
    const cantidad = Math.round(Number(n));
    if (!isFinite(cantidad) || cantidad <= 0) return deHoy();
    const g = crudo();
    const h = hoy();
    g.dias[h] = (Number(g.dias[h]) || 0) + cantidad;
    guardar(g.dias);
    return deHoy();
  }

  function deHoy() { return Number(crudo().dias[hoy()]) || 0; }

  function total() {
    const dias = crudo().dias;
    return Object.keys(dias).reduce(function (s, f) { return s + (Number(dias[f]) || 0); }, 0);
  }

  function resumen() {
    const h = deHoy();
    return {
      hoy: h,
      total: total(),
      meta: META_DIARIA,
      metaCumplida: h >= META_DIARIA,
      faltaParaLaMeta: Math.max(0, META_DIARIA - h)
    };
  }

  /* ---------- Sincronización ---------- */

  function paraEnviar() { return { dias: crudo().dias }; }

  /**
   * Une lo del servidor con lo local quedándose con el MAYOR de cada día.
   * No suma: el mismo dispositivo reenvía su total cada vez que sincroniza, y
   * sumando se duplicaría en cada envío. El costo es que dos dispositivos el
   * mismo día no acumulan entre sí, sólo gana el que más hizo.
   */
  function adoptar(remoto) {
    if (!remoto || typeof remoto !== 'object' || !remoto.dias) return false;
    const g = crudo();
    let cambio = false;
    Object.keys(remoto.dias).forEach(function (f) {
      if (!esFecha(f)) return;
      const suyo = Number(remoto.dias[f]) || 0;
      const mio = Number(g.dias[f]) || 0;
      if (suyo > mio) { g.dias[f] = suyo; cambio = true; }
    });
    if (cambio) guardar(g.dias);
    return cambio;
  }

  function borrar() {
    try { localStorage.removeItem(CLAVE); } catch (err) {}
  }

  return {
    valeIntento: valeIntento,
    sumar: sumar,
    deHoy: deHoy,
    total: total,
    resumen: resumen,
    paraEnviar: paraEnviar,
    adoptar: adoptar,
    borrar: borrar,
    META_DIARIA: META_DIARIA,
    COMBO_DESDE: COMBO_DESDE
  };
})();
