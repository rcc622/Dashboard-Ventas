"""Ventas reales desde la app de comisiones de Kenet (Supabase, SOLO lectura).

La app (repo rcc622/Comisiones-ventas, comisiones-ventas-dun.vercel.app) guarda cada venta
cerrada con su vendedor, monto de contrato, monto comisionable y mes de venta. Es la fuente de
«ventas reales» del dashboard /ventas: lo que el CRM marca como ganado no siempre coincide con
lo que se cobró.

Contrato de `build(usuarios)` (entra a data/ventas.json como `comisiones`):
  generado
  vendedores[{id, nombre, zona, rol, asesor_id}]
  ventas[{id, vendedor_id, asesor_id, vendedor, cliente, zona, mes 'AAAA-MM', mes_texto,
          fecha (epoch del día 1 del mes, hora Monterrey), monto, comisionable, cancelada,
          liga, origen, compartida_con,
          paneles, forma_pago, enganche, referido_por, bidireccional, extras, comision_pagada,
          zona_app (texto tal cual en la app: «COMERCIAL MTY», «FORANEO»…),
          captura ('completa' = trae origen y liga de HubSpot, o el vendedor está en la lista que
          no necesita liga; misma regla que la pestaña Analítica de la app)}]

Cruce con el CRM (`emparejar`): la app guarda casi solo el primer nombre («Carlos», «Mara»);
el corte usa el slug «nombre-apellido». Un vendedor se casa con el asesor del CRM cuyo slug
empieza con su primer nombre; si hay varios, gana el de la misma zona; si sigue empatado, queda
sin asesor y la UI lo lista para que se resuelva con VENTAS_COMISIONES_MAP
({"Arely Y david": "arely-tovar"}), que siempre manda.

Env: SUPABASE_URL y SUPABASE_SERVICE_KEY (la misma llave del respaldo diario). Sin ellas no entra
y el corte sigue igual que antes. Solo GET; nunca escribe en la app.
"""
import datetime
import json
import os
import sys
import unicodedata
import urllib.parse
import urllib.request

TZ = datetime.timezone(datetime.timedelta(hours=-6))
MESES = {"enero": 1, "febrero": 2, "marzo": 3, "abril": 4, "mayo": 5, "junio": 6, "julio": 7,
         "agosto": 8, "septiembre": 9, "setiembre": 9, "octubre": 10, "noviembre": 11, "diciembre": 12}
ZONAS = {"monterrey": "MTY", "saltillo": "SLT", "torreon": "TRC", "monclova": "MVA"}
PAGINA = 1000


def norm(s):
    return "".join(c for c in unicodedata.normalize("NFD", str(s or "")) if unicodedata.category(c) != "Mn").lower().strip()


def get(tabla, select, url=None, key=None):
    """Todas las filas de una tabla vía PostgREST, paginando de a PAGINA."""
    url = (url or os.environ.get("SUPABASE_URL", "")).rstrip("/")
    key = key or os.environ.get("SUPABASE_SERVICE_KEY", "")
    if not url or not key:
        raise SystemExit("faltan SUPABASE_URL / SUPABASE_SERVICE_KEY")
    out, off = [], 0
    while True:
        q = urllib.parse.urlencode({"select": select, "limit": PAGINA, "offset": off, "order": "id"})
        req = urllib.request.Request("%s/rest/v1/%s?%s" % (url, tabla, q),
                                     headers={"apikey": key, "Authorization": "Bearer " + key, "Accept": "application/json"})
        with urllib.request.urlopen(req, timeout=60) as r:
            chunk = json.loads(r.read().decode("utf-8"))
        out += chunk
        if len(chunk) < PAGINA:
            return out
        off += PAGINA


def mes(texto):
    """'Julio 2026' -> ('2026-07', epoch del 1 de julio). Texto raro -> (None, None)."""
    partes = norm(texto).replace(" de ", " ").split()
    if len(partes) >= 2 and partes[0] in MESES and partes[-1].isdigit():
        y, m = int(partes[-1]), MESES[partes[0]]
        if y < 100:
            y += 2000
        return "%04d-%02d" % (y, m), int(datetime.datetime(y, m, 1, tzinfo=TZ).timestamp())
    return None, None


