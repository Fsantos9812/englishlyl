/*
  Registra el service worker y, en el índice, ofrece el botón de instalar.
  Lo cargan todas las páginas.
*/
(function () {
  'use strict';

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function (err) {
        console.warn('[pwa] No se pudo registrar el service worker:', err.message);
      });
    });
  }

  // El botón sólo existe en el índice; en las lecciones no hay nada que hacer.
  const boton = document.getElementById('instalar');
  if (!boton) return;

  let prompt = null;

  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();          // el navegador no muestra su barra: la mostramos nosotros
    prompt = e;
    boton.hidden = false;
  });

  boton.addEventListener('click', async function () {
    if (!prompt) return;
    boton.disabled = true;
    prompt.prompt();
    try { await prompt.userChoice; } catch (err) { /* el usuario cerró el diálogo */ }
    prompt = null;
    boton.hidden = true;
    boton.disabled = false;
  });

  window.addEventListener('appinstalled', function () {
    prompt = null;
    boton.hidden = true;
  });
})();
