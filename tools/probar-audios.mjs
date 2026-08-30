/*
  Pruebas de la organizacion de los audios: rutas, filtrado por leccion y
  marcado de escuchados. Sin Netlify ni despliegue.

      node tools/probar-audios.mjs
*/
import * as L from '../netlify/functions/_logica.mjs';

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

console.log('\nRUTAS DE AUDIO');

const store = nuevoStore();
await L.crearUsuario(store, { usuario: 'ana', nombre: 'Ana' });
await L.crearUsuario(store, { usuario: 'beto', nombre: 'Beto' });

const guardar = (u, leccion, frase, cuando) => L.guardarAudio(store, u, u, {
  audio: Buffer.alloc(10).toString('base64'),
  leccion, frase, id: 'x' + frase, mime: 'audio/webm', grabadoEn: cuando
});

await guardar('ana', 'leccion-04-familia', 0, '2026-08-20T10:00:00.000Z');
await guardar('ana', 'leccion-04-familia', 1, '2026-08-21T10:00:00.000Z');
await guardar('ana', 'leccion-05-compras', 0, '2026-08-22T10:00:00.000Z');
await guardar('beto', 'leccion-04-familia', 0, '2026-08-21T11:00:00.000Z');

const claves = [...store.m.keys()].filter(k => k.startsWith('audio/'));
afirmar('la lección es un segmento propio de la ruta',
  claves.every(k => k.split('/').length === 4), claves[0]);

const deAna4 = claves.find(k => k.startsWith('audio/ana/leccion-04-familia/'));
afirmar('el nombre lleva número de frase y fecha',
  /\/01_20260820T100000_/.test(deAna4), deAna4);

const info = L.leerClaveDeAudio(deAna4);
afirmar('la clave se puede descomponer',
  info && info.usuario === 'ana' && info.leccion === 'leccion-04-familia'
  && info.frase === 1 && !!info.grabadoEn, JSON.stringify(info));

console.log('\nCOMPATIBILIDAD CON LO YA GUARDADO');

store.m.set('audio/ana/leccion-03-viajes-02-abc.webm', 'x');
const viejo = L.leerClaveDeAudio('audio/ana/leccion-03-viajes-02-abc.webm');
afirmar('entiende el formato viejo y plano',
  viejo && viejo.leccion === 'leccion-03-viajes' && viejo.frase === 2, JSON.stringify(viejo));
afirmar('lo marca como formato viejo', viejo.formato === 'viejo');

console.log('\nFILTRADO');

const deAna = await L.listarAudios(store, { usuario: 'ana' });
afirmar('lista los 3 nuevos + 1 viejo de Ana', deAna.length === 4, String(deAna.length));
afirmar('ordena por fecha, la más nueva primero',
  deAna[0].leccion === 'leccion-05-compras', deAna[0].leccion);

const unaLeccion = await L.listarAudios(store, { usuario: 'ana', leccion: 'leccion-04-familia' });
afirmar('filtra por lección de un alumno', unaLeccion.length === 2, String(unaLeccion.length));

const todaLaLeccion = await L.listarAudios(store, { leccion: 'leccion-04-familia' });
  afirmar('la misma lección de TODOS los alumnos', todaLaLeccion.length === 3, String(todaLaLeccion.length));

  // Sólo el detalle carga metadata para no pagar costo en los resúmenes.
  const sinDetalle = await L.listarAudios(store, { usuario: 'ana', leccion: 'leccion-04-familia' });
  afirmar('sin conDetalle no trae origen', sinDetalle[0].origen === undefined);
  const conDetalle = await L.listarAudios(store, { usuario: 'ana', leccion: 'leccion-04-familia', conDetalle: true });
  afirmar('con conDetalle trae origen', conDetalle[0].origen === 'translate');

console.log('\nESCUCHADOS');

const lecciones = await L.resumenDeLecciones(store);
const l4 = lecciones.find(x => x.leccion === 'leccion-04-familia');
afirmar('resumen por lección cuenta alumnos',
  l4 && l4.total === 3 && l4.alumnos === 2, JSON.stringify(l4));
afirmar('todo arranca como pendiente', l4.pendientes === 3, String(l4.pendientes));

await L.marcarEscuchado(store, todaLaLeccion[0].clave, true);
const tras = await L.resumenDeLecciones(store);
afirmar('marcar escuchado baja los pendientes',
  tras.find(x => x.leccion === 'leccion-04-familia').pendientes === 2);

await L.marcarEscuchado(store, todaLaLeccion[0].clave, false);
const tras2 = await L.resumenDeLecciones(store);
afirmar('se puede desmarcar',
  tras2.find(x => x.leccion === 'leccion-04-familia').pendientes === 3);

afirmar('rechaza una clave que no es de audio',
  (await L.marcarEscuchado(store, 'progreso/ana.json', true)).estado === 400);

console.log('\nRESUMEN DEL PANEL');

const resumen = await L.resumenDeAlumnos(store);
const ana = resumen.find(x => x.usuario === 'ana');
afirmar('trae contadores, no la lista entera de audios',
  ana.audios === 4 && ana.audiosPendientes === 4, JSON.stringify({ a: ana.audios, p: ana.audiosPendientes }));
afirmar('desglosa por lección', ana.audiosPorLeccion.length === 3,
  JSON.stringify(ana.audiosPorLeccion.map(x => x.leccion)));

await L.borrarUsuario(store, 'ana');
afirmar('borrar al alumno se lleva sus escuchados',
  ![...store.m.keys()].some(k => k.startsWith('escuchado/ana')));
afirmar('y también sus audios',
  ![...store.m.keys()].some(k => k.startsWith('audio/ana/')));

console.log('\n' + (mal ? mal + ' FALLARON, ' + ok + ' OK' : 'TODO OK: ' + ok + ' pruebas'));
process.exit(mal ? 1 : 0);
