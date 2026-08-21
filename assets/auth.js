/*
  Sesión del alumno en el navegador.

  Guarda el token en localStorage y lo ofrece a sync.js. Si el servidor
  responde que la sesión venció, la borra y avisa para que se vuelva a entrar.

  Todo esto es opcional: sin sesión las lecciones funcionan igual, sólo que
  el progreso no le llega al profe.
*/
window.Auth = (function () {
  'use strict';

  const ENDPOINT = window.AUTH_ENDPOINT || '/.netlify/functions/auth';
  // El panel del profe guarda su sesión aparte: si compartieran la misma clave,
  // entrar al panel dejaría al índice creyendo que el profe es un alumno.
  const CLAVE = window.AUTH_CLAVE || 'lecciones:sesion';
  const oyentes = [];

  function leer() {
    try {
      const g = JSON.parse(localStorage.getItem(CLAVE) || 'null');
      if (g && g.token) return g;
    } catch (err) {}
    return null;
  }

  function guardar(sesion) {
    try {
      if (sesion) localStorage.setItem(CLAVE, JSON.stringify(sesion));
      else localStorage.removeItem(CLAVE);
    } catch (err) {}
    avisar();
  }

  function avisar() {
    const s = leer();
    oyentes.forEach(function (fn) { try { fn(s); } catch (err) {} });
  }

  function alCambiar(fn) { oyentes.push(fn); fn(leer()); }

  function token() { const s = leer(); return s ? s.token : ''; }
  function nombre() { const s = leer(); return s ? s.nombre : ''; }
  function usuario() { const s = leer(); return s ? s.usuario : ''; }
  function rol() { const s = leer(); return s ? (s.rol || 'alumno') : ''; }
  function activa() { return !!token(); }
  function debeCambiar() { const s = leer(); return !!(s && s.debeCambiar); }

  async function pedir(cuerpo, conToken) {
    const cabeceras = { 'Content-Type': 'application/json' };
    if (conToken) cabeceras.Authorization = 'Bearer ' + token();
    const r = await fetch(ENDPOINT, {
      method: 'POST',
      headers: cabeceras,
      body: JSON.stringify(cuerpo)
    });
    let datos = {};
    try { datos = await r.json(); } catch (err) {}
    if (!r.ok) {
      const e = new Error(datos.error || ('HTTP ' + r.status));
      e.status = r.status;
      throw e;
    }
    return datos;
  }

  async function entrar(usuarioTexto, clave) {
    const datos = await pedir({ accion: 'login', usuario: usuarioTexto, clave: clave });
    guardar({
      token: datos.token,
      usuario: String(usuarioTexto).trim().toLowerCase(),
      nombre: datos.nombre || usuarioTexto,
      rol: datos.rol || 'alumno',
      debeCambiar: !!datos.debeCambiar,
      desde: new Date().toISOString()
    });
    return leer();
  }

  async function cambiarClave(actual, nueva) {
    await pedir({ accion: 'cambiar-clave', actual: actual, nueva: nueva }, true);
    const s = leer();
    if (s) { s.debeCambiar = false; guardar(s); }
  }

  function salir() { guardar(null); }

  // La llama sync.js cuando el servidor devuelve 401: el token ya no sirve.
  function vencida() {
    if (leer()) { guardar(null); return true; }
    return false;
  }

  return {
    entrar: entrar,
    salir: salir,
    vencida: vencida,
    cambiarClave: cambiarClave,
    token: token,
    nombre: nombre,
    usuario: usuario,
    rol: rol,
    activa: activa,
    debeCambiar: debeCambiar,
    alCambiar: alCambiar
  };
})();


/*
  Ojito para ver la contraseña mientras se escribe.

  Va en este archivo porque es el unico que cargan las dos paginas que tienen
  campos de contraseña (el indice y el panel del profe): asi no hay que acordarse
  de engancharlo a mano en cada campo nuevo.
*/
(function () {
  'use strict';

  function ponerOjo(input) {
    if (input.dataset.conOjo) return;
    input.dataset.conOjo = '1';

    // El boton se posiciona contra una caja propia, no contra el campo.
    const caja = document.createElement('span');
    caja.className = 'con-ojo';
    input.parentNode.insertBefore(caja, input);
    caja.appendChild(input);

    const boton = document.createElement('button');
    boton.type = 'button';
    boton.className = 'ojo';

    const pintar = function () {
      const visible = input.type === 'text';
      boton.textContent = visible ? '🙈' : '👁️';
      const que = visible ? 'Ocultar la contraseña' : 'Mostrar la contraseña';
      boton.setAttribute('aria-label', que);
      boton.setAttribute('aria-pressed', visible ? 'true' : 'false');
      boton.title = que;
    };

    boton.addEventListener('click', function () {
      // Cambiar el type manda el cursor al final: se guarda y se restaura.
      const pos = input.selectionStart;
      input.type = (input.type === 'password') ? 'text' : 'password';
      pintar();
      input.focus();
      try { input.setSelectionRange(pos, pos); } catch (err) {}
    });

    pintar();
    caja.appendChild(boton);
  }

  function decorar() {
    document.querySelectorAll('input[type="password"]').forEach(ponerOjo);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', decorar);
  else decorar();
})();
