import React, { useState, useEffect, useMemo, useRef } from "react";

/* ────────────────────────────────────────────────────────────
   Generador de guiones — Módulo 1
   Curso de inglés A1 con narrativa inmersiva de viaje.
   Paso 1 del pipeline: produce el guion crudo que luego
   consume la skill assimil-formatter en Modo Adaptar.
   ──────────────────────────────────────────────────────────── */

const STORE_KEY = "modulo1-guiones-ingles";

const PHASES = [
  { id: 1, nombre: "Llegada", abbr: "LLG", lecciones: [1, 2, 3], contexto: "Presentaciones, saludos, números, pasaporte, inmigración", recomb: "primeras palabras" },
  { id: 2, nombre: "Alojamiento", abbr: "ALJ", lecciones: [4, 5, 6], contexto: "Hotel, check-in, habitación, posesivos, fechas, horas", recomb: "primeras palabras" },
  { id: 3, nombre: "La ciudad", abbr: "CIU", lecciones: [7, 8, 9], contexto: "Direcciones, transporte, planificación turística", recomb: "recombinación creciente" },
  { id: 4, nombre: "Necesidades básicas", abbr: "NEC", lecciones: [10, 11, 12], contexto: "Compras, supermercado, ropa, comida, precios", recomb: "recombinación creciente" },
  { id: 5, nombre: "Social", abbr: "SOC", lecciones: [13, 14, 15], contexto: "Restaurante, conocer gente, hobbies, conversación", recomb: "recombinación amplia" },
  { id: 6, nombre: "Emergencias", abbr: "EMG", lecciones: [16, 17, 18], contexto: "Salud, seguridad, pedir ayuda urgente", recomb: "recombinación amplia" },
];

const INTEGRACION = [3, 6, 9, 12, 15, 18];

const faseDe = (n) => PHASES.find((f) => f.lecciones.includes(n));

/* ── utilidades ─────────────────────────────────────────── */

const kebab = (s = "") =>
  s.toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim().replace(/\s+/g, "-").slice(0, 48) || "sin-titulo";

const mrz = (s, len = 44) =>
  (s.toUpperCase().replace(/\s/g, "<") + "<".repeat(len)).slice(0, len);

const pad2 = (n) => String(n).padStart(2, "0");

/* ── construcción del prompt ────────────────────────────── */

function buildPrompt(n, lessons, protagonista, cast) {
  const fase = faseDe(n);
  const esIntegracion = INTEGRACION.includes(n);
  const previas = Object.keys(lessons).map(Number).filter((k) => k < n).sort((a, b) => a - b);

  const resumen = previas.length
    ? previas.map((k) => {
        const L = lessons[k];
        const voc = (L.vocabulario_nuevo || []).map((v) => v.en).join(", ") || "(ninguno — lección de integración)";
        const est = (L.estructuras || []).map((e) => e.nombre).join(" | ") || "(ninguna — lección de integración)";
        return `Lección ${k} · "${L.titulo_en}"\n  · vocabulario: ${voc}\n  · estructuras ya explicadas: ${est}`;
      }).join("\n")
    : "(ninguna todavía — esta es la primera lección del módulo)";

  const elenco = cast.length
    ? cast.map((c) => `${c.nombre} — ${c.rol}`).join("; ")
    : "(aún sin definir: crea aquí el elenco recurrente, 4–6 personajes con nombre fijo)";

  const reglaIntegracion = esIntegracion
    ? `ESTA ES UNA LECCIÓN DE INTEGRACIÓN (${INTEGRACION.join(", ")}). Regla de oro innegociable:
- "vocabulario_nuevo" DEBE ser un array vacío [].
- "estructuras" DEBE ser un array vacío [].
- Todo el diálogo recombina exclusivamente léxico y gramática de las lecciones ${n - 2} y ${n - 1} (y anteriores).
- Rellena "actividades" con el simulacro inmersivo: escenario realista, diálogo guiado con huecos, role-play en parejas, mini-proyecto y una pregunta de autoevaluación.`
    : `Lección regular. Presupuesto A1 estricto:
- "vocabulario_nuevo": entre 8 y 12 palabras de contenido (sustantivos, verbos, adjetivos). Artículos, pronombres y preposiciones NO cuentan y no deben listarse.
- "estructuras": 1, máximo 2.
- "actividades" debe ser null.`;

  return `Eres experto en didáctica de idiomas (enfoque comunicativo y por tareas) y en diseño curricular. Escribes el GUION CRUDO de una lección de inglés para hispanohablantes de Latinoamérica, dentro de un curso con narrativa inmersiva de viaje.

PARÁMETROS FIJOS
- Variante: inglés americano (apartment, subway, vacation, elevator...).
- L1: español latinoamericano. Asume interferencia típica.
- Nivel: A1 temprano (A1.1) en las 18 lecciones. Nunca A2.
- El estudiante ES el protagonista y habla en el diálogo en primera persona (hablante "Tú"). Nombre del protagonista: ${protagonista || "[nombre]"}.
- Elenco recurrente actual: ${elenco}

FILOSOFÍA
1. Storytelling emocional: alguien que llega a un país extranjero y resuelve situaciones cotidianas reales.
2. Reciclaje activo: reutiliza vocabulario y estructuras de lecciones previas; nada se abandona.
3. Utilidad inmediata: prioriza frases de supervivencia lingüística.
4. Anticipar interferencia L1: para cada estructura nueva, señala dónde el inglés se construye distinto al español (orden de palabras, to be vs "tener" para edad/frío/hambre, auxiliar do, ausencia de doble negación, preposiciones que sobran o faltan).

LECCIÓN A ESCRIBIR
- Número: ${n} de 18
- Fase: ${fase.id}. ${fase.nombre}
- Contexto central de la fase: ${fase.contexto}
- Señal de diseño: ${fase.recomb} — apóyate más en vocabulario ya visto que en léxico nuevo.
- Diálogo: entre 8 y 10 líneas.

${reglaIntegracion}

LECCIONES YA GENERADAS (no repitas estas explicaciones gramaticales; sí recicla su vocabulario)
${resumen}

FORMATO DE SALIDA
Responde ÚNICAMENTE con un objeto JSON válido, sin preámbulo, sin comentarios y sin bloques de código markdown. Sé conciso: frases breves, sin relleno.

{
  "titulo_en": "título corto en inglés",
  "titulo_es": "título corto en español",
  "objetivo": "Puedo ... (can-do statement en español, una frase)",
  "vocabulario_nuevo": [{"en":"palabra","es":"traducción"}],
  "vocabulario_reciclado": [{"item":"palabra o frase","leccion":1}],
  "estructuras": [{"nombre":"nombre de la estructura","explicacion":"una o dos frases","contraste_es":"en qué se diferencia del español"}],
  "dialogo": [{"n":1,"hablante":"Officer","linea":"Good morning! Passport, please."}],
  "contraste_l1": ["error típico de hispanohablantes a anticipar"],
  "continuidad": "qué lección(es) previas conviene revisar y por qué",
  "personajes": [{"nombre":"","rol":""}],
  "actividades": null
}

Reglas del diálogo: hablantes con nombre propio del elenco (o Tú para el estudiante); inglés natural y sencillo, nada de frases de libro de texto imposibles de oír en la calle. En personajes incluye solo los que aparecen en esta lección, reusando los nombres del elenco actual cuando ya existan.

REGLAS DE JSON — CRÍTICAS
- La comilla doble (") se usa SOLO como delimitador de claves y valores. NUNCA dentro de un texto.
- Si necesitas citar una frase en inglés dentro de una explicación, usa comillas simples: 'Where are you from?'.
- Sin saltos de línea dentro de los valores. Sin comas finales antes de } o ].
- Nada antes de la primera llave ni después de la última.`;
}

