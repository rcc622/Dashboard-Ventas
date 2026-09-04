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
Metas mensuales por asesor: env VENTAS_METAS='{"marco-perez": 70, "mara-galvez": 30}'.
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

ZONAS = [("MTY", "Monterrey"), ("SLT", "Saltillo"), ("TRC", "Torreón"), ("MVA", "Monclova")]
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
        metas = {slug(a) if " " in str(a) else str(a): int(b)
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
        "etapas": etapas, "metas": metas,
        "leads": leads, "eventos": eventos, "tareas_abiertas": tareas,
    }


def selftest():
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
