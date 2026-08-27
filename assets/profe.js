/*
  Panel del profe. Es una página estática común: toda la autoridad la tiene
  el servidor, que exige un token con rol "profe" en cada llamada.

  Las grabaciones NO se traen todas de una: el resumen sólo trae contadores,
  y el detalle se pide por lección cuando se despliega. Con un curso de meses
  esa diferencia es que el panel abra al instante o que tarde.

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

  let vista = 'alumno';          // 'alumno' | 'leccion'
  let soloPendientes = false;
  const nombresPorUsuario = {};  // usuario -> nombre para mostrar

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

  /** "21/8 07:31" — corto, para las filas de grabaciones. */
  function fechaCorta(iso) {
    if (!iso) return 'sin fecha';
    const d = new Date(iso);
    if (isNaN(d)) return 'sin fecha';
    return d.getDate() + '/' + (d.getMonth() + 1) + ' '
      + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }

  // Títulos reales de lessons.json. Sin esto el panel mostraba el id masticado
  // ("Lección 1 · familia edades") en vez de "Familia y edades".
  const titulosDeLeccion = {};
  let titulosPedidos = null;

  function cargarTitulos() {
    if (titulosPedidos) return titulosPedidos;
    titulosPedidos = fetch('lessons.json', { cache: 'no-cache' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (m) {
        (m && m.lecciones ? m.lecciones : []).forEach(function (l) {
          if (l && l.id) titulosDeLeccion[l.id] = l.titulo || l.id;
        });
      })
      .catch(function () { /* sin manifiesto se usa el nombre derivado del id */ });
    return titulosPedidos;
  }

  /** El título del manifiesto; si no está, "leccion-04-familia" -> "Lección 4 · familia" */
  function nombreDeLeccion(id) {
    if (titulosDeLeccion[id]) return titulosDeLeccion[id];
    const m = /^leccion-0*(\d+)-(.*)$/.exec(String(id || ''));
    if (!m) return String(id || '').replace(/-/g, ' ');
    return 'Lección ' + m[1] + ' · ' + m[2].replace(/-/g, ' ');
  }

  function plural(n, uno, varios) { return n === 1 ? uno : varios; }

  /** "4 · 2 sin escuchar" */
  function contador(total, pendientes) {
    if (!total) return 'sin grabaciones';
    return total + ' ' + plural(total, 'grabación', 'grabaciones')
      + (pendientes ? ' · ' + pendientes + ' sin escuchar' : ' · todas escuchadas');
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

  /* ---------------- Puntajes ---------------- */

  function tablaDeLecciones(lecciones) {
    const claves = Object.keys(lecciones || {}).sort();
    if (!claves.length) return el('p', 'hint', 'Sin ejercicios todavía.');

    const t = el('table', 'notas');
    const cab = document.createElement('tr');
    ['Lección', 'Hechos', 'Promedio'].forEach(function (x) {
      const th = el('th', null, x);
      th.scope = 'col';
      cab.appendChild(th);
    });
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
      fila.appendChild(el('td', null, nombreDeLeccion(k)));
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

  /* ---------------- Grabaciones ---------------- */

  /** Una fila: tilde de escuchado, etiqueta legible y reproductor bajo demanda. */
  function filaDeAudio(a, mostrarAlumno) {
    const li = document.createElement('li');
    if (a.escuchado) li.classList.add('escuchado');

    // Todas las tildes se llamaban "Marcar como escuchada": en una lista de 20
    // grabaciones no había forma de saber cuál se estaba marcando.
    const cual = (mostrarAlumno ? (nombresPorUsuario[a.usuario] || a.usuario) + ', ' : '')
      + (a.frase ? 'frase ' + a.frase : 'frase sin número')
      + (a.textoEs ? ': ' + a.textoEs : '');
    const tilde = document.createElement('input');
    tilde.type = 'checkbox';
    tilde.checked = !!a.escuchado;
    tilde.title = 'Marcar como escuchada';
    tilde.setAttribute('aria-label', 'Marcar como escuchada la grabación de ' + cual);
    tilde.addEventListener('change', async function () {
      tilde.disabled = true;
      try {
        await pedir({ cuerpo: { accion: 'escuchado', clave: a.clave, valor: tilde.checked } });
        a.escuchado = tilde.checked;
        li.classList.toggle('escuchado', tilde.checked);
      } catch (err) {
        tilde.checked = !tilde.checked;
        window.alert('No se pudo marcar: ' + err.message);
      } finally {
        tilde.disabled = false;
      }
    });

    const etiqueta = el('span', 'frase');
    etiqueta.textContent = (mostrarAlumno ? (nombresPorUsuario[a.usuario] || a.usuario) + ' · ' : '')
      + (a.frase ? 'frase ' + a.frase : 'frase ?')
      + ' · ' + fechaCorta(a.grabadoEn);
    if (a.formato === 'viejo') etiqueta.textContent += ' · (formato viejo)';

    const audio = document.createElement('audio');
    audio.controls = true;
    audio.preload = 'none';

    // El <audio> no manda cabeceras: se descarga con fetch autenticado
    // y se reproduce desde un blob local.
    const boton = el('button', null, '▶ Cargar');
    boton.type = 'button';
    boton.setAttribute('aria-label', 'Cargar y escuchar la grabación de ' + cual);
    boton.addEventListener('click', async function () {
      boton.disabled = true;
      boton.textContent = '…';
      try {
        const r = await fetch(ADMIN + '?audio=' + encodeURIComponent(a.clave), {
          headers: { 'Authorization': 'Bearer ' + window.Auth.token() }
        });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const blob = await r.blob();
        const url = URL.createObjectURL(blob);
        audio.src = url;
        const baja = el('a', null, '💾');
        baja.href = url;
        baja.download = a.clave.split('/').pop();
        baja.title = 'Descargar';
        baja.setAttribute('aria-label', 'Descargar la grabación de ' + cual);
        li.appendChild(baja);
        boton.remove();
        audio.play().catch(function () { /* el navegador puede pedir un gesto */ });
      } catch (err) {
        boton.disabled = false;
        boton.textContent = 'error';
      }
    });

    const cajaTilde = el('label', 'tilde-caja');
    cajaTilde.appendChild(tilde);

    li.appendChild(cajaTilde);
    li.appendChild(etiqueta);
    li.appendChild(boton);
    li.appendChild(audio);
    return li;
  }

  /**
   * Grupo desplegable de una lección. Los audios se piden recién al abrirlo:
   * el panel no descarga el curso entero para mostrar una lista.
   */
  function grupoDeLeccion({ leccion, total, pendientes, usuario, mostrarAlumno }) {
    const caja = el('div', 'grupo');

    const cabecera = el('button', 'grupo-cab');
    cabecera.type = 'button';
    const flecha = el('span', 'flecha', '▸');
    cabecera.appendChild(flecha);
    cabecera.appendChild(el('span', 'grupo-titulo', nombreDeLeccion(leccion)));
    const marca = el('span', 'grupo-conteo', contador(total, pendientes));
    if (pendientes) marca.classList.add('hay-pendientes');
    cabecera.appendChild(marca);

    const cuerpo = el('div', 'grupo-cuerpo');
    cuerpo.hidden = true;
    let cargado = false;

    cabecera.addEventListener('click', async function () {
      cuerpo.hidden = !cuerpo.hidden;
      flecha.textContent = cuerpo.hidden ? '▸' : '▾';
      if (cargado || cuerpo.hidden) return;

      cuerpo.textContent = '';
      cuerpo.appendChild(el('p', 'hint', 'Cargando…'));
      try {
        const q = '?accion=audios&leccion=' + encodeURIComponent(leccion)
          + (usuario ? '&usuario=' + encodeURIComponent(usuario) : '');
        const datos = await pedir({ query: q });
        let audios = datos.audios || [];
        if (soloPendientes) audios = audios.filter(function (a) { return !a.escuchado; });

        cuerpo.textContent = '';
        if (!audios.length) {
          cuerpo.appendChild(el('p', 'hint', soloPendientes
            ? 'Nada pendiente en esta lección.' : 'Sin grabaciones.'));
          return;
        }
        const ul = el('ul', 'audios');
        audios.forEach(function (a) { ul.appendChild(filaDeAudio(a, mostrarAlumno)); });
        cuerpo.appendChild(ul);
        cargado = true;
      } catch (err) {
        cuerpo.textContent = '';
        cuerpo.appendChild(el('p', 'status bad', 'No se pudo cargar: ' + err.message));
      }
    });

    caja.appendChild(cabecera);
    caja.appendChild(cuerpo);
    return caja;
  }

  /* ---------------- Vista por alumno ---------------- */

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
    if (a.debeCambiar) izq.appendChild(el('span', 'pill gris', 'contraseña sin cambiar'));
    if (!a.ultimoAcceso) izq.appendChild(el('span', 'pill gris', 'nunca entró'));
    if (a.audiosPendientes) {
      izq.appendChild(el('span', 'pill', a.audiosPendientes + ' sin escuchar'));
    }

    const acciones = el('div', 'acciones');
    // Con varios alumnos había tantos "Resetear" y "Borrar" idénticos como
    // alumnos, y "Borrar" se lleva puestas sus grabaciones. El nombre dice a quién.
    const quien = a.nombre || a.usuario;
    const reset = el('button', null, '🔑 Resetear');
    reset.type = 'button';
    reset.setAttribute('aria-label', 'Resetear la contraseña de ' + quien);
    reset.addEventListener('click', function () { resetear(a); });
    const borrar = el('button', 'peligro', '🗑 Borrar');
    borrar.type = 'button';
    borrar.setAttribute('aria-label', 'Borrar a ' + quien + ' con sus puntajes y grabaciones');
    borrar.addEventListener('click', function () { eliminar(a); });
    acciones.appendChild(reset);
    acciones.appendChild(borrar);

    cab.appendChild(izq);
    cab.appendChild(acciones);
    card.appendChild(cab);
    card.appendChild(tablaDeLecciones(a.lecciones));

    const r = a.repaso;
    if (r && r.tarjetas) {
      card.appendChild(el('p', 'hint', '🧠 ' + r.tarjetas
        + (r.tarjetas === 1 ? ' palabra en repaso' : ' palabras en repaso')
        + ' · ' + r.vencenHoy + ' vence' + (r.vencenHoy === 1 ? '' : 'n') + ' hoy'
        + ' · ' + r.maduras + (r.maduras === 1 ? ' firme' : ' firmes')));
    }

    const grupos = (a.audiosPorLeccion || []).filter(function (g) {
      return !soloPendientes || g.pendientes > 0;
    });

    if (!grupos.length) {
      card.appendChild(el('p', 'hint', soloPendientes
        ? 'Nada pendiente de escuchar.' : 'Sin grabaciones.'));
      return card;
    }

    card.appendChild(el('p', 'hint', '🎙 ' + contador(a.audios, a.audiosPendientes)));
    grupos.forEach(function (g) {
      card.appendChild(grupoDeLeccion({
        leccion: g.leccion, total: g.total, pendientes: g.pendientes,
        usuario: a.usuario, mostrarAlumno: false
      }));
    });
    return card;
  }

  /* ---------------- Vista por lección ---------------- */

  function tarjetaDeLeccion(l) {
    const card = el('div', 'card');
    const cab = el('div', 'alumno-cab');
    const izq = el('div');
    izq.appendChild(el('h3', null, nombreDeLeccion(l.leccion)));
    izq.appendChild(el('p', 'alumno-meta',
      contador(l.total, l.pendientes) + ' · ' + l.alumnos + ' ' + plural(l.alumnos, 'alumno', 'alumnos')));
    cab.appendChild(izq);
    card.appendChild(cab);
    card.appendChild(grupoDeLeccion({
      leccion: l.leccion, total: l.total, pendientes: l.pendientes,
      usuario: null, mostrarAlumno: true
    }));
    return card;
  }

  /* ---------------- Carga y render ---------------- */

  function barraDeVistas() {
    const barra = el('div', 'vistas');

    const grupo = el('div', 'segmentado');
    [['alumno', '👥 Por alumno'], ['leccion', '📚 Por lección']].forEach(function (par) {
      const b = el('button', par[0] === vista ? 'activo' : null, par[1]);
      b.type = 'button';
      // Sin esto, cuál de las dos vistas está activa se sabía sólo por el color.
      b.setAttribute('aria-pressed', par[0] === vista ? 'true' : 'false');
      b.addEventListener('click', function () {
        if (vista === par[0]) return;
        vista = par[0];
        cargar();
      });
      grupo.appendChild(b);
    });

    const filtro = el('label', 'filtro');
    const tilde = document.createElement('input');
    tilde.type = 'checkbox';
    tilde.checked = soloPendientes;
    tilde.addEventListener('change', function () {
      soloPendientes = tilde.checked;
      cargar();
    });
    filtro.appendChild(tilde);
    filtro.appendChild(document.createTextNode(' Sólo lo que me falta escuchar'));

    barra.appendChild(grupo);
    barra.appendChild(filtro);
    return barra;
  }

  async function cargar() {
    lista.textContent = '';
    lista.appendChild(barraDeVistas());
    const cargando = el('p', 'hint', 'Cargando…');
    lista.appendChild(cargando);

    try {
      await cargarTitulos();
      // Los alumnos se piden siempre: hacen falta los nombres para las etiquetas.
      const datos = await pedir({ query: '?accion=alumnos' });
      const alumnos = datos.alumnos || [];
      alumnos.forEach(function (a) { nombresPorUsuario[a.usuario] = a.nombre || a.usuario; });

      const pendientesTotal = alumnos.reduce(function (s, a) { return s + (a.audiosPendientes || 0); }, 0);
      resumen.textContent = alumnos.length
        ? alumnos.length + ' ' + plural(alumnos.length, 'alumno', 'alumnos')
          + (pendientesTotal ? ' · ' + pendientesTotal + ' grabaciones sin escuchar' : '')
        : 'Todavía no creaste ningún alumno.';

      cargando.remove();

      if (vista === 'leccion') {
        const r = await pedir({ query: '?accion=lecciones' });
        let lecciones = r.lecciones || [];
        if (soloPendientes) lecciones = lecciones.filter(function (l) { return l.pendientes > 0; });
        if (!lecciones.length) {
          lista.appendChild(el('p', 'hint', soloPendientes
            ? 'No queda nada sin escuchar. 🎉' : 'Todavía no hay grabaciones.'));
          return;
        }
        lecciones.forEach(function (l) { lista.appendChild(tarjetaDeLeccion(l)); });
        return;
      }

      const visibles = soloPendientes
        ? alumnos.filter(function (a) { return a.audiosPendientes > 0; })
        : alumnos;
      if (!visibles.length) {
        lista.appendChild(el('p', 'hint', soloPendientes
          ? 'No queda nada sin escuchar. 🎉' : 'Todavía no creaste ningún alumno.'));
        return;
      }
      visibles.forEach(function (a) { lista.appendChild(tarjetaDeAlumno(a)); });
    } catch (err) {
      cargando.remove();
      lista.appendChild(el('p', 'status bad', 'No se pudo cargar: ' + err.message));
    }
  }

  /* ---------------- Credenciales ---------------- */

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

  /* ---------------- Acciones sobre alumnos ---------------- */

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
