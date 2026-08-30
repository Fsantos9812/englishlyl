/*
  Pruebas de la logica de usuarios y entregas, sin Netlify ni despliegue.
  Se corre parado en la raiz del proyecto:

      node tools/probar-logica.mjs
*/
import * as L from '../netlify/functions/_logica.mjs';
import * as A from '../netlify/functions/_auth.mjs';

const nuevoStore = () => {
  const m = new Map();
  const md = new Map();
  return {
    m,
    async setJSON(k, v) { m.set(k, JSON.stringify(v)); },
    async set(k, v, opts) { m.set(k, v); if (opts && opts.metadata) md.set(k, opts.metadata); },
    async get(k, o) {
      const e = m.get(k);
      if (e === undefined) return null;
      return (o && o.type === 'json') ? JSON.parse(e) : e;
    },
    async getWithMetadata(k) { const e = m.get(k); return e === undefined ? null : { data: e, metadata: md.get(k) || {} }; },
    async getMetadata(k) { const e = m.get(k); return e === undefined ? null : { metadata: md.get(k) || {} }; },
    async delete(k) { m.delete(k); md.delete(k); },
    async list({ prefix }) {
      return { blobs: [...m.keys()].filter(k => k.startsWith(prefix)).map(key => ({ key })) };
    }
  };
};

let ok = 0, mal = 0;
function afirmar(nombre, condicion, detalle) {
  if (condicion) { ok++; console.log('  OK   ' + nombre); }
  else { mal++; console.log('  FALLA ' + nombre + (detalle ? '  -> ' + detalle : '')); }
}

/* ---------------- Contrasenas ---------------- */
console.log('\nCONTRASEÑAS');
{
  const cred = await A.credencialDe('miClave123');
  afirmar('el hash no es la contraseña', cred.hash !== 'miClave123');
  afirmar('trae salt propio', !!cred.salt && cred.salt.length >= 16);
  afirmar('usa 210k iteraciones', cred.iteraciones === 210000, String(cred.iteraciones));
  afirmar('acepta la correcta', await A.claveCoincide('miClave123', cred));
  afirmar('rechaza la incorrecta', !await A.claveCoincide('miClave124', cred));

  const otra = await A.credencialDe('miClave123');
  afirmar('dos usuarios con la misma clave tienen hash distinto', otra.hash !== cred.hash);

  // Los espacios de los extremos no cuentan: se copian sin querer del panel
  afirmar('acepta con espacio adelante', await A.claveCoincide('  miClave123', cred));
  afirmar('acepta con espacio atras', await A.claveCoincide('miClave123 ', cred));
  afirmar('acepta con salto de linea pegado',
    await A.claveCoincide('miClave123' + String.fromCharCode(10), cred));
  afirmar('los espacios internos SI cuentan', !await A.claveCoincide('miCla ve123', cred));

  const conEspacios = await A.credencialDe('  otraClave456  ');
  afirmar('una clave creada con espacios entra sin ellos',
    await A.claveCoincide('otraClave456', conEspacios));
}

/* ---------------- Tokens ---------------- */
console.log('\nTOKENS DE SESIÓN');
{
  const S = 'secreto-largo';
  const t = await A.crearToken({ usuario: 'ana', rol: 'alumno' }, S, 60);
  const leido = await A.leerToken(t, S);
  afirmar('ida y vuelta', leido && leido.usuario === 'ana' && leido.rol === 'alumno');
  afirmar('rechaza otro secreto', !await A.leerToken(t, 'otro-secreto'));
  afirmar('rechaza firma manipulada', !await A.leerToken(t.slice(0, -3) + 'aaa', S));

  // Un alumno que se autoasciende a profe editando el payload
  const partes = t.split('.');
  const payload = JSON.parse(Buffer.from(partes[0], 'base64url').toString());
  payload.r = 'profe';
  const falsificado = Buffer.from(JSON.stringify(payload)).toString('base64url') + '.' + partes[1];
  afirmar('rechaza el rol falsificado', !await A.leerToken(falsificado, S));

  const vencido = await A.crearToken({ usuario: 'ana', rol: 'alumno' }, S, -10);
  afirmar('rechaza el vencido', !await A.leerToken(vencido, S));
}

