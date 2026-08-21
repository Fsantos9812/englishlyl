/*
  Autenticacion: hash de contrasenas y tokens de sesion.

  Sin dependencias: todo con Web Crypto, que el runtime de Netlify ya trae.

  - Las contrasenas se guardan como PBKDF2-SHA256 con salt propio por usuario.
    Nunca se guarda ni se registra la contrasena en claro.
  - La sesion es un token firmado con HMAC-SHA256: el servidor no guarda
    sesiones, solo verifica la firma y la fecha de vencimiento.
*/

const ITERACIONES = 210000;          // recomendacion OWASP para PBKDF2-SHA256
const LARGO_CLAVE_BITS = 256;
const codificador = new TextEncoder();

/* ---------- base64 / base64url ---------- */

export function bytesABase64(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

export function base64ABytes(texto) {
  const bin = atob(String(texto || ''));
  const salida = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) salida[i] = bin.charCodeAt(i);
  return salida;
}

function aBase64Url(bytes) {
  return bytesABase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function deBase64Url(texto) {
  let t = String(texto || '').replace(/-/g, '+').replace(/_/g, '/');
  while (t.length % 4) t += '=';
  return base64ABytes(t);
}

/* ---------- Comparacion en tiempo constante ---------- */
// Comparar con === corta en el primer byte distinto y filtra informacion por
// el tiempo de respuesta. Esto siempre recorre todo.
export function igualSeguro(a, b) {
  const x = String(a == null ? '' : a);
  const y = String(b == null ? '' : b);
  let distinto = x.length ^ y.length;
  const largo = Math.max(x.length, y.length);
  for (let i = 0; i < largo; i++) {
    distinto |= (x.charCodeAt(i) || 0) ^ (y.charCodeAt(i) || 0);
  }
  return distinto === 0;
}

/* ---------- Contrasenas ---------- */

// Se recortan los espacios de los extremos. Una contrasena copiada del panel
// se arrastra un espacio invisible con facilidad, y el alumno no tiene forma
// de darse cuenta. Va aca abajo, en el unico lugar donde se crea y se
// verifica, para que las dos operaciones no se puedan desincronizar nunca.
export function normalizarClave(clave) {
  return String(clave == null ? '' : clave).trim();
}

export function nuevoSalt() {
  return bytesABase64(crypto.getRandomValues(new Uint8Array(16)));
}

export async function hashDeClave(clave, salt, iteraciones) {
  const material = await crypto.subtle.importKey(
    'raw', codificador.encode(String(clave)), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({
    name: 'PBKDF2',
    salt: base64ABytes(salt),
    iterations: iteraciones || ITERACIONES,
    hash: 'SHA-256'
  }, material, LARGO_CLAVE_BITS);
  return bytesABase64(new Uint8Array(bits));
}

/** Devuelve el bloque que se guarda en el usuario. */
export async function credencialDe(clave) {
  const salt = nuevoSalt();
  return {
    salt: salt,
    hash: await hashDeClave(normalizarClave(clave), salt, ITERACIONES),
    iteraciones: ITERACIONES
  };
}

export async function claveCoincide(clave, credencial) {
  if (!credencial || !credencial.salt || !credencial.hash) return false;
  const calculado = await hashDeClave(
    normalizarClave(clave), credencial.salt, credencial.iteraciones || ITERACIONES);
  return igualSeguro(calculado, credencial.hash);
}

/* ---------- Tokens de sesion ---------- */

async function firmar(texto, secreto) {
  const clave = await crypto.subtle.importKey(
    'raw', codificador.encode(String(secreto)), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const firma = await crypto.subtle.sign('HMAC', clave, codificador.encode(texto));
  return aBase64Url(new Uint8Array(firma));
}

export async function crearToken(datos, secreto, segundos) {
  const payload = {
    u: String(datos.usuario),
    r: String(datos.rol || 'alumno'),
    exp: Math.floor(Date.now() / 1000) + (segundos || 60 * 60 * 24 * 30)
  };
  const cuerpo = aBase64Url(codificador.encode(JSON.stringify(payload)));
  return cuerpo + '.' + await firmar(cuerpo, secreto);
}

/**
 * Verifica firma y vencimiento.
 * @returns {object|null} { usuario, rol, exp } o null si no sirve.
 */
export async function leerToken(token, secreto) {
  if (!token || !secreto) return null;
  const partes = String(token).split('.');
  if (partes.length !== 2) return null;

  const esperado = await firmar(partes[0], secreto);
  if (!igualSeguro(partes[1], esperado)) return null;

  let payload;
  try {
    payload = JSON.parse(new TextDecoder().decode(deBase64Url(partes[0])));
  } catch (err) { return null; }

  if (!payload || !payload.u) return null;
  if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;

  return { usuario: payload.u, rol: payload.r || 'alumno', exp: payload.exp };
}

/** Saca el token de la cabecera Authorization. */
export function tokenDeCabecera(request) {
  const cabecera = request.headers.get('authorization') || '';
  const m = cabecera.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : '';
}

/* ---------- Ayudas para el alta de alumnos ---------- */

const ADJETIVOS = ['verde', 'rojo', 'azul', 'claro', 'nuevo', 'lento', 'alto', 'tibio', 'largo', 'sabio'];
const SUSTANTIVOS = ['casa', 'perro', 'rio', 'campo', 'nube', 'gato', 'arbol', 'barco', 'puente', 'faro'];

/** Contrasena legible para dictar o entregar en papel: "casa-verde-473". */
export function claveLegible() {
  const azar = crypto.getRandomValues(new Uint32Array(3));
  return SUSTANTIVOS[azar[0] % SUSTANTIVOS.length]
    + '-' + ADJETIVOS[azar[1] % ADJETIVOS.length]
    + '-' + (100 + (azar[2] % 900));
}

/** Normaliza el nombre de usuario: sin tildes, sin espacios, minuscula. */
export function normalizarUsuario(texto) {
  return String(texto || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '.')
    .replace(/^[.]+|[.]+$/g, '')
    .slice(0, 40);
}
