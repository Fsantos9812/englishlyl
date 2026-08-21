# -*- coding: utf-8 -*-
"""
Genera lessons.json leyendo las lecciones de la carpeta.

Ese archivo es la unica fuente de verdad: el indice arma la lista con el,
y cada leccion arma su navegacion (anterior / siguiente) con el mismo.

Uso, parado en la raiz del proyecto:

    python tools/generar-manifiesto.py
"""
import io
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SALIDA = os.path.join(ROOT, "lessons.json")

TITULO_RE = re.compile(r"<title>(.*?)</title>", re.S)
NIVEL_RE = re.compile(r'<span class="level">(.*?)</span>', re.S)
DATOS_RE = re.compile(
    r'<script type="application/json" id="lesson-data">(.*?)</script>', re.S
)


def leer_leccion(nombre):
    ruta = os.path.join(ROOT, nombre)
    html = io.open(ruta, encoding="utf-8").read()

    m = DATOS_RE.search(html)
    if not m:
        sys.exit("%s no tiene bloque #lesson-data (esta sin refactorizar?)" % nombre)
    datos = json.loads(m.group(1))

    # Renombrar el .html no cambia el "id" de adentro, y ese id es con lo que se
    # guarda el progreso del alumno y se nombran sus grabaciones. Si no coinciden,
    # la leccion funciona pero en el panel aparece con el nombre viejo.
    esperado = re.sub(r"\.html$", "", nombre)
    if datos["id"] != esperado:
        sys.exit(os.linesep.join([
            'El id de %s dice "%s" pero el archivo se llama "%s".' % (nombre, datos["id"], esperado),
            'Renombraste el archivo sin cambiar el id de adentro.',
            'Ese id es con lo que se guarda el progreso y se nombran las grabaciones.',
            'Corregi el campo "id" del bloque #lesson-data y volve a correr esto.',
        ]))

    titulo = TITULO_RE.search(html)
    nivel = NIVEL_RE.search(html)

    return {
        "archivo": nombre,
        "id": datos["id"],
        "titulo": titulo.group(1).strip() if titulo else datos["id"],
        "nivel": nivel.group(1).strip() if nivel else "",
        "ejercicios": {
            "repeat": len(datos.get("repeat") or []),
            "type": len(datos.get("type") or []),
            "translate": len(datos.get("translate") or []),
        },
    }


def main():
    nombres = sorted(
        f for f in os.listdir(ROOT) if re.match(r"^leccion-.*\.html$", f)
    )
    if not nombres:
        sys.exit("no se encontraron lecciones en %s" % ROOT)

    lecciones = [leer_leccion(n) for n in nombres]
    manifiesto = {"lecciones": lecciones}

    io.open(SALIDA, "w", encoding="utf-8", newline="\n").write(
        json.dumps(manifiesto, ensure_ascii=False, indent=2) + "\n"
    )

    print("lessons.json actualizado con %d lecciones:" % len(lecciones))
    for l in lecciones:
        e = l["ejercicios"]
        print(
            "  %-28s %-3s repeat=%d type=%d translate=%d"
            % (l["id"], l["nivel"], e["repeat"], e["type"], e["translate"])
        )


main()
