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

  // Sin tildes a proposito: se aplican DESPUES de quitar los acentos.
  const NUMEROS = {
    en: { 0:'zero', 1:'one', 2:'two', 3:'three', 4:'four', 5:'five', 6:'six', 7:'seven', 8:'eight',
          9:'nine', 10:'ten', 11:'eleven', 12:'twelve', 13:'thirteen', 14:'fourteen', 15:'fifteen',
          16:'sixteen', 17:'seventeen', 18:'eighteen', 19:'nineteen', 20:'twenty', 30:'thirty',
          40:'forty', 50:'fifty', 60:'sixty', 70:'seventy', 80:'eighty', 90:'ninety', 100:'one hundred' },
    es: { 0:'cero', 1:'uno', 2:'dos', 3:'tres', 4:'cuatro', 5:'cinco', 6:'seis', 7:'siete', 8:'ocho',
          9:'nueve', 10:'diez', 11:'once', 12:'doce', 13:'trece', 14:'catorce', 15:'quince',
          16:'dieciseis', 17:'diecisiete', 18:'dieciocho', 19:'diecinueve', 20:'veinte', 30:'treinta',
          40:'cuarenta', 50:'cincuenta', 60:'sesenta', 70:'setenta', 80:'ochenta', 90:'noventa', 100:'cien' }
  };

  function normalizar(texto, idioma) {
    const tabla = NUMEROS[idioma === 'en' ? 'en' : 'es'];
    let t = (texto || '').toLowerCase();
    t = t.replace(/[‘’ʼ´`]/g, "'");   // apostrofes tipograficos -> '
    // Quita tildes y la enie: "anos"/"anios" no deben fallar por un acento.
    t = t.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (idioma === 'en') { for (const par of CONTRACCIONES) t = t.replace(par[0], par[1]); }
    t = t.replace(/[^a-z0-9\s']/g, ' ');                              // puntuacion fuera
    t = t.replace(/\d+/g, function (n) { return tabla[String(Number(n))] || n; });  // 5 -> cinco / five
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
    if (puntaje >= 0.55) return { cls: 'warn', text: '🟡 Cerca, seguí practicando' };
    return { cls: 'bad', text: '🔴 Intentá de nuevo' };
  }

  return {
    normalizar: normalizar,
    similitud: similitud,
    veredicto: veredicto
  };
})();
