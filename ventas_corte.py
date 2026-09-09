#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Corte del dashboard de ventas (/ventas): junta Kommo y HubSpot en UN solo
`data/ventas.json`. Corre el extractor de cada CRM que tenga token
(`ventas_kommo.py`, `ventas_hubspot.py`) y mezcla:

  · Un asesor = un humano, aunque viva en los dos CRM. La llave es el NOMBRE
    normalizado (sin acentos, primer nombre + primer apellido, ver `slug`),
    porque ningún CRM sabe el id del otro. Alias explícitos en `ALIAS` para los
    nombres que no coinciden solos ("Randall Cruz" vs "Randall").
  · Equipos = zonas MTY / SLT / TRC / MVA + cualquier otro grupo KS-<X> de Kommo
    (KS-SEGUIMIENTO, KS-TRAINING…). Kommo las trae en el grupo KS-<zona>,
    HubSpot en el equipo del owner (Monterrey/Saltillo/Torreón/Monclova).
  · Etapas del embudo = las de Ventas en Kommo (CANON como respaldo); HubSpot
    mapea las suyas a ese índice (ver ventas_hubspot.CANON_HS).
  · Ids: 'k:<id>' y 'h:<id>' para que nunca choquen; `crm` en cada fila.

Contrato que lee ventas/src/types.ts:
  generado, dias_historia, desde, fuentes[{crm, generado, leads, eventos, tareas, error?}]
  usuarios[{id, nombre, zona, crm[], ids{}}], equipos[{id, nombre}], etapas[{id, nombre}], metas{slug: n}
  Cada lead trae `ciudad` (la del contacto en Kommo, la del deal en HubSpot), ya normalizada.
  levantamientos{filas[]} = los Excel de operaciones (Apps Script), la verdad de «ya se hizo».
  leads[], eventos[], tareas_abiertas[]   (ver docstrings de los extractores)

Uso:
    python ventas_corte.py            # escribe DASH_DATA/ventas.json
    python ventas_corte.py --dry      # resumen sin escribir
    python ventas_corte.py --selftest
