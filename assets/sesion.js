/*
  Sesión de práctica: un ejercicio por vez, en pantalla completa.

  Se abre ENCIMA de la lección, no la reemplaza. La lección sigue siendo la
  pantalla donde se busca, se repasa lo hecho y se ve el vocabulario; esto es
  el modo de practicar. Si la sesión no cierra, la lección sigue funcionando.

  No tiene datos propios: los pide a window.Leccion, que expone assets/lesson.js.
  Registrar una respuesta acá actualiza también la tarjeta de la lección de
  atrás, el contador de la barra y el bloque — todo pasa por el mismo setResult.
*/
(function () {
  'use strict';

  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;

  const NOMBRES = { repeat: '🎧 Listen and Repeat', type: '✍️ Listen and Type' };

  let caja = null;           // el overlay
  let cola = [];
  let indice = 0;
  let combo = 0;
  let mejorCombo = 0;
  let xpGanado = 0;
  let aciertos = 0;
  const puntajes = [];

  const quieto = function () {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  };

  function el(tag, cls, texto) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (texto != null) n.textContent = texto;
    return n;
  }

  /* ---------------- La cola ---------------- */

  const DESFASE = 5;   // ejercicios entre escribir una frase y tener que decirla

  /**
   * Intercala poniendo cada Repeat DESPUES de su Type, y separado.
   *
   * El orden importaba mas de lo que parecia: la tarjeta de Repeat muestra la
   * frase en ingles Y su traduccion, que es justo la respuesta del Type. Con el
   * Repeat adelante, el Type dejaba de medir nada — el alumno acababa de leer
   * la respuesta. Asi que primero se pregunta (Type, sin nada a la vista) y
   * despues se refuerza (Repeat, ya con el texto delante).
   *
   * Esto vale para frases que el alumno YA vio. Las nuevas no pasan por aca:
   * las presenta el Repeat antes, en armarCola().
   */
  function entrelazar(tipos, repeticiones) {
    const salida = tipos.slice();
    const posicion = {};
    tipos.forEach(function (t, n) { posicion[t.idx] = n; });

    // Se procesan en el orden en que salieron sus Type, para que las
    // inserciones no se pisen entre si.
    const ordenados = repeticiones.slice().sort(function (a, b) {
      const pa = posicion[a.idx], pb = posicion[b.idx];
      return (pa === undefined ? Infinity : pa) - (pb === undefined ? Infinity : pb);
    });

    let insertados = 0;
    ordenados.forEach(function (r) {
      const base = posicion[r.idx];
      // Sin Type para esa frase (no existe o quedo fuera), va al final.
      const destino = (base === undefined)
        ? salida.length
        : Math.min(base + insertados + DESFASE, salida.length);
      salida.splice(destino, 0, r);
      insertados += 1;
    });
    return salida;
  }

  // Primero lo nuevo, presentado; despues lo que ya vio, preguntado. Dentro de
  // cada grupo, lo que no hizo nunca antes que lo peor puntuado, que es lo que
  // más necesita volver a practicar.
  function armarCola() {
    const L = window.Leccion;
    const porModo = { type: [], repeat: [] };

    [['type', L.type], ['repeat', L.repeat]].forEach(function (par) {
      const sec = par[0];
      // Sin reconocimiento de voz, Listen and Repeat no se puede puntuar:
      // se deja afuera en vez de meter ejercicios que van a fallar.
      if (sec === 'repeat' && !SR) return;
      par[1].forEach(function (frase, i) {
        porModo[sec].push({ sec: sec, idx: i, frase: frase, puntaje: L.puntajeDe(sec, i) });
      });
    });

    const prioridad = function (lista) {
      return lista.slice().sort(function (a, b) {
        const aSin = typeof a.puntaje !== 'number';
        const bSin = typeof b.puntaje !== 'number';
        if (aSin !== bSin) return aSin ? -1 : 1;     // sin hacer, primero
        if (aSin) return a.idx - b.idx;               // entre nuevos, en orden
        return a.puntaje - b.puntaje;                 // entre hechos, el peor
      });
    };

    // Primer encuentro: presentar antes de preguntar.
    //
    // El Type pide la traduccion sin nada a la vista. Con una frase que el
    // alumno nunca vio eso no mide nada: le pide la respuesta antes de darsela,
    // y deja un 0 guardado que arrastra el promedio de la leccion por algo que
    // todavia no se le habia ensenado. La tarjeta de Repeat es la
    // unica presentacion que existe (audio, ingles y espanol a la vez), asi que
    // la frase nueva entra solo por ahi: su Type espera a la proxima pasada,
    // cuando ya hay algo que medir.
    //
    // Nueva = ni el Type ni el Repeat tienen puntaje. Haberla visto de un lado
    // alcanza para que el otro deje de ser en frio.
    const nuevas = {};
    if (SR) {
      porModo.repeat.forEach(function (r) {
        if (typeof r.puntaje !== 'number') nuevas[r.idx] = true;
      });
      porModo.type.forEach(function (t) {
        if (typeof t.puntaje === 'number') delete nuevas[t.idx];
      });
    }
    // Sin reconocimiento de voz no hay Repeat, o sea que no hay presentacion
    // posible: `nuevas` queda vacio a proposito y el Type pasa igual, que es
    // todo lo que ese navegador puede ofrecer.
    const esNueva = function (e) { return nuevas[e.idx] === true; };
    const yaVista = function (e) { return !esNueva(e); };

    const presentacion  = prioridad(porModo.repeat.filter(esNueva));
    const tipos         = prioridad(porModo.type.filter(yaVista));
    const repeticiones  = prioridad(porModo.repeat.filter(yaVista));

    // La leccion entera, sin tope. Salir con la ✕ no pierde nada: cada
    // respuesta se guarda al momento, asi que volver a entrar retoma con lo
    // que falta adelante.
    return presentacion.concat(entrelazar(tipos, repeticiones));
  }

  /** Cuantos hay en total y cuantos sin hacer, para el boton de la leccion. */
  function resumenDeCola() {
    const cola = armarCola();
    const pendientes = cola.filter(function (e) {
      return typeof e.puntaje !== 'number';
    }).length;
    return { total: cola.length, pendientes: pendientes };
  }

  /* ---------------- Armado ---------------- */

  function abrir() {
    cola = armarCola();
    if (!cola.length) return;
    indice = 0; combo = 0; mejorCombo = 0; xpGanado = 0; aciertos = 0;
    puntajes.length = 0;

    caja = el('div', 'sesion');
    caja.setAttribute('role', 'dialog');
    caja.setAttribute('aria-modal', 'true');
    caja.setAttribute('aria-label', 'Sesión de práctica');

    const barra = el('div', 'sesion-barra');
    const salir = el('button', 'sesion-salir', '✕');
    salir.type = 'button';
    salir.setAttribute('aria-label', 'Salir de la sesión');
    salir.addEventListener('click', cerrar);
    const pista = el('div', 'sesion-pista');
    const relleno = el('span');
    pista.appendChild(relleno);
    const cuenta = el('span', 'sesion-cuenta');
    barra.appendChild(salir);
    barra.appendChild(pista);
    barra.appendChild(cuenta);

    const escenario = el('div', 'sesion-escenario');

    caja.appendChild(barra);
    caja.appendChild(escenario);
    document.body.appendChild(caja);
    document.body.classList.add('sesion-abierta');

    caja.__relleno = relleno;
    caja.__cuenta = cuenta;
    caja.__escenario = escenario;

    document.addEventListener('keydown', alEscape);
    mostrar();
  }

  function alEscape(e) { if (e.key === 'Escape' && caja) cerrar(); }

  function cerrar() {
    if (!caja) return;
    document.removeEventListener('keydown', alEscape);
    caja.remove();
    caja = null;
    document.body.classList.remove('sesion-abierta');
    if (window.Sesion && window.Sesion.alCerrar) window.Sesion.alCerrar();
  }

  function pintarProgreso() {
    const hechos = indice;
    caja.__relleno.style.width = Math.round(hechos / cola.length * 100) + '%';
    caja.__cuenta.textContent = Math.min(indice + 1, cola.length) + ' / ' + cola.length;
  }

  /* ---------------- Un ejercicio ---------------- */

  function mostrar() {
    if (indice >= cola.length) { terminar(); return; }
    const ej = cola[indice];
    pintarProgreso();

    const escenario = caja.__escenario;
    escenario.textContent = '';

    const tarjeta = el('div', 'sesion-tarjeta');
    if (!quieto()) tarjeta.classList.add('entra');

    tarjeta.appendChild(el('p', 'sesion-tipo', NOMBRES[ej.sec]));

    let responder;

    if (ej.sec === 'type') {
      responder = montarType(tarjeta, ej);
    } else {
      responder = montarRepeat(tarjeta, ej);
    }

    escenario.appendChild(tarjeta);
    if (responder.foco) responder.foco();
  }

  /** Escuchar en inglés y escribir en español. */
  function montarType(tarjeta, ej) {
    const escuchar = el('button', 'btn-listen btn-escuchar', '🔊 Escuchar');
    escuchar.type = 'button';
    escuchar.setAttribute('aria-label', 'Escuchar la frase en inglés');
    escuchar.addEventListener('click', function () { window.Voz.decir(ej.frase.en, window.Leccion.langEn); });
    const fila = el('div', 'row sesion-centro');
    fila.appendChild(escuchar);
    tarjeta.appendChild(fila);

    const campo = el('input', 'type-input');
    campo.type = 'text';
    campo.placeholder = 'Escribí en español lo que escuchaste';
    campo.autocomplete = 'off';
    campo.lang = 'es';
    campo.setAttribute('aria-label', 'Escribí en español lo que escuchaste');
    tarjeta.appendChild(campo);

    const accion = el('button', 'btn-listen sesion-accion', '✔️ Revisar');
    accion.type = 'button';
    tarjeta.appendChild(accion);

    window.Voz.decir(ej.frase.en, window.Leccion.langEn);

    const revisar = function () {
      const puntaje = window.Texto.similitud(campo.value, ej.frase.es, 'es');
      campo.readOnly = true;
      resolver(ej, puntaje, ej.frase.es, ej.frase.en);
    };
    accion.addEventListener('click', revisar);
    campo.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); revisar(); }
    });

    return { foco: function () { campo.focus(); } };
  }

  /** Escuchar la frase en inglés y repetirla en voz alta. */
  function montarRepeat(tarjeta, ej) {
    const frase = el('p', 'sesion-frase', ej.frase.en);
    frase.lang = 'en';
    tarjeta.appendChild(frase);
    tarjeta.appendChild(el('p', 'hint sesion-centro', ej.frase.es));

    const escuchar = el('button', 'btn-record', '🔊 Escuchar');
    escuchar.type = 'button';
    escuchar.addEventListener('click', function () { window.Voz.decir(ej.frase.en, window.Leccion.langEn); });

    const grabar = el('button', 'btn-listen sesion-accion', '🎤 Decirlo');
    grabar.type = 'button';

    const fila = el('div', 'row sesion-centro');
    fila.appendChild(escuchar);
    tarjeta.appendChild(fila);
    tarjeta.appendChild(grabar);

    const estado = el('p', 'hint sesion-centro', '');
    estado.setAttribute('aria-live', 'polite');
    tarjeta.appendChild(estado);

    grabar.addEventListener('click', function () {
      const rec = new SR();
      rec.lang = window.Leccion.langEn;
      rec.interimResults = false;
      rec.maxAlternatives = 1;
      grabar.disabled = true;
      grabar.classList.add('recording');
      estado.textContent = '🎙️ Escuchando…';
      rec.onresult = function (ev) {
        const dicho = ev.results[0][0].transcript;
        const puntaje = window.Texto.similitud(dicho, ej.frase.en, 'en');
        resolver(ej, puntaje, ej.frase.en, 'Dijiste: "' + dicho + '"');
      };
      rec.onerror = function (ev) {
        grabar.disabled = false;
        grabar.classList.remove('recording');
        estado.textContent = 'No se pudo escuchar (' + ev.error + '). Revisá el permiso de micrófono.';
      };
      rec.onend = function () { grabar.classList.remove('recording'); };
      try { rec.start(); }
      catch (err) {
        grabar.disabled = false;
        estado.textContent = 'No se pudo iniciar el micrófono.';
      }
    });

    return { foco: function () { grabar.focus(); } };
  }

  /* ---------------- Corrección ---------------- */

  function resolver(ej, puntaje, esperado, detalle) {
    const v = window.Texto.veredicto(puntaje);
    const acierto = puntaje >= 0.85;
    puntajes.push(puntaje);

    const vale = window.XP.valeIntento(puntaje, combo);
    if (acierto) { combo += 1; aciertos += 1; if (combo > mejorCombo) mejorCombo = combo; }
    else combo = 0;

    const ganado = vale.base + vale.extra;
    xpGanado += ganado;
    window.XP.sumar(ganado);

    // Esto es lo que hace que la lección de atrás quede al día: mismo camino
    // que responder en la tarjeta, así se marca, se recuentan bloques y sincroniza.
    window.Leccion.registrar(ej.sec, ej.idx, puntaje);

    mostrarVeredicto(v, puntaje, esperado, detalle, vale);
  }

  function mostrarVeredicto(v, puntaje, esperado, detalle, vale) {
    const panel = el('div', 'sesion-veredicto ' + v.cls);
    panel.setAttribute('role', 'status');
    if (!quieto()) panel.classList.add('sube');

    const titulo = el('p', 'sesion-veredicto-txt',
      v.text + ' (' + Math.round(puntaje * 100) + '%)');
    panel.appendChild(titulo);

    if (puntaje < 0.85) panel.appendChild(el('p', 'sesion-esperado', 'Era: "' + esperado + '"'));
    else if (detalle && detalle !== esperado) panel.appendChild(el('p', 'sesion-esperado', detalle));

    const premios = el('p', 'sesion-premios');
    premios.appendChild(el('span', 'sesion-xp', '+' + (vale.base + vale.extra) + ' XP'));
    if (vale.extra) {
      const c = el('span', 'sesion-combo', '🔥 ' + combo + ' seguidas · +' + vale.extra);
      if (!quieto()) c.classList.add('late');
      premios.appendChild(c);
    }
    panel.appendChild(premios);

    const seguir = el('button', 'btn-listen sesion-accion',
      indice + 1 >= cola.length ? '🏁 Terminar' : 'Siguiente →');
    seguir.type = 'button';
    seguir.addEventListener('click', function () { indice += 1; mostrar(); });
    panel.appendChild(seguir);

    caja.__escenario.appendChild(panel);
    seguir.focus();
  }

  /* ---------------- Final ---------------- */

  function terminar() {
    pintarProgreso();
    const escenario = caja.__escenario;
    escenario.textContent = '';

    const fin = el('div', 'sesion-tarjeta sesion-fin');
    if (!quieto()) fin.classList.add('entra');

    fin.appendChild(el('p', 'sesion-tipo', '🏁 Sesión terminada'));

    const promedio = puntajes.length
      ? Math.round(puntajes.reduce(function (a, b) { return a + b; }, 0) / puntajes.length * 100) : 0;

    const marcador = el('div', 'sesion-marcador');
    [['+' + xpGanado, 'XP ganados'],
     [aciertos + '/' + puntajes.length, 'aciertos'],
     ['🔥 ' + mejorCombo, 'mejor racha'],
     [promedio + '%', 'promedio']].forEach(function (par) {
      const c = el('div', 'sesion-dato');
      c.appendChild(el('strong', null, par[0]));
      c.appendChild(el('span', null, par[1]));
      marcador.appendChild(c);
    });
    fin.appendChild(marcador);

    const r = window.XP.resumen();
    fin.appendChild(el('p', 'hint sesion-centro', r.metaCumplida
      ? '🎯 Meta del día cumplida: ' + r.hoy + ' XP'
      : 'Llevás ' + r.hoy + ' XP hoy · te faltan ' + r.faltaParaLaMeta + ' para la meta'));

    const otra = el('button', 'btn-listen sesion-accion', '▶ Otra sesión');
    otra.type = 'button';
    otra.addEventListener('click', function () { cerrar(); abrir(); });
    const volver = el('button', 'btn-record sesion-accion', '← Volver a la lección');
    volver.type = 'button';
    volver.addEventListener('click', cerrar);

    if (armarCola().length) fin.appendChild(otra);
    fin.appendChild(volver);

    escenario.appendChild(fin);
    (armarCola().length ? otra : volver).focus();
  }

  /* ---------------- API ---------------- */

  window.Sesion = {
    abrir: abrir,
    hayCola: function () { return armarCola().length; },
    resumen: resumenDeCola,
    // Solo lectura, para poder comprobar el orden sin recorrer la sesion entera:
    // que cada Repeat caiga DESPUES de su Type es facil de romper sin notarlo.
    orden: function () {
      return armarCola().map(function (e) { return e.sec + ':' + e.idx; });
    },
    alCerrar: null      // lo completa lesson.js para repintar el botón
  };
})();