/* ── llamada al modelo ──────────────────────────────────── */

async function pedirAlModelo(prompt) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 1000,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) throw new Error(`El servidor respondió ${res.status}.`);

  const data = await res.json();
  return (data.content || [])
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("");
}

/* ¿Esta comilla cierra el valor, o está dentro del texto?
   Tras un cierre real solo puede venir , : } ] o el final. Y si viene
   una coma, lo siguiente tiene que ser un valor JSON de verdad — no
   una palabra suelta como en: "orden fijo: "Where are you from?", nunca" */
function cierreReal(src, i) {
  let j = i + 1;
  while (j < src.length && /\s/.test(src[j])) j++;
  const c = src[j];
  if (c === undefined || c === "}" || c === "]" || c === ":") return true;
  if (c !== ",") return false;

  let k = j + 1;
  while (k < src.length && /\s/.test(src[k])) k++;
  const d = src[k];
  if (d === undefined) return true;
  if (d === '"' || d === "{" || d === "[" || d === "-" || (d >= "0" && d <= "9")) return true;
  return src.startsWith("true", k) || src.startsWith("false", k) || src.startsWith("null", k);
}

/* Repara los fallos habituales del JSON generado: comillas dobles sin
   escapar dentro de un valor, saltos de línea crudos, y comas o llaves
   colgando por truncamiento. */
function repararJSON(src) {
  let out = "";
  let dentro = false;
  const pila = [];

  for (let i = 0; i < src.length; i++) {
    const c = src[i];

    if (dentro) {
      if (c === "\\") { out += c + (src[i + 1] || ""); i++; continue; }
      if (c === '"') {
        if (cierreReal(src, i)) { dentro = false; out += c; }
        else out += '\\"';                          // comilla interna: escapar
        continue;
      }
      if (c === "\n" || c === "\r") { out += "\\n"; continue; }
      if (c === "\t") { out += "\\t"; continue; }
      out += c;
      continue;
    }

    if (c === '"') { dentro = true; out += c; continue; }
    if (c === "{" || c === "[") pila.push(c === "{" ? "}" : "]");
    if (c === "}" || c === "]") pila.pop();
    if (c === ",") {
      let j = i + 1;
      while (j < src.length && /\s/.test(src[j])) j++;
      if (src[j] === "}" || src[j] === "]") continue;  // coma colgante
    }
    out += c;
  }

  if (dentro) out += '"';
  while (pila.length) out += pila.pop();
  return out;
}

function extraerJSON(texto) {
  let t = String(texto).replace(/```json/gi, "").replace(/```/g, "").trim();
  const ini = t.indexOf("{");
  if (ini === -1) throw new Error("La respuesta no contenía ningún guion.");
  const fin = t.lastIndexOf("}");
  t = fin > ini ? t.slice(ini, fin + 1) : t.slice(ini);

  try { return JSON.parse(t); } catch (_) { /* seguimos al reparador */ }
  try { return JSON.parse(repararJSON(t)); } catch (_) {
    throw new Error("El modelo devolvió un JSON mal formado.");
  }
}

function normalizar(obj) {
  return {
    titulo_en: obj.titulo_en || "Untitled",
    titulo_es: obj.titulo_es || "Sin título",
    objetivo: obj.objetivo || "",
    vocabulario_nuevo: Array.isArray(obj.vocabulario_nuevo) ? obj.vocabulario_nuevo : [],
    vocabulario_reciclado: Array.isArray(obj.vocabulario_reciclado) ? obj.vocabulario_reciclado : [],
    estructuras: Array.isArray(obj.estructuras) ? obj.estructuras : [],
    dialogo: Array.isArray(obj.dialogo) ? obj.dialogo : [],
    contraste_l1: Array.isArray(obj.contraste_l1) ? obj.contraste_l1 : [],
    continuidad: obj.continuidad || "",
    personajes: Array.isArray(obj.personajes) ? obj.personajes : [],
    actividades: obj.actividades || null,
  };
}

