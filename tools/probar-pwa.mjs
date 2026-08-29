/*
  Pruebas de assets/pwa.js: cómo se entera la app de que quedó vieja, y qué
  hace al respecto.

      node tools/probar-pwa.mjs

  Carga assets/pwa.js de verdad, con un `document`, un `navigator.serviceWorker`
  y un `fetch` de mentira.

  Lo que se cuida acá es una asimetría: quedarse una vuelta más con la versión
  vieja es un fastidio; recargar en bucle deja al alumno sin poder usar la app.
  Por eso el chequeo de versión —que es la red de seguridad para cuando el
  service worker falla— avisa y no recarga solo. Recargar solo queda para los
  caminos que sí saben que la versión nueva ya está lista.
*/
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const FUENTE = fs.readFileSync(path.join(RAIZ, 'assets', 'pwa.js'), 'utf8');

/**
 * Monta el entorno y carga pwa.js.
 *   miVersion   la que dice el <script src="assets/pwa.js?v=N">
 *   suVersion   la que dice el sw.js del servidor
 *   controlador si al cargar ya había un service worker al mando
 */
function montar({ miVersion = '50', suVersion = '50', controlador = true, oculto = false } = {}) {
  const hechos = { recargas: 0, desregistros: 0, cachesBorrados: 0 };
  const oyentes = {};      // evento -> [fn]
  let barra = null;

  const nodo = (tag) => ({
    tagName: String(tag).toUpperCase(),
    className: '', type: '', textContent: '',
    hijos: [],
    setAttribute() {},
    getAttribute() { return null; },
    appendChild(h) { this.hijos.push(h); return h; },
    addEventListener(ev, fn) { this.on = this.on || {}; this.on[ev] = fn; }
  });

  globalThis.window = globalThis;
  globalThis.location = { reload() { hechos.recargas += 1; } };
  globalThis.document = {
    get hidden() { return oculto; },
    activeElement: null,
    body: { appendChild(n) { barra = n; return n; } },
    createElement: nodo,
    addEventListener(ev, fn) { (oyentes[ev] = oyentes[ev] || []).push(fn); },
    querySelector(sel) {
      if (sel.indexOf('pwa.js?v=') !== -1) {
        return { getAttribute: () => 'assets/pwa.js?v=' + miVersion };
      }
      return null;                       // ni sesión, ni grabando, ni #instalar
    },
    getElementById() { return null; }
  };
  globalThis.addEventListener = function (ev, fn) { (oyentes[ev] = oyentes[ev] || []).push(fn); };
  globalThis.setInterval = function () { return 0; };
  globalThis.fetch = function () {
    return Promise.resolve({
      ok: true,
      text: () => Promise.resolve("const VERSION = '" + suVersion + "';\nlo demas no importa")
    });
  };
  globalThis.caches = {
    keys: () => Promise.resolve(['lecciones-v49', 'lecciones-v50']),
    delete: () => { hechos.cachesBorrados += 1; return Promise.resolve(true); }
  };

  const swOyentes = {};
  const registro = {
    waiting: null, installing: null,
    update() {},
    unregister() { hechos.desregistros += 1; return Promise.resolve(true); },
    addEventListener(ev, fn) { swOyentes[ev] = fn; }
  };
  // Node trae su propio `navigator` de solo lectura: hay que redefinirlo.
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true, writable: true, value: {
    serviceWorker: {
      controller: controlador ? {} : null,
      register: () => Promise.resolve(registro),
      getRegistrations: () => Promise.resolve([registro]),
      addEventListener(ev, fn) { (oyentes['sw:' + ev] = oyentes['sw:' + ev] || []).push(fn); }
    }
  } });

  new Function(FUENTE)();

  const disparar = (ev) => (oyentes[ev] || []).forEach((fn) => fn());
  return {
    hechos,
    disparar,
    cargar: () => disparar('load'),
    cambioDeControlador: () => disparar('sw:controllerchange'),
    verBarra: () => barra,
    textoBarra: () => (barra ? barra.hijos.map((h) => h.textContent).join(' | ') : null),
    tocarActualizar: () => { const b = barra && barra.hijos.find((h) => h.tagName === 'BUTTON'); if (b) b.on.click(); },
    mostrarPagina: () => { oculto = false; },
    ocultarPagina: () => { oculto = true; }
  };
}

const asentar = () => new Promise((r) => setTimeout(r, 0));

let ok = 0, mal = 0;
function afirmar(nombre, condicion, detalle) {
  if (condicion) { ok++; console.log('  OK   ' + nombre); }
  else { mal++; console.log('  FALLA ' + nombre + (detalle ? '  -> ' + detalle : '')); }
}
function igual(nombre, obtenido, esperado) {
  afirmar(nombre, obtenido === esperado, 'esperaba "' + esperado + '" y dio "' + obtenido + '"');
}

console.log('\n--- La página quedó vieja ---');
let app = montar({ miVersion: '49', suVersion: '50' });
app.cargar();
await asentar();
await asentar();
afirmar('avisa que hay una versión nueva', app.verBarra() !== null);
igual('y NO recarga sola: recargar es lo que ya no funcionó', app.hechos.recargas, 0);

console.log('\n--- Y el botón hace la limpieza, no otra recarga ---');
app.tocarActualizar();
await asentar();
await asentar();
igual('desregistra el service worker', app.hechos.desregistros, 1);
igual('borra los caches viejos', app.hechos.cachesBorrados, 2);
igual('y recién ahí recarga', app.hechos.recargas, 1);

console.log('\n--- La página está al día ---');
app = montar({ miVersion: '50', suVersion: '50' });
app.cargar();
await asentar();
await asentar();
igual('no molesta con ningún aviso', app.verBarra(), null);
igual('ni recarga', app.hechos.recargas, 0);

console.log('\n--- Con la app en segundo plano se espera ---');
app = montar({ miVersion: '49', suVersion: '50', oculto: true });
app.cargar();
await asentar();
await asentar();
igual('no aparece nada mientras no la está mirando', app.verBarra(), null);
app.mostrarPagina();
app.disparar('visibilitychange');
await asentar();
await asentar();
afirmar('y al volver, ahí sí avisa', app.verBarra() !== null);

console.log('\n--- Cambio de service worker al mando ---');
app = montar({ miVersion: '50', suVersion: '50', controlador: true });
app.cargar();
await asentar();
app.cambioDeControlador();
await asentar();
igual('con uno anterior, la versión nueva entró: recarga', app.hechos.recargas, 1);

app = montar({ miVersion: '50', suVersion: '50', controlador: false });
app.cargar();
await asentar();
app.cambioDeControlador();
await asentar();
igual('sin uno anterior es la primera instalación: no recarga', app.hechos.recargas, 0);

console.log('');
if (mal) {
  console.log('FALLARON ' + mal + ' de ' + (ok + mal) + ' pruebas');
  process.exit(1);
}
console.log('TODO OK: ' + ok + ' pruebas');
