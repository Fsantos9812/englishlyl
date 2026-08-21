/*
  Logica de usuarios y entregas, sin nada de Netlify adentro.

  Recibe un "store" con la interfaz minima de Netlify Blobs
  ({ set, setJSON, get, getWithMetadata, list, delete }), asi se puede probar
  en local con un store falso en memoria.

  Claves que se usan:
    usuarios/<usuario>.json                      credenciales y datos del alumno
    progreso/<usuario>.json                      puntajes de todas las lecciones
    dias/<usuario>.json                          historial de dias practicados
    audio/<usuario>/<leccion>-<frase>-<id>.ext   grabaciones
*/
import { credencialDe, claveCoincide, claveLegible, normalizarUsuario, normalizarClave } from './_auth.mjs';

const MAX_NOMBRE = 80;
const MAX_AUDIO_BYTES = 4 * 1024 * 1024;
const MAX_PROGRESO_BYTES = 256 * 1024;
const MAX_DIAS = 400;
const MIN_CLAVE = 6;

export function slug(texto) {
  return String(texto || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50) || 'sin-nombre';
}

export function extensionDe(mime) {
  const m = String(mime || '').toLowerCase();
  if (m.includes('mp4') || m.includes('aac') || m.includes('m4a')) return 'm4a';
  if (m.includes('ogg')) return 'ogg';
  if (m.includes('wav')) return 'wav';
  if (m.includes('mpeg')) return 'mp3';
  return 'webm';
}

export function ok(cuerpo) { return { estado: 200, cuerpo: Object.assign({ ok: true }, cuerpo) }; }
export function error(codigo, mensaje) { return { estado: codigo, cuerpo: { ok: false, error: mensaje } }; }

/* ---------------- Usuarios ---------------- */

const claveUsuario = (u) => 'usuarios/' + u + '.json';

export async function buscarUsuario(store, usuario) {
  if (!usuario) return null;
  return store.get(claveUsuario(usuario), { type: 'json' });
}

export async function listarUsuarios(store) {
  const { blobs } = await store.list({ prefix: 'usuarios/' });
  const salida = [];
  for (const b of blobs || []) {
    const u = await store.get(b.key, { type: 'json' });
    if (u) salida.push(u);
  }
  return salida.sort(function (a, b2) {
    return String(a.nombre || a.usuario).localeCompare(String(b2.nombre || b2.usuario), 'es');
  });
}

export async function crearUsuario(store, { usuario, nombre, clave }) {
  const u = normalizarUsuario(usuario || nombre);
  if (!u) return error(400, 'El nombre de usuario no puede quedar vacío.');
  if (String(nombre || '').length > MAX_NOMBRE) return error(400, 'El nombre es demasiado largo.');
  if (await buscarUsuario(store, u)) return error(409, 'Ya existe un usuario "' + u + '".');

  const enClaro = normalizarClave(clave) || claveLegible();
  if (enClaro.length < MIN_CLAVE) {
    return error(400, 'La contraseña necesita al menos ' + MIN_CLAVE + ' caracteres.');
  }

  const registro = {
    usuario: u,
    nombre: String(nombre || u).trim() || u,
    rol: 'alumno',
    credencial: await credencialDe(enClaro),
    debeCambiar: true,               // la primera contrasena la puso el profe
    creado: new Date().toISOString(),
    ultimoAcceso: null
  };
  await store.setJSON(claveUsuario(u), registro);

  // La contrasena en claro se devuelve UNA sola vez, para que el profe la anote.
  return ok({ usuario: u, nombre: registro.nombre, clave: enClaro });
}

export async function resetearClave(store, usuario) {
  const u = normalizarUsuario(usuario);
  const registro = await buscarUsuario(store, u);
  if (!registro) return error(404, 'No existe ese usuario.');

  const enClaro = claveLegible();
  registro.credencial = await credencialDe(enClaro);
  registro.debeCambiar = true;
  await store.setJSON(claveUsuario(u), registro);
  return ok({ usuario: u, clave: enClaro });
}

export async function borrarUsuario(store, usuario) {
  const u = normalizarUsuario(usuario);
  if (!await buscarUsuario(store, u)) return error(404, 'No existe ese usuario.');

  await store.delete(claveUsuario(u));
  await store.delete('progreso/' + u + '.json');
  await store.delete('dias/' + u + '.json');
  await store.delete('escuchado/' + u + '.json');
  const { blobs } = await store.list({ prefix: 'audio/' + u + '/' });
  for (const b of blobs || []) await store.delete(b.key);
  return ok({ usuario: u, borrado: true });
}