def emparejar(vendedores, usuarios, forzados=None):
    """Pone asesor_id (slug del CRM) a cada vendedor de la app, o None si no se puede decidir.
    Orden: forzados (Configuración o env) > slug completo igual > primer nombre, solo si ese nombre
    es ÚNICO entre los vendedores de la app (dos «Jorge» no pueden caer en el mismo asesor) y, cuando
    el vendedor trae apellido distinto, solo si además coincide la zona."""
    forzados = {norm(k): v for k, v in (forzados or {}).items()}
    ids = {u["id"] for u in usuarios}
    primeros = {}
    for v in vendedores:
        t = [x for x in norm(v["nombre"]).replace(" y ", " ").split() if x]
        k = t[0] if t else ""
        primeros[k] = primeros.get(k, 0) + 1
    for v in vendedores:
        n = norm(v["nombre"])
        if n in forzados:
            v["asesor_id"] = forzados[n] if forzados[n] in ids else None   # '' o slug inexistente = sin asesor
            continue
        tokens = [t for t in n.replace(" y ", " ").split() if t]
        primero = tokens[0] if tokens else ""
        slug_v = "-".join(tokens[:2])
        exacto = [u for u in usuarios if u["id"] == slug_v] if len(tokens) >= 2 else []
        if exacto:
            v["asesor_id"] = exacto[0]["id"]
            continue
        cand = [u for u in usuarios if u["id"] == primero or u["id"].startswith(primero + "-")] if primero and primeros.get(primero, 0) == 1 else []
        if len(cand) > 1 and v.get("zona"):
            cand = [u for u in cand if u.get("zona") == v["zona"]] or cand
        if len(cand) == 1 and len(tokens) >= 2 and v.get("zona") and cand[0].get("zona") and cand[0]["zona"] != v["zona"]:
            cand = []
        v["asesor_id"] = cand[0]["id"] if len(cand) == 1 else None
    return vendedores


# Vendedores cuya captura cuenta como completa sin liga de HubSpot (misma lista que catalogs.js de la app).
SIN_LIGA_HUBSPOT = {"cambaceo1@kenetsolar.com", "ventasmty4@kenetsolar.com", "btnhlopez@gmail.com"}


def build(usuarios=None, forzados=None):
    """`forzados` ({nombre en la app: slug del CRM o ''}) viene de Configuración; VENTAS_COMISIONES_MAP se suma."""
    prof = get("profiles", "id,full_name,role,zone,comisionable,email")
    sales = get("sales", "id,vendor_id,shared_vendor_id,client_name,zone,sale_month,contract_amount,"
                         "commissionable_amount,cancelled,hubspot_link,origin,created_at,"
                         "panels,payment_method,advance_paid,referred_by,has_bidirectional_meter,extras_non_commissionable,commission_paid")
    correo = {p["id"]: (p.get("email") or "").strip().lower() for p in prof}
    vend = [{"id": p["id"], "nombre": (p.get("full_name") or "").strip(), "zona": ZONAS.get(norm(p.get("zone")), ""),
             "rol": p.get("role") or "", "asesor_id": None} for p in prof]
    try:
        env = json.loads(os.environ.get("VENTAS_COMISIONES_MAP") or "{}")
    except ValueError:
        env = {}
    if usuarios:
        emparejar(vend, usuarios, dict(env, **(forzados or {})))
    por = {v["id"]: v for v in vend}
    ventas = []
    for s in sales:
        m, fecha = mes(s.get("sale_month"))
        v = por.get(s.get("vendor_id")) or {}
        ventas.append({
            "id": s["id"], "vendedor_id": s.get("vendor_id"), "asesor_id": v.get("asesor_id"),
            "vendedor": v.get("nombre") or "?", "cliente": (s.get("client_name") or "").strip(),
            "zona": ZONAS.get(norm(s.get("zone")), v.get("zona", "")), "mes": m, "mes_texto": s.get("sale_month") or "",
            "fecha": fecha, "monto": float(s.get("contract_amount") or 0),
            "comisionable": float(s.get("commissionable_amount") or 0), "cancelada": bool(s.get("cancelled")),
            "liga": s.get("hubspot_link") or "", "origen": s.get("origin") or "",
            "compartida_con": (por.get(s.get("shared_vendor_id")) or {}).get("nombre") or "",
            # Analítica (Randall 7-sep): lo mismo que la pestaña Analítica de la app.
            "paneles": int(s.get("panels") or 0), "forma_pago": (s.get("payment_method") or "").strip(),
            "enganche": bool(s.get("advance_paid")), "referido_por": (s.get("referred_by") or "").strip(),
            "bidireccional": bool(s.get("has_bidirectional_meter")), "extras": float(s.get("extras_non_commissionable") or 0),
            "comision_pagada": bool(s.get("commission_paid")), "zona_app": (s.get("zone") or "").strip(),
            "captura": "completa" if s.get("origin") and (correo.get(s.get("vendor_id")) in SIN_LIGA_HUBSPOT or s.get("hubspot_link")) else "incompleta",
        })
    ventas.sort(key=lambda x: (x["fecha"] or 0, x["id"]), reverse=True)
    return {"generado": datetime.datetime.now(TZ).isoformat(timespec="seconds"), "vendedores": vend, "ventas": ventas}


