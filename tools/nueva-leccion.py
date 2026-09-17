# -*- coding: utf-8 -*-
"""
Arma una leccion nueva de punta a punta: de un archivo de frases a publicada.

    python tools/nueva-leccion.py frases.txt --titulo "En el restaurante" --nivel A1
    python tools/nueva-leccion.py --publicar leccion-03-en-el-restaurante

No hace nada que no hagan ya generar-lecciones.py y generar-audios.py: los
encadena en orden, con los controles que antes dependian de acordarse.
El porque de cada decision esta en tools/CONTEXTO-nueva-leccion.md.

  1. Valida TODAS las frases antes de escribir nada.
  2. git en main, limpio y al dia, para que el numero de leccion no choque.
  3. Escribe lecciones-md/leccion-NN-tema.md y genera el .html.
  4. Muestra cuanto audio falta y pregunta antes de gastar cuota de Google.
  5. Revisa que git solo muestre archivos de esta leccion: nunca index.html.
  6. Abre la leccion en un servidor local para revisarla, y pregunta si
     publicar: commit, push y espera a que Netlify diga "ready".

EL ARCHIVO DE FRASES

Pares `ingles = espanol`, uno por linea, bajo estas secciones:

    ## Vocabulario
    table = mesa

    ## Frases
    A table for two, please. = Una mesa para dos, por favor.

`## Frases` (o frases sueltas sin ninguna seccion arriba) va a Listen and
Repeat Y a Listen and Type a la vez. Es a proposito: pronunciar y reconocer
por escrito se olvidan a ritmos distintos, y la sesion presenta la frase con el
Repeat y la pregunta con el Type emparejando por posicion (ver PENDIENTES.md).
Si alguna vez tienen que ser distintas, se escriben `## Listen and Repeat` y
`## Listen and Type` por separado. `## Listen and Translate` tambien vale.

Sirve igual un .md completo con frontmatter; entonces --titulo y --nivel sobran.
El Markdown que queda en lecciones-md/ lo escribe este script, en el formato
exacto de _plantilla.md, y el numero lo elige el: no hace falta adivinarlo.

PREGUNTAR, NO ADIVINAR

Las preguntas usan input(). Sin teclado --un agente con stdin cerrado, o
`< /dev/null`-- input() recibe fin de archivo y eso cuenta como NO: no se
generan audios, no se abre nada y no se publica. Ni cuota de Google ni
produccion sin un "s" escrito por una persona.
"""
import argparse
import html as html_mod
import importlib.util
import io
import json
import os
import re
import shutil
import socket
import subprocess
import sys
import time
import webbrowser

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TOOLS = os.path.join(RAIZ, "tools")
CARPETA_MD = os.path.join(RAIZ, "lecciones-md")

# Respaldo por si falta .netlify/state.json, que esta en .gitignore: un clon
# nuevo no lo tiene hasta correr `netlify link`.
SITE_ID = "c7d1e067-fccf-4ca1-9b71-7ae82aa7d32c"
PANEL_DEPLOYS = "https://app.netlify.com/sites/englishlyl/deploys"
ESPERA_DEPLOY = 180

SECCIONES = {
    "frases": "frases",
    "vocabulario": "vocabulario",
    "listen and repeat": "repeat",
    "listen and type": "type",
    "listen and translate": "translate",
}
# Orden y encabezados con los que se escribe el .md, igual que _plantilla.md.
ENCABEZADOS = [
    ("vocabulario", "Vocabulario"),
    ("repeat", "Listen and Repeat"),
    ("type", "Listen and Type"),
    ("translate", "Listen and Translate"),
]
# Lo que escriben los generadores. Nada de esto puede estar suelto al empezar,
# ni cambiado al publicar si no es de la leccion que se publica.
MANIFIESTOS = ("lessons.json", "vocabulario.json", "audios.json")


def cortar(*lineas):
    print("")
    for linea in lineas:
        print(linea)
    sys.exit(1)


