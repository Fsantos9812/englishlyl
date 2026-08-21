/*
  Endpoints del panel del profe. Todos exigen Bearer con rol "profe".

  GET  /.netlify/functions/admin?accion=alumnos      lista con progreso y grabaciones
  GET  /.netlify/functions/admin?audio=<clave>       devuelve una grabacion
  POST /.netlify/functions/admin  { accion: "crear",    usuario, nombre, clave? }
  POST /.netlify/functions/admin  { accion: "resetear", usuario }
  POST /.netlify/functions/admin  { accion: "borrar",   usuario }
*/
import { crearUsuario, resetearClave, borrarUsuario, resumenDeAlumnos } from './_logica.mjs';
import { json, elStore, exigirSesion } from './_http.mjs';

export default async function handler(request) {
  const { respuesta } = await exigirSesion(request, 'profe');
  if (respuesta) return respuesta;

  const store = elStore();
  const url = new URL(request.url);

  if (request.method === 'GET') {
    const clave = url.searchParams.get('audio');
    if (clave) {
      // Sólo el prefijo de audios: el panel no es una ventana a todo el store.
      if (!clave.startsWith('audio/')) return json({ ok: false, error: 'Clave inválida.' }, 400);
      const r = await store.getWithMetadata(clave, { type: 'arrayBuffer' });
      if (!r) return json({ ok: false, error: 'No existe esa grabación.' }, 404);
      return new Response(r.data, {
        headers: {
          'Content-Type': (r.metadata && r.metadata.mime) || 'audio/webm',
          'Cache-Control': 'no-store'
        }
      });
    }
    return json({ ok: true, alumnos: await resumenDeAlumnos(store) });
  }

  if (request.method !== 'POST') return json({ ok: false, error: 'Método no permitido.' }, 405);

  let entrada;
  try { entrada = await request.json(); }
  catch (err) { return json({ ok: false, error: 'El cuerpo no es JSON válido.' }, 400); }

  let r;
  if (entrada.accion === 'crear') r = await crearUsuario(store, entrada);
  else if (entrada.accion === 'resetear') r = await resetearClave(store, entrada.usuario);
  else if (entrada.accion === 'borrar') r = await borrarUsuario(store, entrada.usuario);
  else return json({ ok: false, error: 'Acción desconocida.' }, 400);

  return json(r.cuerpo, r.estado);
}
