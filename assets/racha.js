/*
  Racha de días practicando.

  La fuente de verdad es la LISTA DE DÍAS, no un contador. El número de días
  seguidos se calcula siempre a partir de esa lista, nunca se guarda suelto.
  Eso permite unir el historial de varios dispositivos: juntando las listas
  sale la racha real, sin que un celular con menos historia le pise la racha
  a la computadora.

  Sin nombre y código de clase esto es puramente local. Con ellos, el servidor
  une los días de todos los dispositivos y el cliente adopta esa lista.
*/
window.Racha = (function () {
  'use strict';

  const CLAVE = 'lecciones:racha';
  const CLAVE_HOY = 'lecciones:racha-hoy';   // lo hecho hoy, hasta completar el dia

  // El dia NO suma con una sola de las dos. Practicar la leccion y repasar el
  // vocabulario se olvidan a ritmos distintos: la racha premia sostener las dos.
  const REQUERIDAS = [
    { clave: 'leccion', texto: 'practicar una lección' },
    { clave: 'repaso', texto: 'repasar el vocabulario' }
  ];
  const MAX_DIAS = 400;         // techo del historial guardado

  // Fecha local en formato YYYY-MM-DD. A propósito NO se usa toISOString():
  // eso da UTC y a la noche te cambia el día antes de tiempo.
  function iso(d) {
    return d.getFullYear() + '-'
      + String(d.getMonth() + 1).padStart(2, '0') + '-'
      + String(d.getDate()).padStart(2, '0');
  }

  function hoy() { return iso(new Date()); }

  /* ---------- Lo hecho hoy ---------- */

  // Vive aparte de la lista de dias y se descarta solo al cambiar la fecha:
  // es estado del dia en curso, no historial.
  function actividadesDeHoy() {
    try {
      const g = JSON.parse(localStorage.getItem(CLAVE_HOY) || 'null');
      if (g && g.fecha === hoy() && g.hechas && typeof g.hechas === 'object') return g.hechas;
    } catch (err) {}
    return {};
  }

  function guardarActividades(hechas) {
    try { localStorage.setItem(CLAVE_HOY, JSON.stringify({ fecha: hoy(), hechas: hechas })); }
    catch (err) {}
  }

  /** Lo que falta hacer hoy para que el dia sume. Vacio si ya sumo. */
  function faltantes() {
    const hechas = actividadesDeHoy();
    return REQUERIDAS.filter(function (r) { return !hechas[r.clave]; });
  }

  /** "repasar el vocabulario" | "practicar una lección y repasar el vocabulario" */
  function queFalta() {
    const f = faltantes().map(function (r) { return r.texto; });
    if (!f.length) return '';
    return f.length === 1 ? f[0] : f.slice(0, -1).join(', ') + ' y ' + f[f.length - 1];
  }

  function esFecha(s) { return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s); }

  function aFecha(s) {
    const p = String(s).split('-');
    return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
  }

  function diasEntre(desde, hasta) {
    return Math.round((aFecha(hasta) - aFecha(desde)) / 86400000);
  }

  function ordenarUnicos(dias) {
    const vistos = {};
    const salida = [];
    (dias || []).forEach(function (d) {
      if (!esFecha(d) || vistos[d]) return;
      vistos[d] = true;
      salida.push(d);
    });
    return salida.sort().slice(-MAX_DIAS);
  }

  /* ---------- Cálculo a partir de la lista de días ---------- */

  // La corrida más larga de todo el historial.
  function mejorCorrida(dias) {
    if (!dias.length) return 0;
    let mejor = 1;
    let corrida = 1;
    for (let i = 1; i < dias.length; i++) {
      corrida = (diasEntre(dias[i - 1], dias[i]) === 1) ? corrida + 1 : 1;
      if (corrida > mejor) mejor = corrida;
    }
    return mejor;
  }

  // La corrida viva: sólo cuenta si termina hoy o ayer.
  function corridaActual(dias, hoyISO) {
    if (!dias.length) return 0;
    const ultimo = dias[dias.length - 1];
    const dif = diasEntre(ultimo, hoyISO);
    if (dif !== 0 && dif !== 1) return 0;
    let actual = 1;
    for (let i = dias.length - 1; i > 0; i--) {
      if (diasEntre(dias[i - 1], dias[i]) === 1) actual++;
      else break;
    }
    return actual;
  }

  /* ---------- Almacenamiento ---------- */

  function crudo() {
    let g = null;
    try { g = JSON.parse(localStorage.getItem(CLAVE) || 'null'); } catch (err) { g = null; }
    if (!g || typeof g !== 'object') return { dias: [], mejor: 0 };

    let dias = ordenarUnicos(g.dias);

    // Formato viejo (contador suelto, sin historial): se reconstruyen los días
    // hacia atrás desde el último, así nadie pierde su racha al actualizar.
    if (!dias.length && esFecha(g.ultimo) && Number(g.actual) > 0) {
      const cuantos = Math.min(Number(g.actual), MAX_DIAS);
      const base = aFecha(g.ultimo);
      const reconstruidos = [];
      for (let i = cuantos - 1; i >= 0; i--) {
        reconstruidos.push(iso(new Date(base.getFullYear(), base.getMonth(), base.getDate() - i)));
      }
      dias = ordenarUnicos(reconstruidos);
    }

    return { dias: dias, mejor: Number(g.mejor) || 0 };
  }

  function guardar(dias, mejorPrevio) {
    const limpios = ordenarUnicos(dias);
    const mejor = Math.max(Number(mejorPrevio) || 0, mejorCorrida(limpios));
    try {
      localStorage.setItem(CLAVE, JSON.stringify({ dias: limpios, mejor: mejor }));
    } catch (err) {}
    return { dias: limpios, mejor: mejor };
  }

  /* ---------- API ---------- */

  function leer() {
    const d = crudo();
    const h = hoy();
    const actual = corridaActual(d.dias, h);
    const ultimo = d.dias.length ? d.dias[d.dias.length - 1] : null;
    const practicoHoy = ultimo === h;

    return {
      actual: actual,
      mejor: Math.max(d.mejor, mejorCorrida(d.dias)),
      ultimo: ultimo,
      practicoHoy: practicoHoy,
      enRiesgo: actual > 0 && !practicoHoy,          // practicó ayer, hoy todavía no
      vencida: !actual && !!ultimo,                  // venía practicando y cortó
      dias: d.dias,
      faltaHoy: practicoHoy ? '' : queFalta()        // qué le falta para sumar hoy
    };
  }

  /**
   * Anota una actividad del dia. El dia recien suma cuando estan TODAS las
   * requeridas: hacer solo la leccion, o solo el repaso, no alcanza.
   *
   * @param {string} actividad "leccion" | "repaso"
   * @returns {{subio, nuevo, falta, actual, mejor, record}}
   *   subio  el dia se sumo en esta llamada
   *   nuevo  esta actividad no estaba marcada hoy (para no repetir el aviso)
   *   falta  lo que sigue faltando, en texto; vacio si ya esta completo
   */
  function registrar(actividad) {
    const antes = leer();
    if (antes.practicoHoy) {
      return { subio: false, nuevo: false, falta: '',
               actual: antes.actual, mejor: antes.mejor, record: false };
    }

    const hechas = actividadesDeHoy();
    const nuevo = !!actividad && !hechas[actividad];
    if (actividad) { hechas[actividad] = true; guardarActividades(hechas); }

    const falta = queFalta();
    if (falta) {
      return { subio: false, nuevo: nuevo, falta: falta,
               actual: antes.actual, mejor: antes.mejor, record: false };
    }

    // Ya estan las dos: recien ahora el dia entra en la lista.
    const d = crudo();
    const guardado = guardar(d.dias.concat([hoy()]), d.mejor);
    const despues = leer();
    return {
      subio: true,
      nuevo: nuevo,
      falta: '',
      actual: despues.actual,
      mejor: despues.mejor,
      record: despues.actual > 1 && despues.actual >= guardado.mejor
    };
  }

  // Une lo que devolvió el servidor con lo local. No pisa: suma días.
  // Devuelve true si el número visible cambió, para repintar.
  function adoptar(remoto) {
    if (!remoto || typeof remoto !== 'object') return false;
    const antes = leer();
    const d = crudo();
    guardar(d.dias.concat(Array.isArray(remoto.dias) ? remoto.dias : []),
            Math.max(d.mejor, Number(remoto.mejor) || 0));
    const despues = leer();
    return despues.actual !== antes.actual || despues.mejor !== antes.mejor;
  }

  // Lo que se le manda al servidor.
  function paraEnviar() {
    const d = crudo();
    return { dias: d.dias, mejor: Math.max(d.mejor, mejorCorrida(d.dias)) };
  }

  // Los últimos n días corridos, terminando hoy, para la tira del índice.
  function ultimosDias(n) {
    const practicados = {};
    crudo().dias.forEach(function (x) { practicados[x] = true; });

    const iniciales = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];
    const base = new Date();
    const salida = [];
    for (let i = n - 1; i >= 0; i--) {
      const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() - i);
      const clave = iso(d);
      salida.push({
        fecha: clave,
        inicial: iniciales[d.getDay()],
        practico: !!practicados[clave],
        esHoy: i === 0
      });
    }
    return salida;
  }

  function borrar() {
    try { localStorage.removeItem(CLAVE); } catch (err) {}
    try { localStorage.removeItem(CLAVE_HOY); } catch (err) {}
  }

  return {
    leer: leer,
    registrar: registrar,
    adoptar: adoptar,
    paraEnviar: paraEnviar,
    ultimosDias: ultimosDias,
    faltantes: faltantes,
    queFalta: queFalta,
    hoy: hoy,
    borrar: borrar
  };
})();