def preguntar(texto):
    """True solo con un si escrito. Sin teclado (fin de archivo) es NO."""
    try:
        respuesta = input(texto + " [s/N] ")
    except EOFError:
        print("")
        return False
    return respuesta.strip().lower() in ("s", "si", "sí", "y", "yes")


def git(*args):
    # core.quotepath=false: sin eso git devuelve "lecci\303\263n" en vez de la ruta.
    return subprocess.run(
        ["git", "-c", "core.quotepath=false"] + list(args), cwd=RAIZ,
        capture_output=True, encoding="utf-8", errors="replace")


def correr(script, *args, **kw):
    # UTF-8 explicito: con la salida en un pipe (Git Bash, un agente) Python usa
    # cp1252 y los acentos de los otros scripts llegan rotos.
    kw.setdefault("env", dict(os.environ, PYTHONIOENCODING="utf-8"))
    return subprocess.run(
        [sys.executable, os.path.join(TOOLS, script)] + list(args), cwd=RAIZ, **kw)


def estado_git():
    """[(codigo, ruta)] de git status, con una entrada por archivo."""
    r = git("status", "--porcelain", "-z", "--untracked-files=all")
    if r.returncode != 0:
        cortar("git status fallo:", r.stderr.strip())
    entradas = []
    partes = r.stdout.split("\0")
    i = 0
    while i < len(partes):
        entrada = partes[i]
        i += 1
        if not entrada:
            continue
        codigo, ruta = entrada[:2], entrada[3:]
        if "R" in codigo or "C" in codigo:
            i += 1   # con -z, la ruta de origen de un renombre viene aparte
        entradas.append((codigo, ruta))
    return entradas


def es_de_generador(ruta):
    return bool(
        re.match(r"^leccion-[^/]*\.html$", ruta)
        or re.match(r"^lecciones-md/leccion-[^/]*\.md$", ruta)
        or ruta.startswith("assets/")
        or ruta in MANIFIESTOS
        or ruta == "index.html")


def chequear_rama():
    rama = git("rev-parse", "--abbrev-ref", "HEAD").stdout.strip()
    if rama != "main":
        cortar("Estas en la rama %r y Netlify publica main." % rama,
               "Cambiate con `git switch main` y volve a correr esto.")


# ---------------------------------------------------------------------------
# Frases
# ---------------------------------------------------------------------------

def leer_frases(ruta):
    """(meta, secciones, errores). No escribe nada.

    generar-lecciones.py descarta EN SILENCIO una linea sin '=' o una seccion
    con el nombre mal escrito: la leccion sale con una frase menos y nadie se
    entera. Aca eso es un error con numero de linea, antes de tocar el disco.
    """
    texto = io.open(ruta, encoding="utf-8-sig").read()

    meta = {}
    cuerpo, desfase = texto, 0
    m = re.match(r"^---\s*\n(.*?)\n---\s*\n(.*)$", texto, re.S)
    if m:
        for linea in m.group(1).splitlines():
            if ":" in linea:
                k, v = linea.split(":", 1)
                meta[k.strip().lower()] = v.strip()
        cuerpo = m.group(2)
        desfase = texto[:m.start(2)].count("\n")

    secciones = {"frases": [], "vocabulario": [], "repeat": [], "type": [], "translate": []}
    errores = []
    vistas = {}
    actual = "frases"
    for n, linea in enumerate(cuerpo.splitlines(), desfase + 1):
        if not linea.strip():
            continue
        cabecera = re.match(r"^\s*#+\s*(.*?)\s*$", linea)
        if cabecera:
            actual = SECCIONES.get(cabecera.group(1).lower())
            if not actual:
                errores.append(
                    "linea %d: no existe la seccion %r. Las que hay: Frases, Vocabulario, "
                    "Listen and Repeat, Listen and Type, Listen and Translate."
                    % (n, cabecera.group(1)))
            continue
        if not actual:
            continue   # debajo de una seccion invalida: ya se aviso arriba
        if "=" not in linea:
            errores.append("linea %d: falta el '=' entre ingles y espanol: %s" % (n, linea.strip()))
            continue
        en, es = [x.strip() for x in linea.split("=", 1)]
        if not en or not es:
            errores.append("linea %d: falta el %s: %s"
                           % (n, "ingles" if not en else "espanol", linea.strip()))
            continue
        # Los datos van dentro de un <script>: esto lo cerraria antes de tiempo.
        if "</script" in (en + es).lower():
            errores.append("linea %d: '</script' rompe la pagina: %s" % (n, linea.strip()))
            continue
        clave = (actual, en.lower())
        if clave in vistas:
            errores.append("linea %d: %r ya esta en la linea %d, en la misma seccion"
                           % (n, en, vistas[clave]))
            continue
        vistas[clave] = n
        secciones[actual].append({"en": en, "es": es})

    frases = secciones.pop("frases")
    if frases and (secciones["repeat"] or secciones["type"]):
        errores.append("Hay Frases y tambien Listen and Repeat / Listen and Type. Usa una "
                       "forma o la otra: Frases ya va a las dos.")
    elif frases:
        secciones["repeat"] = list(frases)
        secciones["type"] = list(frases)

    if not errores and not (secciones["repeat"] or secciones["type"] or secciones["translate"]):
        errores.append("No hay ninguna frase: la leccion quedaria sin ejercicios.")
    return meta, secciones, errores


