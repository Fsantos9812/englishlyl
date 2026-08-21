/*
  Indice de lecciones: arma la lista desde lessons.json y le suma el progreso
  que cada leccion dejo guardado en localStorage.
*/
(function () {
  'use strict';

  const listEl = document.getElementById('lesson-list');
  const resumenEl = document.getElementById('resumen');
  const PREFIJO = 'lecciones:progreso:';   // igual que en assets/lesson.js

  function progresoDe(leccion) {
    const e = leccion.ejercicios || {};
    const total = (e.repeat || 0) + (e.type || 0);
    let hechos = 0;
    let suma = 0;
    try {
      const crudo = localStorage.getItem(PREFIJO + leccion.id);
      const guardado = crudo ? JSON.parse(crudo) : null;
      if (guardado && typeof guardado === 'object') {
        for (const clave of Object.keys(guardado)) {
          const valor = guardado[clave];
          if (typeof valor === 'number' && isFinite(valor)) { hechos++; suma += valor; }
        }
      }
    } catch (err) { /* localStorage bloqueado o dato corrupto: cuenta como sin empezar */ }

    return {
      total: total,
      hechos: Math.min(hechos, total),
      pct: hechos ? Math.round((suma / hechos) * 100) : null
    };
  }

  function el(tag, cls, text) {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  }

  function filaDe(leccion) {
    const p = progresoDe(leccion);
    const li = document.createElement('li');
    const a = document.createElement('a');
    a.href = leccion.archivo;

    const fila = el('div', 'lesson-row');
    const izq = el('span');
    izq.appendChild(el('span', 'lesson-title', leccion.titulo));
    if (leccion.nivel) izq.appendChild(el('span', 'level', leccion.nivel));

    let meta;
    if (!p.total) meta = 'sin ejercicios con puntaje';
    else if (!p.hechos) meta = 'sin empezar';
    else meta = p.hechos + ' / ' + p.total + ' · ' + p.pct + '%';

    fila.appendChild(izq);
    fila.appendChild(el('span', 'lesson-meta', meta));
    a.appendChild(fila);

    if (p.total) {
      const completa = p.hechos === p.total;
      const barra = el('div', 'bar' + (completa ? ' done' : ''));
      const relleno = el('span');
      relleno.style.width = Math.round((p.hechos / p.total) * 100) + '%';
      barra.appendChild(relleno);
      a.appendChild(barra);
      a.setAttribute('aria-label', leccion.titulo + ' — ' + meta);
    }

    li.appendChild(a);
    return li;
  }

  function pintarRacha() {
    const caja = document.getElementById('racha-card');
    if (!caja || !window.Racha) return;
    const r = window.Racha.leer();

    const numero = document.getElementById('racha-numero');
    const texto = document.getElementById('racha-texto');
    const semana = document.getElementById('racha-semana');

    numero.textContent = '🔥 ' + r.actual;
    numero.style.opacity = r.actual ? '1' : '.45';

    if (!r.actual && r.vencida) texto.textContent = 'Se te cortó la racha. Hacé un ejercicio hoy y arrancá de nuevo.';
    else if (!r.actual) texto.textContent = 'Practicá hoy para empezar tu racha.';
    else if (r.enRiesgo) texto.textContent = 'Practicá hoy para no perderla.';
    else texto.textContent = r.actual === 1 ? '¡Arrancaste! Volvé mañana para seguirla.' : 'días seguidos. ¡Seguí así!';

    if (r.mejor > 1) {
      texto.textContent += ' · Tu récord: ' + r.mejor + ' días';
    }

    semana.textContent = '';
    window.Racha.ultimosDias(7).forEach(function (d) {
      const celda = el('span', 'dia' + (d.practico ? ' hecho' : '') + (d.esHoy ? ' hoy' : ''), d.inicial);
      const punto = document.createElement('b');
      punto.textContent = d.practico ? '✓' : '';
      punto.setAttribute('aria-hidden', 'true');
      celda.appendChild(punto);
      celda.title = d.fecha + (d.practico ? ' — practicaste' : ' — sin práctica');
      semana.appendChild(celda);
    });
  }

  function render(lecciones) {
    pintarRacha();
    listEl.textContent = '';
    lecciones.forEach(function (l) { listEl.appendChild(filaDe(l)); });

    const empezadas = lecciones.filter(function (l) { return progresoDe(l).hechos > 0; });
    if (!empezadas.length) {
      resumenEl.textContent = lecciones.length + ' lecciones · todavía no empezaste ninguna';
      return;
    }
    const promedio = Math.round(
      empezadas.reduce(function (s, l) { return s + progresoDe(l).pct; }, 0) / empezadas.length
    );
    resumenEl.textContent = 'Empezaste ' + empezadas.length + ' de ' + lecciones.length
      + ' lecciones · promedio ' + promedio + '%';
  }

  /* ---------- Sesión del alumno y estado del envío ---------- */
  (function sesionYEnvio() {
    const cajaLogin = document.getElementById('caja-login');
    const cajaSesion = document.getElementById('caja-sesion');
    const cajaCambio = document.getElementById('caja-cambio');
    const estadoEl = document.getElementById('sync-estado');
    const loginEstado = document.getElementById('login-estado');
    if (!cajaLogin || !window.Auth) return;

    const campoUsuario = document.getElementById('usuario');
    const campoClave = document.getElementById('clave');
    const botonEntrar = document.getElementById('entrar');
    const botonSalir = document.getElementById('salir');

    function hace(iso) {
      const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
      if (!isFinite(min)) return '';
      if (min < 1) return 'recién';
      if (min < 60) return 'hace ' + min + ' min';
      const h = Math.round(min / 60);
      if (h < 24) return 'hace ' + h + (h === 1 ? ' hora' : ' horas');
      return new Date(iso).toLocaleDateString('es-AR');
    }

    function pintarEnvio() {
      if (!estadoEl || !window.Sync) return;
      const s = window.Sync.estado();
      if (!window.Auth.activa()) return;
      if (s.pendientes) {
        estadoEl.className = 'status';
        estadoEl.textContent = '⏳ Enviando ' + s.pendientes + ' grabación'
          + (s.pendientes === 1 ? '' : 'es') + '…';
      } else if (s.error) {
        estadoEl.className = 'status warn';
        estadoEl.textContent = '⚠️ No se pudo enviar (' + s.error + '). Se reintenta solo.';
      } else if (s.ultimo) {
        estadoEl.className = 'status good';
        estadoEl.textContent = '✅ Tu profe ya lo recibió — ' + hace(s.ultimo);
      } else {
        estadoEl.className = 'status';
        estadoEl.textContent = 'Listo para enviar.';
      }
    }

    function pintarSesion(sesion) {
      const dentro = !!sesion;
      cajaLogin.hidden = dentro;
      cajaSesion.hidden = !dentro;
      if (!dentro) return;
      document.getElementById('sesion-nombre').textContent = sesion.nombre || sesion.usuario;
      if (cajaCambio) cajaCambio.hidden = !sesion.debeCambiar;
      pintarEnvio();
      pintarRacha();          // el servidor pudo devolver días de otro dispositivo
    }

    async function entrar() {
      const u = campoUsuario.value.trim();
      const c = campoClave.value;
      if (!u || !c) {
        loginEstado.className = 'status warn';
        loginEstado.textContent = 'Completá usuario y contraseña.';
        return;
      }
      botonEntrar.disabled = true;
      loginEstado.className = 'status';
      loginEstado.textContent = 'Entrando…';
      try {
        await window.Auth.entrar(u, c);
        campoClave.value = '';
        loginEstado.textContent = '';
      } catch (err) {
        loginEstado.className = 'status bad';
        loginEstado.textContent = err.message || 'No se pudo entrar.';
      } finally {
        botonEntrar.disabled = false;
      }
    }

    botonEntrar.addEventListener('click', entrar);
    [campoUsuario, campoClave].forEach(function (el2) {
      el2.addEventListener('keydown', function (e) { if (e.key === 'Enter') entrar(); });
    });
    botonSalir.addEventListener('click', function () {
      if (window.confirm('¿Cerrar sesión en este dispositivo? Tu progreso local no se borra.')) {
        window.Auth.salir();
      }
    });

    const botonCambiar = document.getElementById('cambiar');
    if (botonCambiar) {
      botonCambiar.addEventListener('click', async function () {
        const nueva = document.getElementById('clave-nueva').value;
        const salida = document.getElementById('cambio-estado');
        botonCambiar.disabled = true;
        try {
          await window.Auth.cambiarClave(document.getElementById('clave-actual').value, nueva);
          salida.className = 'status good';
          salida.textContent = '✅ Listo, ya es tuya.';
          if (cajaCambio) cajaCambio.hidden = true;
        } catch (err) {
          salida.className = 'status bad';
          salida.textContent = err.message || 'No se pudo cambiar.';
        } finally {
          botonCambiar.disabled = false;
        }
      });
    }

    window.Auth.alCambiar(pintarSesion);
    if (window.Sync) window.Sync.alCambiar(function () { pintarEnvio(); pintarRacha(); });
  })();

  fetch('lessons.json', { cache: 'no-cache' })
    .then(function (r) { return r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status)); })
    .then(function (m) {
      if (!m || !Array.isArray(m.lecciones) || !m.lecciones.length) throw new Error('manifiesto vacío');
      render(m.lecciones);
    })
    .catch(function (err) {
      console.error('[indice] No se pudo leer lessons.json:', err);
      resumenEl.textContent = '';
      listEl.textContent = '';
      listEl.appendChild(el('li', 'empty',
        'No se pudo cargar la lista de lecciones. Recargá la página; si sigue igual, falta el archivo lessons.json.'));
    });

  // El progreso pudo cambiar en otra pestaña, o al volver con el boton "atras".
  window.addEventListener('pageshow', function (ev) { if (ev.persisted) location.reload(); });
})();