export async function cambiarClave(store, usuario, actual, nueva) {
  const registro = await buscarUsuario(store, usuario);
  if (!registro) return error(404, 'No existe ese usuario.');
  if (!await claveCoincide(actual, registro.credencial)) {
    return error(403, 'La contraseña actual no coincide.');
  }
  if (normalizarClave(nueva).length < MIN_CLAVE) {
    return error(400, 'La contraseña nueva necesita al menos ' + MIN_CLAVE + ' caracteres.');
  }
  registro.credencial = await credencialDe(nueva);
  registro.debeCambiar = false;
  await store.setJSON(claveUsuario(usuario), registro);
  return ok({ cambiada: true });
}

/** Verifica usuario + clave. Devuelve el registro o null. */
export async function verificarCredenciales(store, usuario, clave) {
  const registro = await buscarUsuario(store, normalizarUsuario(usuario));
  if (!registro) return null;
  if (!await claveCoincide(clave, registro.credencial)) return null;
  return registro;
}

export async function marcarAcceso(store, usuario) {
  const registro = await buscarUsuario(store, usuario);
  if (!registro) return;
  registro.ultimoAcceso = new Date().toISOString();
  await store.setJSON(claveUsuario(usuario), registro);
}

/* ---------------- Racha: union de dias entre dispositivos ---------------- */

const esFecha = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);

export function unirDias(a, b) {
  const vistos = Object.create(null);
  const salida = [];
  for (const d of [].concat(a || [], b || [])) {
    if (!esFecha(d) || vistos[d]) continue;
    vistos[d] = true;
    salida.push(d);
  }
  return salida.sort().slice(-MAX_DIAS);
}

export function mejorCorrida(dias) {
  if (!dias || !dias.length) return 0;
  const dif = (x, y) => Math.round(
    (new Date(y + 'T00:00:00') - new Date(x + 'T00:00:00')) / 86400000);
  let mejor = 1;
  let corrida = 1;
  for (let i = 1; i < dias.length; i++) {
    corrida = dif(dias[i - 1], dias[i]) === 1 ? corrida + 1 : 1;
    if (corrida > mejor) mejor = corrida;
  }
  return mejor;
}

/**
 * Une los dias que manda este dispositivo con los ya guardados.
 * El "actual" no se calcula acá a propósito: depende de qué día es HOY para
 * el alumno, y el servidor está en UTC. Eso lo resuelve el cliente.
 */
export async function fusionarDias(store, usuario, entrantes, mejorEntrante) {
  const clave = 'dias/' + usuario + '.json';
  const previo = await store.get(clave, { type: 'json' });
  const dias = unirDias(previo && previo.dias, entrantes);
  const mejor = Math.max(
    Number(previo && previo.mejor) || 0,
    Number(mejorEntrante) || 0,
    mejorCorrida(dias)
  );
  await store.setJSON(clave, { dias, mejor, actualizado: new Date().toISOString() });
  return { dias, mejor };
}

/* ---------------- Claves de audio ---------------- */

/** 2026-08-21T12:31:52.710Z -> 20260821T123152 */
export function selloDeTiempo(iso) {
  const d = iso ? new Date(iso) : new Date();
  const f = isNaN(d) ? new Date() : d;
  const dos = (n) => String(n).padStart(2, '0');
  return f.getUTCFullYear() + dos(f.getUTCMonth() + 1) + dos(f.getUTCDate())
    + 'T' + dos(f.getUTCHours()) + dos(f.getUTCMinutes()) + dos(f.getUTCSeconds());
}

/** 20260821T123152 -> ISO, para mostrarlo en la hora del profe. */
function deSelloDeTiempo(sello) {
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})$/.exec(String(sello || ''));
  if (!m) return null;
  return m[1] + '-' + m[2] + '-' + m[3] + 'T' + m[4] + ':' + m[5] + ':' + m[6] + 'Z';
}

/**
 * Descompone una clave de audio. Entiende el formato nuevo
 *   audio/<usuario>/<leccion>/<NN>_<sello>_<id>.<ext>
 * y tambien el viejo y plano
 *   audio/<usuario>/<leccion>-<NN>-<id>.<ext>
 * para que las grabaciones que ya existian no desaparezcan del panel.
 */
