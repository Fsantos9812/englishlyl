# -*- coding: utf-8 -*-
"""
Genera lecciones en el formato de ESTE proyecto a partir de archivos Markdown.

    python tools/generar-lecciones.py                  # todos los .md de lecciones-md/
    python tools/generar-lecciones.py lecciones-md/leccion-06-clima.md

Diferencias con un generador de sitio autonomo, y son a proposito:

  * NO escribe index.html. El indice de este proyecto tiene login, racha y
    exportacion; se arma solo desde lessons.json. Pisarlo rompe el sitio.
  * NO mete CSS ni JS adentro de cada leccion. Usa assets/lesson.css y los
    modulos compartidos, con la misma version ?v=N que el resto del sitio.
  * Regenera lessons.json al terminar, que es lo que hace aparecer la leccion
    en el indice, en la navegacion y en el cache offline.

Formato del .md (todas las secciones son opcionales):

    ---
    titulo: Familia y edades
    nivel: A1
    idioma_audio: en-US
    idioma_audio_es: es-419
    ---

    ## Vocabulario
    mother = madre

    ## Listen and Repeat
    This is my mother. = Esta es mi madre.

    ## Listen and Type
    My family is very big. = Mi familia es muy grande.

    ## Listen and Translate
    My brother lives in another city. = Mi hermano vive en otra ciudad.
"""
import glob
import html as html_mod
import io
import json
import os
import re
import subprocess
import sys

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ENTRADA = os.path.join(RAIZ, "lecciones-md")

SECCIONES = {
    "vocabulario": "vocabulario",
    "listen and repeat": "repeat",
    "listen and type": "type",
    "listen and translate": "translate",
}


def version_de_assets():
    """La version sale de una leccion ya existente: nunca inventar una nueva."""
    for ruta in sorted(glob.glob(os.path.join(RAIZ, "leccion-*.html"))):
        m = re.search(r"assets/lesson\.css\?v=(\d+)", io.open(ruta, encoding="utf-8").read())
        if m:
            return m.group(1)
    return "1"


def leer_md(ruta):
    texto = io.open(ruta, encoding="utf-8").read()

    meta = {}
    cuerpo = texto
    m = re.match(r"^---\s*\n(.*?)\n---\s*\n(.*)$", texto, re.S)
    if m:
        for linea in m.group(1).splitlines():
            if ":" in linea:
                k, v = linea.split(":", 1)
                meta[k.strip().lower()] = v.strip()
        cuerpo = m.group(2)

    datos = {"vocabulario": [], "repeat": [], "type": [], "translate": []}
    actual = None
    for linea in cuerpo.splitlines():
        cabecera = re.match(r"^##\s+(.*?)\s*$", linea)
        if cabecera:
            actual = SECCIONES.get(cabecera.group(1).strip().lower())
            continue
        if not actual or not linea.strip() or "=" not in linea:
            continue
        en, es = linea.split("=", 1)
        en, es = en.strip(), es.strip()
        if en and es:
            datos[actual].append({"en": en, "es": es})

    return meta, datos


def id_de_leccion(nombre_md, meta):
    if meta.get("id"):
        return meta["id"]
    return re.sub(r"\.md$", "", os.path.basename(nombre_md))


def escapar(t):
    return html_mod.escape(str(t), quote=True)


