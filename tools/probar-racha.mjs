/*
  Pruebas de la racha: la regla de las dos mitades, el corte de días y la
  unión entre dispositivos.

      node tools/probar-racha.mjs

  Carga assets/racha.js de verdad, no una copia. Necesita `window` y un
  localStorage de mentira, nada más: el módulo no toca el DOM.
*/
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

const almacen = new Map();
globalThis.window = globalThis;
globalThis.localStorage = {
  getItem: (k) => (almacen.has(k) ? almacen.get(k) : null),
  setItem: (k, v) => almacen.set(k, String(v)),
  removeItem: (k) => almacen.delete(k)
};

new Function(fs.readFileSync(path.join(RAIZ, 'assets', 'racha.js'), 'utf8'))();
const R = globalThis.Racha;

let ok = 0, mal = 0;
function afirmar(nombre, condicion, detalle) {
  if (condicion) { ok++; console.log('  OK   ' + nombre); }
  else { mal++; console.log('  FALLA ' + nombre + (detalle ? '  -> ' + detalle : '')); }
}
function igual(nombre, obtenido, esperado) {
  afirmar(nombre, obtenido === esperado, 'esperaba "' + esperado + '" y dio "' + obtenido + '"');
}
const limpiar = () => almacen.clear();

// Los días se guardan en hora local, así que las fechas de prueba también.
function diaLocal(desplazamiento) {
  const d = new Date();
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate() + desplazamiento);
  return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0')
       + '-' + String(x.getDate()).padStart(2, '0');
}

console.log('\n--- Una sola mitad no alcanza ---');
limpiar();
let r = R.registrar('leccion');
afirmar('la lección sola no suma el día', r.subio === false);
afirmar('avisa que es nueva', r.nuevo === true);
igual('y dice qué falta', r.falta, 'repasar el vocabulario');
igual('la racha sigue en cero', R.leer().actual, 0);

r = R.registrar('leccion');
afirmar('repetir la misma actividad no vuelve a avisar', r.nuevo === false);
afirmar('y sigue sin sumar', r.subio === false);

console.log('\n--- Con las dos, suma ---');
r = R.registrar('repaso');
afirmar('ahora sí suma el día', r.subio === true);
igual('ya no falta nada', r.falta, '');
igual('la racha arrancó', R.leer().actual, 1);
igual('leer() no reporta pendientes', R.leer().faltaHoy, '');

console.log('\n--- Ya sumado, no vuelve a sumar ---');
r = R.registrar('repaso');
afirmar('no suma dos veces el mismo día', r.subio === false);
igual('la racha no se movió', R.leer().actual, 1);

console.log('\n--- El orden inverso da lo mismo ---');
limpiar();
r = R.registrar('repaso');
afirmar('el repaso solo no suma', r.subio === false);
igual('y pide la lección', r.falta, 'practicar una lección');
r = R.registrar('leccion');
afirmar('completando con la lección, suma', r.subio === true);

console.log('\n--- Qué falta, en texto ---');
limpiar();
igual('sin nada hecho, faltan las dos',
  R.queFalta(), 'practicar una lección y repasar el vocabulario');
igual('leer() lo expone igual', R.leer().faltaHoy,
  'practicar una lección y repasar el vocabulario');
R.registrar('leccion');
igual('hecha una, falta la otra', R.queFalta(), 'repasar el vocabulario');
igual('faltantes() devuelve una', R.faltantes().length, 1);
igual('con su clave', R.faltantes()[0].clave, 'repaso');

console.log('\n--- Lo de ayer no cuenta para hoy ---');
limpiar();
// medio día hecho, pero con fecha de ayer: no debe arrastrarse
almacen.set('lecciones:racha-hoy', JSON.stringify({ fecha: diaLocal(-1), hechas: { leccion: true } }));
igual('el estado viejo se descarta', R.queFalta(),
  'practicar una lección y repasar el vocabulario');
afirmar('y la lección de hoy sola no completa', R.registrar('repaso').subio === false);

console.log('\n--- La corrida de días sigue funcionando ---');
limpiar();
almacen.set('lecciones:racha', JSON.stringify({ dias: [diaLocal(-2), diaLocal(-1)], mejor: 2 }));
igual('dos días seguidos hasta ayer', R.leer().actual, 2);
afirmar('está en riesgo: practicó ayer, hoy no', R.leer().enRiesgo === true);
R.registrar('leccion');
R.registrar('repaso');
igual('hoy completo la lleva a tres', R.leer().actual, 3);

limpiar();
almacen.set('lecciones:racha', JSON.stringify({ dias: [diaLocal(-5), diaLocal(-4)], mejor: 2 }));
igual('con un hueco, la corrida viva es cero', R.leer().actual, 0);
afirmar('y queda marcada como vencida', R.leer().vencida === true);
igual('pero el récord se conserva', R.leer().mejor, 2);

console.log('\n--- Reiniciar borra las dos claves ---');
limpiar();
R.registrar('leccion');
R.borrar();
igual('se limpió lo hecho hoy', R.queFalta(),
  'practicar una lección y repasar el vocabulario');
igual('y el historial', R.leer().actual, 0);

console.log('\n--- Unir con otro dispositivo ---');
limpiar();
almacen.set('lecciones:racha', JSON.stringify({ dias: [diaLocal(-1)], mejor: 1 }));
afirmar('adoptar suma días que no tenía',
  R.adoptar({ dias: [diaLocal(-2)], mejor: 1 }) === true);
igual('y la corrida crece', R.leer().actual, 2);
afirmar('adoptar lo mismo dos veces no cambia nada',
  R.adoptar({ dias: [diaLocal(-2)], mejor: 1 }) === false);

console.log('');
if (mal) {
  console.log('FALLARON ' + mal + ' de ' + (ok + mal) + ' pruebas');
  process.exit(1);
}
console.log('TODO OK: ' + ok + ' pruebas');