export function leerClaveDeAudio(clave) {
  const partes = String(clave || '').split('/');
  if (partes.length < 3 || partes[0] !== 'audio') return null;

  const usuario = partes[1];

  if (partes.length >= 4) {                       // formato nuevo
    const archivo = partes.slice(3).join('/');
    const trozos = archivo.replace(/\.[a-z0-9]+$/i, '').split('_');
    return {
      clave,
      usuario,
      leccion: partes[2],
      frase: Number(trozos[0]) || null,
      grabadoEn: deSelloDeTiempo(trozos[1]),
      formato: 'nuevo'
    };
  }

  // formato viejo: la leccion y la frase estan pegadas en el nombre
  const archivo = partes[2].replace(/\.[a-z0-9]+$/i, '');
  const m = /^(.*)-(\d{2})-(.*)$/.exec(archivo);
  return {
    clave,
    usuario,
    leccion: m ? m[1] : archivo,
    frase: m ? Number(m[2]) : null,
    grabadoEn: null,
    formato: 'viejo'
  };
}

/* ---------------- Entregas ---------------- */

export async function guardarProgreso(store, usuario, nombre, datos) {
  if (!datos || typeof datos !== 'object') return error(400, 'Faltan los datos de progreso.');
  if (JSON.stringify(datos).length > MAX_PROGRESO_BYTES) {
    return error(413, 'Progreso demasiado grande.');
  }

  const racha = await fusionarDias(
    store, usuario,
    datos.racha && datos.racha.dias,
    datos.racha && datos.racha.mejor
  );

  await store.setJSON('progreso/' + usuario + '.json', {
    usuario,
    nombre: nombre || usuario,
    actualizado: new Date().toISOString(),
    lecciones: datos.lecciones || {}
  });

  // Se devuelve la racha unida para que el dispositivo adopte el historial
  // completo: asi el celular recupera los dias que hizo en la computadora.
  return ok({ racha });
}

export async function guardarAudio(store, usuario, nombre, entrada) {
  if (typeof entrada.audio !== 'string' || !entrada.audio) return error(400, 'Falta el audio.');

  let bytes;
  try { bytes = Buffer.from(entrada.audio, 'base64'); }
  catch (err) { return error(400, 'El audio no es base64 válido.'); }

  if (!bytes.length) return error(400, 'El audio vino vacío.');
  if (bytes.length > MAX_AUDIO_BYTES) return error(413, 'La grabación supera los 4 MB.');

  const leccion = slug(entrada.leccion || 'leccion');
  const frase = String((Number(entrada.frase) || 0) + 1).padStart(2, '0');
  // El id lo manda el cliente: reenviar la misma grabacion pisa la anterior
  // en vez de duplicarla.
  const id = slug(entrada.id || String(Date.now()));

  // La leccion va como segmento propio de la ruta. No es cosmetico: permite
  // pedirle al store los audios de UNA leccion en vez de traer todo el curso.
  // El nombre lleva frase y fecha para poder ordenarlo y mostrarlo sin abrir
  // los metadatos de cada archivo.
  const nombreArchivo = 'audio/' + usuario + '/' + leccion + '/'
    + frase + '_' + selloDeTiempo(entrada.grabadoEn) + '_' + id
    + '.' + extensionDe(entrada.mime);

  await store.set(nombreArchivo, bytes, {
    metadata: {
      usuario,
      nombre: nombre || usuario,
      leccion: String(entrada.leccion || ''),
      frase: Number(entrada.frase) || 0,
      textoEs: String(entrada.textoEs || '').slice(0, 200),
      mime: String(entrada.mime || 'audio/webm'),
      grabadoEn: String(entrada.grabadoEn || ''),
      recibidoEn: new Date().toISOString()
    }
  });
  return ok({ guardado: nombreArchivo });
}

/** Procesa una entrega ya autenticada. */
export async function recibirEntrega(entrada, { store, sesion, registro }) {
  if (!entrada || typeof entrada !== 'object') return error(400, 'Cuerpo inválido.');
  const nombre = (registro && registro.nombre) || sesion.usuario;

  if (entrada.tipo === 'progreso') {
    return guardarProgreso(store, sesion.usuario, nombre, entrada.datos);
  }
  if (entrada.tipo === 'audio') {
    return guardarAudio(store, sesion.usuario, nombre, entrada);
  }
  return error(400, 'Tipo de entrega desconocido: ' + entrada.tipo);
}

/* ---------------- Panel del profe ---------------- */

const claveEscuchados = (u) => 'escuchado/' + u + '.json';

async function escuchadosDe(store, usuario) {
  const g = await store.get(claveEscuchados(usuario), { type: 'json' });
  return (g && g.claves) || {};
}

