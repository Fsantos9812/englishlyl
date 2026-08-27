/*
  Service worker: deja el sitio usable sin internet.

  Al instalar guarda el nucleo (indice, assets, iconos) y ademas cada leccion
  que figure en lessons.json, asi el alumno puede practicar en el subte.

  ⚠️ Al editar cualquier cosa dentro de assets/, subi VERSION y el ?v= de los
     HTML: el nombre del cache cambia y se descarta el viejo.
*/
const VERSION = '23';
const CACHE = 'lecciones-v' + VERSION;

const NUCLEO = [
  './',
  'index.html',
  '404.html',
  'lessons.json',
  'manifest.webmanifest',
  'assets/lesson.css?v=' + VERSION,
  'assets/lesson.js?v=' + VERSION,
  'assets/index.js?v=' + VERSION,
  'assets/racha.js?v=' + VERSION,
  'assets/auth.js?v=' + VERSION,
  'assets/srs.js?v=' + VERSION,
  'assets/sync.js?v=' + VERSION,
  'assets/pwa.js?v=' + VERSION,
  'assets/export.js?v=' + VERSION,
  'assets/icon-192.png',
  'assets/icon-512.png',
  'assets/icon-maskable-512.png',
  'assets/apple-touch-icon.png',
  'assets/favicon-32.png'
];

// Un archivo que falta no debe tumbar toda la instalacion.
async function guardarTodo(cache, urls) {
  const resultados = await Promise.allSettled(urls.map(function (u) { return cache.add(u); }));
  const fallados = urls.filter(function (_, i) { return resultados[i].status === 'rejected'; });
  if (fallados.length) console.warn('[sw] No se pudieron cachear:', fallados);
}

self.addEventListener('install', function (event) {
  event.waitUntil((async function () {
    const cache = await caches.open(CACHE);
    await guardarTodo(cache, NUCLEO);

    // Las lecciones salen del manifiesto: no hay lista duplicada que mantener.
    try {
      const r = await fetch('lessons.json', { cache: 'no-cache' });
      if (r.ok) {
        const m = await r.json();
        const archivos = (m.lecciones || []).map(function (l) { return l.archivo; });
        if (archivos.length) await guardarTodo(cache, archivos);
      }
    } catch (err) {
      console.warn('[sw] Sin lessons.json en la instalación:', err.message);
    }
    self.skipWaiting();
  })());
});

self.addEventListener('activate', function (event) {
  event.waitUntil((async function () {
    const nombres = await caches.keys();
    await Promise.all(nombres.map(function (n) {
      return (n.indexOf('lecciones-v') === 0 && n !== CACHE) ? caches.delete(n) : null;
    }));
    await self.clients.claim();
  })());
});

// HTML y manifiesto: primero la red, para que una lección nueva se vea enseguida.
async function redPrimero(request, cache) {
  try {
    const respuesta = await fetch(request);
    if (respuesta && respuesta.ok) cache.put(request, respuesta.clone());
    // Una leccion borrada del sitio no puede seguir viva en el cache: si el
    // servidor dice que ya no esta, se tira la copia en vez de servirla.
    else if (respuesta && respuesta.status === 404) await cache.delete(request);
    return respuesta;
  } catch (err) {
    const guardada = await cache.match(request, { ignoreSearch: false });
    if (guardada) return guardada;
    if (request.mode === 'navigate') {
      return (await cache.match('index.html')) || (await cache.match('./')) || Response.error();
    }
    throw err;
  }
}

// assets versionados: primero el cache, que para eso son inmutables.
async function cachePrimero(request, cache) {
  const guardada = await cache.match(request);
  if (guardada) return guardada;
  const respuesta = await fetch(request);
  if (respuesta && respuesta.ok) cache.put(request, respuesta.clone());
  return respuesta;
}

self.addEventListener('fetch', function (event) {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Las funciones nunca se cachean: el panel del profe y las entregas tienen
  // que ir siempre a la red.
  if (url.pathname.startsWith('/.netlify/')) return;

  // El panel del profe tampoco: su propio pie promete que no se guarda para uso
  // offline, y la estrategia de HTML lo estaba cacheando igual en la 1ra visita.
  if (url.pathname.endsWith('/profe.html')) return;

  const esHTML = request.mode === 'navigate' || url.pathname.endsWith('.html');
  const esManifiesto = url.pathname.endsWith('lessons.json');

  event.respondWith((async function () {
    const cache = await caches.open(CACHE);
    return (esHTML || esManifiesto)
      ? redPrimero(request, cache)
      : cachePrimero(request, cache);
  })());
});
