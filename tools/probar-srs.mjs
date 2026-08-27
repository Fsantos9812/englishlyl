/*
  Pruebas del registro de repeticion espaciada: SM-2, union entre dispositivos
  y tamaño del envio. Sin Netlify ni despliegue.

      node tools/probar-srs.mjs
*/
import * as L from '../netlify/functions/_logica.mjs';

const nuevoStore = () => {
  const m = new Map();
  return {
    m,
    async setJSON(k, v) { m.set(k, JSON.stringify(v)); },
    async set(k, v) { m.set(k, v); },
    async get(k, o) {
      const e = m.get(k);
      if (e === undefined) return null;
      return (o && o.type === 'json') ? JSON.parse(e) : e;
    },
    async delete(k) { m.delete(k); },
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

/* ---------------- SM-2, replicado del cliente para poder probarlo ---------------- */
// assets/srs.js corre en el navegador; esta copia sirve para verificar que la
// progresion de intervalos sea la de SM-2 y que los cortes de puntaje peguen.

function calidadDe(p) {
  if (p >= 0.85) return 5;
  if (p >= 0.70) return 4;
  if (p >= 0.55) return 3;
  if (p >= 0.40) return 2;
  return 1;
}

function programar(estado, q) {
  let ease = estado ? estado.e : 2.5;
  let reps = estado ? estado.r : 0;
  let interval = estado ? estado.i : 0;
  if (q < 3) { reps = 0; interval = 1; }
  else {
    reps = reps + 1;
    if (reps === 1) interval = 1;
    else if (reps === 2) interval = 6;
    else interval = Math.round(interval * ease);
    if (interval < 1) interval = 1;
  }
  ease = Math.max(1.3, ease + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)));
  return { i: interval, e: ease, r: reps };
}

console.log('\nPUNTAJE -> CALIDAD');
afirmar('100% es calidad máxima', calidadDe(1) === 5);
afirmar('85% (el corte de "¡Muy bien!") no reinicia', calidadDe(0.85) === 5);
afirmar('55% (el corte de "Intentá de nuevo") todavía avanza', calidadDe(0.55) === 3);
afirmar('54% reinicia la tarjeta', calidadDe(0.54) < 3, String(calidadDe(0.54)));
afirmar('0% reinicia', calidadDe(0) < 3);

console.log('\nPROGRESIÓN DE INTERVALOS');
{
  let e = null;
  e = programar(e, 5); afirmar('primer acierto -> 1 día', e.i === 1, String(e.i));
  e = programar(e, 5); afirmar('segundo acierto -> 6 días', e.i === 6, String(e.i));
  e = programar(e, 5); afirmar('tercero -> 6 x facilidad', e.i > 6 && e.i < 30, String(e.i));
  const antes = e.i;
  e = programar(e, 1); afirmar('un error tira el intervalo a 1 día', e.i === 1, antes + ' -> ' + e.i);
  afirmar('y reinicia las repeticiones', e.r === 0);
  afirmar('la facilidad baja pero no por debajo de 1.3', e.e >= 1.3, String(e.e));
}
{
  // Una tarjeta siempre fallada no puede hundir la facilidad indefinidamente
  let e = null;
  for (let i = 0; i < 20; i++) e = programar(e, 1);
  afirmar('la facilidad tiene piso en 1.3 tras 20 fallos', e.e === 1.3, String(e.e));
}

