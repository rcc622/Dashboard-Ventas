#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Extractor HubSpot -> data/crm_recon.json

Reemplaza las consultas manuales por MCP. Necesita un token de Private App
(HubSpot → Settings → Integrations → Private Apps → Create). Scopes de LECTURA:
    crm.objects.contacts.read
    crm.objects.deals.read
    crm.objects.owners.read
Guardar el token en la variable de entorno HUBSPOT_TOKEN. Nunca en el repo.

Uso:
    python crm_hubspot.py            # escribe data/crm_recon.json
    python crm_hubspot.py --dry      # imprime sin escribir
    python crm_hubspot.py --probe    # verifica token y muestra owners/equipos

Escribe el mismo contrato que crm_kommo.py (ver docstring de dashboard.py).
Solo lectura: nunca hace POST/PATCH/DELETE.
"""
import sys, os, json, time, urllib.request, urllib.parse, urllib.error
from datetime import date, datetime, timedelta, timezone

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.environ.get("DASH_DATA", os.path.join(HERE, "data"))
OUT = os.path.join(DATA, "crm_recon.json")
TOKEN = os.environ.get("HUBSPOT_TOKEN", "")
BASE = "https://api.hubapi.com"
TZ = timezone(timedelta(hours=-6))   # America/Monterrey

# Valores de la propiedad `origen` que cuentan como Meta.
ORIGEN_META = ["FB-form", "Wapp-FB", "Redes Sociales", "Instagram",
               "Wapp-IG", "WA-FB D", "WA-IG D"]
# La zona sale de `ciudad` — `zona_operativa` está vacío en toda la base (verificado 2026-07-26).
CIUDAD_A_ZONA = {"Monterrey": "MTY", "Saltillo": "SLT", "Torreón": "TRC",
                 "Torreon": "TRC", "Monclova": "MVA"}


def _req(method, path, body=None, params=None):
    if not TOKEN:
        sys.exit("Falta HUBSPOT_TOKEN. Crea una Private App de solo lectura y expórtalo.")
    url = BASE + path + (("?" + urllib.parse.urlencode(params)) if params else "")
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method, headers={
        "Authorization": "Bearer " + TOKEN,
        "Content-Type": "application/json",
        "User-Agent": "kenet-dashboard/1.0",
    })
    for intento in range(4):
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                raw = r.read().decode("utf-8")
                return json.loads(raw) if raw.strip() else {}
        except urllib.error.HTTPError as e:
            if e.code == 429 and intento < 3:      # HubSpot: 100 req / 10 s
                time.sleep(2 * (intento + 1))
                continue
            if e.code in (502, 503, 504) and intento < 3:
                time.sleep(2 * (intento + 1))
                continue
            raise SystemExit("HTTP %s en %s\n%s"
                             % (e.code, path, e.read().decode("utf-8", "replace")[:400]))
        except urllib.error.URLError as e:
            if intento < 3:
                time.sleep(2)
                continue
            raise SystemExit("Red: %s" % e)
    return {}


def search(objeto, filtros, propiedades, limit=200):
    """Itera /crm/v3/objects/{objeto}/search paginando con `after`."""
    after, n = None, 0
    while True:
        body = {"filterGroups": [{"filters": filtros}], "properties": propiedades,
                "limit": limit}
        if after:
            body["after"] = after
        r = _req("POST", "/crm/v3/objects/%s/search" % objeto, body)
        for it in r.get("results", []):
            yield it
        n += len(r.get("results", []))
        after = ((r.get("paging") or {}).get("next") or {}).get("after")
        if not after:
            return
        if n > 60000:      # ponytail: tope de seguridad
            print("  aviso: corte en 60k registros de %s" % objeto)
            return


def ms(d):
    return int(datetime(d.year, d.month, d.day, tzinfo=TZ).timestamp() * 1000)


def rango(prop, desde, hasta):
    return [{"propertyName": prop, "operator": "BETWEEN",
             "value": str(ms(desde)), "highValue": str(ms(hasta + timedelta(days=1)) - 1)}]


def owners():
    """{ownerId: {'nombre':..., 'zona':...}} — la zona sale del equipo del owner."""
    out = {}
    r = _req("GET", "/crm/v3/owners/", params={"limit": 500})
    for o in r.get("results", []):
        nombre = " ".join(x for x in [o.get("firstName"), o.get("lastName")] if x).strip()
        zona = ""
        for t in o.get("teams") or []:
            n = (t.get("name") or "").upper()
            for ciudad, z in (("MONTERREY", "MTY"), ("SALTILLO", "SLT"),
                              ("TORREON", "TRC"), ("TORREÓN", "TRC"), ("MONCLOVA", "MVA")):
                if ciudad in n:
                    zona = z
        out[str(o.get("id"))] = {"nombre": nombre or o.get("email", "?"), "zona": zona}
    return out


def probe():
    o = owners()
    print("Owners con equipo de zona:")
    porz = {}
    for oid, d in o.items():
        if d["zona"]:
            porz.setdefault(d["zona"], []).append(d["nombre"])
    for z in ("MTY", "TRC", "SLT", "MVA"):
        nombres = porz.get(z, [])
        print("  %-4s %d — %s" % (z, len(nombres), ", ".join(sorted(nombres)) or "—"))
    sinzona = [d["nombre"] for d in o.values() if not d["zona"]]
    print("  sin equipo de zona: %d (%s)" % (len(sinzona), ", ".join(sorted(sinzona)[:6])))
    print("\nToken OK. %d owners en total." % len(o))


def build(dias=7):
    hoy = date.today()
    ini7, ini30 = hoy - timedelta(days=dias), hoy - timedelta(days=30)
    own = owners()

    props_c = ["origen", "ciudad", "hubspot_owner_id", "createdate"]
    c7 = list(search("contacts", rango("createdate", ini7, hoy), props_c))
    c30 = list(search("contacts", rango("createdate", ini30, hoy), props_c))
    props_d = ["origen", "amount", "closedate", "days_to_close", "hs_is_closed_won"]
    d30 = [d for d in search("deals", rango("closedate", ini30, hoy), props_d)
           if str((d.get("properties") or {}).get("hs_is_closed_won")).lower() == "true"]
    d7 = [d for d in d30
          if (d["properties"].get("closedate") or "")[:10] >= ini7.isoformat()]

    def es_meta(p):
        return (p.get("origen") or "") in ORIGEN_META

    origen7 = {}
    for c in c7:
        o = (c["properties"].get("origen") or "Unassigned")
        origen7[o] = origen7.get(o, 0) + 1

    asig_zona, por_rep = {}, {}
    for c in c7:
        p = c["properties"]
        oid = p.get("hubspot_owner_id")
        if not (es_meta(p) and oid):
            continue
        z = CIUDAD_A_ZONA.get(p.get("ciudad") or "", "")
        if z:
            asig_zona[z] = asig_zona.get(z, 0) + 1
        info = own.get(str(oid), {})
        if info.get("nombre"):
            k = (info["nombre"], info.get("zona") or z)
            por_rep[k] = por_rep.get(k, 0) + 1

    def suma(ds):
        return {"count": len(ds),
                "mxn": sum(float(d["properties"].get("amount") or 0) for d in ds)}

    def ttc(ds):
        v = [float(d["properties"]["days_to_close"]) for d in ds
             if d["properties"].get("days_to_close")]
        return round(sum(v) / len(v), 2) if v else 0

    dm7 = [d for d in d7 if es_meta(d["properties"])]
    dm30 = [d for d in d30 if es_meta(d["properties"])]

    return {
        "source": "hubspot",
        "_generado": datetime.now(TZ).isoformat(timespec="seconds"),
        "window_7d": {"start": ini7.isoformat(), "end": hoy.isoformat()},
        "window_30d": {"start": ini30.isoformat(), "end": hoy.isoformat()},
        "meta_origen_set": ORIGEN_META,
        "leads_by_origen_7d": origen7,
        "leads_total_7d": len(c7),
        "leads_unassigned_7d": sum(1 for c in c7 if not c["properties"].get("hubspot_owner_id")),
        "leads_meta_30d": sum(1 for c in c30 if es_meta(c["properties"])),
        "leads_total_30d": len(c30),
        "ttc_meta_30d_days": ttc(dm30),
        "ttc_blended_30d_days": ttc(d30),
        "assigned_meta_by_zone_7d": {z: asig_zona.get(z, 0) for z in ("MTY", "SLT", "TRC", "MVA")},
        "assigned_by_rep_7d": [{"rep": nombre, "zone": zona, "leads": n}
                               for (nombre, zona), n in sorted(por_rep.items(), key=lambda kv: -kv[1])],
        "won_7d": suma(d7), "won_30d": suma(d30),
        "won_meta_7d": suma(dm7), "won_meta_30d": suma(dm30),
    }


if __name__ == "__main__":
    if "--probe" in sys.argv:
        probe()
    else:
        data = build()
        if "--dry" in sys.argv:
            print(json.dumps(data, ensure_ascii=False, indent=2))
        else:
            os.makedirs(DATA, exist_ok=True)
            with open(OUT, "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
            print("Escrito:", OUT)
            print("  leads 7d=%d · asignados=%d · won-meta 7d=%d"
                  % (data["leads_total_7d"],
                     sum(data["assigned_meta_by_zone_7d"].values()),
                     data["won_meta_7d"]["count"]))