/* ── markdown de salida ─────────────────────────────────── */

function toMarkdown(n, L) {
  const fase = faseDe(n);
  const esInt = INTEGRACION.includes(n);
  const out = [];

  out.push(`# Guion — Lección ${pad2(n)}`);
  out.push(`**Fase:** ${fase.id}. ${fase.nombre} | **Nivel CEFR:** A1 | **Título:** ${L.titulo_en} / ${L.titulo_es}`);
  out.push("");
  out.push(`**Objetivo:** ${L.objetivo}`);
  out.push("");

  out.push(
    esInt
      ? `**Vocabulario nuevo:** — (lección de integración: no se introduce vocabulario nuevo)`
      : `**Vocabulario nuevo:** ${L.vocabulario_nuevo.map((v) => `${v.en} (${v.es})`).join(", ")}`
  );
  out.push("");

  out.push(
    L.vocabulario_reciclado.length
      ? `**Vocabulario reciclado:** ${L.vocabulario_reciclado.map((v) => `${v.item} (lección ${v.leccion})`).join(", ")}`
      : `**Vocabulario reciclado:** — (lección 1, no aplica)`
  );
  out.push("");

  if (esInt) {
    out.push(`**Estructura nueva:** — (lección de integración: no se introduce gramática nueva)`);
  } else {
    out.push(`**Estructura nueva:**`);
    L.estructuras.forEach((e) => {
      out.push(`- *${e.nombre}* — ${e.explicacion}`);
      if (e.contraste_es) out.push(`  - Contraste con el español: ${e.contraste_es}`);
    });
  }
  out.push("");

  if (L.contraste_l1.length) {
    out.push(`**Contraste L1:**`);
    L.contraste_l1.forEach((c) => out.push(`- ${c}`));
    out.push("");
  }

  out.push(`**Diálogo:**`);
  L.dialogo.forEach((d, i) => out.push(`${d.n || i + 1}. ${d.hablante}: ${d.linea}`));
  out.push("");

  if (esInt && L.actividades) {
    const a = L.actividades;
    out.push(`**Actividades de integración:**`);
    if (a.escenario) out.push(`- Escenario: ${a.escenario}`);
    if (a.dialogo_huecos) out.push(`- Diálogo guiado con huecos: ${a.dialogo_huecos}`);
    if (a.role_play) out.push(`- Role-play: ${a.role_play}`);
    if (a.mini_proyecto) out.push(`- Mini-proyecto: ${a.mini_proyecto}`);
    if (a.autoevaluacion) out.push(`- Autoevaluación: ${a.autoevaluacion}`);
    out.push("");
  }

  out.push(`**Continuidad:** ${L.continuidad}`);
  out.push("");
  return out.join("\n");
}

/* ── presupuesto ────────────────────────────────────────── */

function presupuesto(n, L) {
  const esInt = INTEGRACION.includes(n);
  const p = L.vocabulario_nuevo.length;
  const f = L.dialogo.length;
  const e = L.estructuras.length;
  return [
    { label: "palabras nuevas", valor: p, rango: esInt ? "0" : "8–12", ok: esInt ? p === 0 : p >= 8 && p <= 12 },
    { label: "frases del diálogo", valor: f, rango: "8–10", ok: f >= 8 && f <= 10 },
    { label: "estructuras", valor: e, rango: esInt ? "0" : "1–2", ok: esInt ? e === 0 : e >= 1 && e <= 2 },
  ];
}

/* ── estilos ────────────────────────────────────────────── */

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Bodoni+Moda:opsz,wght@6..96,400;500&family=Public+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap');

.pp {
  --ink:#12263F; --ink-2:#28405C; --page:#E8EDE5; --card:#F4F7F0;
  --stamp:#5C3B8E; --alert:#A8342A; --gold:#A8863F; --rule:#C3CCBC; --muted:#5F6C63;
  --sans:'Public Sans',ui-sans-serif,system-ui,sans-serif;
  --mono:'IBM Plex Mono',ui-monospace,'SF Mono',monospace;
  --disp:'Bodoni Moda','Times New Roman',serif;
  background:var(--page); color:var(--ink); font-family:var(--sans);
  min-height:100vh; font-size:15px; line-height:1.6; position:relative;
}
/* impresión de seguridad, muy tenue */
.pp::before{
  content:''; position:fixed; inset:0; pointer-events:none; opacity:.035; z-index:0;
  background:
    repeating-linear-gradient(52deg, var(--ink) 0 1px, transparent 1px 7px),
    repeating-linear-gradient(-52deg, var(--ink) 0 1px, transparent 1px 7px);
}
.pp *{box-sizing:border-box}
.pp button{font-family:inherit;cursor:pointer}
.pp :focus-visible{outline:2px solid var(--stamp); outline-offset:2px}

.pp-mrz{background:var(--ink); color:var(--page); padding:9px 16px; position:relative; z-index:1;
  font-family:var(--mono); font-size:10.5px; letter-spacing:.16em; line-height:1.7; overflow:hidden; white-space:nowrap}
.pp-mrz span{opacity:.55}
.pp-mrz b{font-weight:500;opacity:1}

.pp-head{position:relative; z-index:1; padding:22px 24px 16px; border-bottom:1px solid var(--rule);
  display:flex; flex-wrap:wrap; gap:18px; align-items:flex-end; justify-content:space-between}
