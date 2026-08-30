# -*- coding: utf-8 -*-
"""
Convierte una leccion autocontenida (CSS y JS inline) al formato del proyecto:
maquetado + bloque de datos JSON, apoyandose en assets/lesson.css y lesson.js.

Es lo que hay que correr sobre cualquier leccion generada por un generador
externo antes de sumarla al sitio. Las que ya estan convertidas se saltean,
asi se puede correr sobre toda la carpeta sin romper nada.

    python tools/convertir-leccion.py            # toda la carpeta
    python tools/convertir-leccion.py leccion-05-tema.html
"""
import glob
import io
import json
import os
import re
import sys

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# La version de los assets se toma de una leccion ya convertida, para no
# quedar desincronizado con el resto del sitio.
VERSION_RE = re.compile(r"assets/lesson\.css\?v=(\d+)")
ARRAY_RE = {
    "repeat": re.compile(r"^const REPEAT_PHRASES = (\[.*\]);\s*$", re.M),
    "type": re.compile(r"^const TYPE_PHRASES = (\[.*\]);\s*$", re.M),
    "translate": re.compile(r"^const TRANSLATE_PHRASES = (\[.*\]);\s*$", re.M),
}
ID_RE = re.compile(r'^const LESSON_ID = "([^"]+)";\s*$', re.M)
LANG_EN_RE = re.compile(r'^const LANG_EN = "([^"]+)";\s*$', re.M)
LANG_ES_RE = re.compile(r'^const LANG_ES = "([^"]+)";\s*$', re.M)
STYLE_RE = re.compile(r"[ \t]*<style>.*?</style>\n?", re.S)
SCRIPT_RE = re.compile(r"<script>.*?</script>\n?", re.S)


def version_de_assets():
    for ruta in sorted(glob.glob(os.path.join(RAIZ, "leccion-*.html"))):
        m = VERSION_RE.search(io.open(ruta, encoding="utf-8").read())
        if m:
            return m.group(1)
    return "1"


def convertir(ruta, version):
    nombre = os.path.basename(ruta)
    html = io.open(ruta, encoding="utf-8").read()

    if 'id="lesson-data"' in html:
        return "ya estaba convertida"

    m = ID_RE.search(html)
    if not m:
        return "SIN CONVERTIR: no encontre 'const LESSON_ID' (formato desconocido)"

    datos = {
        "id": m.group(1),
        "langEn": (LANG_EN_RE.search(html).group(1) if LANG_EN_RE.search(html) else "en-US"),
        "langEs": (LANG_ES_RE.search(html).group(1) if LANG_ES_RE.search(html) else "es-419"),
    }
    for clave, rx in ARRAY_RE.items():
        encontrado = rx.search(html)
        datos[clave] = json.loads(encontrado.group(1)) if encontrado else []

    if "<style>" in html:
        html = STYLE_RE.sub(
            '<link rel="stylesheet" href="assets/lesson.css?v=%s">\n' % version, html, count=1
        )

    payload = json.dumps(datos, ensure_ascii=False, indent=2)
    if "</script" in payload:
        return "SIN CONVERTIR: los datos contienen '</script'"

    bloque = (
        '<script type="application/json" id="lesson-data">\n'
        + payload
        + "\n</script>\n"
        + '<script src="assets/racha.js?v=%s" defer></script>\n' % version
        + '<script src="assets/auth.js?v=%s" defer></script>\n' % version
        + '<script src="assets/sync.js?v=%s" defer></script>\n' % version
        + '<script src="assets/srs.js?v=%s" defer></script>\n' % version
        + '<script src="assets/xp.js?v=%s" defer></script>\n' % version
        + '<script src="assets/texto.js?v=%s" defer></script>\n' % version
        + '<script src="assets/voz.js?v=%s" defer></script>\n' % version
        + '<script src="assets/intentos.js?v=%s" defer></script>\n' % version
        + '<script src="assets/sesion.js?v=%s" defer></script>\n' % version
        + '<script src="assets/modal.js?v=%s" defer></script>\n' % version
        + '<script src="assets/lesson.js?v=%s" defer></script>\n' % version
        + '<script src="assets/pwa.js?v=%s" defer></script>\n' % version
    )
    html = SCRIPT_RE.sub(lambda _: bloque, html, count=1)

    # Cabecera de PWA, si el generador externo no la puso
    if "manifest.webmanifest" not in html:
        html = re.sub(
            r"(</title>\n)",
            r"\1"
            '<meta name="theme-color" content="#4f46e5">\n'
            '<link rel="manifest" href="manifest.webmanifest">\n'
            '<link rel="icon" href="assets/favicon-32.png" sizes="32x32">\n'
            '<link rel="apple-touch-icon" href="assets/apple-touch-icon.png">\n',
            html,
            count=1,
        )

    io.open(ruta, "w", encoding="utf-8", newline="\n").write(html)
    cuenta = tuple(len(datos[k]) for k in ("repeat", "type", "translate"))
    return "convertida  repeat=%d type=%d translate=%d  (%d B)" % (cuenta + (len(html),))


def main():
    version = version_de_assets()
    objetivo = sys.argv[1:] or sorted(
        os.path.basename(p) for p in glob.glob(os.path.join(RAIZ, "leccion-*.html"))
    )
    print("Version de assets en uso: v=%s" % version)
    problemas = 0
    for nombre in objetivo:
        resultado = convertir(os.path.join(RAIZ, nombre), version)
        if resultado.startswith("SIN CONVERTIR"):
            problemas += 1
        print("  %-34s %s" % (nombre, resultado))

    if problemas:
        print("\n%d leccion(es) no se pudieron convertir. Revisalas a mano." % problemas)
        sys.exit(1)
    print("\nListo. Ahora corre:  python tools/generar-manifiesto.py")


main()
