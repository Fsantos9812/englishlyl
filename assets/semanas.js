/*
  Las semanas del curso en el indice.

  Las lecciones que genera tools/nueva-semana.py traen en lessons.json su
  "semana", su "dia" (lun ... dom), su "fecha" (AAAA-MM-DD) y el "tema" de la
  semana. Con eso el indice muestra un grupo por semana ("Semana 1 · 9–15 nov")
  que se despliega por dias. Las lecciones sueltas, sin semana, van aparte.

  No toca el DOM: lo usa assets/index.js y lo prueba tools/probar-semanas.mjs.
*/
(function () {
  'use strict';

  const DIAS = ['lun', 'mar', 'mie', 'jue', 'vie', 'sab', 'dom'];
  const NOMBRE_DIA = { lun: 'Lun', mar: 'Mar', mie: 'Mié', jue: 'Jue', vie: 'Vie', sab: 'Sáb', dom: 'Dom' };
  const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

  // 'AAAA-MM-DD' como fecha LOCAL. new Date('2026-11-09') seria la medianoche
  // UTC, que en Colombia todavia es el domingo 8 a las 7 de la noche.
  function fecha(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
    return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
  }

  function sumarDias(d, n) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  }

  function mismoDia(a, b) {
    return !!(a && b) && a.getFullYear() === b.getFullYear()
      && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  }

  // "9–15 nov"; si la semana cruza de mes, "30 nov – 6 dic".
  function rango(desde, hasta) {
    if (!desde || !hasta) return '';
    if (desde.getMonth() === hasta.getMonth()) {
      return desde.getDate() + '–' + hasta.getDate() + ' ' + MESES[hasta.getMonth()];
    }
    return desde.getDate() + ' ' + MESES[desde.getMonth()] + ' – ' + hasta.getDate() + ' ' + MESES[hasta.getMonth()];
  }

  // "S01 Lun · Países y nacionalidades" -> "Países y nacionalidades": dentro de
  // su semana, el dia ya lo dice la fila.
  function sinPrefijo(titulo) {
    return String(titulo || '').replace(/^S\d+\s+\S+\s+·\s+/, '');
  }

  // "Lun 9 · Países y nacionalidades"
  function tituloDelDia(leccion) {
    const d = fecha(leccion.fecha);
    const dia = ((NOMBRE_DIA[leccion.dia] || '') + (d ? ' ' + d.getDate() : '')).trim();
    return (dia ? dia + ' · ' : '') + sinPrefijo(leccion.titulo);
  }

  function ordenDelDia(leccion) {
    const i = DIAS.indexOf(leccion.dia);
    return i === -1 ? DIAS.length : i;
  }

  // La semana que se muestra abierta: la de hoy; si hoy no cae en ninguna, la
  // ultima que ya empezo; si todas son futuras, la mas cercana. `grupos` viene
  // de la semana mas nueva a la mas vieja.
  function semanaAbierta(grupos, hoy) {
    const conFecha = grupos.filter(function (g) { return g.desde; });
    const enCurso = conFecha.find(function (g) { return g.desde <= hoy && hoy <= g.hasta; });
    if (enCurso) return enCurso.semana;
    const empezadas = conFecha.filter(function (g) { return g.desde <= hoy; });
    if (empezadas.length) return empezadas[0].semana;
    if (conFecha.length) return conFecha[conFecha.length - 1].semana;
    return grupos.length ? grupos[0].semana : null;
  }

  /*
    { grupos: [{ semana, etiqueta, tema, desde, hasta, lecciones, deHoy }],
      sueltas: [lecciones sin semana, en el orden de lessons.json],
      abierta: numero de la semana que va abierta, o null }

    Los grupos van de la semana mas nueva a la mas vieja: la que se esta
    haciendo queda arriba. Dentro de cada uno, de lunes a domingo.
  */
  function agrupar(lecciones, hoy) {
    const base = hoy || new Date();
    const hoyLocal = new Date(base.getFullYear(), base.getMonth(), base.getDate());
    const porSemana = new Map();
    const sueltas = [];

    (lecciones || []).forEach(function (l) {
      if (Number.isInteger(l.semana) && l.semana > 0) {
        if (!porSemana.has(l.semana)) porSemana.set(l.semana, []);
        porSemana.get(l.semana).push(l);
      } else {
        sueltas.push(l);
      }
    });

    const grupos = Array.from(porSemana.keys())
      .sort(function (a, b) { return b - a; })
      .map(function (n) {
        const ls = porSemana.get(n).slice().sort(function (a, b) { return ordenDelDia(a) - ordenDelDia(b); });
        const fechas = ls.map(function (l) { return fecha(l.fecha); })
          .filter(Boolean)
          .sort(function (a, b) { return a - b; });
        const desde = fechas.length ? fechas[0] : null;
        // La semana va de lunes a domingo aunque falte alguna leccion.
        const hasta = desde ? sumarDias(desde, 6) : null;
        const conTema = ls.find(function (l) { return l.tema; });
        return {
          semana: n,
          etiqueta: 'Semana ' + n + (desde ? ' · ' + rango(desde, hasta) : ''),
          tema: conTema ? conTema.tema : '',
          desde: desde,
          hasta: hasta,
          lecciones: ls,
          deHoy: ls.filter(function (l) { return mismoDia(fecha(l.fecha), hoyLocal); })
            .map(function (l) { return l.id; })
        };
      });

    return { grupos: grupos, sueltas: sueltas, abierta: semanaAbierta(grupos, hoyLocal) };
  }

  window.Semanas = {
    agrupar: agrupar,
    rango: rango,
    tituloDelDia: tituloDelDia,
    sinPrefijo: sinPrefijo,
    fecha: fecha
  };
})();
