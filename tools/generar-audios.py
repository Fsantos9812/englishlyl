# -*- coding: utf-8 -*-
"""
Genera los audios de las lecciones con Google Cloud Text-to-Speech.

    python tools/generar-audios.py --dry-run
    python tools/generar-audios.py

Lee las lecciones ya generadas (el bloque #lesson-data de cada leccion-*.html),
junta las frases y escribe un .mp3 por frase en assets/audio/<idioma>/.

POR QUE EL ARCHIVO SE LLAMA COMO LA FRASE

"Nice to meet you." -> nice-to-meet-you.mp3. Eso da tres cosas gratis:

  1. La misma frase en dos lecciones reusa un solo archivo. En este curso
     `repeat` y `type` comparten las frases a proposito, asi que de entrada se
     genera la mitad de los audios.
  2. El nombre depende del contenido, asi que el contenido nunca cambia debajo
     de una URL que ya existe. Es justo lo que necesita assets/, servido con
     cache inmutable de un ano: cambiar la frase cambia el archivo.
  3. Se puede mirar la carpeta y entender que hay, sin abrir nada.

El nombre se normaliza (sin mayusculas, sin acentos, sin puntuacion) porque
"Where are you from?.mp3" no es una URL valida -- el ? abre la query string --,
los dos puntos no son un nombre valido en Windows, y el CDN de Netlify
distingue mayusculas mientras que Windows no: un archivo que anda en tu maquina
daria 404 en produccion.

La correspondencia frase -> archivo no se recalcula en el navegador: se publica
en audios.json y assets/voz.js la lee. Asi no hay dos implementaciones del
mismo normalizado que se puedan desincronizar en silencio.

LA CLAVE NUNCA VA EN EL CODIGO

Se lee de la variable de entorno GOOGLE_TTS_KEY. netlify.toml publica la raiz
entera (publish = "."), asi que un archivo con la clave adentro quedaria
descargable desde el sitio.
"""
import argparse
import base64
import io
import json
import os
import re
import sys
import unicodedata
import urllib.error
import urllib.request

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CARPETA_AUDIO = os.path.join(RAIZ, "assets", "audio")
MANIFIESTO = os.path.join(RAIZ, "audios.json")
API = "https://texttospeech.googleapis.com/v1/text:synthesize"

# Una voz fija para todo el curso: que el alumno escuche siempre a la misma
# persona. Cambiarlas obliga a regenerar con --force, porque el nombre del
# archivo depende de la frase y no de la voz.
VOCES = {
    "en": {"languageCode": "en-US", "name": "en-US-Neural2-F"},
    "es": {"languageCode": "es-US", "name": "es-US-Neural2-A"},
}
# Un poco mas lento que el habla normal: son alumnos de A1.
VELOCIDAD = 0.92

LIMITE_NOMBRE = 80


def nombre_de(texto):
    """Frase -> nombre de archivo seguro en URL, en Windows y en Linux."""
    s = unicodedata.normalize("NFD", texto)
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    s = s.lower()
    s = re.sub(r"[^a-z0-9]+", "-", s)
    s = s.strip("-")[:LIMITE_NOMBRE].strip("-")
    return s or "audio"


def leer_lecciones():
    """Devuelve [(archivo, datos)] leyendo el #lesson-data de cada leccion.

    Se lee el HTML y no el .md porque el HTML es lo que esta publicado: hay
    lecciones que existen sin su Markdown fuente.
    """
    salida = []
    for archivo in sorted(os.listdir(RAIZ)):
        if not (archivo.startswith("leccion-") and archivo.endswith(".html")):
            continue
        html = io.open(os.path.join(RAIZ, archivo), encoding="utf-8").read()
        m = re.search(
            r'<script type="application/json" id="lesson-data">(.*?)</script>',
            html, re.S)
        if not m:
            print("  aviso: %s no tiene #lesson-data, se saltea" % archivo)
            continue
        try:
            salida.append((archivo, json.loads(m.group(1))))
        except ValueError as err:
            print("  aviso: %s tiene JSON invalido (%s), se saltea" % (archivo, err))
    return salida


def frases_de(datos, con_translate, con_vocabulario):
    """Que texto hay que hacer sonar, y en que idioma.

    Repeat y Type suenan en INGLES: el alumno escucha ingles y repite, o
    escribe la traduccion. Translate suena en ESPANOL, que es al reves.
    """
    pedido = []
    for seccion in ("repeat", "type"):
        for frase in datos.get(seccion) or []:
            if frase.get("en"):
                pedido.append(("en", frase["en"]))
    if con_translate:
        for frase in datos.get("translate") or []:
            if frase.get("es"):
                pedido.append(("es", frase["es"]))
    if con_vocabulario:
        for frase in datos.get("vocabulario") or []:
            if frase.get("en"):
                pedido.append(("en", frase["en"]))
    return pedido


def cargar_manifiesto():
    if not os.path.exists(MANIFIESTO):
        return {"voces": {}, "en": {}, "es": {}}
    try:
        m = json.loads(io.open(MANIFIESTO, encoding="utf-8").read())
    except ValueError:
        print("  aviso: audios.json ilegible, se rehace")
        return {"voces": {}, "en": {}, "es": {}}
    for k in ("voces", "en", "es"):
        m.setdefault(k, {})
    return m


def guardar_manifiesto(m):
    m["voces"] = dict((k, v["name"]) for k, v in VOCES.items())
    texto = json.dumps(m, ensure_ascii=False, indent=2, sort_keys=True) + "\n"
    io.open(MANIFIESTO, "w", encoding="utf-8", newline="\n").write(texto)


