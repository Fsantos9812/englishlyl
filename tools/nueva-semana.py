# -*- coding: utf-8 -*-
"""
Las 5 lecciones de una semana de Ruta al Ingles, de sus frases a publicadas en
UN solo commit y UN solo deploy.

    python tools/nueva-semana.py <carpeta-de-la-semana>/sitio                 # genera
    python tools/nueva-semana.py <carpeta-de-la-semana>/sitio --pedir-clave   # genera, audio y publica
    python tools/nueva-semana.py <carpeta-de-la-semana>/sitio --publicar      # publica lo ya generado

La carpeta `sitio/` la escribe armar-semana.py, que vive FUERA de este repo
(INGLES_LORE_Y_LUCI/RUTA-AL-INGLES) junto con las diapositivas de la semana:
un semana.json y un _frases-N-dia.txt por dia. El presupuesto de carga
cognitiva se valida alla. Aca se controla que lo que se genera y se publica sea
EXACTAMENTE lo validado:

  * semana.json guarda la huella (sha256) de cada _frases. Si un archivo se
    toco despues, aunque conserve la cantidad de frases, corta.
  * --publicar compara cada leccion generada (.md y .html) con su _frases. Si
    se rearmo la semana despues de generar, corta en vez de publicar lo viejo.

Por que no correr nueva-leccion.py cinco veces: esa exige git limpio para
numerar, asi que habria que publicar cada leccion antes de generar la
siguiente. Son cinco deploys por semana, y los creditos de Netlify ya se
agotaron una vez (PENDIENTES.md).

Todo lo demas es nueva-leccion.py: se importan sus funciones, con sus mismas
reglas (ver tools/CONTEXTO-nueva-leccion.md). Sin teclado --un agente, o
`< /dev/null`-- cada pregunta es NO: ni audios ni publicacion, tampoco con
--publicar.
"""
import argparse
import hashlib
import importlib.util
import io
import json
import os
import re
import sys

TOOLS = os.path.dirname(os.path.abspath(__file__))
SECCIONES = ("vocabulario", "repeat", "type", "translate")


def cargar_nueva_leccion():
    spec = importlib.util.spec_from_file_location(
        "nueva_leccion", os.path.join(TOOLS, "nueva-leccion.py"))
    modulo = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(modulo)
    return modulo


nl = cargar_nueva_leccion()


def filtro_de(semana):
    """Lo que tienen en comun los ids de la semana: leccion-NN-s03-lun-...

    Sin guion adelante a proposito: generar-audios.py lo recibe como
    `--leccion s03-` y argparse tomaria `-s03-` por una opcion.
    """
    return "s%02d-" % semana


def ids_de_la_semana(semana):
    patron = re.compile(r"^(leccion-\d+-s%02d-[^/]*)\.(html|md)$" % semana)
    ids = set()
    for carpeta in (nl.RAIZ, nl.CARPETA_MD):
        for nombre in os.listdir(carpeta):
            m = patron.match(nombre)
            if m:
                ids.add(m.group(1))
    return sorted(ids)


def huella(ruta):
    with open(ruta, "rb") as f:
        return hashlib.sha256(f.read()).hexdigest()


def leer_semana(carpeta):
    """(semana.json, [(meta, secciones)]) con cada _frases verificado."""
    ruta = os.path.join(carpeta, "semana.json")
    if not os.path.isfile(ruta):
        nl.cortar("No existe %s." % ruta,
                  "La carpeta sitio/ la escribe armar-semana.py (RUTA-AL-INGLES/herramientas).")
    try:
        semana = json.load(io.open(ruta, encoding="utf-8-sig"))
    except ValueError as err:
        nl.cortar("semana.json no es un JSON valido: %s" % err)
    for campo in ("semana", "titulo", "nivel", "lecciones"):
        if not semana.get(campo):
            nl.cortar("semana.json no tiene '%s'." % campo)

    lecciones, errores = [], []
    for item in semana["lecciones"]:
        archivo = os.path.join(carpeta, item.get("archivo", ""))
        if not os.path.isfile(archivo):
            errores.append("falta %s" % item.get("archivo"))
            continue
        # armar-semana.py valido el presupuesto sobre este contenido exacto. Si la
        # huella no coincide, el archivo cambio despues y ese control ya no vale.
        if item.get("huella") != huella(archivo):
            errores.append("%s cambio despues de armar-semana.py. Volve a correr armar-semana.py."
                           % item["archivo"])
            continue
        meta, secciones, problemas = nl.leer_frases(archivo)
        errores += ["%s: %s" % (item["archivo"], p) for p in problemas]
        if problemas:
            continue
        meta.update({"titulo": item["titulo"], "nivel": semana["nivel"]})
        meta["idioma_audio"] = meta.get("idioma_audio") or "en-US"
        meta["idioma_audio_es"] = meta.get("idioma_audio_es") or "es-419"
        lecciones.append((meta, secciones))
    if errores:
        nl.cortar("No se escribio ni se publico nada. Corregi esto:", *["  " + e for e in errores])
    return semana, lecciones