def armar_html(id_leccion, meta, datos, version):
    titulo = meta.get("titulo") or id_leccion
    nivel = meta.get("nivel", "")

    partes = []
    partes.append("<!DOCTYPE html>")
    partes.append('<html lang="es">')
    partes.append("<head>")
    partes.append('<meta charset="UTF-8">')
    partes.append('<meta name="viewport" content="width=device-width, initial-scale=1.0">')
    partes.append("<title>%s</title>" % escapar(titulo))
    partes.append('<meta name="theme-color" content="#4f46e5">')
    partes.append('<link rel="manifest" href="manifest.webmanifest">')
    partes.append('<link rel="icon" href="assets/favicon-32.png" sizes="32x32">')
    partes.append('<link rel="apple-touch-icon" href="assets/apple-touch-icon.png">')
    partes.append('<link rel="stylesheet" href="assets/lesson.css?v=%s">' % version)
    partes.append("</head>")
    partes.append("<body>")
    partes.append('<div class="wrap">')
    partes.append("  <header>")
    if nivel:
        partes.append('    <span class="level">%s</span>' % escapar(nivel))
    partes.append("    <h1>%s</h1>" % escapar(titulo))
    partes.append("  </header>")

    if datos["vocabulario"]:
        filas = "".join(
            "<tr><td>%s</td><td>%s</td></tr>" % (escapar(p["en"]), escapar(p["es"]))
            for p in datos["vocabulario"]
        )
        partes.append("")
        partes.append("  <h2>📘 Vocabulario</h2>")
        partes.append('  <div class="card"><table>%s</table></div>' % filas)

    if datos["repeat"]:
        partes.append("")
        partes.append("  <h2>🎧 Listen and Repeat</h2>")
        partes.append('  <p class="hint">Escuchá la frase en inglés y repetila en voz alta. '
                      "Se compara lo que dijiste con la frase original.</p>")
        partes.append('  <div id="phrases"></div>')

    if datos["type"]:
        partes.append("")
        partes.append("  <h2>✍️ Listen and Type</h2>")
        partes.append('  <p class="hint">Escuchá en inglés y escribí en español lo que entendiste.</p>')
        partes.append('  <div id="type-exercises"></div>')

    if datos["translate"]:
        partes.append("")
        partes.append("  <h2>🎙️ Listen and Translate</h2>")
        partes.append('  <p class="hint">Escuchá en español y grabá en voz alta tu traducción al '
                      "inglés. Sin corrección automática: es para practicar y guardar tu progreso.</p>")
        partes.append('  <div id="translate-exercises"></div>')
        partes.append('  <div class="card" id="recordings-panel"><strong>Mis grabaciones guardadas: '
                      '<span id="rec-count">0</span></strong><div id="recordings-list"></div></div>')

    partes.append("")
    partes.append("  <footer>Lección generada con tools/generar-lecciones.py</footer>")
    partes.append("</div>")
    partes.append("")

    # El contador cuenta TODOS los ejercicios: las traducciones grabadas tambien
    # son trabajo hecho, aunque no lleven puntaje.
    total_ejercicios = len(datos["repeat"]) + len(datos["type"]) + len(datos["translate"])
    partes.append('<div class="summary">')
    partes.append('  <span>Progreso: <strong id="progress">0 / %d</strong></span>' % total_ejercicios)
    partes.append('  <span>Puntaje: <strong id="score">—</strong></span>')
    if datos["translate"]:
        partes.append('  <span>Grabaciones: <strong id="rec-count-footer"></strong></span>')
    partes.append("</div>")
    partes.append("")

    payload = json.dumps(
        {
            "id": id_leccion,
            "langEn": meta.get("idioma_audio", "en-US"),
            "langEs": meta.get("idioma_audio_es", "es-419"),
            "repeat": datos["repeat"],
            "type": datos["type"],
            "translate": datos["translate"],
        },
        ensure_ascii=False,
        indent=2,
    )
    if "</script" in payload:
        raise ValueError("los datos contienen '</script'")

    partes.append('<script type="application/json" id="lesson-data">')
    partes.append(payload)
    partes.append("</script>")
    for modulo in ["racha", "auth", "sync", "lesson", "pwa"]:
        partes.append('<script src="assets/%s.js?v=%s" defer></script>' % (modulo, version))
    partes.append("</body>")
    partes.append("</html>")
    return "\n".join(partes) + "\n"


def main():
    if not os.path.isdir(ENTRADA):
        os.makedirs(ENTRADA)
        print("Cree la carpeta lecciones-md/. Poné ahí tus archivos .md y volvé a correr esto.")
        return

    # Solo "leccion-*.md": asi se pueden dejar notas o plantillas en la misma
    # carpeta sin que terminen convertidas en paginas del sitio.
    objetivo = sys.argv[1:] or sorted(glob.glob(os.path.join(ENTRADA, "leccion-*.md")))
    if not objetivo:
        print("No hay archivos leccion-*.md en lecciones-md/")
        return

    version = version_de_assets()
    print("Version de assets en uso: v=%s\n" % version)

    for ruta_md in objetivo:
        if not os.path.isabs(ruta_md):
            ruta_md = os.path.join(RAIZ, ruta_md)
        meta, datos = leer_md(ruta_md)
        id_leccion = id_de_leccion(ruta_md, meta)
        salida = os.path.join(RAIZ, id_leccion + ".html")

        html = armar_html(id_leccion, meta, datos, version)
        io.open(salida, "w", encoding="utf-8", newline="\n").write(html)
        print("  %-34s repeat=%d type=%d translate=%d vocab=%d" % (
            os.path.basename(salida), len(datos["repeat"]), len(datos["type"]),
            len(datos["translate"]), len(datos["vocabulario"])))

    print("\nRegenerando el manifiesto...")
    subprocess.run([sys.executable, os.path.join(RAIZ, "tools", "generar-manifiesto.py")], check=True)
    print("\nindex.html NO se tocó: se arma solo desde lessons.json.")


main()