/* ---------------- Usuarios ---------------- */
console.log('\nUSUARIOS');
{
  const store = nuevoStore();
  const r = await L.crearUsuario(store, { nombre: 'Ana Gómez Ñuñez' });
  afirmar('crea con usuario normalizado', r.cuerpo.usuario === 'ana.gomez.nunez', r.cuerpo.usuario);
  afirmar('devuelve una clave legible', /^[a-z]+-[a-z]+-\d{3}$/.test(r.cuerpo.clave), r.cuerpo.clave);
  afirmar('la clave en claro no queda guardada',
    !JSON.stringify([...store.m.values()]).includes(r.cuerpo.clave));

  const dup = await L.crearUsuario(store, { nombre: 'Ana Gómez Ñuñez' });
  afirmar('no permite duplicados', dup.estado === 409, String(dup.estado));

  afirmar('login correcto', !!await L.verificarCredenciales(store, 'ana.gomez.nunez', r.cuerpo.clave));
  afirmar('login con clave mala', !await L.verificarCredenciales(store, 'ana.gomez.nunez', 'xxx'));
  afirmar('login de usuario inexistente', !await L.verificarCredenciales(store, 'nadie', 'xxx'));

  const corta = await L.cambiarClave(store, 'ana.gomez.nunez', r.cuerpo.clave, 'abc');
  afirmar('rechaza contraseña corta', corta.estado === 400);
  const cambio = await L.cambiarClave(store, 'ana.gomez.nunez', r.cuerpo.clave, 'claveNueva2026');
  afirmar('cambia la contraseña', cambio.estado === 200);
  afirmar('la vieja ya no sirve', !await L.verificarCredenciales(store, 'ana.gomez.nunez', r.cuerpo.clave));
  afirmar('la nueva sirve', !!await L.verificarCredenciales(store, 'ana.gomez.nunez', 'claveNueva2026'));

  const mal2 = await L.cambiarClave(store, 'ana.gomez.nunez', 'no-es-la-actual', 'otraMas2026');
  afirmar('no cambia sin la actual', mal2.estado === 403);

  // Borrar arrastra todo lo del alumno
  await L.guardarProgreso(store, 'ana.gomez.nunez', 'Ana',
    { lecciones: { l1: { 'repeat:0': 1 } }, racha: { dias: ['2026-08-20'] } });
  await L.guardarAudio(store, 'ana.gomez.nunez', 'Ana',
    { audio: Buffer.alloc(10).toString('base64'), leccion: 'l1', frase: 0, id: 'x' });
  const antes = store.m.size;
  await L.borrarUsuario(store, 'ana.gomez.nunez');
  afirmar('borrar arrastra progreso, días y audios', store.m.size === 0, antes + ' claves -> ' + store.m.size);
}

/* ---------------- Racha entre dispositivos ---------------- */
console.log('\nRACHA ENTRE DISPOSITIVOS');
{
  const store = nuevoStore();
  await L.crearUsuario(store, { usuario: 'ana', nombre: 'Ana' });

  // Dispositivo A: cuatro dias seguidos
  const A4 = ['2026-08-18', '2026-08-19', '2026-08-20', '2026-08-21'];
  const r1 = await L.guardarProgreso(store, 'ana', 'Ana', { lecciones: {}, racha: { dias: A4, mejor: 4 } });
  afirmar('guarda los días del dispositivo A', r1.cuerpo.racha.dias.length === 4);

  // Dispositivo B recien estrenado: manda una lista vacia
  const r2 = await L.guardarProgreso(store, 'ana', 'Ana', { lecciones: {}, racha: { dias: [], mejor: 0 } });
  afirmar('un dispositivo sin historial NO borra la racha', r2.cuerpo.racha.dias.length === 4,
    JSON.stringify(r2.cuerpo.racha));
  afirmar('el récord tampoco retrocede', r2.cuerpo.racha.mejor === 4, String(r2.cuerpo.racha.mejor));

  // Dispositivo B aporta un dia que A no tenia
  const r3 = await L.guardarProgreso(store, 'ana', 'Ana', { lecciones: {}, racha: { dias: ['2026-08-17'], mejor: 1 } });
  afirmar('une los días de los dos dispositivos', r3.cuerpo.racha.dias.length === 5);
  afirmar('recalcula el récord con la unión', r3.cuerpo.racha.mejor === 5, String(r3.cuerpo.racha.mejor));

  afirmar('ignora fechas basura',
    L.unirDias(['2026-08-01', 'ayer', '', null, '2026-13-45x']).length === 1);
  afirmar('mejorCorrida con huecos', L.mejorCorrida(['2026-08-01', '2026-08-05', '2026-08-06']) === 2);
}