.pp-brand h1{font-family:var(--disp); font-weight:500; font-size:30px; line-height:1.05; margin:4px 0 0; letter-spacing:-.01em}
.pp-eyebrow{font-family:var(--mono); font-size:10px; letter-spacing:.24em; text-transform:uppercase; color:var(--muted)}
.pp-namefield{display:flex; flex-direction:column; gap:5px}
.pp-namefield label{font-family:var(--mono); font-size:9.5px; letter-spacing:.2em; text-transform:uppercase; color:var(--muted)}
.pp-namefield input{font-family:var(--mono); font-size:13px; padding:7px 10px; width:190px;
  background:transparent; border:1px solid var(--rule); border-radius:2px; color:var(--ink)}

.pp-tabs{display:flex; gap:2px; position:relative; z-index:1; padding:0 24px; border-bottom:1px solid var(--rule)}
.pp-tab{background:none; border:none; border-bottom:2px solid transparent; padding:11px 2px; margin-right:26px;
  font-family:var(--mono); font-size:10.5px; letter-spacing:.18em; text-transform:uppercase; color:var(--muted)}
.pp-tab[data-on="1"]{color:var(--ink); border-bottom-color:var(--gold)}

.pp-grid{position:relative; z-index:1; display:grid; grid-template-columns:302px 1fr; gap:0; align-items:start}
.pp-rail{border-right:1px solid var(--rule); padding:18px 16px 40px; position:sticky; top:0; max-height:100vh; overflow-y:auto}
.pp-main{padding:26px 30px 60px; min-width:0}

.pp-railhead{display:flex; justify-content:space-between; align-items:baseline; margin-bottom:16px;
  font-family:var(--mono); font-size:10px; letter-spacing:.16em; text-transform:uppercase; color:var(--muted)}
.pp-phase{margin-bottom:16px}
.pp-phasename{font-family:var(--mono); font-size:9.5px; letter-spacing:.2em; text-transform:uppercase;
  color:var(--muted); padding-bottom:5px; border-bottom:1px solid var(--rule); margin-bottom:6px;
  display:flex; justify-content:space-between}
.pp-row{width:100%; text-align:left; background:none; border:1px solid transparent; border-radius:2px;
  padding:8px 8px 8px 9px; display:flex; align-items:center; gap:10px; transition:background .12s}
.pp-row:hover{background:rgba(18,38,63,.045)}
.pp-row[data-sel="1"]{background:var(--card); border-color:var(--rule)}
.pp-rowno{font-family:var(--mono); font-size:11px; color:var(--gold); font-weight:500; width:20px; flex:none}
.pp-rowtxt{flex:1; min-width:0; font-size:13px; line-height:1.35}
.pp-rowtxt em{display:block; font-style:normal; font-family:var(--mono); font-size:9px; letter-spacing:.14em;
  text-transform:uppercase; color:var(--muted); margin-top:2px}
.pp-rowtxt .pend{color:var(--muted)}

/* el sello */
.pp-stamp{flex:none; width:60px; height:40px; border:1.5px solid var(--stamp); border-radius:2px;
  color:var(--stamp); display:flex; flex-direction:column; align-items:center; justify-content:center;
  font-family:var(--mono); text-transform:uppercase; mix-blend-mode:multiply; opacity:.82;
  box-shadow:inset 0 0 0 3px transparent, inset 0 0 0 4px var(--stamp)}
.pp-stamp b{font-size:12px; font-weight:600; letter-spacing:.04em; line-height:1.1}
.pp-stamp i{font-style:normal; font-size:6.5px; letter-spacing:.14em}
.pp-tilt-a{transform:rotate(-7deg)} .pp-tilt-b{transform:rotate(5deg)} .pp-tilt-c{transform:rotate(-3deg)}
.pp-empty{flex:none; width:60px; height:40px; border:1px dashed var(--rule); border-radius:2px}
.pp-press{animation:press .42s cubic-bezier(.2,.9,.3,1) 1}
@keyframes press{0%{transform:scale(1.7) rotate(-16deg);opacity:0}60%{opacity:.95}100%{transform:none;opacity:.82}}

.pp-cast{margin-top:22px; border-top:1px solid var(--rule); padding-top:12px}
.pp-cast h4{font-family:var(--mono); font-size:9.5px; letter-spacing:.2em; text-transform:uppercase;
  color:var(--muted); margin:0 0 8px; font-weight:400}
.pp-cast li{list-style:none; font-size:12.5px; margin-bottom:5px}
.pp-cast li span{color:var(--muted)}
.pp-cast ul{margin:0;padding:0}

/* panel principal */
.pp-doc-eyebrow{font-family:var(--mono); font-size:10px; letter-spacing:.22em; text-transform:uppercase;
  color:var(--muted); display:flex; gap:12px; flex-wrap:wrap; align-items:center}
.pp-int{color:var(--stamp); border:1px solid var(--stamp); border-radius:2px; padding:1px 6px; font-size:9px}
.pp-title{font-family:var(--disp); font-weight:400; font-size:clamp(28px,4.2vw,42px); line-height:1.08;
  margin:10px 0 2px; letter-spacing:-.015em}
.pp-subtitle{font-size:15px; color:var(--muted); margin:0 0 22px}

.pp-sec{margin-bottom:26px}
.pp-sec > h3{font-size:11px; font-weight:600; letter-spacing:.15em; text-transform:uppercase; margin:0 0 10px;
  display:flex; align-items:center; gap:10px; color:var(--ink)}
.pp-sec > h3::after{content:''; flex:1; height:1px; background:var(--rule)}
.pp-card{background:var(--card); border:1px solid var(--rule); border-radius:2px; padding:16px 18px}