def pares(lista):
    return [(p.get("en", ""), p.get("es", "")) for p in lista or []]


def verificar_generadas(n, lecciones):
    """Los ids de la semana, si lo generado coincide EXACTAMENTE con sitio/."""
    nombre_de = nl.cargar_nombre_de()
    generados = ids_de_la_semana(n)
    ids, problemas = [], []
    for meta, secciones in lecciones:
        slug = nombre_de(meta["titulo"])
        candidatos = [i for i in generados if re.match(r"^leccion-\d+-%s$" % re.escape(slug), i)]
        if len(candidatos) != 1:
            problemas.append("%s: %d lecciones generadas con ese titulo" % (meta["titulo"], len(candidatos)))
            continue
        id_leccion = candidatos[0]
        ids.append(id_leccion)
        ruta_md = os.path.join(nl.CARPETA_MD, id_leccion + ".md")
        if not os.path.exists(ruta_md) or not os.path.exists(os.path.join(nl.RAIZ, id_leccion + ".html")):
            problemas.append("%s: falta el .md o el .html" % id_leccion)
            continue
        _, en_md, errores_md = nl.leer_frases(ruta_md)
        en_html = nl.datos_de_leccion(id_leccion)
        for seccion in SECCIONES:
            esperado = pares(secciones[seccion])
            if errores_md or pares(en_md[seccion]) != esperado:
                problemas.append("%s: el .md no coincide con sitio/ (%s)" % (id_leccion, seccion))
                break
            if pares(en_html.get(seccion)) != esperado:
                problemas.append("%s: el .html no coincide con sitio/ (%s)" % (id_leccion, seccion))
                break
    sobran = sorted(set(generados) - set(ids))
    if sobran:
        problemas.append("hay lecciones de la semana que sitio/ no tiene: %s" % ", ".join(sobran))
    if problemas:
        nl.cortar(*(["Lo generado no es lo que hay en sitio/: no se publica nada."]
                    + ["  " + p for p in problemas]
                    + ["", "Si se rearmo la semana, borra sus lecciones (lecciones-md/leccion-*-s%02d-*.md"
                           " y leccion-*-s%02d-*.html)," % (n, n),
                       "descarta los manifiestos con `git checkout -- lessons.json vocabulario.json audios.json`",
                       "y volve a generar."]))
    return ids


def mensaje(semana, cuantas):
    return "Agrega semana %02d de Ruta al Inglés: %s (%d lecciones)" % (
        semana["semana"], semana["titulo"], cuantas)