def selftest():
    assert mes("Julio 2026") == ("2026-07", int(datetime.datetime(2026, 7, 1, tzinfo=TZ).timestamp()))
    assert mes("septiembre de 2026")[0] == "2026-09" and mes("Febrero 26")[0] == "2026-02"
    assert mes("") == (None, None) and mes("lo que sea") == (None, None)
    us = [{"id": "carlos-campillo", "zona": "MTY"}, {"id": "carlos-garcia", "zona": "TRC"}, {"id": "mara-galvez", "zona": "MTY"},
          {"id": "david-giacoman", "zona": "MTY"}, {"id": "jose-villarreal", "zona": "MTY"}, {"id": "arely-tovar", "zona": "TRC"},
          {"id": "jorge-emmanuel", "zona": "MTY"}, {"id": "javier-tonche", "zona": "MTY"}, {"id": "mildred-garcia", "zona": "TRC"}]
    v = emparejar([{"nombre": "Carlos", "zona": "MTY"}, {"nombre": "Mara", "zona": ""}, {"nombre": "David Giacoman", "zona": "MTY"},
                   {"nombre": "Jose Luis", "zona": "MTY"}, {"nombre": "Arely Y david", "zona": "TRC"}, {"nombre": "Nadie", "zona": ""},
                   {"nombre": "Jorge Bayardo", "zona": "TRC"}, {"nombre": "Jorge Torres", "zona": "MTY"}, {"nombre": "Javier Rodriguez", "zona": "TRC"},
                   {"nombre": "Mildred", "zona": "SLT"}], us, {"Arely Y david": "arely-tovar", "Mildred": ""})
    got = [x["asesor_id"] for x in v]
    # Carlos: nombre único en la app, dos Carlos en el CRM -> gana la zona. Jorge x2 -> nadie.
    # Javier Rodriguez: apellido distinto y otra zona -> nadie. Mildred forzada a '' -> sin asesor.
    assert got == ["carlos-campillo", "mara-galvez", "david-giacoman", "jose-villarreal", "arely-tovar", None, None, None, None, None], got
    print("selftest ok")


if __name__ == "__main__":
    if "--selftest" in sys.argv:
        selftest()
        sys.exit(0)
    c = build()
    con = sum(1 for v in c["vendedores"] if v["asesor_id"])
    print("comisiones: %d ventas · %d vendedores (%d con asesor del CRM) · meses %s → %s" % (
        len(c["ventas"]), len(c["vendedores"]), con,
        min((v["mes"] for v in c["ventas"] if v["mes"]), default="?"), max((v["mes"] for v in c["ventas"] if v["mes"]), default="?")))