Metas EN PESOS (decisión de Randall 4-sep, regla de Alejandro): VENTAS_META_MXN = meta
mensual de venta para todos (default 800000); VENTAS_METAS='{"marco-perez": 1000000}'
la cambia por asesor; VENTAS_COTIZADO_X (10) y VENTAS_COTIZADO_DIAS (90) = pipeline sano:
cotizado con ≤ 90 días por 10× la meta mensual. La UI hace la aritmética.
"""
import sys, os, re, json, time, unicodedata
from datetime import datetime, timezone, timedelta

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

TZ = timezone(timedelta(hours=-6))
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(os.environ.get("DASH_DATA", os.path.join(HERE, "data")), "ventas.json")
DIAS_HISTORIA = int(os.environ.get("VENTAS_DIAS", "90") or 90)
META_MXN = int(float(os.environ.get("VENTAS_META_MXN") or 800000))
COTIZADO_X = int(float(os.environ.get("VENTAS_COTIZADO_X") or 10))
COTIZADO_DIAS = int(float(os.environ.get("VENTAS_COTIZADO_DIAS") or 90))

ZONAS =[("MTY", "Monterrey"), ("SLT", "Saltillo"), ("TRC", "Torreón"), ("MVA", "Monclova")]
CANON = ["Por contactar", "Conversación iniciada", "Propuesta entregada",
         "Levantamiento agendado", "Levantamiento hecho", "Contrato solicitado"]
# nombre normalizado completo -> slug. Solo lo que la regla no resuelve sola.
ALIAS = {"randall cruz": "randall", "javier t": "javier-tonche"}


# Las cuatro ciudades donde vendemos, escritas igual vengan de donde vengan: Kommo las guarda
# como las escribe el cliente («torreon», «Monterrey, N.L.») y HubSpot con acento (Randall 8-sep).
CIUDADES = {"monterrey": "Monterrey", "saltillo": "Saltillo", "torreon": "Torreón", "monclova": "Monclova",
            "ramos arizpe": "Ramos Arizpe", "gomez palacio": "Gómez Palacio", "lerdo": "Lerdo",
            "matamoros": "Matamoros", "frontera": "Frontera", "castanos": "Castaños",
            "san pedro": "San Pedro", "santa catarina": "Santa Catarina", "guadalupe": "Guadalupe",
            "apodaca": "Apodaca", "escobedo": "Escobedo", "garcia": "García", "juarez": "Juárez",
            "san nicolas": "San Nicolás", "santiago": "Santiago", "cadereyta": "Cadereyta"}


def ciudad_limpia(txt):
    """«TORREON, COAH.» y «Torreón» son la misma ciudad: una sola etiqueta para poder agrupar."""
    s = unicodedata.normalize("NFKD", txt or "").encode("ascii", "ignore").decode().lower()
    s = " ".join(re.findall(r"[a-z]+", s))
    if not s:
        return ""
    for clave, bonito in CIUDADES.items():
        if clave in s:
            return bonito
    return " ".join(w.capitalize() for w in s.split())[:40]


def normaliza(nombre):
    s = unicodedata.normalize("NFKD", nombre or "").encode("ascii", "ignore").decode().lower()
    s = s.split("@")[0]                       # un owner que es solo correo
    return " ".join(re.findall(r"[a-z0-9]+", s))


PARTICULAS = {"de", "del", "la", "las", "los", "y", "da", "do", "van", "von"}


def slug(nombre):
    """Llave de asesor entre CRMs: primer nombre + primer apellido, sin acentos ni
    partículas («Monserrat de León» → monserrat-leon)."""
    n = normaliza(nombre)
    if n in ALIAS:
        return ALIAS[n]
    t = [x for x in n.split() if x not in PARTICULAS]
    return "-".join(t[:2]) if t else "sin-nombre"


def aviso(msg):
    print("  aviso: " + msg, file=sys.stderr)


def fuentes():
    """[(crm, parte)] de cada CRM con token. Un CRM que falla no tumba al otro."""
    partes = []
    if os.environ.get("KOMMO_LONG_TOKEN") or os.environ.get("KOMMO_ENV") or not os.environ.get("HUBSPOT_TOKEN"):
        try:
            import ventas_kommo
            partes.append(("kommo", ventas_kommo.build()))
        except SystemExit as e:
            aviso("Kommo no entra: %s" % str(e)[:200])
        except Exception as e:
            aviso("Kommo falló: %r" % e)
    if os.environ.get("HUBSPOT_TOKEN"):
        try:
            import ventas_hubspot
            partes.append(("hubspot", ventas_hubspot.build()))
        except SystemExit as e:
            aviso("HubSpot no entra: %s" % str(e)[:200])
        except Exception as e:
            aviso("HubSpot falló: %r" % e)
    return partes


def mezclar(partes):
    usuarios, mapa = {}, {}          # slug -> usuario ; (crm, raw_id) -> slug
    siempre = set()                  # usuarios activos con rol o grupo KS-* en Kommo: entran aunque no tengan leads
    for crm, p in partes:
        for raw, u in p["usuarios"].items():
            s = slug(u["nombre"])
            mapa[(crm, str(raw))] = s
            if crm == "kommo" and (u.get("zona") or str(u.get("rol") or "").upper().startswith("KS-")) and u.get("activo", True):
                siempre.add(s)
            U = usuarios.setdefault(s, {"id": s, "nombre": u["nombre"], "zona": "", "crm": [], "ids": {}, "rol": ""})
            if crm == "kommo" and u.get("rol"):
                U["rol"] = u["rol"]
            if crm not in U["crm"]:
                U["crm"].append(crm)
            U["ids"][crm] = raw
            if crm == "kommo" and u["nombre"]:
                U["nombre"] = u["nombre"]         # el nombre de Kommo trae acentos
            if u.get("zona") and (not U["zona"] or crm == "kommo"):
                U["zona"] = u["zona"]

    leads, eventos, tareas, usados = [], [], [], set()

    def asesor(crm, raw):
        s = mapa.get((crm, str(raw))) if raw not in (None, "", 0) else None
        if s:
            usados.add(s)
        return s

    for crm, p in partes:
        for l in p["leads"]:
            l["asesor_id"] = asesor(crm, l.get("asesor_id"))
            l["ciudad"] = ciudad_limpia(l.get("ciudad"))
            leads.append(l)
        for e in p["eventos"]:
            e["asesor_id"] = asesor(crm, e.get("asesor_id"))
            eventos.append(e)
        for t in p["tareas_abiertas"]:
            t["asesor_id"] = asesor(crm, t.get("asesor_id"))
            tareas.append(t)
    eventos.sort(key=lambda e: e["ts"])

    etapas = next((p["etapas"] for crm, p in partes if crm == "kommo" and p.get("etapas")), None) \
        or [{"id": i, "nombre": n} for i, n in enumerate(CANON)]

    metas = {}
    try:
        metas = {slug(a) if " " in str(a) else str(a): int(float(b))
                 for a, b in json.loads(os.environ.get("VENTAS_METAS") or "{}").items()}
    except (ValueError, TypeError, AttributeError):
        aviso("VENTAS_METAS no es JSON válido; sin metas")

    # Solo asesores con algo que mostrar (HubSpot trae 30 owners, la mitad inactivos), más los que
    # estén en un grupo KS-* de Kommo aunque todavía no tengan leads (Randall 6-sep).
    lista = sorted([u for s, u in usuarios.items() if s in usados or s in siempre], key=lambda u: u["nombre"])
    conocidas = {a for a, _ in ZONAS}
    extras = sorted({u["zona"] for u in lista if u["zona"] and u["zona"] not in conocidas})
    return {
        "generado": datetime.now(TZ).isoformat(timespec="seconds"),
        "dias_historia": DIAS_HISTORIA, "desde": int(time.time()) - DIAS_HISTORIA * 86400,
        "fuentes": [{"crm": crm, "generado": p.get("generado"), "leads": len(p["leads"]),
                     "eventos": len(p["eventos"]), "tareas": len(p["tareas_abiertas"])} for crm, p in partes],
        "usuarios": lista,
        "equipos": [{"id": a, "nombre": b} for a, b in ZONAS] + [{"id": z, "nombre": z.capitalize()} for z in extras],
        "etapas": etapas, "metas": metas, "meta_mxn": META_MXN,
        "cotizado_x": COTIZADO_X, "cotizado_dias": COTIZADO_DIAS,
        "leads": leads, "eventos": eventos, "tareas_abiertas": tareas,
    }


def agregar_comisiones(corte):
    """Ventas reales de la app de comisiones (Supabase). Entra solo con SUPABASE_URL +
    SUPABASE_SERVICE_KEY; si falla, el corte sale igual que antes y `comisiones.error` lo dice."""
    if not (os.environ.get("SUPABASE_URL") and os.environ.get("SUPABASE_SERVICE_KEY")):
        return corte
    try:
        import ventas_comisiones
        forzados = {}
        try:   # Configuración > Ventas reales: {nombre en la app: slug o ''}; vive en el volumen
            with open(os.path.join(os.path.dirname(OUT), "ventas_config.json"), encoding="utf-8") as f:
                forzados = json.load(f).get("comisiones_map") or {}
        except (OSError, ValueError):
            pass
        corte["comisiones"] = ventas_comisiones.build(corte["usuarios"], forzados)
        con = sum(1 for v in corte["comisiones"]["vendedores"] if v["asesor_id"])
        print("comisiones: %d ventas · %d vendedores (%d con asesor del CRM)"
              % (len(corte["comisiones"]["ventas"]), len(corte["comisiones"]["vendedores"]), con))
    except Exception as e:
        aviso("comisiones falló: %r" % e)
        corte["comisiones"] = {"error": str(e)[:200], "vendedores": [], "ventas": []}
    return corte


HIST = os.path.join(os.path.dirname(OUT), "ventas_hist.jsonl")


COTIZACIONES_DIAS = 120   # cuántos días de cotizaciones generadas viajan en el corte
LEVANTAMIENTOS_DIAS = 400  # cuántos días de levantamientos de los Excel viajan en el corte


def agregar_levantamientos(corte):
    """Levantamientos de ayuda a cierre, tal como los lleva OPERACIONES en sus Excel.

    El embudo del CRM subregistra la visita: el asesor no siempre mueve la tarjeta a
    «Levantamiento hecho» (Randall 9-sep). Quien sabe de verdad si se hizo es el Excel:
    en MTY la columna Estado que llena operaciones, y en el sheet nuevo por zona la
    respuesta «¿Se realizó el levantamiento?» de la cuadrilla.

    Los dos los sirve un Apps Script de solo lectura (`levantamientos_sheet.gs`), porque no
    hay cuenta de servicio de Google en el proyecto y el dashboard corre sin dependencias.
    Sin `LEVANTAMIENTOS_URL` no entra nada y el tablero sigue igual."""
    url = os.environ.get("LEVANTAMIENTOS_URL", "").strip()
    if not url:
        return corte
    token = os.environ.get("LEVANTAMIENTOS_TOKEN", "kenet-levantamientos-2026").strip()
    import urllib.request, urllib.parse, urllib.error
    liga = url + ("&" if "?" in url else "?") + urllib.parse.urlencode({"token": token, "dias": LEVANTAMIENTOS_DIAS})
    try:
        with urllib.request.urlopen(liga, timeout=180) as r:
            d = json.loads(r.read().decode("utf-8"))
        if d.get("error"):
            raise RuntimeError(d["error"])
        filas = d.get("filas") or []
        for f in filas:
            f["municipio"] = ciudad_limpia(f.get("municipio"))
        corte["levantamientos"] = {"generado": d.get("generado") or datetime.now().isoformat(timespec="seconds"),
                                   "dias": LEVANTAMIENTOS_DIAS, "filas": filas}
        hechos = sum(1 for f in filas if f.get("hecho"))
        print("levantamientos (Excel): %d filas · %d hechos · zonas %s"
              % (len(filas), hechos, sorted({f.get("zona") for f in filas})))
    except Exception as e:
        aviso("levantamientos falló: %r" % e)
        corte["levantamientos"] = {"error": str(e)[:200], "dias": LEVANTAMIENTOS_DIAS, "filas": []}
    return corte


def agregar_cotizaciones(corte):
    """Cotizaciones GENERADAS en /cotizador (tabla `cotizaciones` de Supabase, la escribe
    Kommo-ia al generar el JPG; una fila por opción de pago, cot_id agrupa la cotización).
    El dashboard cuenta cotizaciones por método y por combinación de métodos (dirección
    8-sep). Sin SUPABASE_* no entra; si falla, `cotizaciones.error` lo dice."""
    if not (os.environ.get("SUPABASE_URL") and os.environ.get("SUPABASE_SERVICE_KEY")):
        return corte
    try:
        import ventas_comisiones
        desde = time.time() - COTIZACIONES_DIAS * 86400
        filas = ventas_comisiones.get("cotizaciones",
                                      "creado,cot_id,lead_id,asesor,sucursal,paneles,micro,ptr,n_opciones,plan,plazo,ppanel,total")
        out = []
        for r in filas:   # ponytail: se baja toda la tabla y se filtra aquí; paginar por fecha cuando pase de ~50k filas
            try:
                ts = int(datetime.fromisoformat(r["creado"].replace("Z", "+00:00")).timestamp())
            except (KeyError, ValueError, TypeError):
                continue
            if ts < desde:
                continue
            out.append({"ts": ts, "cot": r.get("cot_id"), "lead": r.get("lead_id"), "asesor": r.get("asesor") or "",
                        "suc": (r.get("sucursal") or "").upper(), "paneles": r.get("paneles") or 0,
                        "micro": bool(r.get("micro")), "ptr": bool(r.get("ptr")), "n": r.get("n_opciones") or 1,
                        "plan": r.get("plan") or "", "plazo": r.get("plazo") or 0,
                        "ppanel": r.get("ppanel") or 0, "total": r.get("total") or 0})
        corte["cotizaciones"] = {"generado": datetime.now().isoformat(timespec="seconds"),
                                 "dias": COTIZACIONES_DIAS, "filas": out}
        print("cotizaciones generadas: %d filas · %d cotizaciones (últimos %d días)"
              % (len(out), len({r["cot"] for r in out}), COTIZACIONES_DIAS))
    except Exception as e:
        aviso("cotizaciones falló: %r" % e)
        corte["cotizaciones"] = {"error": str(e)[:200], "dias": COTIZACIONES_DIAS, "filas": []}
    return corte


def foto_pipeline(corte, ahora=None):
    """Foto de HOY del embudo Ventas, sin filtro de rango: leads y monto por etapa, total y
    por asesor. Randall quiere ver el pipeline «como estaba hace 7 días» y su liquidez; el
    corte solo sabe el presente, así que cada día se guarda una foto (ver guardar_historico)."""
    por_et, por_as = {}, {}
    for l in corte["leads"]:
        if l.get("funnel") != 4 or l.get("embudo") != "ventas":
            continue
        e, a, m = str(l.get("etapa_id", -1)), l.get("asesor_id") or "sin-asesor", l.get("presupuesto") or 0
        x = por_et.setdefault(e, [0, 0]); x[0] += 1; x[1] += m
        y = por_as.setdefault(a, {}).setdefault(e, [0, 0]); y[0] += 1; y[1] += m
    return {"fecha": (ahora or datetime.now(TZ)).strftime("%Y-%m-%d"), "generado": corte["generado"],
            "etapas": por_et, "por_asesor": por_as}


def guardar_historico(corte, ruta=HIST):
    """Una línea por día en ventas_hist.jsonl (append-only, en el volumen). False si hoy ya está."""
    foto = foto_pipeline(corte)
    if os.path.exists(ruta):
        with open(ruta, encoding="utf-8") as f:
            lineas = [x for x in f.read().splitlines() if x.strip()]
        if lineas and json.loads(lineas[-1]).get("fecha") == foto["fecha"]:
            return False
    with open(ruta, "a", encoding="utf-8") as f:
        f.write(json.dumps(foto, ensure_ascii=False, separators=(",", ":")) + "\n")
    return True


def selftest():
    foto = foto_pipeline({"generado": "x", "leads": [
        {"funnel": 4, "embudo": "ventas", "etapa_id": 2, "asesor_id": "a", "presupuesto": 100},
        {"funnel": 4, "embudo": "ventas", "etapa_id": 2, "asesor_id": "b", "presupuesto": 50},
        {"funnel": 4, "embudo": "hunting", "etapa_id": -1, "asesor_id": "a", "presupuesto": 999},
        {"funnel": 5, "embudo": "ventas", "etapa_id": 5, "asesor_id": "a", "presupuesto": 999}]})
    assert foto["etapas"] == {"2": [2, 150]} and foto["por_asesor"] == {"a": {"2": [1, 100]}, "b": {"2": [1, 50]}}, foto
    assert slug("Marco Pérez") == "marco-perez" == slug("MARCO PEREZ")
    assert slug("Samuel Giacoman Marcos") == "samuel-giacoman" == slug("Samuel Giacoman")
    assert slug("Randall Cruz") == "randall" == slug("Randall")
    assert slug("Javier T") == "javier-tonche" == slug("Javier Tonche")
    assert slug("Gamaliel Alvarez - IOPS Saltillo") == "gamaliel-alvarez"
    assert slug("Monserrat de León") == "monserrat-leon" and slug("Jose Luis Villarreal") == "jose-luis"
    assert slug("cambaceo1@kenetsolar.com") == "cambaceo1" and slug("") == "sin-nombre"
    assert ciudad_limpia("TORREON, COAH.") == ciudad_limpia("Torreón") == "Torreón"
    assert ciudad_limpia("") == "" and ciudad_limpia("Tampico") == "Tampico"
    partes = [("kommo", {"usuarios": {1: {"nombre": "Mara Gálvez", "zona": "SLT", "rol": "KS-TRAINING"}, 2: {"nombre": "Nuevo Trainee", "zona": "", "rol": "KS-SEGUIMIENTO", "activo": True},
                                      3: {"nombre": "Ex Vendedor", "zona": "TRAINING", "activo": False}}, "etapas": None,
                         "leads": [{"id": "k:1", "asesor_id": 1}], "eventos": [], "tareas_abiertas": []}),
              ("hubspot", {"usuarios": {"9": {"nombre": "Mara Galvez", "zona": ""}, "8": {"nombre": "Nadie", "zona": "MTY"}}, "etapas": None,
                           "leads": [{"id": "h:1", "asesor_id": "9"}], "eventos": [{"ts": 1, "asesor_id": "9"}], "tareas_abiertas": []})]
    c = mezclar(partes)
    # Mara tiene leads; el de Seguimiento entra por su rol KS-* aunque no tenga leads; el inactivo y «Nadie» (HubSpot sin uso) no.
    assert [u["id"] for u in c["usuarios"]] == ["mara-galvez", "nuevo-trainee"], c["usuarios"]
    assert c["usuarios"][0]["rol"] == "KS-TRAINING" and c["usuarios"][1]["rol"] == "KS-SEGUIMIENTO"
    assert len(c["equipos"]) == 4, c["equipos"]
    u = c["usuarios"][0]
    assert u["crm"] == ["kommo", "hubspot"] and u["zona"] == "SLT" and u["ids"] == {"kommo": 1, "hubspot": "9"}
    assert all(l["asesor_id"] == "mara-galvez" for l in c["leads"]) and len(c["etapas"]) == 6
    assert c["meta_mxn"] == META_MXN > 0 and c["cotizado_x"] == COTIZADO_X and c["cotizado_dias"] == COTIZADO_DIAS
    print("selftest OK")


if __name__ == "__main__":
    if "--selftest" in sys.argv:
        selftest()
        sys.exit(0)
    partes = fuentes()
    if not partes:
        sys.exit("ningún CRM entregó corte: se conserva el ventas.json anterior")
    corte = agregar_levantamientos(agregar_cotizaciones(agregar_comisiones(mezclar(partes))))
    print("corte: %s · %d asesores · %d leads · %d actividades · %d tareas abiertas"
          % (" + ".join(f["crm"] for f in corte["fuentes"]), len(corte["usuarios"]),
             len(corte["leads"]), len(corte["eventos"]), len(corte["tareas_abiertas"])))
    if "--dry" in sys.argv:
        print(json.dumps({"fuentes": corte["fuentes"], "usuarios": corte["usuarios"]}, ensure_ascii=False, indent=1))
        sys.exit(0)
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    tmp = OUT + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(corte, f, ensure_ascii=False, separators=(",", ":"))
    os.replace(tmp, OUT)
    print("escrito %s (%.0f KB)" % (OUT, os.path.getsize(OUT) / 1024))
    try:
        if guardar_historico(corte):
            print("histórico: foto de hoy guardada en %s" % HIST)
    except Exception as e:
        aviso("histórico no guardado: %r" % e)