def crear(args, semana, lecciones):
    n = semana["semana"]
    ya = ids_de_la_semana(n)
    if ya:
        nl.cortar("La semana %d ya tiene lecciones generadas:" % n, *["  " + i for i in ya],
                  "", "Para publicarlas: python tools/nueva-semana.py \"%s\" --publicar" % args.carpeta,
                  "Para rehacerlas, borralas antes (y descarta los cambios en los manifiestos).")

    print("[2/6] Revisando git")
    nl.chequear_rama()
    sucio = [(c, ruta) for c, ruta in nl.estado_git() if c != "??" or nl.es_de_generador(ruta)]
    if sucio:
        nl.cortar("git tiene cambios sin commitear:", *(["  %s %s" % s for s in sucio] +
                  ["", "Commitealos o descartalos antes."]))
    if not args.sin_pull:
        r = nl.git("pull", "--ff-only")
        if r.returncode != 0:
            nl.cortar("git pull --ff-only fallo:", (r.stdout + r.stderr).strip(), "",
                      "Sin conexion se puede seguir con --sin-pull.")

    # Todos los ids se calculan y controlan ANTES de escribir el primer archivo.
    nombre_de = nl.cargar_nombre_de()
    base = int(nl.siguiente_numero())
    ids = ["leccion-%02d-%s" % (base + i, nombre_de(meta["titulo"])) for i, (meta, _) in enumerate(lecciones)]
    malos = [i for i in ids if filtro_de(n) not in i]
    if malos or len(set(ids)) != len(ids):
        nl.cortar("Los titulos no dan ids distintos de la semana %d: %s" % (n, ", ".join(malos or ids)),
                  "Los titulos tienen que empezar con S%02d, como los arma armar-semana.py." % n)

    print("[3/6] Generando %d lecciones" % len(lecciones))
    escritos = []
    try:
        for id_leccion, (meta, secciones) in zip(ids, lecciones):
            escritos.append(id_leccion)   # antes de escribir: si falla a mitad, tambien se borra
            nl.escribir_md(os.path.join(nl.CARPETA_MD, id_leccion + ".md"), meta, secciones)
            print("  " + id_leccion)
        ok = nl.correr("generar-lecciones.py",
                       *[os.path.join(nl.CARPETA_MD, i + ".md") for i in ids]).returncode == 0
    except (Exception, KeyboardInterrupt):
        for id_leccion in escritos:
            nl.deshacer(id_leccion)
        print("")
        print("Se corto a mitad de la generacion. Se borro lo que se habia escrito.")
        raise
    if not ok:
        for id_leccion in ids:
            nl.deshacer(id_leccion)
        nl.cortar("generar-lecciones.py fallo. Se borro lo que se habia escrito.")

    # El filtro de generar-audios.py es un `in` sobre el nombre de archivo:
    # antes de usarlo para gastar cuota, confirmar que agarra exactamente estas.
    agarra = sorted(nombre[:-5] for nombre in os.listdir(nl.RAIZ)
                    if nombre.startswith("leccion-") and nombre.endswith(".html") and filtro_de(n) in nombre)
    if agarra != sorted(ids):
        nl.cortar("El filtro de audio %r no coincide con las lecciones generadas." % filtro_de(n),
                  "Las lecciones quedan sin commitear; genera los audios de a una.")

    print("")
    print("[4/6] Audios de las %d lecciones (las frases repetidas entre dias cuentan una vez)" % len(ids))
    nl.paso_audios(filtro_de(n), args)

    print("")
    print("[5/6] Controlando archivos")
    archivos = nl.controlar_archivos(*ids)
    mp3 = [a for a in archivos if a.endswith(".mp3")]
    for ruta in archivos:
        if ruta not in mp3:
            print("  " + ruta)
    if mp3:
        print("  assets/audio/: %d mp3" % len(mp3))

    print("")
    print("[6/6] Revision")
    if nl.preguntar("  Abrir el indice en el navegador?"):
        nl.revisar_en_navegador("index")
    if nl.preguntar("  Publicar las %d lecciones de la semana %d en englishlyl.netlify.app?" % (len(ids), n)):
        print("")
        return nl.publicar(*ids, mensaje=mensaje(semana, len(ids)))

    print("")
    print("No se publico nada: los archivos quedan sin commitear. Para publicar despues:")
    print('  python tools/nueva-semana.py "%s" --publicar' % args.carpeta)
    return 0


def publicar(args, semana, lecciones):
    print("[2/2] Comparando lo generado con sitio/")
    ids = verificar_generadas(semana["semana"], lecciones)
    for id_leccion in ids:
        print("  " + id_leccion)
    return nl.publicar(*ids, mensaje=mensaje(semana, len(ids)), confirmar=True)


def main():
    p = argparse.ArgumentParser(
        description="Las 5 lecciones de una semana de Ruta al Ingles, en un solo deploy.")
    p.add_argument("carpeta", help="carpeta sitio/ que escribio armar-semana.py")
    p.add_argument("--publicar", action="store_true",
                   help="publica las lecciones ya generadas, si coinciden con sitio/")
    p.add_argument("--sin-pull", action="store_true",
                   help="no hace git pull antes de numerar (sin conexion)")
    audio = p.add_argument_group("pasan tal cual a generar-audios.py")
    audio.add_argument("--pedir-clave", action="store_true")
    audio.add_argument("--clave-archivo", default="")
    audio.add_argument("--con-translate", action="store_true")
    audio.add_argument("--con-vocabulario", action="store_true")
    audio.add_argument("--limite", type=int, default=0)
    args = p.parse_args()

    sys.stdout.reconfigure(line_buffering=True)
    try:
        print("[1/%d] Revisando las frases de la semana" % (2 if args.publicar else 6))
        semana, lecciones = leer_semana(os.path.abspath(args.carpeta))
        for meta, secciones in lecciones:
            print("  %-38s vocabulario=%d  frases=%d" % (meta["titulo"], len(secciones["vocabulario"]),
                                                         len(secciones["repeat"])))
        if args.publicar:
            return publicar(args, semana, lecciones)
        return crear(args, semana, lecciones)
    except KeyboardInterrupt:
        print("")
        print("Cortado. Revisa con git status que no haya quedado nada a medias.")
        return 130


if __name__ == "__main__":
    sys.exit(main())