/** Marca o desmarca una grabacion como ya escuchada por el profe. */
export async function marcarEscuchado(store, clave, valor) {
  const info = leerClaveDeAudio(clave);
  if (!info) return error(400, 'Clave de audio inválida.');

  const claves = await escuchadosDe(store, info.usuario);
  if (valor) claves[clave] = new Date().toISOString();
  else delete claves[clave];

  await store.setJSON(claveEscuchados(info.usuario), { claves });
  return ok({ clave, escuchado: !!valor });
}

/**
 * Audios de un alumno, o de una leccion, o de una leccion de un alumno.
 * Cuando se pide una leccion concreta se usa el prefijo completo: el store
 * devuelve solo esos archivos en vez de todo el curso.
 */
export async function listarAudios(store, { usuario, leccion } = {}) {
  const prefijo = 'audio/'
    + (usuario ? usuario + '/' : '')
    + (usuario && leccion ? leccion + '/' : '');

  const { blobs } = await store.list({ prefix: prefijo });
  const porUsuario = {};
  const salida = [];

  for (const b of blobs || []) {
    const info = leerClaveDeAudio(b.key);
    if (!info) continue;
    if (leccion && info.leccion !== leccion) continue;   // filtra el formato viejo

    if (!(info.usuario in porUsuario)) {
      porUsuario[info.usuario] = await escuchadosDe(store, info.usuario);
    }
    info.escuchado = !!porUsuario[info.usuario][b.key];
    salida.push(info);
  }

  // Mas nuevas primero; las viejas sin fecha, al final
  salida.sort(function (a, b2) {
    if (a.grabadoEn && b2.grabadoEn) return a.grabadoEn < b2.grabadoEn ? 1 : -1;
    if (a.grabadoEn) return -1;
    if (b2.grabadoEn) return 1;
    return a.clave < b2.clave ? 1 : -1;
  });
  return salida;
}

/** Lecciones que tienen alguna grabacion, con cuantas y cuantas sin escuchar. */
export async function resumenDeLecciones(store) {
  const audios = await listarAudios(store);
  const mapa = new Map();
  for (const a of audios) {
    if (!mapa.has(a.leccion)) mapa.set(a.leccion, { leccion: a.leccion, total: 0, pendientes: 0, alumnos: {} });
    const l = mapa.get(a.leccion);
    l.total++;
    if (!a.escuchado) l.pendientes++;
    l.alumnos[a.usuario] = true;
  }
  return Array.from(mapa.values())
    .map(function (l) {
      return { leccion: l.leccion, total: l.total, pendientes: l.pendientes,
               alumnos: Object.keys(l.alumnos).length };
    })
    .sort(function (a, b) { return a.leccion.localeCompare(b.leccion, 'es'); });
}

/**
 * Un renglon por alumno. NO trae la lista de audios: sólo cuántos hay y
 * cuántos faltan escuchar, para que el panel abra rápido aunque el curso
 * lleve meses. El detalle se pide por lección, cuando se despliega.
 */
export async function resumenDeAlumnos(store) {
  const usuarios = await listarUsuarios(store);
  const audios = await listarAudios(store);

  const porUsuario = {};
  for (const a of audios) {
    if (!porUsuario[a.usuario]) porUsuario[a.usuario] = { total: 0, pendientes: 0, lecciones: {} };
    const u = porUsuario[a.usuario];
    u.total++;
    if (!a.escuchado) u.pendientes++;
    if (!u.lecciones[a.leccion]) u.lecciones[a.leccion] = { total: 0, pendientes: 0 };
    u.lecciones[a.leccion].total++;
    if (!a.escuchado) u.lecciones[a.leccion].pendientes++;
  }

  const salida = [];
  for (const u of usuarios) {
    const progreso = await store.get('progreso/' + u.usuario + '.json', { type: 'json' });
    const dias = await store.get('dias/' + u.usuario + '.json', { type: 'json' });
    const audio = porUsuario[u.usuario] || { total: 0, pendientes: 0, lecciones: {} };
    salida.push({
      usuario: u.usuario,
      nombre: u.nombre,
      creado: u.creado,
      ultimoAcceso: u.ultimoAcceso,
      debeCambiar: !!u.debeCambiar,
      actualizado: progreso ? progreso.actualizado : null,
      lecciones: progreso ? progreso.lecciones || {} : {},
      dias: dias ? dias.dias || [] : [],
      mejorRacha: dias ? dias.mejor || 0 : 0,
      audios: audio.total,
      audiosPendientes: audio.pendientes,
      audiosPorLeccion: Object.keys(audio.lecciones).sort().map(function (k) {
        return { leccion: k, total: audio.lecciones[k].total, pendientes: audio.lecciones[k].pendientes };
      })
    });
  }
  return salida;
}
