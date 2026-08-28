/*
  Registra el service worker, mantiene la app en la última versión y, en el
  índice, ofrece el botón de instalar. Lo cargan todas las páginas.

  El problema que resuelve la parte de actualización: el service worker ya hacía
  skipWaiting() y clients.claim(), o sea que la versión nueva tomaba el control
  enseguida — pero la página YA CARGADA sigue con el JS y el CSS viejos en
  memoria hasta que se recarga. El alumno entraba, veía lo de antes y creía que
  no se había actualizado. Pasó de verdad.

  La política es: recargar solo cuando no cuesta nada, y avisar cuando sí.
  Nunca se recarga en medio de una sesión, grabando, ni con algo escrito sin
  enviar: perder eso es peor que quedarse una vuelta más con la versión vieja.
*/
(function () {
  'use strict';

  /* ---------------- Mantenerse al día ---------------- */

  const CADA = 30 * 60 * 1000;   // relee el sw cada media hora si la app queda abierta
  const REVISAR = 10 * 1000;     // con una versión esperando, revisa si ya se puede

  let pendiente = false;         // hay una versión nueva instalada esperando
  let interactuo = false;        // el alumno ya tocó algo en esta carga
  let volvio = false;            // volvió a la app después de tenerla en segundo plano
  let barra = null;
  let reloj = null;
  let recargando = false;

  ['pointerdown', 'keydown'].forEach(function (ev) {
    window.addEventListener(ev, function () { interactuo = true; }, { once: true, passive: true });
  });

  // Estar ocupado no es "tener la app abierta": es tener algo que se perdería.
  function ocupado() {
    if (document.querySelector('.sesion')) return true;          // sesión a pantalla completa
    if (document.querySelector('.recording')) return true;       // grabando audio
    // Escribiendo ahora mismo. No se mira "hay algo tipeado": la lección deja
    // las respuestas en sus 22 campos, así que eso daría ocupado para siempre y
    // la actualización no llegaría nunca. Lo ya respondido está guardado.
    const foco = document.activeElement;
    return !!(foco && (foco.tagName === 'INPUT' || foco.tagName === 'TEXTAREA'));
  }

  function recargar() {
    if (recargando) return;
    recargando = true;
    location.reload();
  }

  function mostrarBarra() {
    if (barra) return;
    barra = document.createElement('div');
    barra.className = 'aviso-version';
    barra.setAttribute('role', 'status');

    const txt = document.createElement('span');
    txt.textContent = '✨ Hay una versión nueva';
    const boton = document.createElement('button');
    boton.type = 'button';
    boton.className = 'btn-listen';
    boton.textContent = 'Actualizar';
    boton.addEventListener('click', recargar);

    barra.appendChild(txt);
    barra.appendChild(boton);
    document.body.appendChild(barra);
  }

  function evaluar() {
    if (!pendiente || recargando) return;
    if (document.hidden) return;
    if (ocupado()) return;               // se espera: no se le corta nada

    // Recargar sin avisar sólo cuando no se nota: recién cargó y no tocó nada,
    // o acaba de volver a la app. En cualquier otro momento, se pregunta.
    if (!interactuo || volvio) { recargar(); return; }
    mostrarBarra();
  }

  function hayVersionNueva() {
    if (pendiente) return;
    pendiente = true;
    evaluar();
    if (!reloj) reloj = setInterval(evaluar, REVISAR);
  }

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').then(function (reg) {
        const buscar = function () { try { reg.update(); } catch (err) {} };

        document.addEventListener('visibilitychange', function () {
          if (document.hidden) return;
          volvio = true;
          buscar();
          evaluar();
        });
        setInterval(buscar, CADA);

        reg.addEventListener('updatefound', function () {
          const entrante = reg.installing;
          if (!entrante) return;
          entrante.addEventListener('statechange', function () {
            // Sin controller es la primera visita: se está instalando, no
            // actualizando, y no hay nada viejo en pantalla que reemplazar.
            if (entrante.state === 'installed' && navigator.serviceWorker.controller) {
              hayVersionNueva();
            }
          });
        });
      }).catch(function (err) {
        console.warn('[pwa] No se pudo registrar el service worker:', err.message);
      });
    });
  }

  /* ---------------- Botón de instalar ---------------- */

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