console.log('\nUNIÓN ENTRE DISPOSITIVOS');
{
  const compu = {
    'l1:repeat:0': { i: 6, e: 2.5, r: 2, d: '2026-09-01', v: 2, u: '2026-08-20T10:00:00.000Z' },
    'l1:repeat:1': { i: 1, e: 2.4, r: 1, d: '2026-08-22', v: 1, u: '2026-08-20T10:05:00.000Z' }
  };
  const celu = {
    'l1:repeat:0': { i: 15, e: 2.6, r: 3, d: '2026-09-10', v: 3, u: '2026-08-21T09:00:00.000Z' },
    'l1:type:0':   { i: 1, e: 2.5, r: 1, d: '2026-08-22', v: 1, u: '2026-08-21T09:02:00.000Z' }
  };

  const unido = L.unirSrs(compu, celu);
  afirmar('junta las tarjetas de los dos', Object.keys(unido).length === 3, String(Object.keys(unido).length));
  afirmar('en la repetida gana el repaso más nuevo',
    unido['l1:repeat:0'].i === 15, String(unido['l1:repeat:0'].i));
  afirmar('no pierde la que sólo tenía la computadora', !!unido['l1:repeat:1']);

  // El mismo dispositivo, mandando estado viejo, no debe retroceder nada
  const alReves = L.unirSrs(unido, compu);
  afirmar('un envío viejo NO hace retroceder la tarjeta',
    alReves['l1:repeat:0'].i === 15, String(alReves['l1:repeat:0'].i));

  const conVacio = L.unirSrs(unido, {});
  afirmar('un dispositivo sin historia no borra nada',
    Object.keys(conVacio).length === 3, String(Object.keys(conVacio).length));

  afirmar('ignora entradas basura',
    Object.keys(L.unirSrs({}, { 'x': null, 'y': 'texto' })).length === 0);
}

console.log('\nPERSISTENCIA EN EL SERVIDOR');
{
  const store = nuevoStore();
  await L.crearUsuario(store, { usuario: 'ana', nombre: 'Ana' });

  const r1 = await L.guardarProgreso(store, 'ana', 'Ana', {
    lecciones: {},
    racha: { dias: ['2026-08-21'] },
    srs: { 'l1:repeat:0': { i: 6, e: 2.5, r: 2, d: '2026-09-01', u: '2026-08-20T10:00:00.000Z' } }
  });
  afirmar('devuelve el srs unido al guardar', !!r1.cuerpo.srs['l1:repeat:0']);

  const r2 = await L.guardarProgreso(store, 'ana', 'Ana', {
    lecciones: {}, racha: { dias: [] }, srs: {}
  });
  afirmar('un envío vacío no borra las tarjetas guardadas',
    Object.keys(r2.cuerpo.srs).length === 1, JSON.stringify(r2.cuerpo.srs));

  const resumen = L.resumenSrs(r2.cuerpo.srs, '2026-09-05');
  afirmar('el resumen cuenta las vencidas', resumen.vencenHoy === 1, JSON.stringify(resumen));
  afirmar('y ninguna madura todavía', resumen.maduras === 0, JSON.stringify(resumen));

  await L.borrarUsuario(store, 'ana');
  afirmar('borrar al alumno se lleva su srs',
    ![...store.m.keys()].some(k => k.startsWith('srs/ana')));
}

console.log('\nTAMAÑO DEL ENVÍO (el servidor rechaza a los 256 KB)');
{
  // Curso grande y realista: 15 lecciones x 22 frases x 2 modos = 660 tarjetas
  const tarjetas = {};
  for (let l = 1; l <= 15; l++) {
    for (const modo of ['repeat', 'type']) {
      for (let i = 0; i < 22; i++) {
        tarjetas['leccion-' + String(l).padStart(2, '0') + '-tema-largo:' + modo + ':' + i] = {
          i: 15, e: 2.53, r: 4, d: '2026-09-10', v: 6,
          u: '2026-08-21T09:02:11.482Z', p: 0.923, b: 1
        };
      }
    }
  }
  const bytes = JSON.stringify({ lecciones: {}, racha: { dias: [] }, srs: tarjetas }).length;
  const kb = Math.round(bytes / 1024);
  console.log('    660 tarjetas -> ' + kb + ' KB de 256 KB');
  afirmar('un curso de 15 lecciones entra en el límite', bytes < 256 * 1024, kb + ' KB');
  afirmar('y con margen de sobra (menos de la mitad)', bytes < 128 * 1024, kb + ' KB');
}

console.log('\n' + (mal ? mal + ' FALLARON, ' + ok + ' OK' : 'TODO OK: ' + ok + ' pruebas'));
process.exit(mal ? 1 : 0);
