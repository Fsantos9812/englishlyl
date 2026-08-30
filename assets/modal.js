/*
  Modal de confirmación propio, en vez de window.confirm() del sistema.

  Los confirm() nativos rompen la estética de la app, pueden salir en inglés
  según el navegador, y no se pueden estilizar. Este es un alertdialog simple
  que respeta los tokens de color, el modo oscuro y prefers-reduced-motion.

  Uso:
    window.Modal.confirmar('¿Borrar?', { titulo: 'Cuidado', peligro: true,
                                          aceptar: 'Borrar', cancelar: 'Cancelar' })
      .then(function (si) { if (si) { ... } });
*/
window.Modal = (function () {
  'use strict';

  let activo = null;

  function el(tag, cls, texto) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (texto != null) n.textContent = texto;
    return n;
  }

  function confirmar(mensaje, opts) {
    opts = opts || {};
    return new Promise(function (resolve) {
      if (activo) { resolve(false); return; }

      const overlay = el('div', 'modal-overlay');
      overlay.setAttribute('role', 'presentation');

      const modal = el('div', 'modal');
      modal.setAttribute('role', 'alertdialog');
      modal.setAttribute('aria-modal', 'true');
      modal.setAttribute('aria-labelledby', 'modal-titulo');

      const titulo = el('p', 'modal-titulo', opts.titulo || 'Confirmar');
      titulo.id = 'modal-titulo';
      const texto = el('p', 'modal-texto', mensaje);

      const acciones = el('div', 'modal-acciones');
      const cancelar = el('button', 'btn-record', opts.cancelar || 'Cancelar');
      cancelar.type = 'button';
      const aceptar = el('button', opts.peligro ? 'btn-peligro' : 'btn-listen', opts.aceptar || 'Aceptar');
      aceptar.type = 'button';
      acciones.appendChild(cancelar);
      acciones.appendChild(aceptar);

      modal.appendChild(titulo);
      modal.appendChild(texto);
      modal.appendChild(acciones);
      overlay.appendChild(modal);
      document.body.appendChild(overlay);

      let tecladoHandler, focoOriginal;

      function cerrar(valor) {
        if (!activo || activo.overlay !== overlay) return;
        activo = null;
        document.removeEventListener('keydown', tecladoHandler);
        if (focoOriginal && focoOriginal.focus) focoOriginal.focus();
        overlay.remove();
        resolve(valor);
      }

      function trapFocus(e) {
        if (e.key !== 'Tab') return;
        const focables = [cancelar, aceptar];
        const actual = document.activeElement;
        const idx = focables.indexOf(actual);
        if (e.shiftKey) {
          if (idx <= 0) { e.preventDefault(); focables[focables.length - 1].focus(); }
        } else {
          if (idx < 0 || idx === focables.length - 1) { e.preventDefault(); focables[0].focus(); }
        }
      }

      tecladoHandler = function (e) {
        if (e.key === 'Escape') { e.preventDefault(); cerrar(false); }
        else if (e.key === 'Enter') { e.preventDefault(); cerrar(true); }
        else trapFocus(e);
      };

      cancelar.addEventListener('click', function () { cerrar(false); });
      aceptar.addEventListener('click', function () { cerrar(true); });
      overlay.addEventListener('click', function (e) { if (e.target === overlay) cerrar(false); });

      focoOriginal = document.activeElement;
      activo = { overlay: overlay };
      document.addEventListener('keydown', tecladoHandler);
      // Por defecto el foco va al botón seguro (cancelar); para acciones
      // destructivas eso evita borrar algo con un Enter descuidado.
      cancelar.focus();
    });
  }

  return { confirmar: confirmar };
})();
