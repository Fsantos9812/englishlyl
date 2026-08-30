/*
  Repaso de vocabulario con repetición espaciada.

  El algoritmo ya estaba: assets/srs.js implementa SM-2, guarda el estado por
  tarjeta y el servidor lo une entre dispositivos. Lo único que faltaba era esto,
  la pantalla, que es lo que su comentario de cabecera venía anticipando.

  Funciona igual que Listen and Type y no es casualidad: se escucha la palabra en
  inglés y se escribe en español. La palabra NO se muestra hasta responder, si no
  no habría nada que escuchar. La calidad no la elige el alumno: la puntúa
  window.Texto.similitud(), la misma función de la lección. Es la decisión que ya
  estaba tomada en srs.js y acá se respeta.

  Anda sin conexión: las palabras salen de vocabulario.json (cacheado por el
  service worker), la voz es la del navegador y el estado vive en localStorage.
*/
(function () {
  'use strict';

  const NUEVAS_POR_DIA = 10;   // techo de palabras nuevas, para no volcar el curso entero

  const cajaTarjeta = document.getElementById('tarjeta');
  const cajaFin = document.getElementById('fin');
  const cajaVacia = document.getElementById('vacia');
  const elProgreso = document.getElementById('repaso-progreso');
  if (!cajaTarjeta) return;

  let cola = [];
  let indice = 0;
  const puntajes = [];
  const malas = [];          // palabras con puntaje < 0.85, para sugerir repaso
  let lecciones = {};        // mapping id -> archivo, para armar links

  function el(tag, cls, texto) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (texto != null) n.textContent = texto;
    return n;
  }

  /* ---------------- Aviso de racha ---------------- */

  function avisar(texto) {
    const t = el('div', 'toast');
    t.setAttribute('role', 'status');
    t.textContent = texto;
    document.body.appendChild(t);
    void t.offsetWidth;   // reflow forzado: rAF no dispara en segundo plano
    t.classList.add('show');
    setTimeout(function () {
      t.classList.remove('show');
      setTimeout(function () { t.remove(); }, 300);
    }, 3600);
  }

  // Repasar es una de las dos mitades del día; la otra es practicar la lección.
  function marcarRacha() {
    if (!window.Racha) return;
    const r = window.Racha.registrar('repaso');
    if (r.subio) {
      if (r.record) avisar('🏆 ¡Nuevo récord! ' + r.actual + ' días seguidos');
      else if (r.actual === 1) avisar('🔥 ¡Arrancaste tu racha! Volvé mañana para seguirla');
      else avisar('🔥 ¡' + r.actual + ' días seguidos!');
      return;
    }
    if (r.nuevo && r.falta) avisar('✅ Ya repasaste hoy. Te falta ' + r.falta + ' para sumar el día');
  }

  /* ---------------- Una tarjeta ---------------- */

  function pintarProgreso() {
    if (elProgreso) elProgreso.textContent = (indice + 1) + ' / ' + cola.length;
  }

  function mostrar() {
    if (indice >= cola.length) { terminar(); return; }
    const p = cola[indice];
    const idiomaEn = p.langEn || 'en-US';
    const estado = window.SRS.estadoDe(p.leccion, p.clave);

    cajaTarjeta.textContent = '';
    pintarProgreso();

    const card = el('div', 'card repaso-card');

    const origen = el('p', 'repaso-origen', p.tituloLeccion || p.leccion);
    if (!estado) origen.appendChild(el('span', 'level', 'nueva'));
    card.appendChild(origen);

    // El botón de escuchar ES la pregunta: la palabra no se muestra todavía.
    const escuchar = el('button', 'btn-listen btn-escuchar', '🔊 Escuchar');
    escuchar.type = 'button';
    escuchar.setAttribute('aria-label', 'Escuchar la palabra en inglés');
    escuchar.addEventListener('click', function () { window.Voz.decir(p.en, idiomaEn); });
    const filaEscuchar = el('div', 'row');
    filaEscuchar.appendChild(escuchar);
    card.appendChild(filaEscuchar);

    // Se revela recién al responder: antes sería regalar la respuesta.
    const revelada = el('p', 'repaso-pregunta');
    revelada.lang = 'en';
    revelada.hidden = true;
    card.appendChild(revelada);

    const campo = el('input', 'type-input');
    campo.type = 'text';
    campo.id = 'respuesta';
    campo.placeholder = 'Escribí en español lo que escuchaste';
    campo.autocomplete = 'off';
    campo.lang = 'es';
    // Sin la palabra adentro: el nombre accesible no puede cantar la respuesta.
    campo.setAttribute('aria-label', 'Escribí en español lo que escuchaste');
    card.appendChild(campo);

    const fila = el('div', 'row');
    const revisar = el('button', 'btn-record', '✔️ Revisar');
    revisar.type = 'button';
    fila.appendChild(revisar);
    card.appendChild(fila);

    const estadoEl = el('div', 'status');
    estadoEl.id = 'repaso-estado';
    estadoEl.setAttribute('aria-live', 'polite');
    card.appendChild(estadoEl);

    cajaTarjeta.appendChild(card);

    // Se dice sola al aparecer: en un repaso, tocar Escuchar cada vez es un
    // paso de más. El botón queda igual para volver a oírla.
    window.Voz.decir(p.en, idiomaEn);
    campo.focus();

    let respondida = false;

    function responder() {
      if (respondida) { siguiente(); return; }
      respondida = true;

      const puntaje = window.Texto.similitud(campo.value, p.es, 'es');
      const v = window.Texto.veredicto(puntaje);
      puntajes.push(puntaje);
      if (puntaje < 0.85) malas.push(p);

      // Acá se cierra el círculo: SM-2 programa cuándo vuelve esta palabra.
      const programado = window.SRS.registrar(p.leccion, p.clave, puntaje);

      // Ahora sí se muestra: se escuchó, se escribió, se ve cómo se escribe.
      revelada.textContent = p.en;
      revelada.hidden = false;

      estadoEl.className = 'status ' + v.cls;
      estadoEl.textContent = v.text + ' (' + Math.round(puntaje * 100) + '%)'
        + (puntaje < 0.85 ? ' — era "' + p.es + '"' : '')
        + ' · vuelve en ' + programado.i + (programado.i === 1 ? ' día' : ' días');

      campo.readOnly = true;
      revisar.textContent = indice + 1 >= cola.length ? '🏁 Terminar' : 'Siguiente →';
      revisar.focus();

      marcarRacha();
      if (window.Sync) window.Sync.programar();
    }

    function siguiente() { indice += 1; mostrar(); }

    revisar.addEventListener('click', responder);
    campo.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); responder(); }
    });
  }

  /* ---------------- Final ---------------- */

  function terminar() {
    cajaTarjeta.hidden = true;
    if (elProgreso) elProgreso.textContent = '';
    cajaFin.hidden = false;

    const promedio = puntajes.length
      ? Math.round(puntajes.reduce(function (a, b) { return a + b; }, 0) / puntajes.length * 100)
      : 0;
    const r = window.SRS.resumen();

    document.getElementById('fin-titulo').textContent =
      '🏁 Repasaste ' + puntajes.length + (puntajes.length === 1 ? ' tarjeta' : ' tarjetas');

    const detalle = document.getElementById('fin-detalle');
    detalle.textContent =
      'Promedio ' + promedio + '%. Te quedan ' + r.vencenHoy
      + (r.vencenHoy === 1 ? ' tarjeta' : ' tarjetas') + ' para hoy.';

    // Enlace a las palabras flojas, agrupadas por lección.
    const cuerpo = cajaFin.querySelector('.row') || cajaFin;
    const viejas = cajaFin.querySelectorAll('.repaso-siguiente');
    viejas.forEach(function (n) { n.remove(); });

    if (malas.length) {
      const porLeccion = {};
      malas.forEach(function (p) {
        if (!porLeccion[p.leccion]) porLeccion[p.leccion] = { titulo: p.tituloLeccion || p.leccion, palabras: [] };
        porLeccion[p.leccion].palabras.push(p.en);
      });
      const sugerencias = el('div', 'repaso-siguiente');
      sugerencias.appendChild(el('p', 'hint', 'Te costaron estas palabras:'));
      Object.keys(porLeccion).forEach(function (id) {
        const grupo = porLeccion[id];
        const fila = el('div', 'repaso-grupo');
        fila.appendChild(el('strong', null, grupo.titulo + ': '));
        fila.appendChild(document.createTextNode(grupo.palabras.join(', ')));
        if (lecciones[id]) {
          const enlace = el('a', 'btn-volver', 'Practicar lección →');
          enlace.href = lecciones[id];
          fila.appendChild(enlace);
        }
        sugerencias.appendChild(fila);
      });
      cuerpo.parentNode.insertBefore(sugerencias, cuerpo);
    }

    if (r.vencenHoy) {
      const seguir = el('button', 'btn-listen', '🔄 Seguir repasando');
      seguir.type = 'button';
      seguir.addEventListener('click', function () { location.reload(); });
      cuerpo.appendChild(seguir);
    }
  }

  function sinNada(total) {
    cajaTarjeta.hidden = true;
    cajaVacia.hidden = false;
    const r = window.SRS.resumen();
    document.getElementById('vacia-detalle').textContent = total
      ? 'Ya repasaste todo lo que vencía. Tenés ' + r.tarjetas
        + (r.tarjetas === 1 ? ' tarjeta en estudio' : ' tarjetas en estudio')
        + ', de las cuales ' + r.maduras + ' ya están firmes. Volvé mañana.'
      : 'Todavía no hay vocabulario en el curso.';
  }

  /* ---------------- Arranque ---------------- */

  Promise.all([
    fetch('vocabulario.json', { cache: 'no-cache' })
      .then(function (r) { return r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status)); }),
    fetch('lessons.json', { cache: 'no-cache' })
      .then(function (r) { return r.ok ? r.json() : { lecciones: [] }; })
      .catch(function () { return { lecciones: [] }; })
  ])
    .then(function (par) {
      const m = par[0];
      (par[1].lecciones || []).forEach(function (l) { lecciones[l.id] = l.archivo; });
      const palabras = (m && m.palabras) || [];
      cola = window.SRS.colaDeRepaso(palabras, NUEVAS_POR_DIA);
      if (!cola.length) {
        // No se le puede exigir repasar lo que no existe: si no habia nada
        // vencido, la mitad del dia se da por cumplida igual.
        marcarRacha();
        sinNada(palabras.length);
        return;
      }
      mostrar();
    })
    .catch(function (err) {
      console.error('[repaso] no se pudo leer vocabulario.json:', err);
      cajaTarjeta.textContent = '';
      cajaTarjeta.appendChild(el('p', 'hint',
        'No se pudo cargar el vocabulario. Recargá la página; si sigue igual, falta el archivo vocabulario.json.'));
    });
})();
