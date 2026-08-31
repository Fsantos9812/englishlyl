/*
  Normalización y puntaje de una respuesta escrita.

  Vivía adentro de assets/lesson.js. Salió de ahí cuando la pantalla de repaso
  necesitó puntuar igual que Listen and Type: con dos copias, la primera vez que
  alguien agregara una contracción a una sola de las dos, el mismo alumno
  escribiendo lo mismo sacaría notas distintas según la pantalla.

  Nada de esto toca el DOM ni guarda nada: entra texto, sale un número.
*/
window.Texto = (function () {
  'use strict';

  const CONTRACCIONES = [
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

  /* ---------------- Numeros en palabras ---------------- */
  // Antes esto era una tabla de redondos (0-20, 30, 40 ... 100). Con eso, "45"
  // se quedaba como "45" mientras el alumno escribia "cuarenta y cinco" y perdia
  // puntos por algo que estaba bien. Una leccion entera de edades lo hacia seguido.
  //
  // Sin tildes a proposito: normalizar() ya saco los acentos cuando llega aca,
  // asi que "dieciseis" tiene que salir sin tilde para poder coincidir.

  const ES_HASTA_29 = [
    'cero', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve',
    'diez', 'once', 'doce', 'trece', 'catorce', 'quince', 'dieciseis', 'diecisiete',
    'dieciocho', 'diecinueve', 'veinte', 'veintiuno', 'veintidos', 'veintitres',
    'veinticuatro', 'veinticinco', 'veintiseis', 'veintisiete', 'veintiocho', 'veintinueve'
  ];
  const ES_DECENAS = ['', '', '', 'treinta', 'cuarenta', 'cincuenta',
    'sesenta', 'setenta', 'ochenta', 'noventa'];
  const ES_CENTENAS = ['', 'ciento', 'doscientos', 'trescientos', 'cuatrocientos',
    'quinientos', 'seiscientos', 'setecientos', 'ochocientos', 'novecientos'];

  const EN_HASTA_19 = [
    'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine',
    'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen',
    'seventeen', 'eighteen', 'nineteen'
  ];
  const EN_DECENAS = ['', '', 'twenty', 'thirty', 'forty', 'fifty',
    'sixty', 'seventy', 'eighty', 'ninety'];

  function enEspanol(n) {
    if (n < 30) return ES_HASTA_29[n];
    if (n < 100) {
      const u = n % 10;
      return ES_DECENAS[Math.floor(n / 10)] + (u ? ' y ' + ES_HASTA_29[u] : '');
    }
    if (n === 100) return 'cien';                 // 100 es "cien", 101 ya es "ciento uno"
    if (n < 1000) {
      const r = n % 100;
      return ES_CENTENAS[Math.floor(n / 100)] + (r ? ' ' + enEspanol(r) : '');
    }
    const miles = Math.floor(n / 1000);
    const r = n % 1000;
    // "mil", no "uno mil"
    return (miles === 1 ? 'mil' : enEspanol(miles) + ' mil') + (r ? ' ' + enEspanol(r) : '');
  }

  function enIngles(n) {
    if (n < 20) return EN_HASTA_19[n];
    if (n < 100) {
      const u = n % 10;
      // Se genera con espacio y no con guion: normalizar() ya convirtio los
      // guiones en espacios, asi que "forty-five" y "forty five" llegan igual.
      return EN_DECENAS[Math.floor(n / 10)] + (u ? ' ' + EN_HASTA_19[u] : '');
    }
    if (n < 1000) {
      const r = n % 100;
      return EN_HASTA_19[Math.floor(n / 100)] + ' hundred' + (r ? ' ' + enIngles(r) : '');
    }
    const miles = Math.floor(n / 1000);
    const r = n % 1000;
    return enIngles(miles) + ' thousand' + (r ? ' ' + enIngles(r) : '');
  }

  const TOPE = 1000000;   // arriba de esto se deja el numero como vino

  function enPalabras(n, idioma) {
    const x = Number(n);
    if (!isFinite(x) || x < 0 || x >= TOPE || Math.floor(x) !== x) return null;
    return idioma === 'en' ? enIngles(x) : enEspanol(x);
  }

  function normalizar(texto, idioma) {
    let t = (texto || '').toLowerCase();
    t = t.replace(/[‘’ʼ´`]/g, "'");   // apostrofes tipograficos -> '
    // Quita tildes y la enie: "anos"/"anios" no deben fallar por un acento.
    t = t.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (idioma === 'en') { for (const par of CONTRACCIONES) t = t.replace(par[0], par[1]); }
    t = t.replace(/[^a-z0-9\s']/g, ' ');                              // puntuacion fuera
    // 45 -> "cuarenta y cinco" / "forty five"
    t = t.replace(/\d+/g, function (n) { return enPalabras(n, idioma) || n; });
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

  function similitud(dicho, objetivo, idioma) {
    const a = normalizar(dicho, idioma);
    const b = normalizar(objetivo, idioma);
    if (!a.length && !b.length) return 1;
    return 1 - levenshtein(a, b) / Math.max(a.length, b.length, 1);
  }

  // Los mismos cortes que usa srs.js para traducir puntaje a calidad de SM-2:
  // lo que ve el alumno y lo que decide el algoritmo no pueden contradecirse.
  function veredicto(puntaje) {
    if (puntaje >= 0.85) return { cls: 'good', text: '✅ ¡Muy bien!' };
    if (puntaje >= 0.55) return { cls: 'warn', text: '🟡 Cerca, sigue practicando' };
    return { cls: 'bad', text: '🔴 Intentá de nuevo' };
  }

  return {
    normalizar: normalizar,
    similitud: similitud,
    veredicto: veredicto,
    enPalabras: enPalabras
  };
})();