/* ---------------- Limites de las entregas ---------------- */
console.log('\nLÍMITES');
{
  const store = nuevoStore();
  await L.crearUsuario(store, { usuario: 'ana', nombre: 'Ana' });
  const sesion = { usuario: 'ana', rol: 'alumno' };
  const registro = { usuario: 'ana', nombre: 'Ana' };

  const grande = await L.recibirEntrega(
    { tipo: 'progreso', datos: { relleno: 'y'.repeat(300 * 1024) } }, { store, sesion, registro });
  afirmar('rechaza progreso de 300 KB', grande.estado === 413);

  const audioGrande = await L.recibirEntrega(
    { tipo: 'audio', audio: Buffer.alloc(5 * 1024 * 1024).toString('base64') }, { store, sesion, registro });
  afirmar('rechaza audio de 5 MB', audioGrande.estado === 413);

  const vacio = await L.recibirEntrega({ tipo: 'audio', audio: '' }, { store, sesion, registro });
  afirmar('rechaza audio vacío', vacio.estado === 400);

  const raro = await L.recibirEntrega({ tipo: 'borrar-todo' }, { store, sesion, registro });
  afirmar('rechaza tipo desconocido', raro.estado === 400);

  // Reenviar el mismo id no duplica
  const uno = { tipo: 'audio', audio: Buffer.alloc(10).toString('base64'), leccion: 'l1', frase: 0, id: 'abc' };
  await L.recibirEntrega(uno, { store, sesion, registro });
  await L.recibirEntrega(uno, { store, sesion, registro });
  const audios = [...store.m.keys()].filter(k => k.startsWith('audio/'));
  afirmar('reenviar el mismo audio no duplica', audios.length === 1, audios.join(', '));
  afirmar('el audio queda bajo el usuario del token', audios[0].startsWith('audio/ana/'), audios[0]);

  // Los intentos de Repeat llegan con origen, puntaje y transcript.
  const repeat = await L.recibirEntrega({
    tipo: 'audio',
    audio: Buffer.alloc(10).toString('base64'),
    leccion: 'l1', frase: 2, id: 'rep',
    origen: 'repeat', puntaje: 0.55, dicho: 'She es my friend', textoEn: 'She is my friend'
  }, { store, sesion, registro });
  afirmar('guarda el intento de repeat', repeat.estado === 200, String(repeat.estado));
  const claveRep = [...store.m.keys()].find(k => /_rep\./.test(k));
  const metaRep = claveRep ? await store.getMetadata(claveRep) : null;
  afirmar('el intento trae metadata con origen repeat',
    metaRep && metaRep.metadata.origen === 'repeat', JSON.stringify(metaRep));
  afirmar('y guarda el puntaje redondeado',
    metaRep && metaRep.metadata.puntaje === 0.55, JSON.stringify(metaRep && metaRep.metadata.puntaje));
  afirmar('y guarda lo que dijo',
    metaRep && metaRep.metadata.dicho === 'She es my friend');
  afirmar('y guarda el texto esperado',
    metaRep && metaRep.metadata.textoEn === 'She is my friend');

  // Sin origen se asume translate (compatibilidad con lo ya guardado).
  const metaAnterior = await store.getMetadata(audios[0]);
  afirmar('los audios sin origen quedan como translate',
    metaAnterior && metaAnterior.metadata.origen === 'translate', JSON.stringify(metaAnterior));
}

console.log('\n' + (mal ? mal + ' FALLARON, ' + ok + ' OK' : 'TODO OK: ' + ok + ' pruebas'));
process.exit(mal ? 1 : 0);