def escribir_md(ruta, meta, secciones):
    lineas = ["---"]
    for k in ("titulo", "nivel", "idioma_audio", "idioma_audio_es"):
        lineas.append("%s: %s" % (k, meta[k]))
    lineas.append("---")
    for clave, encabezado in ENCABEZADOS:
        if secciones[clave]:
            lineas.append("")
            lineas.append("## " + encabezado)
            lineas.extend("%s = %s" % (p["en"], p["es"]) for p in secciones[clave])
    io.open(ruta, "w", encoding="utf-8", newline="\n").write("\n".join(lineas) + "\n")


def siguiente_numero():
    """El mayor NN entre las lecciones y los .md, mas uno.

    Se miran las dos carpetas porque hay lecciones sin su Markdown (la 01).
    """
    mayor = 0
    for carpeta, extension in ((RAIZ, "html"), (CARPETA_MD, "md")):
        for nombre in os.listdir(carpeta):
            m = re.match(r"^leccion-(\d+)-.*\.%s$" % extension, nombre)
            if m:
                mayor = max(mayor, int(m.group(1)))
    return "%02d" % (mayor + 1)


def cargar_nombre_de():
    """El normalizado de generar-audios.py, el mismo que nombra los mp3.

    Se importa en vez de copiarlo: dos copias del mismo normalizado terminan
    desincronizadas en silencio. generar-lecciones.py no se puede importar asi,
    porque corre main() al cargarse; ese va por subprocess.
    """
    spec = importlib.util.spec_from_file_location(
        "generar_audios", os.path.join(TOOLS, "generar-audios.py"))
    modulo = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(modulo)
    return modulo.nombre_de


def deshacer(id_leccion):
    for ruta in (os.path.join(CARPETA_MD, id_leccion + ".md"),
                 os.path.join(RAIZ, id_leccion + ".html")):
        if os.path.exists(ruta):
            os.remove(ruta)
    # Se empezo con git limpio, asi que volver los manifiestos a HEAD no pisa
    # nada de nadie.
    git("checkout", "--", *MANIFIESTOS)


# ---------------------------------------------------------------------------
# Audio
# ---------------------------------------------------------------------------

def costo_de_audio(id_leccion, extra):
    """(audios, caracteres) segun el ensayo de generar-audios.py, o None."""
    r = correr("generar-audios.py", "--dry-run", "--leccion", id_leccion, *extra,
               capture_output=True, encoding="utf-8", errors="replace")
    salida = (r.stdout or "") + (r.stderr or "")
    for linea in salida.rstrip().splitlines():
        print("  " + linea)
    m = re.search(r"Audios por generar:\s+(\d+)\s+\((\d+) caracteres\)", salida)
    if r.returncode != 0 or not m:
        return None
    audios, caracteres = int(m.group(1)), int(m.group(2))
    limitado = re.search(r"Limitado a:\s+(\d+)", salida)
    if limitado:
        audios = int(limitado.group(1))
    return audios, caracteres


