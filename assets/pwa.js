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
  let atascado = false;          // la página quedó vieja y recargar no lo arregla

  // Con qué versión se cargó esta página. Sale del propio <script src=...?v=N>,
  // que es la única fuente que no puede mentir: si el HTML es viejo, este número
  // es viejo.
  const MI_VERSION = (function () {
    const yo = document.querySelector('script[src*="pwa.js?v="]');
    const m = yo && yo.getAttribute('src').match(/[?&]v=(\d+)/);
    return m ? m[1] : null;
  })();

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

  /**
   * Último recurso: borrar el service worker y todos sus caches, y recargar.
   *
   * Es para el alumno que quedó clavado en una versión vieja y recargar no se
   * lo arregla. Ahí ya no alcanza con pedir la página de nuevo: hay que sacar
   * del medio al que se la está sirviendo. No pierde nada suyo — el progreso
   * vive en localStorage y las grabaciones en IndexedDB, que no se tocan.
   */
  function recuperar() {
    if (recargando) return;
    recargando = true;
    const listo = function () { location.reload(); };
    const tareas = [];
    try {
      if (navigator.serviceWorker && navigator.serviceWorker.getRegistrations) {
        tareas.push(navigator.serviceWorker.getRegistrations().then(function (regs) {
          return Promise.all(regs.map(function (r) { return r.unregister(); }));
        }));
      }
      if (window.caches && caches.keys) {
        tareas.push(caches.keys().then(function (nombres) {
          return Promise.all(nombres.map(function (n) { return caches.delete(n); }));
        }));
      }
    } catch (err) {}
    Promise.all(tareas).then(listo, listo);
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
    boton.addEventListener('click', atascado ? recuperar : recargar);

    barra.appendChild(txt);
    barra.appendChild(boton);
    document.body.appendChild(barra);
  }

  function evaluar() {
    if (!pendiente || recargando) return;
    if (document.hidden) return;
    if (ocupado()) return;               // se espera: no se le corta nada

    // Atascado significa que la página quedó vieja con el service worker de por
    // medio. Recargar sola ahí puede entrar en bucle: se ofrece y decide el
    // alumno.
    if (atascado) { mostrarBarra(); return; }

    // Recargar sin avisar sólo cuando no se nota: recién cargó y no tocó nada,
    // o acaba de volver a la app. En cualquier otro momento, se pregunta.
    if (!interactuo || volvio) { recargar(); return; }
    mostrarBarra();
  }

  // Sin controller al cargar es la primera visita: se está instalando, no
  // actualizando, y no hay nada viejo en pantalla que reemplazar.
  function vigilar(entrante, habiaControlador) {
    if (!entrante || !habiaControlador) return;
    if (entrante.state === 'installed' || entrante.state === 'activated') {
      hayVersionNueva();
      return;
    }
    entrante.addEventListener('statechange', function () {
      if (entrante.state === 'installed' || entrante.state === 'activated') hayVersionNueva();
    });
  }

  function hayVersionNueva() {
    if (pendiente) return;
    pendiente = true;
    evaluar();
    if (!reloj) reloj = setInterval(evaluar, REVISAR);
  }

  /**
   * Comprueba contra el servidor si esta página quedó vieja.
   *
   * No depende del service worker en absoluto, y ese es el punto: es la red que
   * agarra todos los casos en que el mecanismo del sw falla en silencio. sw.js
   * se revalida siempre y lleva adentro `const VERSION = 'N'`; si ese número no
   * es el que cargó esta página, lo que se está viendo es viejo.
   */
  function comprobarVersion() {
    if (!MI_VERSION || recargando || pendiente) return;
    fetch('sw.js', { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.text() : null; })
      .then(function (texto) {
        if (!texto) return;
        const m = texto.match(/const VERSION = '(\d+)'/);
        if (!m || m[1] === MI_VERSION) return;

        // Esta vía NUNCA recarga sola, y es a propósito. Llegar acá significa
        // que el mecanismo del service worker ya falló: si encima recargáramos
        // solos, y la recarga volviera a traer lo viejo —que es exactamente lo
        // que pasa cuando falla—, el alumno quedaría en un bucle de recargas.
        // Se probó y pasa: cinco recargas seguidas.
        //
        // Así que se muestra el aviso y decide el alumno. Un toque, y el botón
        // hace la limpieza en vez de una recarga más, porque recargar es
        // justamente lo que ya no le funcionó.
        atascado = true;
        hayVersionNueva();
      })
      .catch(function () {});
  }

  if ('serviceWorker' in navigator) {
    // Si al cargar ya había un service worker al mando, cualquier cambio de
    // mando posterior significa que entró una versión nueva. Este evento no se
    // puede perder por llegar tarde, que es justo lo que le pasaba a
    // 'updatefound': register() dispara su propia comprobación, y si la versión
    // nueva se instalaba antes de que la promesa resolviera, el listener se
    // colgaba después y no se enteraba nunca.
    const habiaControlador = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener('controllerchange', function () {
      if (!habiaControlador) return;   // primera instalación: nada viejo en pantalla
      hayVersionNueva();
    });

    window.addEventListener('load', function () {
      comprobarVersion();
      navigator.serviceWorker.register('sw.js').then(function (reg) {
        const buscar = function () { try { reg.update(); } catch (err) {} };

        // Lo que haya pasado antes de llegar hasta acá.
        if (reg.waiting && habiaControlador) hayVersionNueva();
        if (reg.installing) vigilar(reg.installing, habiaControlador);

        document.addEventListener('visibilitychange', function () {
          if (document.hidden) return;
          volvio = true;
          buscar();
          comprobarVersion();
          evaluar();
        });
        setInterval(buscar, CADA);

        reg.addEventListener('updatefound', function () {
          vigilar(reg.installing, habiaControlador);
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
