/*
  Pruebas de assets/semanas.js: como el indice agrupa las lecciones por semana
  y las despliega por dia.

      node tools/probar-semanas.mjs

  Carga assets/semanas.js de verdad, no una copia. Solo necesita `window`: el
  modulo no toca el DOM.
*/
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
globalThis.window = globalThis;
new Function(fs.readFileSync(path.join(RAIZ, 'assets', 'semanas.js'), 'utf8'))();
const S = globalThis.Semanas;

let ok = 0, mal = 0;
function afirmar(nombre, condicion, detalle) {
  if (condicion) { ok++; console.log('  OK   ' + nombre); }
  else { mal++; console.log('  FALLA ' + nombre + (detalle ? '  -> ' + detalle : '')); }
}
function igual(nombre, obtenido, esperado) {
  afirmar(nombre, obtenido === esperado, 'esperaba "' + esperado + '" y dio "' + obtenido + '"');
}

const DIAS = ['lun', 'mar', 'mie', 'jue', 'vie', 'sab', 'dom'];

// Las 7 lecciones de una semana, como las deja lessons.json, pero en desorden
// a proposito: el orden de los dias lo tiene que poner el modulo.
function semana(n, inicio, tema) {
  const lunes = S.fecha(inicio);
  return DIAS.map(function (dia, i) {
    const f = new Date(lunes.getFullYear(), lunes.getMonth(), lunes.getDate() + i);
    const iso = f.getFullYear() + '-' + String(f.getMonth() + 1).padStart(2, '0')
      + '-' + String(f.getDate()).padStart(2, '0');
    return { id: 'leccion-s' + n + '-' + dia, titulo: 'S0' + n + ' X · Tema ' + dia,
             semana: n, dia: dia, fecha: iso, tema: tema };
  }).reverse();
}
const sueltas = [{ id: 'leccion-01', titulo: 'Familia y edades' },
                 { id: 'leccion-02', titulo: 'Control de pasaportes' }];
const todas = sueltas.concat(semana(1, '2026-11-09', 'Unidad 1 · Países'),
                             semana(2, '2026-11-16', 'Unidad 1 · Trabajos'));

console.log('\n--- Agrupar ---');
let a = S.agrupar(todas, new Date(2026, 10, 11, 15, 30));   // miercoles 11 de nov, a la tarde
igual('dos semanas', a.grupos.length, 2);
igual('la mas nueva arriba', a.grupos[0].semana, 2);
igual('etiqueta con el rango', a.grupos[1].etiqueta, 'Semana 1 · 9–15 nov');
igual('tema de la semana', a.grupos[1].tema, 'Unidad 1 · Países');
igual('de lunes a domingo', a.grupos[1].lecciones.map(function (l) { return l.dia; }).join(','), DIAS.join(','));
igual('las sueltas aparte y en su orden', a.sueltas.map(function (l) { return l.titulo; }).join(' | '),
      'Familia y edades | Control de pasaportes');
igual('abierta, la semana de hoy', a.abierta, 1);
igual('la leccion de hoy es la del miercoles', a.grupos[1].deHoy.join(), 'leccion-s1-mie');
igual('la otra semana no tiene leccion de hoy', a.grupos[0].deHoy.length, 0);

console.log('\n--- Cual va abierta ---');
igual('domingo 15 a la noche: todavia la 1', S.agrupar(todas, new Date(2026, 10, 15, 23, 59)).abierta, 1);
igual('lunes 16 a la madrugada: la 2', S.agrupar(todas, new Date(2026, 10, 16, 0, 1)).abierta, 2);
igual('en la pausa de fin de año: la ultima que empezo', S.agrupar(todas, new Date(2026, 11, 24)).abierta, 2);
igual('antes de empezar el curso: la mas cercana', S.agrupar(todas, new Date(2026, 10, 1)).abierta, 1);

console.log('\n--- Fechas y titulos ---');
igual('la fecha es local, no UTC', S.fecha('2026-11-09').getDate(), 9);
igual('una fecha mal escrita no es fecha', S.fecha('9/11/2026'), null);
igual('una semana que cruza de mes', S.rango(S.fecha('2026-11-30'), S.fecha('2026-12-06')), '30 nov – 6 dic');
igual('una semana que cruza de año', S.rango(S.fecha('2026-12-28'), S.fecha('2027-01-03')), '28 dic – 3 ene');
igual('titulo del dia',
      S.tituloDelDia({ titulo: 'S01 Lun · Países y nacionalidades', dia: 'lun', fecha: '2026-11-09' }),
      'Lun 9 · Países y nacionalidades');
igual('sabado, con tilde',
      S.tituloDelDia({ titulo: 'S01 Sáb · Preguntas y respuestas', dia: 'sab', fecha: '2026-11-14' }),
      'Sáb 14 · Preguntas y respuestas');
igual('sin fecha igual sirve', S.tituloDelDia({ titulo: 'S03 Mar · Algo', dia: 'mar' }), 'Mar · Algo');
igual('un titulo sin prefijo queda igual', S.sinPrefijo('Familia y edades'), 'Familia y edades');

console.log('\n--- Sin semanas ---');
a = S.agrupar(sueltas, new Date(2026, 10, 11));
igual('ningun grupo', a.grupos.length, 0);
igual('nada abierto', a.abierta, null);
igual('todas sueltas', a.sueltas.length, 2);
a = S.agrupar([{ id: 'x', titulo: 'S04 Lun · Sin fecha', semana: 4, dia: 'lun' }], new Date());
igual('una semana sin fechas: etiqueta sin rango', a.grupos[0].etiqueta, 'Semana 4');
igual('una semana sin fechas: igual va abierta', a.abierta, 4);
igual('una "semana" que no es un numero entero va con las sueltas',
      S.agrupar([{ id: 'y', semana: '1' }]).sueltas.length, 1);

console.log('\n' + ok + ' bien, ' + mal + ' mal');
process.exit(mal ? 1 : 0);