.pp-obj{font-family:var(--disp); font-size:19px; line-height:1.4; margin:0}

.pp-meters{display:flex; flex-wrap:wrap; gap:10px}
.pp-meter{border:1px solid var(--rule); border-radius:2px; padding:8px 12px; background:var(--card); min-width:132px}
.pp-meter b{font-family:var(--mono); font-size:17px; font-weight:600; display:block; line-height:1.1}
.pp-meter em{font-style:normal; font-family:var(--mono); font-size:9px; letter-spacing:.14em;
  text-transform:uppercase; color:var(--muted); display:block; margin-top:3px}
.pp-meter[data-ok="0"]{border-color:var(--alert)} .pp-meter[data-ok="0"] b{color:var(--alert)}

.pp-chips{display:flex; flex-wrap:wrap; gap:7px}
.pp-chip{border:1px solid var(--rule); border-radius:2px; padding:5px 9px; background:var(--card); font-size:13px}
.pp-chip span{color:var(--muted)}
.pp-chip u{text-decoration:none; font-family:var(--mono); font-size:9px; letter-spacing:.1em; color:var(--gold)}

.pp-struct{border-left:2px solid var(--gold); padding-left:14px; margin-bottom:16px}
.pp-struct h4{margin:0 0 4px; font-size:15px; font-weight:600}
.pp-struct p{margin:0 0 5px}
.pp-struct .contra{color:var(--muted); font-size:13.5px}

.pp-dialog{counter-reset:none}
.pp-line{display:grid; grid-template-columns:26px 92px 1fr; gap:12px; padding:8px 0; border-bottom:1px solid rgba(195,204,188,.6); align-items:baseline}
.pp-line:last-child{border-bottom:none}
.pp-line .num{font-family:var(--mono); font-size:11px; color:var(--gold)}
.pp-line .who{font-family:var(--mono); font-size:9.5px; letter-spacing:.13em; text-transform:uppercase; color:var(--muted)}
.pp-line .say{font-size:16px}
.pp-line[data-you="1"] .who{color:var(--stamp)}

.pp-list{margin:0; padding-left:18px} .pp-list li{margin-bottom:6px}

.pp-actions{display:flex; flex-wrap:wrap; gap:8px; margin:28px 0 20px}
.pp-btn{border:1px solid var(--ink); background:var(--ink); color:var(--page); border-radius:2px;
  padding:9px 16px; font-family:var(--mono); font-size:10.5px; letter-spacing:.16em; text-transform:uppercase}
.pp-btn:hover{background:var(--ink-2); border-color:var(--ink-2)}
.pp-btn[data-v="ghost"]{background:transparent; color:var(--ink); border-color:var(--rule)}
.pp-btn[data-v="ghost"]:hover{background:rgba(18,38,63,.05); border-color:var(--ink)}
.pp-btn[data-v="quiet"]{background:transparent; color:var(--muted); border-color:transparent; padding-left:4px}
.pp-btn[data-v="quiet"]:hover{color:var(--alert)}
.pp-btn:disabled{opacity:.4; cursor:not-allowed}

.pp-raw{width:100%; min-height:340px; font-family:var(--mono); font-size:12px; line-height:1.7;
  background:var(--card); border:1px solid var(--rule); border-radius:2px; padding:16px; color:var(--ink); resize:vertical}

.pp-blank{max-width:520px; padding:60px 0}
.pp-blank h2{font-family:var(--disp); font-size:27px; font-weight:400; margin:0 0 10px; line-height:1.2}
.pp-blank p{color:var(--muted); margin:0 0 22px}

.pp-error{border:1px solid var(--alert); border-left-width:3px; border-radius:2px; padding:12px 16px;
  background:rgba(168,52,42,.05); margin-bottom:20px; font-size:14px}
.pp-error b{display:block; font-size:11px; letter-spacing:.15em; text-transform:uppercase; color:var(--alert); margin-bottom:4px}

.pp-loading{font-family:var(--mono); font-size:11px; letter-spacing:.18em; text-transform:uppercase; color:var(--muted)}
.pp-loading::after{content:'▮'; animation:blink 1s steps(2) infinite; margin-left:4px}
@keyframes blink{50%{opacity:0}}

.pp-search{font-family:var(--mono); font-size:13px; padding:9px 12px; width:100%; max-width:340px;
  background:var(--card); border:1px solid var(--rule); border-radius:2px; color:var(--ink); margin-bottom:20px}
.pp-count{font-family:var(--mono); font-size:10px; letter-spacing:.16em; text-transform:uppercase; color:var(--muted)}
.pp-footmrz{margin-top:34px; padding-top:12px; border-top:1px solid var(--rule);
  font-family:var(--mono); font-size:10px; letter-spacing:.16em; color:var(--muted); overflow:hidden; white-space:nowrap}

