/*
  POST /.netlify/functions/entregar   (con Bearer del alumno)

  { tipo: "progreso", datos: {...} }  -> guarda puntajes y une los dias de la racha
  { tipo: "audio", ... }              -> guarda una grabacion

  El alumno sale del token, nunca del cuerpo: nadie puede entregar en nombre
  de otro aunque manipule el JSON.
*/
import { recibirEntrega } from './_logica.mjs';
import { json, elStore, exigirSesion } from './_http.mjs';

export default async function handler(request) {
  if (request.method !== 'POST') return json({ ok: false, error: 'Usa POST.' }, 405);

  const { sesion, registro, respuesta } = await exigirSesion(request, 'alumno');
  if (respuesta) return respuesta;

  let entrada;
  try { entrada = await request.json(); }
  catch (err) { return json({ ok: false, error: 'El cuerpo no es JSON válido.' }, 400); }

  const r = await recibirEntrega(entrada, { store: elStore(), sesion, registro });
  return json(r.cuerpo, r.estado);
}
