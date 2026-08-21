/* Ayudas compartidas por los endpoints: respuestas y sesion. */
import { getStore } from '@netlify/blobs';
import { leerToken, tokenDeCabecera } from './_auth.mjs';
import { buscarUsuario } from './_logica.mjs';

const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store'
};

export function json(cuerpo, estado) {
  return new Response(JSON.stringify(cuerpo), { status: estado || 200, headers: JSON_HEADERS });
}

export function elStore() { return getStore('entregas'); }

export function secreto() { return process.env.SESION_SECRETO; }

/** Falta configurar el sitio: mejor cerrado que abierto. */
export function sinConfigurar() {
  return json({
    ok: false,
    error: 'Falta configurar SESION_SECRETO en las variables de entorno de Netlify.'
  }, 503);
}

/**
 * Valida el token de la cabecera.
 * @returns {object} { sesion, registro } o { respuesta } con el error listo.
 */
export async function exigirSesion(request, rolNecesario) {
  const s = secreto();
  if (!s) return { respuesta: sinConfigurar() };

  const sesion = await leerToken(tokenDeCabecera(request), s);
  if (!sesion) {
    return { respuesta: json({ ok: false, error: 'Sesión vencida o inválida.', relogin: true }, 401) };
  }
  if (rolNecesario && sesion.rol !== rolNecesario) {
    return { respuesta: json({ ok: false, error: 'No tenés permiso para esto.' }, 403) };
  }

  // El profe vive en variables de entorno, no en el store.
  const registro = sesion.rol === 'profe'
    ? { usuario: sesion.usuario, nombre: 'Profe', rol: 'profe' }
    : await buscarUsuario(elStore(), sesion.usuario);

  if (!registro) {
    return { respuesta: json({ ok: false, error: 'Tu usuario ya no existe.', relogin: true }, 401) };
  }
  return { sesion, registro };
}
