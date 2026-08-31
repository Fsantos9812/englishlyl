/*
  POST /.netlify/functions/auth

  { accion: "login", usuario, clave }            -> { token, rol, nombre, debeCambiar }
  { accion: "cambiar-clave", actual, nueva }     -> con Bearer del propio alumno

  Variables de entorno:
    SESION_SECRETO   cadena larga y secreta para firmar los tokens
    PROFE_USUARIO    usuario del profe
    PROFE_CLAVE      contrasena del profe

  El profe vive en variables de entorno a proposito: asi no hay un problema del
  huevo y la gallina para crear el primer usuario, y su contrasena no queda en
  el mismo lugar que la de los alumnos.
*/
import { crearToken, igualSeguro, normalizarClave } from './_auth.mjs';
import { verificarCredenciales, marcarAcceso, cambiarClave } from './_logica.mjs';
import { json, elStore, secreto, sinConfigurar, exigirSesion } from './_http.mjs';

const DIAS_ALUMNO = 60 * 60 * 24 * 30;    // 30 dias: que no tengan que loguear seguido
const HORAS_PROFE = 60 * 60 * 12;         // 12 horas: el panel ve datos de todos

export default async function handler(request) {
  if (request.method !== 'POST') return json({ ok: false, error: 'Usa POST.' }, 405);

  const s = secreto();
  if (!s) return sinConfigurar();

  let entrada;
  try { entrada = await request.json(); }
  catch (err) { return json({ ok: false, error: 'El cuerpo no es JSON válido.' }, 400); }

  /* ---- cambiar la propia contrasena ---- */
  if (entrada.accion === 'cambiar-clave') {
    const { sesion, respuesta } = await exigirSesion(request);
    if (respuesta) return respuesta;
    if (sesion.rol === 'profe') {
      return json({ ok: false, error: 'La contraseña del profe se cambia en Netlify.' }, 400);
    }
    const r = await cambiarClave(elStore(), sesion.usuario, entrada.actual, entrada.nueva);
    return json(r.cuerpo, r.estado);
  }

  if (entrada.accion !== 'login') {
    return json({ ok: false, error: 'Acción desconocida.' }, 400);
  }

  const usuario = String(entrada.usuario || '').trim();
  const clave = normalizarClave(entrada.clave);
  if (!usuario || !clave) return json({ ok: false, error: 'Faltan usuario o contraseña.' }, 400);

  /* ---- profe ---- */
  const profeUsuario = process.env.PROFE_USUARIO;
  const profeClave = process.env.PROFE_CLAVE;
  const store = elStore();

  // Sin profe configurado y sin ningun alumno creado, el sitio esta recien
  // desplegado: conviene decirlo, no responder "contrasena incorrecta".
  if (!profeUsuario || !profeClave) {
    const { blobs } = await store.list({ prefix: 'usuarios/' });
    if (!blobs || !blobs.length) {
      return json({
        ok: false,
        error: 'Todavía no configuraste PROFE_USUARIO y PROFE_CLAVE en las variables de entorno de Netlify.'
      }, 503);
    }
  }

  if (profeUsuario && profeClave
      && igualSeguro(usuario.toLowerCase(), String(profeUsuario).toLowerCase())) {
    // La variable de entorno tambien se recorta: un espacio pegado sin querer
    // en el panel de Netlify dejaria al profe afuera de su propio sitio.
    if (!igualSeguro(clave, normalizarClave(profeClave))) {
      return json({ ok: false, error: 'Usuario o contraseña incorrectos.' }, 401);
    }
    return json({
      ok: true,
      token: await crearToken({ usuario: usuario.toLowerCase(), rol: 'profe' }, s, HORAS_PROFE),
      rol: 'profe',
      nombre: 'Profe',
      debeCambiar: false
    });
  }

  /* ---- alumno ---- */
  const registro = await verificarCredenciales(store, usuario, clave);
  if (!registro) {
    // Mismo mensaje para usuario inexistente y clave equivocada: no se le
    // regala a nadie la lista de quien tiene cuenta.
    return json({ ok: false, error: 'Usuario o contraseña incorrectos.' }, 401);
  }

  await marcarAcceso(store, registro.usuario);
  return json({
    ok: true,
    token: await crearToken({ usuario: registro.usuario, rol: 'alumno' }, s, DIAS_ALUMNO),
    rol: 'alumno',
    nombre: registro.nombre,
    debeCambiar: !!registro.debeCambiar
  });
}
