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
            // Los intentos flojos de Repeat se guardan como grabaciones, pero
            // NO son "Translate hecho": no tienen que sumar al progreso de la
            // lección ni al conteo del índice.
            if (g.origen === 'repeat') return;
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

    // El día suma con las dos mitades hechas, así que cuando falta una hay que
    // decir cuál: si no, el alumno practica, no ve el fuego y no entiende por qué.
    if (r.faltaHoy && r.actual) texto.textContent = 'Te falta ' + r.faltaHoy + ' para sumar hoy.';
    else if (r.faltaHoy && r.vencida) texto.textContent = 'Se te cortó la racha. Te falta ' + r.faltaHoy + ' para arrancar de nuevo.';
    else if (r.faltaHoy) texto.textContent = 'Te falta ' + r.faltaHoy + ' para empezar tu racha.';
    else texto.textContent = r.actual === 1 ? '¡Arrancaste! Vuelve mañana para seguirla.' : 'días seguidos. ¡Sigue así!';

    if (r.mejor > 1) {
      texto.textContent += ' · Tu récord: ' + r.mejor + ' días';
    }

    const leyenda = document.getElementById('racha-leyenda');
    if (leyenda) leyenda.textContent = '✓ = practicaste · gris = sin práctica';

    semana.textContent = '';
    window.Racha.ultimosDias(7).forEach(function (d) {
      const celda = el('span', 'dia' + (d.practico ? ' hecho' : '') + (d.esHoy ? ' hoy' : ''), d.inicial);
      const punto = document.createElement('b');
      punto.textContent = d.practico ? '✓' : '';
      punto.setAttribute('aria-hidden', 'true');
      celda.appendChild(punto);
      const estado = d.fecha + (d.practico ? ' — practicaste' : ' — sin práctica');
      celda.title = estado;
      celda.setAttribute('aria-label', estado);
      semana.appendChild(celda);
    });
  }

  // Cuenta SOLO las tarjetas de vocabulario: las de los ejercicios de la
  // leccion tambien viven en el SRS, y meterlas aca inflaria el numero.
  function pintarRepaso() {
    const caja = document.getElementById('repaso-card');
    if (!caja || !window.SRS) return;
    const r = window.SRS.resumen('vocab');
    const numero = document.getElementById('repaso-numero');
    const texto = document.getElementById('repaso-texto');
    const enlace = document.getElementById('repaso-enlace');

    numero.textContent = '🧠 ' + r.vencenHoy;
    numero.style.opacity = r.vencenHoy ? '1' : '.45';

    const enEstudio = r.tarjetas + (r.tarjetas === 1 ? ' palabra en estudio' : ' palabras en estudio')
      + (r.maduras ? ', ' + r.maduras + (r.maduras === 1 ? ' ya firme' : ' ya firmes') : '');

    if (!r.tarjetas) {
      texto.textContent = 'Cada palabra que repases vuelve justo cuando estás por olvidarla.';
      enlace.textContent = 'Empezar';
    } else if (r.vencenHoy) {
      texto.textContent = (r.vencenHoy === 1 ? 'palabra para repasar hoy' : 'palabras para repasar hoy')
        + ' · ' + enEstudio;
      enlace.textContent = 'Repasar';
    } else {
      texto.textContent = 'Nada para hoy. ' + enEstudio.charAt(0).toUpperCase() + enEstudio.slice(1)
        + '. Vuelve mañana.';
      enlace.textContent = 'Ver';
    }
  }

  // El XP mide esfuerzo del dia, asi que vive con la racha y no con los puntajes.
  function pintarXp() {
    const caja = document.getElementById('racha-xp');
    const barra = document.getElementById('xp-bar');
    const relleno = document.getElementById('xp-relleno');
    if (!caja || !window.XP) return;
    const r = window.XP.resumen();
    if (!r.total) {
      caja.textContent = 'Practica para empezar a sumar XP.';
      if (barra) barra.hidden = true;
      return;
    }
    caja.textContent = r.metaCumplida
      ? '⚡ ' + r.hoy + ' XP hoy · meta cumplida · ' + r.total + ' en total'
      : '⚡ ' + r.hoy + ' XP hoy · te faltan ' + r.faltaParaLaMeta
        + ' para la meta · ' + r.total + ' en total';
    if (barra && relleno) {
      barra.hidden = false;
      relleno.style.width = Math.min(100, Math.round(r.hoy / r.meta * 100)) + '%';
      barra.setAttribute('aria-label', 'Progreso hacia la meta diaria: ' + r.hoy + ' de ' + r.meta + ' XP');
    }
  }

  function fechaLocal(fechaISO) {
    const p = String(fechaISO).split('-');
    return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
  }

  function pintarHistorial() {
    const cajaResumen = document.getElementById('historial-resumen');
    const cajaDias = document.getElementById('historial-dias');
    if (!cajaResumen || !cajaDias || !window.Racha || !window.XP) return;

    const r = window.Racha.leer();
    const xpPorDia = window.XP.paraEnviar().dias || {};
    const dias = window.Racha.ultimosDias(14);

    cajaResumen.textContent = '';
    const stats = el('div', 'historial-stats');
    stats.appendChild(el('div', null, '🔥 ' + r.actual + (r.actual === 1 ? ' día' : ' días') + ' seguidos'));
    stats.appendChild(el('div', null, '🏆 Récord: ' + r.mejor + (r.mejor === 1 ? ' día' : ' días')));
    stats.appendChild(el('div', null, '⚡ ' + window.XP.total() + ' XP en total'));
    stats.appendChild(el('div', null, '📅 ' + r.dias.length + (r.dias.length === 1 ? ' día practicado' : ' días practicados')));
    cajaResumen.appendChild(stats);

    cajaDias.textContent = '';
    if (!dias.length) {
      cajaDias.appendChild(el('p', 'hint', 'Todavía no hay días para mostrar.'));
      return;
    }

    const tabla = el('table', 'historial-tabla');
    tabla.appendChild(el('caption', null, 'Últimos 14 días'));
    const thead = el('thead');
    const cabecera = el('tr');
    cabecera.appendChild(el('th', null, 'Día'));
    cabecera.appendChild(el('th', null, 'Practicaste'));
    cabecera.appendChild(el('th', null, 'XP'));
    thead.appendChild(cabecera);
    tabla.appendChild(thead);

    const tbody = el('tbody');
    dias.slice().reverse().forEach(function (d) {
      const xp = Number(xpPorDia[d.fecha]) || 0;
      const fila = el('tr');
      fila.appendChild(el('td', null, fechaLocal(d.fecha).toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric', month: 'short' })));
      fila.appendChild(el('td', null, d.practico ? '✓ Sí' : '—'));
      fila.appendChild(el('td', null, xp ? xp + ' XP' : '—'));
      tbody.appendChild(fila);
    });
    tabla.appendChild(tbody);
    cajaDias.appendChild(tabla);
  }

  function render(lecciones, grabadas) {
    pintarRacha();
    pintarXp();
    pintarHistorial();
    pintarRepaso();
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
          + '. Baja el .zip de acá abajo y mándaselo a tu profe.';
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
        loginEstado.textContent = 'Estás con la sesión de profe abierta. Ciérrala para entrar como alumno.';
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
        loginEstado.textContent = 'Completa usuario y contraseña.';
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
      if (!window.Modal) { window.Auth.salir(); return; }
      window.Modal.confirmar(
        '¿Cerrar sesión en este dispositivo? Tu progreso local no se borra.',
        { titulo: 'Cerrar sesión', aceptar: 'Salir', cancelar: 'Cancelar' }
      ).then(function (si) { if (si) window.Auth.salir(); });
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
    if (window.Sync) window.Sync.alCambiar(function () {
      pintarEnvio();
      pintarRacha();
      pintarXp();
      pintarHistorial();
      pintarRepaso();   // el servidor pudo traer repasos hechos en otro dispositivo
    });
  })();

  // Si hoy no hay nada para repasar, esa mitad del día se da por cumplida sin
  // que el alumno tenga que entrar al repaso a comprobar que estaba vacío.
  function marcarRepasoSiNoHayNada(palabras) {
    if (!window.Racha || !window.SRS) return;
    if (window.SRS.colaDeRepaso(palabras, 10).length) return;
    window.Racha.registrar('repaso');
  }

  Promise.all([
    fetch('lessons.json', { cache: 'no-cache' })
      .then(function (r) { return r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status)); }),
    leerGrabadas(),
    fetch('vocabulario.json', { cache: 'no-cache' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .catch(function () { return null; })
  ])
    .then(function (par) {
      const m = par[0];
      if (!m || !Array.isArray(m.lecciones) || !m.lecciones.length) throw new Error('manifiesto vacío');
      marcarRepasoSiNoHayNada((par[2] && par[2].palabras) || []);
      render(m.lecciones, par[1]);
    })
    .catch(function (err) {
      console.error('[indice] No se pudo leer lessons.json:', err);
      resumenEl.textContent = '';
      listEl.textContent = '';
      listEl.appendChild(el('li', 'empty',
        'No se pudo cargar la lista de lecciones. Recarga la página; si sigue igual, falta el archivo lessons.json.'));
    });

  // El progreso pudo cambiar en otra pestaña, o al volver con el boton "atras".
  window.addEventListener('pageshow', function (ev) { if (ev.persisted) location.reload(); });
})();
