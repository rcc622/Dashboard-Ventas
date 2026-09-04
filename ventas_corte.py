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
  · Equipos = zonas MTY / SLT / TRC / MVA. Kommo las trae en el grupo KS-<zona>,
    HubSpot en el equipo del owner (Monterrey/Saltillo/Torreón/Monclova).
  · Etapas del embudo = las de Ventas en Kommo (CANON como respaldo); HubSpot
    mapea las suyas a ese índice (ver ventas_hubspot.CANON_HS).
  · Ids: 'k:<id>' y 'h:<id>' para que nunca choquen; `crm` en cada fila.

Contrato que lee ventas/src/types.ts:
  generado, dias_historia, desde, fuentes[{crm, generado, leads, eventos, tareas, error?}]
  usuarios[{id, nombre, zona, crm[], ids{}}], equipos[{id, nombre}], etapas[{id, nombre}], metas{slug: n}
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
    for crm, p in partes:
        for raw, u in p["usuarios"].items():
            s = slug(u["nombre"])
            mapa[(crm, str(raw))] = s
            U = usuarios.setdefault(s, {"id": s, "nombre": u["nombre"], "zona": "", "crm": [], "ids": {}})
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

    return {
        "generado": datetime.now(TZ).isoformat(timespec="seconds"),
        "dias_historia": DIAS_HISTORIA, "desde": int(time.time()) - DIAS_HISTORIA * 86400,
        "fuentes": [{"crm": crm, "generado": p.get("generado"), "leads": len(p["leads"]),
                     "eventos": len(p["eventos"]), "tareas": len(p["tareas_abiertas"])} for crm, p in partes],
        # Solo asesores con algo que mostrar: HubSpot trae 30 owners, la mitad inactivos.
        "usuarios": sorted([u for s, u in usuarios.items() if s in usados], key=lambda u: u["nombre"]),
        "equipos": [{"id": a, "nombre": b} for a, b in ZONAS],
        "etapas": etapas, "metas": metas, "meta_mxn": META_MXN,
        "cotizado_x": COTIZADO_X, "cotizado_dias": COTIZADO_DIAS,
        "leads": leads, "eventos": eventos, "tareas_abiertas": tareas,
    }


HIST = os.path.join(os.path.dirname(OUT), "ventas_hist.jsonl")


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
    partes = [("kommo", {"usuarios": {1: {"nombre": "Mara Gálvez", "zona": "SLT"}}, "etapas": None,
                         "leads": [{"id": "k:1", "asesor_id": 1}], "eventos": [], "tareas_abiertas": []}),
              ("hubspot", {"usuarios": {"9": {"nombre": "Mara Galvez", "zona": ""}, "8": {"nombre": "Nadie", "zona": "MTY"}}, "etapas": None,
                           "leads": [{"id": "h:1", "asesor_id": "9"}], "eventos": [{"ts": 1, "asesor_id": "9"}], "tareas_abiertas": []})]
    c = mezclar(partes)
    assert [u["id"] for u in c["usuarios"]] == ["mara-galvez"], c["usuarios"]
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
    corte = mezclar(partes)
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
