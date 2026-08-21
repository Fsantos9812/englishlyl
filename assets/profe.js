/*
  Panel del profe. Es una página estática común: toda la autoridad la tiene
  el servidor, que exige un token con rol "profe" en cada llamada.

  Reusa assets/auth.js para el login, así hay un solo lugar donde vive la sesión.
*/
(function () {
  'use strict';

  const ADMIN = window.ADMIN_ENDPOINT || '/.netlify/functions/admin';

  const cajaLogin = document.getElementById('caja-login');
  const cajaPanel = document.getElementById('caja-panel');
  const lista = document.getElementById('lista');
  const resumen = document.getElementById('resumen');
  const loginEstado = document.getElementById('login-estado');
  const botonSalir = document.getElementById('salir');

  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function fecha(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    return isNaN(d) ? '—' : d.toLocaleString('es-AR');
  }

  /* ---------------- Llamadas al servidor ---------------- */

  async function pedir(opciones) {
    const cabeceras = { 'Authorization': 'Bearer ' + window.Auth.token() };
    if (opciones && opciones.cuerpo) cabeceras['Content-Type'] = 'application/json';

    const r = await fetch(ADMIN + ((opciones && opciones.query) || ''), {
      method: (opciones && opciones.cuerpo) ? 'POST' : 'GET',
      headers: cabeceras,
      body: (opciones && opciones.cuerpo) ? JSON.stringify(opciones.cuerpo) : undefined
    });

    let datos = {};
    try { datos = await r.json(); } catch (err) {}
    if (!r.ok) {
      if (r.status === 401) window.Auth.vencida();
      const e = new Error(datos.error || ('HTTP ' + r.status));
      e.status = r.status;
      throw e;
    }
    return datos;
  }

  /* ---------------- Pintado ---------------- */

  function tablaDeLecciones(lecciones) {
    const claves = Object.keys(lecciones || {}).sort();
    if (!claves.length) return el('p', 'hint', 'Sin ejercicios todavía.');

    const t = el('table', 'notas');
    const cab = document.createElement('tr');
    ['Lección', 'Hechos', 'Promedio'].forEach(function (x) { cab.appendChild(el('th', null, x)); });
    t.appendChild(cab);

    claves.forEach(function (k) {
      const l = lecciones[k] || {};
      const puntajes = Object.keys(l)
        .map(function (x) { return l[x]; })
        .filter(function (v) { return typeof v === 'number' && isFinite(v); });
      const prom = puntajes.length
        ? Math.round(puntajes.reduce(function (a, b) { return a + b; }, 0) / puntajes.length * 100) + '%'
        : '—';
      const fila = document.createElement('tr');
      fila.appendChild(el('td', null, k));
      fila.appendChild(el('td', null, String(puntajes.length)));
      fila.appendChild(el('td', null, prom));
      t.appendChild(fila);
    });
    return t;
  }

  // La racha viva se calcula acá, con la fecha local: el servidor está en UTC.
  function rachaActual(dias) {
    if (!dias || !dias.length) return 0;
    const aFecha = function (s) {
      const p = s.split('-');
      return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
    };
    const dif = function (a, b) { return Math.round((aFecha(b) - aFecha(a)) / 86400000); };
    const hoy = (function () {
      const d = new Date();
      return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0')
        + '-' + String(d.getDate()).padStart(2, '0');
    })();
    const orden = dias.slice().sort();
    const d = dif(orden[orden.length - 1], hoy);
    if (d !== 0 && d !== 1) return 0;
    let n = 1;
    for (let i = orden.length - 1; i > 0; i--) {
      if (dif(orden[i - 1], orden[i]) === 1) n++;
      else break;
    }
    return n;
  }

  function tarjetaDeAlumno(a) {
    const card = el('div', 'card');

    const cab = el('div', 'alumno-cab');
    const izq = el('div');
    izq.appendChild(el('h3', null, a.nombre || a.usuario));
    const meta = el('p', 'alumno-meta');
    meta.textContent = '@' + a.usuario
      + ' · última entrega: ' + fecha(a.actualizado)
      + ' · 🔥 ' + rachaActual(a.dias) + (a.mejorRacha ? ' (récord ' + a.mejorRacha + ')' : '');
    izq.appendChild(meta);
    if (a.debeCambiar) {
      const p = el('span', 'pill gris', 'contraseña sin cambiar');
      izq.appendChild(p);
    }
    if (!a.ultimoAcceso) izq.appendChild(el('span', 'pill gris', 'nunca entró'));

    const acciones = el('div', 'acciones');
    const reset = el('button', null, '🔑 Resetear');
    reset.type = 'button';
    reset.addEventListener('click', function () { resetear(a); });
    const borrar = el('button', 'peligro', '🗑 Borrar');
    borrar.type = 'button';
    borrar.addEventListener('click', function () { eliminar(a); });
    acciones.appendChild(reset);
    acciones.appendChild(borrar);

    cab.appendChild(izq);
    cab.appendChild(acciones);
    card.appendChild(cab);
    card.appendChild(tablaDeLecciones(a.lecciones));

    if (a.audios && a.audios.length) {
      card.appendChild(el('p', 'hint', a.audios.length + (a.audios.length === 1
        ? ' grabación' : ' grabaciones')));
      const ul = el('ul', 'audios');
      a.audios.forEach(function (au) {
        const li = document.createElement('li');
        li.appendChild(el('span', 'frase', au.nombre));
        const audio = document.createElement('audio');
        audio.controls = true;
        audio.preload = 'none';
        // El <audio> no manda cabeceras: se descarga con fetch autenticado
        // y se reproduce desde un blob local.
        const boton = el('button', null, '▶ Cargar');
        boton.type = 'button';
        boton.addEventListener('click', async function () {
          boton.disabled = true;
          boton.textContent = '…';
          try {
            const r = await fetch(ADMIN + '?audio=' + encodeURIComponent(au.key), {
              headers: { 'Authorization': 'Bearer ' + window.Auth.token() }
            });
            if (!r.ok) throw new Error('HTTP ' + r.status);
            const blob = await r.blob();
            const url = URL.createObjectURL(blob);
            audio.src = url;
            const baja = el('a', null, '💾');
            baja.href = url;
            baja.download = au.nombre;
            baja.title = 'Descargar';
            li.appendChild(baja);
            boton.remove();
            audio.play().catch(function () { /* el navegador puede pedir gesto */ });
          } catch (err) {
            boton.disabled = false;
            boton.textContent = 'error';
          }
        });
        li.appendChild(boton);
        li.appendChild(audio);
        ul.appendChild(li);
      });
      card.appendChild(ul);
    } else {
      card.appendChild(el('p', 'hint', 'Sin grabaciones.'));
    }

    return card;
  }

  async function cargar() {
    lista.textContent = '';
    lista.appendChild(el('p', 'hint', 'Cargando…'));
    try {
      const datos = await pedir({ query: '?accion=alumnos' });
      const alumnos = datos.alumnos || [];
      lista.textContent = '';
      resumen.textContent = alumnos.length
        ? alumnos.length + (alumnos.length === 1 ? ' alumno' : ' alumnos')
        : 'Todavía no creaste ningún alumno.';
      alumnos.forEach(function (a) { lista.appendChild(tarjetaDeAlumno(a)); });
    } catch (err) {
      lista.textContent = '';
      const p = el('p', 'status bad', 'No se pudo cargar: ' + err.message);
      lista.appendChild(p);
    }
  }

  /* ---------------- Acciones ---------------- */

  // Las credenciales se ACUMULAN. Antes cada alta borraba la anterior, y como
  // el servidor sólo guarda el hash, esa contraseña quedaba perdida para siempre.
  function mostrarCredencial(titulo, usuario, clave) {
    const caja = document.getElementById('credencial');

    const div = el('div', 'credencial');
    div.appendChild(el('strong', null, titulo));
    const p = el('p');
    p.style.margin = '8px 0 0';
    p.appendChild(document.createTextNode('Usuario: '));
    p.appendChild(el('code', null, usuario));
    p.appendChild(document.createTextNode('  ·  Contraseña: '));
    p.appendChild(el('code', null, clave));
    div.appendChild(p);
    div.appendChild(el('p', 'hint', 'Anotala: no se vuelve a mostrar. '
      + 'El alumno la cambia la primera vez que entra.'));

    caja.insertBefore(div, caja.firstChild);   // la más nueva, arriba
    actualizarBarraCredenciales();
  }

  function actualizarBarraCredenciales() {
    const caja = document.getElementById('credencial');
    const cuantas = caja.querySelectorAll('.credencial').length;
    let barra = document.getElementById('credencial-barra');

    if (!cuantas) { if (barra) barra.remove(); return; }

    if (!barra) {
      barra = el('div', 'credencial-barra');
      barra.id = 'credencial-barra';
      barra.appendChild(el('span'));
      const limpiar = el('button', null, 'Limpiar la lista');
      limpiar.type = 'button';
      limpiar.addEventListener('click', function () {
        if (!window.confirm('¿Sacar estas credenciales de la pantalla? '
          + 'Asegurate de haberlas anotado: no se pueden volver a ver.')) return;
        caja.textContent = '';
        actualizarBarraCredenciales();
      });
      barra.appendChild(limpiar);
      caja.parentNode.insertBefore(barra, caja);
    }

    barra.querySelector('span').textContent = cuantas === 1
      ? '1 credencial en pantalla — anotala antes de cerrar'
      : cuantas + ' credenciales en pantalla — anotalas antes de cerrar';
  }

  async function crear() {
    const nombre = document.getElementById('nuevo-nombre').value.trim();
    const usuario = document.getElementById('nuevo-usuario').value.trim();
    const estado = document.getElementById('crear-estado');
    const boton = document.getElementById('crear');

    if (!nombre && !usuario) {
      estado.className = 'status warn';
      estado.textContent = 'Poné al menos el nombre.';
      return;
    }
    boton.disabled = true;
    estado.className = 'status';
    estado.textContent = 'Creando…';
    try {
      const r = await pedir({ cuerpo: { accion: 'crear', nombre: nombre, usuario: usuario } });
      estado.textContent = '';
      document.getElementById('nuevo-nombre').value = '';
      document.getElementById('nuevo-usuario').value = '';
      mostrarCredencial('✅ Alumno creado', r.usuario, r.clave);
      cargar();
    } catch (err) {
      estado.className = 'status bad';
      estado.textContent = err.message;
    } finally {
      boton.disabled = false;
    }
  }

  async function resetear(a) {
    if (!window.confirm('¿Generar una contraseña nueva para ' + (a.nombre || a.usuario) + '?')) return;
    try {
      const r = await pedir({ cuerpo: { accion: 'resetear', usuario: a.usuario } });
      mostrarCredencial('🔑 Contraseña nueva de ' + (a.nombre || a.usuario), r.usuario, r.clave);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      cargar();
    } catch (err) {
      window.alert('No se pudo resetear: ' + err.message);
    }
  }

  async function eliminar(a) {
    const nombre = a.nombre || a.usuario;
    if (!window.confirm('¿Borrar a ' + nombre + '? Se van también sus puntajes y sus grabaciones. '
      + 'Esto no se puede deshacer.')) return;
    if (!window.confirm('Confirmá otra vez: se borra TODO lo de ' + nombre + '.')) return;
    try {
      await pedir({ cuerpo: { accion: 'borrar', usuario: a.usuario } });
      cargar();
    } catch (err) {
      window.alert('No se pudo borrar: ' + err.message);
    }
  }

  /* ---------------- Sesión ---------------- */

  async function entrar() {
    const u = document.getElementById('usuario').value.trim();
    const c = document.getElementById('clave').value;
    const boton = document.getElementById('entrar');
    if (!u || !c) {
      loginEstado.className = 'status warn';
      loginEstado.textContent = 'Completá usuario y contraseña.';
      return;
    }
    boton.disabled = true;
    loginEstado.className = 'status';
    loginEstado.textContent = 'Entrando…';
    try {
      const sesion = await window.Auth.entrar(u, c);
      if (sesion.rol !== 'profe') {
        window.Auth.salir();
        throw new Error('Ese usuario no es el del profe.');
      }
      document.getElementById('clave').value = '';
      loginEstado.textContent = '';
    } catch (err) {
      loginEstado.className = 'status bad';
      loginEstado.textContent = err.message;
    } finally {
      boton.disabled = false;
    }
  }

  document.getElementById('entrar').addEventListener('click', entrar);
  ['usuario', 'clave'].forEach(function (id) {
    document.getElementById(id).addEventListener('keydown', function (e) {
      if (e.key === 'Enter') entrar();
    });
  });
  document.getElementById('crear').addEventListener('click', crear);
  botonSalir.addEventListener('click', function () { window.Auth.salir(); });

  window.Auth.alCambiar(function (sesion) {
    const dentro = !!(sesion && sesion.rol === 'profe');
    cajaLogin.hidden = dentro;
    cajaPanel.hidden = !dentro;
    botonSalir.hidden = !dentro;
    if (dentro) cargar();
    else resumen.textContent = 'Entrá con el usuario de profe.';
  });
})();