def paso_audios(id_leccion, args):
    extra = []
    if args.con_translate:
        extra.append("--con-translate")
    if args.con_vocabulario:
        extra.append("--con-vocabulario")
    if args.limite:
        extra += ["--limite", str(args.limite)]
    reintento = "python tools/generar-audios.py --leccion %s --pedir-clave" % id_leccion

    costo = costo_de_audio(id_leccion, extra)
    if costo is None:
        print("  No pude leer el ensayo. La leccion igual anda con la voz del navegador.")
        print("  Para generar los audios a mano: " + reintento)
        return
    audios, caracteres = costo
    if audios == 0:
        print("  No hay audios nuevos: las frases ya tenian su mp3.")
        return
    if args.limite:
        pregunta = "  Generar %d audios de prueba con Google?" % audios
    else:
        pregunta = "  Generar %d audios (%d caracteres) con Google?" % (audios, caracteres)
    if not preguntar(pregunta):
        print("  Sin audios por ahora. Antes de publicar se pueden generar con:")
        print("    " + reintento)
        return

    clave = []
    if args.pedir_clave:
        clave.append("--pedir-clave")
    if args.clave_archivo:
        clave += ["--clave-archivo", args.clave_archivo]
    # Sin capturar la salida: la consola es del usuario, y --pedir-clave necesita
    # leer el teclado.
    r = correr("generar-audios.py", "--leccion", id_leccion, *(extra + clave))
    if r.returncode != 0:
        print("")
        print("  No se generaron todos los audios. No es fatal: lo que falte suena con")
        print("  la voz del navegador. Para reintentar antes de publicar:")
        print("    " + reintento)


# ---------------------------------------------------------------------------
# Control, revision y publicacion
# ---------------------------------------------------------------------------

def controlar_archivos(*ids):
    """Las rutas a commitear. Corta si git muestra algo que no es de estas lecciones.

    Es la red contra lo que ya paso una vez: un generador que piso index.html.
    Tambien por eso se commitea con una lista explicita y no con `git add -A`:
    netlify.toml publica la raiz, asi que un frases.txt o un archivo con la
    clave que se cuele en el commit queda descargable desde el sitio.

    Acepta varios ids porque tools/nueva-semana.py publica una semana entera en
    un solo commit (y un solo deploy).
    """
    propios = set(MANIFIESTOS)
    for id_leccion in ids:
        propios.update({"lecciones-md/%s.md" % id_leccion, "%s.html" % id_leccion})

    subir, ajenos, sueltos, mp3_cambiados = [], [], [], []
    for codigo, ruta in estado_git():
        audio = ruta.startswith("assets/audio/") and ruta.endswith(".mp3")
        # Un mp3 solo puede ser NUEVO: assets/ se sirve con cache inmutable de un
        # ano, asi que uno ya publicado que cambia de contenido (generar-audios.py
        # --force) no le llega a quien ya lo tenia. Eso se decide aparte, a mano.
        if audio and codigo not in ("??", "A ", "AM"):
            mp3_cambiados.append((codigo, ruta))
        elif (ruta in propios or audio) and "D" not in codigo:
            subir.append(ruta)
        elif codigo == "??" and not es_de_generador(ruta):
            sueltos.append(ruta)
        else:
            ajenos.append((codigo, ruta))

    if mp3_cambiados:
        cortar(*(["Hay mp3 ya publicados que cambiaron o se borraron:"]
                 + ["  %s %s" % c for c in mp3_cambiados]
                 + ["", "assets/ se cachea como inmutable durante un ano: un mp3 publicado nunca",
                    "cambia de contenido. Si fue un --force por cambiar de voz, eso es una",
                    "tarea aparte. Si no, descartalo con `git checkout -- <archivo>`.",
                    "No se commiteo nada."]))

    if ajenos:
        lineas = ["git muestra cambios que no son de %s:" % ", ".join(ids)]
        lineas += ["  %s %s" % c for c in ajenos]
        if any(ruta == "index.html" for _, ruta in ajenos):
            lineas += ["",
                       "index.html NO se toca nunca: tiene el login, la racha y la PWA, y",
                       "la lista de lecciones sale de lessons.json. Algo lo piso."]
        lineas += ["", "No se commiteo nada. Mira esos archivos con `git diff` y descarta "
                       "lo que no corresponda."]
        cortar(*lineas)

    for ruta in sueltos:
        print("  no se sube (no es de la leccion): %s" % ruta)
    return subir


