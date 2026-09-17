# -*- coding: utf-8 -*-
"""
Las 5 lecciones de una semana de Ruta al Ingles, de sus frases a publicadas en
UN solo commit y UN solo deploy.

    python tools/nueva-semana.py <carpeta-de-la-semana>/sitio
    python tools/nueva-semana.py <carpeta-de-la-semana>/sitio --pedir-clave
    python tools/nueva-semana.py --publicar-semana 3

La carpeta `sitio/` la escribe armar-semana.py, que vive FUERA de este repo
(INGLES_LORE_Y_LUCI/RUTA-AL-INGLES) junto con las diapositivas de la semana:
un semana.json y un _frases-N-dia.txt por dia. El presupuesto de carga
cognitiva se controla alla; aca solo se verifica que los archivos no hayan
cambiado despues.

Por que no correr nueva-leccion.py cinco veces: esa exige git limpio para
numerar, asi que habria que publicar cada leccion antes de generar la
siguiente. Son cinco deploys por semana, y los creditos de Netlify ya se
agotaron una vez (PENDIENTES.md).

Todo lo demas es nueva-leccion.py: se importan sus funciones, con sus mismas
reglas (ver tools/CONTEXTO-nueva-leccion.md). Sin teclado --un agente, o
`< /dev/null`-- cada pregunta es NO: no se generan audios ni se publica.
"""
import argparse
import importlib.util
import io
import json
import os
import re
import sys

TOOLS = os.path.dirname(os.path.abspath(__file__))


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


def leer_semana(carpeta):
    ruta = os.path.join(carpeta, "semana.json")
    if not os.path.isfile(ruta):
        nl.cortar("No existe %s." % ruta,
                  "La carpeta sitio/ la escribe armar-semana.py (RUTA-AL-INGLES/herramientas).")
    semana = json.load(io.open(ruta, encoding="utf-8-sig"))
    for campo in ("semana", "titulo", "nivel", "lecciones"):
        if not semana.get(campo):
            nl.cortar("semana.json no tiene '%s'." % campo)

    lecciones, errores = [], []
    for item in semana["lecciones"]:
        archivo = os.path.join(carpeta, item["archivo"])
        if not os.path.isfile(archivo):
            errores.append("falta %s" % item["archivo"])
            continue
        meta, secciones, problemas = nl.leer_frases(archivo)
        errores += ["%s: %s" % (item["archivo"], p) for p in problemas]
        if problemas:
            continue
        # armar-semana.py valido el presupuesto con estas cantidades. Si no
        # coinciden, el archivo se toco a mano despues y ese control no vale.
        if (len(secciones["repeat"]) != item.get("frases")
                or len(secciones["vocabulario"]) != item.get("vocabulario")):
            errores.append("%s cambio despues de armar-semana.py (%d frases y %d de vocabulario; "
                           "semana.json dice %s y %s). Volve a correr armar-semana.py."
                           % (item["archivo"], len(secciones["repeat"]), len(secciones["vocabulario"]),
                              item.get("frases"), item.get("vocabulario")))
        meta.update({"titulo": item["titulo"], "nivel": semana["nivel"]})
        meta["idioma_audio"] = meta.get("idioma_audio") or "en-US"
        meta["idioma_audio_es"] = meta.get("idioma_audio_es") or "es-419"
        lecciones.append((meta, secciones))
    if errores:
        nl.cortar("No se escribio nada. Corregi esto:", *["  " + e for e in errores])
    return semana, lecciones


def crear(args):
    carpeta = os.path.abspath(args.carpeta)

    print("[1/6] Revisando las frases de la semana")
    semana, lecciones = leer_semana(carpeta)
    n = semana["semana"]
    for meta, secciones in lecciones:
        print("  %-38s vocabulario=%d  frases=%d" % (meta["titulo"], len(secciones["vocabulario"]),
                                                     len(secciones["repeat"])))
    ya = ids_de_la_semana(n)
    if ya:
        nl.cortar("La semana %d ya tiene lecciones generadas:" % n, *["  " + i for i in ya],
                  "", "Para publicarlas: python tools/nueva-semana.py --publicar-semana %d" % n,
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

    nombre_de = nl.cargar_nombre_de()
    ids, rutas_md = [], []
    print("[3/6] Generando %d lecciones" % len(lecciones))
    for meta, secciones in lecciones:
        id_leccion = "leccion-%s-%s" % (nl.siguiente_numero(), nombre_de(meta["titulo"]))
        if filtro_de(n) not in id_leccion or id_leccion in ids:
            for hecho in ids:
                nl.deshacer(hecho)
            nl.cortar("El titulo %r no da un id de la semana %d (%s)." % (meta["titulo"], n, id_leccion),
                      "Los titulos tienen que empezar con S%02d, como los arma armar-semana.py." % n)
        ruta_md = os.path.join(nl.CARPETA_MD, id_leccion + ".md")
        nl.escribir_md(ruta_md, meta, secciones)
        ids.append(id_leccion)
        rutas_md.append(ruta_md)
        print("  " + id_leccion)
    if nl.correr("generar-lecciones.py", *rutas_md).returncode != 0:
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
        return nl.publicar(*ids, mensaje=mensaje(n, semana["titulo"], len(ids)))

    print("")
    print("No se publico nada: los archivos quedan sin commitear. Para publicar despues:")
    print("  python tools/nueva-semana.py --publicar-semana %d" % n)
    return 0


def mensaje(n, titulo, cuantas):
    return "Agrega semana %02d de Ruta al Inglés: %s (%d lecciones)" % (n, titulo, cuantas)


def publicar_semana(args):
    n = args.publicar_semana
    ids = [i for i in ids_de_la_semana(n) if os.path.exists(os.path.join(nl.RAIZ, i + ".html"))]
    if not ids:
        nl.cortar("No hay lecciones generadas de la semana %d (leccion-NN-s%02d-*.html)." % (n, n))
    titulo = args.titulo or "semana %d" % n
    print("Lecciones de la semana %d:" % n)
    for i in ids:
        print("  " + i)
    return nl.publicar(*ids, mensaje=mensaje(n, titulo, len(ids)))


def main():
    p = argparse.ArgumentParser(
        description="Las 5 lecciones de una semana de Ruta al Ingles, en un solo deploy.")
    p.add_argument("carpeta", nargs="?", help="carpeta sitio/ que escribio armar-semana.py")
    p.add_argument("--publicar-semana", type=int, metavar="N",
                   help="publica las lecciones ya generadas de la semana N")
    p.add_argument("--titulo", help="titulo de la semana para el commit (con --publicar-semana)")
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
    if bool(args.carpeta) == (args.publicar_semana is not None):
        p.error("pasa la carpeta sitio/, o --publicar-semana N: una de las dos")
    try:
        if args.publicar_semana is not None:
            return publicar_semana(args)
        return crear(args)
    except KeyboardInterrupt:
        print("")
        print("Cortado. Lo que ya se escribio queda sin commitear: revisalo con git status.")
        return 130


if __name__ == "__main__":
    sys.exit(main())