@media (max-width:880px){
  .pp-grid{grid-template-columns:1fr}
  .pp-rail{position:static; max-height:none; border-right:none; border-bottom:1px solid var(--rule)}
  .pp-main{padding:22px 18px 50px}
  .pp-head{padding:18px}
  .pp-line{grid-template-columns:22px 1fr; row-gap:2px}
  .pp-line .who{grid-column:2}
  .pp-line .say{grid-column:2}
}
@media (prefers-reduced-motion:reduce){
  .pp *,.pp *::before,.pp *::after{animation:none !important; transition:none !important}
}
`;

/* ── UI ─────────────────────────────────────────────────── */

function Section({ title, children }) {
  return (
    <section className="pp-sec">
      <h3>{title}</h3>
      {children}
    </section>
  );
}

export default function App() {
  const [lessons, setLessons] = useState({});
  const [cast, setCast] = useState([]);
  const [protagonista, setProtagonista] = useState("");
  const [sel, setSel] = useState(1);
  const [vista, setVista] = useState("guiones");
  const [cargando, setCargando] = useState(null);
  const [error, setError] = useState(null);
  const [crudo, setCrudo] = useState("");
  const [stamped, setStamped] = useState(null);
  const [raw, setRaw] = useState(false);
  const [busca, setBusca] = useState("");
  const [aviso, setAviso] = useState("");
  const listo = useRef(false);

  /* cargar */
  useEffect(() => {
    (async () => {
      try {
        const r = await window.storage.get(STORE_KEY);
        if (r && r.value) {
          const d = JSON.parse(r.value);
          setLessons(d.lessons || {});
          setCast(d.cast || []);
          setProtagonista(d.protagonista || "");
        }
      } catch (e) {
        /* sin datos guardados todavía */
      } finally {
        listo.current = true;
      }
    })();
  }, []);

  /* guardar */
  useEffect(() => {
    if (!listo.current) return;
    const t = setTimeout(() => {
      window.storage
        .set(STORE_KEY, JSON.stringify({ lessons, cast, protagonista }))
        .catch(() => setAviso("No se pudo guardar. Descarga los guiones que te importen."));
    }, 400);
    return () => clearTimeout(t);
  }, [lessons, cast, protagonista]);

  const hechas = Object.keys(lessons).length;
  const L = lessons[sel];

  async function generar(n) {
    setCargando(n);
    setError(null);
    setCrudo("");
    const base = buildPrompt(n, lessons, protagonista, cast);
    let ultimaRespuesta = "";

    for (let intento = 1; intento <= 2; intento++) {
      try {
        const prompt =
          intento === 1
            ? base
            : base +
              "\n\nAVISO: el intento anterior devolvió un JSON inválido. Repásalo carácter por carácter antes de responder: la comilla doble solo delimita, jamás aparece dentro de un texto. Devuelve únicamente el objeto JSON.";

        ultimaRespuesta = await pedirAlModelo(prompt);
        const nueva = normalizar(extraerJSON(ultimaRespuesta));

        setLessons((p) => ({ ...p, [n]: nueva }));
        setCast((prev) => {
          const map = new Map(prev.map((c) => [c.nombre.toLowerCase(), c]));
          (nueva.personajes || []).forEach((c) => {
            if (c && c.nombre && !map.has(c.nombre.toLowerCase())) map.set(c.nombre.toLowerCase(), c);
          });
          return Array.from(map.values()).slice(0, 8);
        });
        setStamped(n);
        setTimeout(() => setStamped(null), 700);
        setCargando(null);
        return;
      } catch (e) {
        if (intento === 2) {
          setError(e.message || "Error desconocido.");
          setCrudo(ultimaRespuesta);
        }
      }
    }
    setCargando(null);
  }

  async function copiar(texto) {
    try {
      await navigator.clipboard.writeText(texto);
      setAviso("Markdown copiado.");
    } catch {
      const ta = document.createElement("textarea");
      ta.value = texto;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand("copy"); setAviso("Markdown copiado."); }
      catch { setAviso("Copia manual: selecciona el texto en la vista markdown."); }
      document.body.removeChild(ta);
    }
    setTimeout(() => setAviso(""), 2600);
  }

  function descargar(n, lec) {
    const blob = new Blob([toMarkdown(n, lec)], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `guion-leccion-${pad2(n)}-${kebab(lec.titulo_en)}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function borrarTodo() {
    if (!window.confirm("Se borran los 18 guiones y el elenco. No hay vuelta atrás.")) return;
    setLessons({});
    setCast([]);
    setStamped(null);
  }

  const vocabulario = useMemo(() => {
    const out = [];
    Object.keys(lessons).map(Number).sort((a, b) => a - b).forEach((n) => {
      (lessons[n].vocabulario_nuevo || []).forEach((v) => out.push({ ...v, leccion: n }));
    });
    return out;
  }, [lessons]);

  const vocabFiltrado = vocabulario.filter(
    (v) =>
      !busca.trim() ||
      v.en.toLowerCase().includes(busca.toLowerCase()) ||
      (v.es || "").toLowerCase().includes(busca.toLowerCase())
  );

  const estructuras = useMemo(() => {
    const out = [];
    Object.keys(lessons).map(Number).sort((a, b) => a - b).forEach((n) => {
      (lessons[n].estructuras || []).forEach((e) => out.push({ ...e, leccion: n }));
    });
    return out;
  }, [lessons]);

  const tilt = (n) => ["pp-tilt-a", "pp-tilt-b", "pp-tilt-c"][n % 3];

  return (
    <div className="pp">
      <style>{CSS}</style>

      <div className="pp-mrz">
        <div><b>{mrz(`GUION<MODULO1<INGLES<A1<VIAJE`)}</b></div>
        <div><span>{mrz(`ES<LATAM<<US<ENGLISH<<SELLOS<${pad2(hechas)}<DE<18`)}</span></div>
      </div>

      <header className="pp-head">
        <div className="pp-brand">
          <div className="pp-eyebrow">Módulo 1 · 18 lecciones · A1.1</div>
          <h1>Generador de guiones</h1>
        </div>
        <div className="pp-namefield">
          <label htmlFor="prot">Nombre del protagonista</label>
          <input
            id="prot"
            value={protagonista}
            placeholder="opcional"
            onChange={(e) => setProtagonista(e.target.value)}
          />
        </div>
      </header>

      <nav className="pp-tabs">
        <button className="pp-tab" data-on={vista === "guiones" ? 1 : 0} onClick={() => setVista("guiones")}>
          Guiones
        </button>
        <button className="pp-tab" data-on={vista === "vocab" ? 1 : 0} onClick={() => setVista("vocab")}>
          Vocabulario acumulado ({vocabulario.length})
        </button>
      </nav>

      {vista === "guiones" ? (
        <div className="pp-grid">
          {/* ── página del pasaporte ── */}
          <aside className="pp-rail">
            <div className="pp-railhead">
              <span>Página de sellos</span>
              <span>{pad2(hechas)}/18</span>
            </div>

            {PHASES.map((f) => (
              <div className="pp-phase" key={f.id}>
                <div className="pp-phasename">
                  <span>{f.id}. {f.nombre}</span>
                  <span>{f.abbr}</span>
                </div>
                {f.lecciones.map((n) => {
                  const hecha = !!lessons[n];
                  const esInt = INTEGRACION.includes(n);
                  return (
                    <button
                      key={n}
                      className="pp-row"
                      data-sel={sel === n ? 1 : 0}
                      onClick={() => { setSel(n); setRaw(false); setError(null); setCrudo(""); }}
                    >
                      <span className="pp-rowno">{pad2(n)}</span>
                      <span className="pp-rowtxt">
                        {hecha ? lessons[n].titulo_en : <span className="pend">Sin generar</span>}
                        <em>{esInt ? "Integración" : f.abbr}</em>
                      </span>
                      {hecha ? (
                        <span className={`pp-stamp ${tilt(n)} ${stamped === n ? "pp-press" : ""}`}>
                          <b>{pad2(n)}</b>
                          <i>{esInt ? "recombina" : "admitido"}</i>
                        </span>
                      ) : (
                        <span className="pp-empty" />
                      )}
                    </button>
                  );
                })}
              </div>
            ))}

            {cast.length > 0 && (
              <div className="pp-cast">
                <h4>Elenco recurrente</h4>
                <ul>
                  {cast.map((c, i) => (
                    <li key={i}>{c.nombre} <span>— {c.rol}</span></li>
                  ))}
                </ul>
              </div>
            )}

            {hechas > 0 && (
              <button className="pp-btn" data-v="quiet" onClick={borrarTodo} style={{ marginTop: 18 }}>
                Borrar todo
              </button>
            )}
          </aside>

          {/* ── documento ── */}
          <main className="pp-main">
            {error && (
              <div className="pp-error">
                <b>La generación falló · dos intentos</b>
                {error} Vuelve a intentarlo{crudo ? ", o rescata el texto de abajo a mano." : "."}
                {crudo && (
                  <details style={{ marginTop: 10 }}>
                    <summary style={{ cursor: "pointer", fontSize: 13 }}>Ver la respuesta cruda</summary>
                    <textarea className="pp-raw" style={{ minHeight: 200, marginTop: 8 }} readOnly value={crudo} />
                  </details>
                )}
              </div>
            )}
            {aviso && <div className="pp-loading" style={{ marginBottom: 16 }}>{aviso}</div>}

            <div className="pp-doc-eyebrow">
              <span>Fase {faseDe(sel).id} · {faseDe(sel).nombre}</span>
              <span>Lección {pad2(sel)} de 18</span>
              <span>A1</span>
              {INTEGRACION.includes(sel) && <span className="pp-int">Integración</span>}
            </div>

            {!L ? (
              <div className="pp-blank">
                <h1 className="pp-title">{faseDe(sel).contexto}</h1>
                <p className="pp-subtitle">
                  {INTEGRACION.includes(sel)
                    ? `Lección de simulacro: recombina todo lo de las lecciones ${sel - 2} y ${sel - 1} sin introducir nada nuevo.`
                    : `Señal de diseño para esta fase: ${faseDe(sel).recomb}.`}
                </p>
                <p style={{ color: "var(--muted)", marginBottom: 24 }}>
                  {hechas === 0
                    ? "Empieza por la lección 1: ahí se fija el elenco y el tono de todo el módulo."
                    : `Se enviarán al modelo el vocabulario y las estructuras de las ${hechas} lecciones ya generadas, para que el reciclaje cite lecciones reales.`}
                </p>
                <button className="pp-btn" disabled={cargando !== null} onClick={() => generar(sel)}>
                  {cargando === sel ? "Escribiendo…" : "Generar guion"}
                </button>
                {cargando === sel && <div className="pp-loading" style={{ marginTop: 14 }}>Redactando la lección {pad2(sel)}</div>}
              </div>
            ) : (
              <>
                <h1 className="pp-title">{L.titulo_en}</h1>
                <p className="pp-subtitle">{L.titulo_es}</p>

                <div className="pp-actions">
                  <button className="pp-btn" onClick={() => descargar(sel, L)}>Descargar .md</button>
                  <button className="pp-btn" data-v="ghost" onClick={() => copiar(toMarkdown(sel, L))}>Copiar markdown</button>
                  <button className="pp-btn" data-v="ghost" onClick={() => setRaw(!raw)}>
                    {raw ? "Ver guion" : "Ver markdown"}
                  </button>
                  <button className="pp-btn" data-v="ghost" disabled={cargando !== null} onClick={() => generar(sel)}>
                    {cargando === sel ? "Escribiendo…" : "Regenerar"}
                  </button>
                </div>

                {raw ? (
                  <textarea className="pp-raw" readOnly value={toMarkdown(sel, L)} />
                ) : (
                  <>
                    <Section title="Objetivo">
                      <div className="pp-card"><p className="pp-obj">{L.objetivo}</p></div>
                    </Section>

                    <Section title="Presupuesto">
                      <div className="pp-meters">
                        {presupuesto(sel, L).map((m) => (
                          <div className="pp-meter" key={m.label} data-ok={m.ok ? 1 : 0}>
                            <b>{m.valor}</b>
                            <em>{m.label} · {m.rango}</em>
                          </div>
                        ))}
                      </div>
                    </Section>

                    <Section title={INTEGRACION.includes(sel) ? "Vocabulario nuevo — ninguno" : "Vocabulario nuevo"}>
                      {L.vocabulario_nuevo.length ? (
                        <div className="pp-chips">
                          {L.vocabulario_nuevo.map((v, i) => (
                            <span className="pp-chip" key={i}>{v.en} <span>· {v.es}</span></span>
                          ))}
                        </div>
                      ) : (
                        <p style={{ color: "var(--muted)", margin: 0 }}>
                          Lección de integración: todo el léxico viene de lecciones anteriores.
                        </p>
                      )}
                    </Section>

                    <Section title="Vocabulario reciclado">
                      {L.vocabulario_reciclado.length ? (
                        <div className="pp-chips">
                          {L.vocabulario_reciclado.map((v, i) => (
                            <span className="pp-chip" key={i}>{v.item} <u>L{pad2(v.leccion)}</u></span>
                          ))}
                        </div>
                      ) : (
                        <p style={{ color: "var(--muted)", margin: 0 }}>Primera lección: no hay nada que reciclar.</p>
                      )}
                    </Section>

                    {L.estructuras.length > 0 && (
                      <Section title="Estructura nueva">
                        {L.estructuras.map((e, i) => (
                          <div className="pp-struct" key={i}>
                            <h4>{e.nombre}</h4>
                            <p>{e.explicacion}</p>
                            {e.contraste_es && <p className="contra">Frente al español: {e.contraste_es}</p>}
                          </div>
                        ))}
                      </Section>
                    )}

                    <Section title="Diálogo">
                      <div className="pp-card pp-dialog">
                        {L.dialogo.map((d, i) => (
                          <div className="pp-line" key={i} data-you={/^t(ú|u)$|^you$/i.test(d.hablante || "") ? 1 : 0}>
                            <span className="num">{d.n || i + 1}</span>
                            <span className="who">{d.hablante}</span>
                            <span className="say">{d.linea}</span>
                          </div>
                        ))}
                      </div>
                    </Section>

                    {L.contraste_l1.length > 0 && (
                      <Section title="Contraste L1">
                        <ul className="pp-list">
                          {L.contraste_l1.map((c, i) => <li key={i}>{c}</li>)}
                        </ul>
                      </Section>
                    )}

                    {L.actividades && (
                      <Section title="Actividades de integración">
                        <ul className="pp-list">
                          {L.actividades.escenario && <li><strong>Escenario.</strong> {L.actividades.escenario}</li>}
                          {L.actividades.dialogo_huecos && <li><strong>Diálogo con huecos.</strong> {L.actividades.dialogo_huecos}</li>}
                          {L.actividades.role_play && <li><strong>Role-play.</strong> {L.actividades.role_play}</li>}
                          {L.actividades.mini_proyecto && <li><strong>Mini-proyecto.</strong> {L.actividades.mini_proyecto}</li>}
                          {L.actividades.autoevaluacion && <li><strong>Autoevaluación.</strong> {L.actividades.autoevaluacion}</li>}
                        </ul>
                      </Section>
                    )}

                    <Section title="Continuidad">
                      <p style={{ margin: 0 }}>{L.continuidad}</p>
                    </Section>

                    <div className="pp-footmrz">
                      {mrz(`GUION<LECCION<${pad2(sel)}<FASE${faseDe(sel).id}<A1`, 52)}
                    </div>
                  </>
                )}
              </>
            )}
          </main>
        </div>
      ) : (
        /* ── vocabulario acumulado ── */
        <main className="pp-main" style={{ padding: "26px 30px 60px" }}>
          <div className="pp-doc-eyebrow"><span>Todo el léxico introducido hasta ahora</span></div>
          <h1 className="pp-title">Vocabulario acumulado</h1>
          <p className="pp-subtitle">
            {vocabulario.length} palabras en {hechas} {hechas === 1 ? "lección" : "lecciones"}. Consúltalo antes de generar para no reintroducir algo ya visto.
          </p>

          {vocabulario.length === 0 ? (
            <p style={{ color: "var(--muted)" }}>Todavía no hay palabras. Genera la lección 1 para empezar a llenar esta lista.</p>
          ) : (
            <>
              <input
                className="pp-search"
                value={busca}
                placeholder="Buscar palabra…"
                onChange={(e) => setBusca(e.target.value)}
              />
              <div className="pp-count" style={{ marginBottom: 12 }}>
                {vocabFiltrado.length} {vocabFiltrado.length === 1 ? "resultado" : "resultados"}
              </div>
              <div className="pp-chips">
                {vocabFiltrado.map((v, i) => (
                  <span className="pp-chip" key={i}>
                    {v.en} <span>· {v.es}</span> <u>L{pad2(v.leccion)}</u>
                  </span>
                ))}
              </div>

              {estructuras.length > 0 && (
                <div style={{ marginTop: 40 }}>
                  <Section title="Estructuras ya explicadas">
                    {estructuras.map((e, i) => (
                      <div className="pp-struct" key={i}>
                        <h4>{e.nombre} <u style={{ textDecoration: "none", fontFamily: "var(--mono)", fontSize: 10, color: "var(--gold)" }}>L{pad2(e.leccion)}</u></h4>
                        <p>{e.explicacion}</p>
                      </div>
                    ))}
                  </Section>
                </div>
              )}
            </>
          )}
        </main>
      )}
    </div>
  );
}