def sintetizar(texto, idioma, clave):
    voz = VOCES[idioma]
    cuerpo = json.dumps({
        "input": {"text": texto},
        "voice": {"languageCode": voz["languageCode"], "name": voz["name"]},
        "audioConfig": {"audioEncoding": "MP3", "speakingRate": VELOCIDAD},
    }).encode("utf-8")
    pedido = urllib.request.Request(
        API + "?key=" + clave, data=cuerpo,
        headers={"Content-Type": "application/json; charset=utf-8"})
    r = urllib.request.urlopen(pedido, timeout=30)
    try:
        datos = json.loads(r.read().decode("utf-8"))
    finally:
        r.close()
    audio = base64.b64decode(datos["audioContent"])
    if len(audio) < 500:
        raise RuntimeError("Google devolvio un audio vacio (%d bytes)" % len(audio))
    return audio


def main():
    p = argparse.ArgumentParser(
        description="Genera los mp3 de las lecciones con Google Cloud TTS.")
    p.add_argument("--dry-run", action="store_true",
                   help="dice que haria y cuanto texto es, sin llamar a Google")
    p.add_argument("--force", action="store_true",
                   help="regenera aunque el archivo exista (para cambiar de voz)")
    p.add_argument("--limite", type=int, default=0,
                   help="genera como mucho N audios: sirve para probar la cadena")
    p.add_argument("--con-translate", action="store_true",
                   help="genera tambien el espanol de Listen and Translate")
    p.add_argument("--con-vocabulario", action="store_true",
                   help="genera tambien las palabras sueltas del vocabulario")
    p.add_argument("--leccion", default="",
                   help="solo las lecciones cuyo nombre contenga esto")
    args = p.parse_args()

    lecciones = leer_lecciones()
    if args.leccion:
        lecciones = [(a, d) for a, d in lecciones if args.leccion in a]
    if not lecciones:
        print("No hay lecciones para procesar.")
        return 0

    manifiesto = cargar_manifiesto()

    pendientes = []          # (idioma, texto, nombre)
    vistos = set()
    desambiguados = 0
    for archivo, datos in lecciones:
        for idioma, texto in frases_de(datos, args.con_translate, args.con_vocabulario):
            texto = texto.strip()
            if not texto or (idioma, texto) in vistos:
                continue
            vistos.add((idioma, texto))

            nombre = manifiesto[idioma].get(texto)
            if not nombre:
                base = nombre_de(texto)
                nombre = base + ".mp3"
                # Dos frases distintas que se normalizan igual ("Hello!" y
                # "Hello?"): la segunda lleva sufijo para no pisar a la primera.
                # Es raro, pero silencioso si no se controla.
                usados = set(manifiesto[idioma].values())
                n = 2
                while nombre in usados:
                    nombre = "%s-%d.mp3" % (base, n)
                    n += 1
                    desambiguados += 1
                manifiesto[idioma][texto] = nombre

            destino = os.path.join(CARPETA_AUDIO, idioma, nombre)
            if args.force or not os.path.exists(destino):
                pendientes.append((idioma, texto, nombre))

    caracteres = sum(len(t) for _, t, _ in pendientes)
    print("Lecciones leidas:      %d" % len(lecciones))
    print("Frases distintas:      %d" % len(vistos))
    print("Audios por generar:    %d  (%d caracteres)" % (len(pendientes), caracteres))
    if desambiguados:
        print("Nombres desambiguados: %d" % desambiguados)
    if args.limite and len(pendientes) > args.limite:
        pendientes = pendientes[:args.limite]
        print("Limitado a:            %d" % len(pendientes))

    if args.dry_run:
        for idioma, texto, nombre in pendientes[:10]:
            print("   %s/%s   <-  %s" % (idioma, nombre, texto))
        if len(pendientes) > 10:
            print("   ... y %d mas" % (len(pendientes) - 10))
        print("")
        print("Ensayo: no se llamo a Google ni se escribio nada.")
        return 0

    if not pendientes:
        guardar_manifiesto(manifiesto)
        print("")
        print("No hay nada que generar: ya estan todos.")
        return 0

    clave = os.environ.get("GOOGLE_TTS_KEY", "").strip()
    if not clave:
        print("")
        print("Falta la clave. Ponela en el entorno y volve a correr:")
        print('  PowerShell:  $env:GOOGLE_TTS_KEY = "tu-clave"')
        print('  bash:        export GOOGLE_TTS_KEY="tu-clave"')
        return 1

    for idioma in ("en", "es"):
        carpeta = os.path.join(CARPETA_AUDIO, idioma)
        if not os.path.isdir(carpeta):
            os.makedirs(carpeta)

    hechos = 0
    for idioma, texto, nombre in pendientes:
        try:
            audio = sintetizar(texto, idioma, clave)
        except urllib.error.HTTPError as err:
            detalle = err.read().decode("utf-8", "replace")[:400]
            print("")
            print("Google respondio %s. Se corta aca para no repetir el error."
                  % err.code)
            print(detalle)
            guardar_manifiesto(manifiesto)
            return 1
        except Exception as err:
            print("")
            print('Fallo con "%s": %s' % (texto, err))
            guardar_manifiesto(manifiesto)
            return 1
        with io.open(os.path.join(CARPETA_AUDIO, idioma, nombre), "wb") as f:
            f.write(audio)
        hechos += 1
        print("  %s/%s  (%d KB)" % (idioma, nombre, len(audio) // 1024))

    guardar_manifiesto(manifiesto)
    print("")
    print("Listo: %d audios nuevos. audios.json actualizado." % hechos)
    print("Ahora: git add -A, git commit -m \"...\", git push")
    return 0


if __name__ == "__main__":
    sys.exit(main())
