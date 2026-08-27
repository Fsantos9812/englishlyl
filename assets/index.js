/*
  Indice de lecciones: arma la lista desde lessons.json y le suma el progreso
  que cada leccion dejo guardado en localStorage.
*/
(function () {
  'use strict';

  const listEl = document.getElementById('lesson-list');
  const resumenEl = document.getElementById('resumen');
  const PREFIJO = 'lecciones:progreso:';   // igual que en assets/lesson.js
  const UMBRAL_BIEN = 85;                  // el mismo del "¡Muy bien!" de lesson.js

  // Las traducciones grabadas viven en IndexedDB, no en localStorage: sin leer
  // esto el indice no las ve y el trabajo del alumno no cuenta en ningun lado.
  // Devuelve { idDeLeccion: { indiceDeFrase: true } }; ante cualquier problema,
  // vacio, que el indice tiene que andar igual.
  function leerGrabadas() {
    return new Promise(function (resolve) {
      if (!('indexedDB' in window)) { resolve({}); return; }
      let req;
      try { req = indexedDB.open('lecciones_audio', 1); }
      catch (err) { resolve({}); return; }
      req.onupgradeneeded = function (e) {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('grabaciones')) {
          const store = db.createObjectStore('grabaciones', { keyPath: 'id', autoIncrement: true });
          store.createIndex('lessonId', 'lessonId', { unique: false });
        }
      };
      req.onerror = function () { resolve({}); };
      req.onsuccess = function (e) {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('grabaciones')) { resolve({}); return; }
        let pedido;
        try { pedido = db.transaction('grabaciones', 'readonly').objectStore('grabaciones').getAll(); }
        catch (err) { resolve({}); return; }
        pedido.onerror = function () { resolve({}); };
        pedido.onsuccess = function () {
          const porLeccion = {};
          (pedido.result || []).forEach(function (g) {
            if (!g || !g.lessonId) return;
            const i = Number(g.phraseIdx);
            if (!Number.isInteger(i) || i < 0) return;
            if (!porLeccion[g.lessonId]) porLeccion[g.lessonId] = {};
            porLeccion[g.lessonId][i] = true;
          });
          resolve(porLeccion);
        };
      };
    });
  }

  function progresoDe(leccion, grabadas) {
    const e = leccion.ejercicios || {};
    const conPuntaje = (e.repeat || 0) + (e.type || 0);
    const sinPuntaje = e.translate || 0;
    let puntuados = 0;
    let suma = 0;
    try {
      const crudo = localStorage.getItem(PREFIJO + leccion.id);
      const guardado = crudo ? JSON.parse(crudo) : null;
      if (guardado && typeof guardado === 'object') {
        for (const clave of Object.keys(guardado)) {
          const valor = guardado[clave];
          if (typeof valor === 'number' && isFinite(valor)) { puntuados++; suma += valor; }
        }
      }
    } catch (err) { /* localStorage bloqueado o dato corrupto: cuenta como sin empezar */ }

    // Grabar una traduccion es trabajo hecho aunque no tenga puntaje.
    const deEstaLeccion = (grabadas || {})[leccion.id] || {};
    const grabadasAca = Math.min(Object.keys(deEstaLeccion).length, sinPuntaje);

    return {
      total: conPuntaje + sinPuntaje,
      hechos: Math.min(puntuados, conPuntaje) + grabadasAca,
      // El promedio sale solo de lo que tiene puntaje; lo grabado no promedia.
      pct: puntuados ? Math.round((suma / puntuados) * 100) : null
    };
  }

  function el(tag, cls, text) {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  }

  function filaDe(leccion, grabadas) {
    const p = progresoDe(leccion, grabadas);
    const li = document.createElement('li');
    const a = document.createElement('a');
    a.href = leccion.archivo;

    const fila = el('div', 'lesson-row');
    const izq = el('span');
    izq.appendChild(el('span', 'lesson-title', leccion.titulo));
    if (leccion.nivel) izq.appendChild(el('span', 'level', leccion.nivel));

    let meta;
    if (!p.total) meta = 'sin ejercicios';
    else if (!p.hechos) meta = 'sin empezar';
    else meta = p.hechos + ' / ' + p.total + (p.pct === null ? '' : ' · ' + p.pct + '%');

    fila.appendChild(izq);
    fila.appendChild(el('span', 'lesson-meta', meta));
    a.appendChild(fila);

    if (p.total) {
      const terminada = p.hechos === p.total;
      // Verde = terminada Y bien hecha. Antes se ponia verde con 30% de promedio,
      // que le decia al alumno que estaba aprendido cuando no lo estaba.
      const bien = terminada && (p.pct === null || p.pct >= UMBRAL_BIEN);
      const barra = el('div', 'bar' + (bien ? ' done' : terminada ? ' repasar' : ''));
      const relleno = el('span');
      relleno.style.width = Math.round((p.hechos / p.total) * 100) + '%';
      barra.appendChild(relleno);
      a.appendChild(barra);
      // El color no puede ser el unico canal: el estado va tambien en el nombre.
      a.setAttribute('aria-label', leccion.titulo + ' — ' + meta
        + (terminada ? (bien ? ' · completa' : ' · terminada, conviene repasar') : ''));
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

  function render(lecciones, grabadas) {
    pintarRacha();
    listEl.textContent = '';
    lecciones.forEach(function (l) { listEl.appendChild(filaDe(l, grabadas)); });

    const empezadas = lecciones.filter(function (l) { return progresoDe(l, grabadas).hechos > 0; });
    if (!empezadas.length) {
      resumenEl.textContent = lecciones.length
        + (lecciones.length === 1 ? ' lección · todavía no la empezaste'
                                  : ' lecciones · todavía no empezaste ninguna');
      return;
    }
    let texto = 'Empezaste ' + empezadas.length + ' de ' + lecciones.length
      + (lecciones.length === 1 ? ' lección' : ' lecciones');
    // Una leccion de puras grabaciones no tiene promedio: no puede dar NaN.
    const conNota = empezadas.filter(function (l) { return progresoDe(l, grabadas).pct !== null; });
    if (conNota.length) {
      const promedio = Math.round(
        conNota.reduce(function (s, l) { return s + progresoDe(l, grabadas).pct; }, 0) / conNota.length
      );
      texto += ' · promedio ' + promedio + '%';
    }
    resumenEl.textContent = texto;
  }

  /* ---------- Sesión del alumno y estado del envío ---------- */
  (function sesionYEnvio() {
    const cajaLogin = document.getElementById('caja-login');
    const cajaSesion = document.getElementById('caja-sesion');
    const cajaCambio = document.getElementById('caja-cambio');
    const estadoEl = document.getElementById('sync-estado');
    const loginEstado = document.getElementById('login-estado');
    if (!cajaLogin || !window.Auth) return;

    const pie = document.getElementById('pie');
    const campoUsuario = document.getElementById('usuario');
    const campoClave = document.getElementById('clave');

    // El pie decia siempre "queda en este dispositivo", incluso con la sesion
    // abierta y sincronizando. Ahora dice lo que de verdad esta pasando.
    function pintarPie(dentro) {
      if (!pie) return;
      pie.textContent = dentro
        ? 'Tu progreso se guarda en este dispositivo y se le envía a tu profe.'
        : 'Tu progreso se guarda en este dispositivo, en este navegador.';
    }
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
      // Las fallidas van PRIMERO, y el error antes que "enviando". Estaba al
      // reves: un envio abortado dejaba pendientes > 0 y el alumno veia
      // "⏳ Enviando…" para siempre, sin enterarse nunca de que algo fallo.
      if (s.fallidas) {
        estadoEl.className = 'status bad';
        estadoEl.textContent = (s.fallidas === 1
          ? '⚠️ Una grabación no pudo enviarse'
          : '⚠️ ' + s.fallidas + ' grabaciones no pudieron enviarse')
          + '. Bajá el .zip de acá abajo y mandáselo a tu profe.';
      } else if (s.error) {
        estadoEl.className = 'status warn';
        estadoEl.textContent = '⚠️ No se pudo enviar'
          + (s.pendientes ? ' (' + s.pendientes + ' en espera)' : '')
          + ': ' + s.error + '. Se reintenta solo.';
      } else if (s.pendientes) {
        estadoEl.className = 'status';
        estadoEl.textContent = '⏳ Enviando ' + s.pendientes + ' grabación'
          + (s.pendientes === 1 ? '' : 'es') + '…';
      } else if (s.ultimo) {
        estadoEl.className = 'status good';
        estadoEl.textContent = '✅ Tu profe ya lo recibió — ' + hace(s.ultimo);
      } else {
        estadoEl.className = 'status';
        estadoEl.textContent = 'Listo para enviar.';
      }
    }

    function pintarSesion(sesion) {
      // Una sesión de profe no habilita el índice: acá se entra como alumno.
      // Puede quedar una de antes, de cuando ambos compartían el mismo guardado.
      const esProfe = !!sesion && sesion.rol && sesion.rol !== 'alumno';
      const dentro = !!sesion && !esProfe;

      cajaLogin.hidden = dentro;
      cajaSesion.hidden = !dentro;
      pintarPie(dentro);

      if (esProfe) {
        // El aviso vive adentro de la caja: plegada no se veria nunca.
        cajaLogin.open = true;
        loginEstado.className = 'status warn';
        loginEstado.textContent = 'Estás con la sesión de profe abierta. Cerrala para entrar como alumno.';
        if (!document.getElementById('salir-profe')) {
          const b = document.createElement('button');
          b.id = 'salir-profe';
          b.type = 'button';
          b.className = 'btn-reset';
          b.textContent = 'Cerrar la sesión de profe';
          b.addEventListener('click', function () { window.Auth.salir(); });
          loginEstado.parentNode.appendChild(b);
        }
        return;
      }

      const sobrante = document.getElementById('salir-profe');
      if (sobrante) sobrante.remove();
      if (loginEstado.className === 'status warn') {
        loginEstado.className = 'status';
        loginEstado.textContent = '';
      }

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

  Promise.all([
    fetch('lessons.json', { cache: 'no-cache' })
      .then(function (r) { return r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status)); }),
    leerGrabadas()
  ])
    .then(function (par) {
      const m = par[0];
      if (!m || !Array.isArray(m.lecciones) || !m.lecciones.length) throw new Error('manifiesto vacío');
      render(m.lecciones, par[1]);
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