def esperar_servidor(puerto):
    limite = time.time() + 5
    while time.time() < limite:
        try:
            socket.create_connection(("127.0.0.1", puerto), timeout=0.5).close()
            return True
        except OSError:
            time.sleep(0.2)
    return False


def revisar_en_navegador(id_leccion):
    """Un servidor local, no un deploy preview: no gasta creditos de Netlify.

    Los creditos ya se agotaron una vez (PENDIENTES.md). La leccion anda sin
    login, asi que el servidor estatico alcanza para verla y escucharla; lo
    unico que no funciona es lo que pasa por netlify/functions.
    """
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        puerto = s.getsockname()[1]
    url = "http://127.0.0.1:%d/%s.html" % (puerto, id_leccion)

    servidor = subprocess.Popen(
        [sys.executable, "-m", "http.server", str(puerto), "--bind", "127.0.0.1"],
        cwd=RAIZ, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        if not esperar_servidor(puerto):
            print("  El servidor local no arranco. Se sigue sin revision.")
            return
        print("  " + url)
        print("  (Mejor en ventana privada: el service worker de la app cachea.)")
        webbrowser.open(url)
        try:
            input("  Enter cuando termines de revisar... ")
        except EOFError:
            print("")
    finally:
        servidor.terminate()
        servidor.wait()


def leer_site_id():
    try:
        return json.load(io.open(os.path.join(RAIZ, ".netlify", "state.json"),
                                 encoding="utf-8"))["siteId"]
    except (OSError, ValueError, KeyError):
        return SITE_ID


def buscar_deploy(netlify, site_id, sha):
    """(deploy o None, problema o None)."""
    try:
        r = subprocess.run(
            [netlify, "api", "listSiteDeploys", "--data",
             json.dumps({"site_id": site_id, "per_page": 10})],
            cwd=RAIZ, capture_output=True, encoding="utf-8", errors="replace", timeout=60)
    except (OSError, subprocess.TimeoutExpired) as err:
        return None, str(err)
    if r.returncode != 0:
        detalle = (r.stderr or r.stdout).strip().splitlines()
        return None, detalle[-1] if detalle else "salio con codigo %d" % r.returncode
    try:
        deploys = json.loads(r.stdout)
    except ValueError:
        return None, "la respuesta no es JSON"
    for deploy in deploys:
        if deploy.get("commit_ref") == sha:
            return deploy, None
    return None, None


def esperar_deploy(sha):
    """Un push que sale bien no es un deploy que sale bien.

    Hubo cinco commits pusheados sin problema cuyo deploy fallo por creditos
    agotados, y produccion quedo clavada sin que nada avisara (PENDIENTES.md).
    """
    netlify = shutil.which("netlify")
    if not netlify:
        print("No esta la CLI de Netlify. Confirma a mano que el deploy diga Published:")
        print("  " + PANEL_DEPLOYS)
        return 0

    site_id = leer_site_id()
    print("Esperando el deploy de Netlify (hasta %d s)..." % ESPERA_DEPLOY)
    limite = time.time() + ESPERA_DEPLOY
    ultimo = None
    while True:
        deploy, problema = buscar_deploy(netlify, site_id, sha)
        if problema:
            print("  No pude consultar a Netlify: %s" % problema)
            print("  Confirmalo a mano: " + PANEL_DEPLOYS)
            return 0
        if deploy:
            estado = deploy.get("state")
            if estado != ultimo:
                print("  %s" % estado)
                ultimo = estado
            if estado == "ready":
                print("")
                print("Publicada: https://englishlyl.netlify.app")
                return 0
            if estado in ("error", "rejected", "skipped"):
                print("")
                print("El deploy NO salio: %s" % (deploy.get("error_message") or estado))
                print("El commit esta en GitHub pero produccion sigue con la version anterior.")
                print("  " + PANEL_DEPLOYS)
                return 1
        if time.time() > limite:
            print("")
            print("Netlify no termino en %d s. Seguilo desde el panel:" % ESPERA_DEPLOY)
            print("  " + PANEL_DEPLOYS)
            return 0
        time.sleep(10)


def publicar(*ids, mensaje=None):
    """Un commit, un push y un deploy para todas las lecciones que se pasen."""
    chequear_rama()
    for id_leccion in ids:
        if not os.path.exists(os.path.join(RAIZ, id_leccion + ".html")):
            cortar("No existe %s.html." % id_leccion)

    print("Controlando archivos")
    archivos = controlar_archivos(*ids)
    if not archivos:
        cortar("No hay nada para publicar: %s ya esta commiteada." % ", ".join(ids))

    if mensaje is None:
        id_leccion = ids[0]
        ruta_html = os.path.join(RAIZ, id_leccion + ".html")
        titulo = re.search(r"<title>(.*?)</title>", io.open(ruta_html, encoding="utf-8").read(), re.S)
        titulo = html_mod.unescape(titulo.group(1).strip()) if titulo else id_leccion
        numero = re.match(r"^leccion-(\d+)", id_leccion).group(1)
        mensaje = "Agrega lección %s: %s" % (numero, titulo)

    r = git("add", "--", *archivos)
    if r.returncode != 0:
        cortar("git add fallo:", r.stderr.strip())
    r = git("commit", "-m", mensaje)
    if r.returncode != 0:
        cortar("git commit fallo:", (r.stdout + r.stderr).strip())
    print("  commit con %d archivos" % len(archivos))

    if subprocess.run(["git", "push"], cwd=RAIZ).returncode != 0:
        cortar("El commit quedo hecho pero el push fallo. Si GitHub tiene algo nuevo:",
               "  git pull --rebase",
               "  git push")
    return esperar_deploy(git("rev-parse", "HEAD").stdout.strip())


def normalizar_id(texto):
    id_leccion = re.sub(r"\.(html|md)$", "", os.path.basename(texto.strip()))
    if not re.match(r"^leccion-\d+-", id_leccion):
        cortar("%r no parece un id de leccion (leccion-NN-tema)." % texto)
    return id_leccion


# ---------------------------------------------------------------------------

def crear(args):
    entrada = os.path.abspath(args.entrada)
    if not os.path.isfile(entrada):
        cortar("No existe el archivo: " + entrada)
    relativa = os.path.relpath(entrada, RAIZ).replace(os.sep, "/")
    if re.match(r"^lecciones-md/leccion-", relativa):
        cortar("El archivo de frases no puede llamarse lecciones-md/leccion-*.md:",
               "ese nombre lo usa el generador, y el numero lo elige este script.",
               "Renombralo, por ejemplo a lecciones-md/_frases-tema.txt.")

    print("[1/6] Revisando las frases")
    meta, secciones, errores = leer_frases(entrada)
    for campo, valor in (("titulo", args.titulo), ("nivel", args.nivel)):
        if valor:
            meta[campo] = valor.strip()
        if not meta.get(campo):
            errores.append("Falta el %s: --%s o '%s:' en el frontmatter." % (campo, campo, campo))
    meta["idioma_audio"] = meta.get("idioma_audio") or "en-US"
    meta["idioma_audio_es"] = meta.get("idioma_audio_es") or "es-419"
    if errores:
        cortar("No se escribio nada. Corregi esto en %s:" % args.entrada,
               *["  " + e for e in errores])
    print("  vocabulario=%d  repeat=%d  type=%d  translate=%d" % tuple(
        len(secciones[k]) for k in ("vocabulario", "repeat", "type", "translate")))

    print("[2/6] Revisando git")
    chequear_rama()
    sucio = [(c, ruta) for c, ruta in estado_git()
             if ruta != relativa and (c != "??" or es_de_generador(ruta))]
    if sucio:
        cortar("git tiene cambios sin commitear:",
               *(["  %s %s" % s for s in sucio] +
                 ["", "Commitealos o descartalos antes. Si es una leccion a medio hacer,",
                  "publicala con --publicar o borrala."]))
    if not args.sin_pull:
        r = git("pull", "--ff-only")
        if r.returncode != 0:
            cortar("git pull --ff-only fallo:", (r.stdout + r.stderr).strip(), "",
                   "Sin conexion se puede seguir con --sin-pull, pero el numero de",
                   "leccion podria chocar con uno ya publicado desde otra maquina.")

    id_leccion = "leccion-%s-%s" % (siguiente_numero(), cargar_nombre_de()(meta["titulo"]))
    ruta_md = os.path.join(CARPETA_MD, id_leccion + ".md")

    print("[3/6] Generando %s" % id_leccion)
    escribir_md(ruta_md, meta, secciones)
    if correr("generar-lecciones.py", ruta_md).returncode != 0:
        deshacer(id_leccion)
        cortar("generar-lecciones.py fallo. Se borro lo que se habia escrito.")

    print("")
    print("[4/6] Audios")
    paso_audios(id_leccion, args)

    print("")
    print("[5/6] Controlando archivos")
    archivos = controlar_archivos(id_leccion)
    mp3 = [a for a in archivos if a.endswith(".mp3")]
    for ruta in archivos:
        if ruta not in mp3:
            print("  " + ruta)
    if mp3:
        print("  assets/audio/: %d mp3" % len(mp3))

    print("")
    print("[6/6] Revision")
    if preguntar("  Abrir la leccion en el navegador?"):
        revisar_en_navegador(id_leccion)
    if preguntar("  Publicar %s en englishlyl.netlify.app?" % id_leccion):
        print("")
        return publicar(id_leccion)

    print("")
    print("No se publico nada: los archivos quedan sin commitear. Para publicar despues:")
    print("  python tools/nueva-leccion.py --publicar %s" % id_leccion)
    return 0


def main():
    p = argparse.ArgumentParser(
        description="De un archivo de frases a una leccion publicada, con audio y revision.")
    p.add_argument("entrada", nargs="?", help="archivo de frases (.txt o .md)")
    p.add_argument("--titulo", help='titulo de la leccion, ej. "En el restaurante"')
    p.add_argument("--nivel", help="nivel, ej. A1")
    p.add_argument("--publicar", metavar="ID",
                   help="publica una leccion ya generada (leccion-NN-tema)")
    p.add_argument("--sin-pull", action="store_true",
                   help="no hace git pull antes de numerar (sin conexion)")
    audio = p.add_argument_group("pasan tal cual a generar-audios.py")
    audio.add_argument("--pedir-clave", action="store_true")
    audio.add_argument("--clave-archivo", default="")
    audio.add_argument("--con-translate", action="store_true")
    audio.add_argument("--con-vocabulario", action="store_true")
    audio.add_argument("--limite", type=int, default=0)
    args = p.parse_args()

    # Sin esto, con la salida en un pipe, lo que imprimen los scripts hijos
    # aparece antes que los encabezados de este y el orden no se entiende.
    sys.stdout.reconfigure(line_buffering=True)

    if bool(args.entrada) == bool(args.publicar):
        p.error("pasa un archivo de frases, o --publicar ID: una de las dos")
    try:
        if args.publicar:
            return publicar(normalizar_id(args.publicar))
        return crear(args)
    except KeyboardInterrupt:
        print("")
        print("Cortado. Lo que ya se escribio queda sin commitear: revisalo con git status.")
        return 130


if __name__ == "__main__":
    sys.exit(main())
