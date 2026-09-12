"""Calificación de llamadas (calificador-llamadas → Supabase analítica, SOLO lectura).

El calificador transcribe cada llamada grabada (Twilio/Kommo y HubSpot), la califica 1-5 ⭐ en
10 etapas + 4 pasos de objeción contra la rúbrica v3 y publica una fila por llamada en
`calificaciones_llamadas` (proyecto «analítica»). El dashboard la lee de ahí: nunca depende de la
máquina que transcribe.

Contrato de `build(usuarios)` (entra a data/ventas.json como `llamadas`):
  generado, dias
  llamadas[{id (rec_sid), crm 'kommo'|'hubspot', asesor (texto tal cual), asesor_id (slug del
            CRM o None), fecha (epoch), dur (s), tipo, resultado, pond, plana, cumple, sig_paso,
            objecion (tipo o ''), audio, tel, resumen, mejora, notas {clave: [estrellas, evidencia]}}]

Cruce con el CRM: el calificador guarda el nombre como lo da Kommo/HubSpot («Cinthia Heredia»); el
corte usa slug «nombre-apellido». Primero slug igual; si no, el asesor cuyo nombre normalizado
contiene todos los tokens del nombre del calificador (HubSpot dice «Cinthia Gabriela Heredia
Cortez»). `VENTAS_LLAMADAS_MAP` ({"Cinthia Heredia": "cinthia-gabriela"}) manda.

Env: ANALITICA_SUPABASE_URL + ANALITICA_SUPABASE_KEY (o SUPABASE_URL + SUPABASE_SERVICE_KEY si son el
mismo proyecto). Sin ellas no entra y el corte sigue igual. Solo GET.
"""
import datetime
import json
import os
import sys
import unicodedata
import urllib.parse
import urllib.request

DIAS = int(os.environ.get("VENTAS_LLAMADAS_DIAS", "180"))
PAGINA = 1000
NOTAS = ["e1_apertura", "e2_confianza", "e3_recibo", "e4_necesidades", "e5_motivaciones", "e6_objeciones",
         "e7_calificacion", "e8_propuesta", "e9_cierre", "e10_siguiente",
         "o1_validar", "o2_aclarar", "o3_resolver", "o4_retomar"]
# columna de Supabase -> clave de `evidencia` (jsonb, con las llaves del calificador)
EVID = {"e1_apertura": "1_apertura", "e2_confianza": "2_confianza", "e3_recibo": "3_recibo_cfe",
        "e4_necesidades": "4_necesidades", "e5_motivaciones": "5_motivaciones", "e6_objeciones": "6_objeciones",
        "e7_calificacion": "7_calificacion", "e8_propuesta": "8_propuesta", "e9_cierre": "9_cierre",
        "e10_siguiente": "10_siguiente_paso", "o1_validar": "1_validar", "o2_aclarar": "2_aclarar",
        "o3_resolver": "3_resolver", "o4_retomar": "4_retomar"}
SELECT = ("rec_sid,fecha,asesor,asesor_uid,telefono,duracion_s,origen,audio_url,tipo_llamada,resultado,"
          "global_prom,global_pond,cumple,objetivo_min,hubo_objecion,tipo_objecion,resumen,areas_mejora,evidencia,"
          + ",".join(NOTAS))


def norm(s):
    return "".join(c for c in unicodedata.normalize("NFD", str(s or "")) if unicodedata.category(c) != "Mn").lower().strip()


def _cred():
    url = (os.environ.get("ANALITICA_SUPABASE_URL") or os.environ.get("SUPABASE_URL") or "").rstrip("/")
    key = os.environ.get("ANALITICA_SUPABASE_KEY") or os.environ.get("SUPABASE_SERVICE_KEY") or ""
    if not url or not key:
        raise SystemExit("faltan ANALITICA_SUPABASE_URL / ANALITICA_SUPABASE_KEY")
    return url, key


def get(desde_iso):
    """Las filas de los últimos DIAS, paginando de a PAGINA."""
    url, key = _cred()
    out, off = [], 0
    while True:
        q = urllib.parse.urlencode({"select": SELECT, "fecha": "gte." + desde_iso, "order": "fecha.desc",
                                    "limit": PAGINA, "offset": off})
        req = urllib.request.Request("%s/rest/v1/calificaciones_llamadas?%s" % (url, q),
                                     headers={"apikey": key, "Authorization": "Bearer " + key, "Accept": "application/json"})
        with urllib.request.urlopen(req, timeout=60) as r:
            chunk = json.loads(r.read().decode("utf-8"))
        out += chunk
        if len(chunk) < PAGINA:
            return out
        off += PAGINA


def epoch(iso):
    try:
        return int(datetime.datetime.fromisoformat(iso.replace("Z", "+00:00")).timestamp())
    except (ValueError, AttributeError):
        return 0


def emparejar(nombre, usuarios, forzados=None):
    """slug del asesor del CRM para el nombre que guarda el calificador, o None."""
    forzados = {norm(k): v for k, v in (forzados or {}).items()}
    n = norm(nombre)
    if n in forzados:
        return forzados[n] or None
    tokens = [t for t in n.replace("-", " ").split() if t not in ("de", "del", "la", "los", "las", "y")]
    slug = "-".join(tokens[:2])
    for u in usuarios:
        if u["id"] == slug:
            return u["id"]
    # todos los tokens del calificador dentro del nombre del CRM (HubSpot trae nombres largos)
    cand = [u for u in usuarios if all(t in norm(u.get("nombre")).split() for t in tokens)]
    return cand[0]["id"] if len(cand) == 1 else None


def fila(r, usuarios, forzados):
    ev = r.get("evidencia") or {}
    if isinstance(ev, str):
        try:
            ev = json.loads(ev)
        except ValueError:
            ev = {}
    notas = {}
    for col in NOTAS:
        e = ev.get(EVID[col]) or {}
        notas[col] = [int(r.get(col) or 0), (e.get("evidencia") or "")[:300]]
    sid = r["rec_sid"]
    return {
        "id": sid, "crm": "hubspot" if r.get("origen") == "hubspot" or sid.startswith("HS") else "kommo",
        "asesor": r.get("asesor") or "?", "asesor_id": emparejar(r.get("asesor"), usuarios, forzados),
        "fecha": epoch(r.get("fecha")), "dur": int(r.get("duracion_s") or 0),
        "tipo": r.get("tipo_llamada") or "", "resultado": r.get("resultado") or "",
        "pond": float(r["global_pond"]) if r.get("global_pond") is not None else None,
        "plana": float(r["global_prom"]) if r.get("global_prom") is not None else None,
        "cumple": bool(r.get("cumple")), "sig_paso": bool(r.get("objetivo_min")),
        "objecion": (r.get("tipo_objecion") or "") if r.get("hubo_objecion") else "",
        "audio": r.get("audio_url") or "", "tel": r.get("telefono") or "",
        "resumen": (r.get("resumen") or "")[:600], "mejora": (r.get("areas_mejora") or "")[:600],
        "notas": notas,
    }


def build(usuarios=None, forzados=None):
    try:
        env = json.loads(os.environ.get("VENTAS_LLAMADAS_MAP") or "{}")
    except ValueError:
        env = {}
    forzados = dict(env, **(forzados or {}))
    desde = (datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(days=DIAS)).isoformat(timespec="seconds")
    filas = [fila(r, usuarios or [], forzados) for r in get(desde)]
    return {"generado": datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=-6))).isoformat(timespec="seconds"),
            "dias": DIAS, "llamadas": filas}


def selftest():
    us = [{"id": "cinthia-gabriela", "nombre": "Cinthia Gabriela Heredia Cortez"}, {"id": "marco-perez", "nombre": "Marco Pérez"},
          {"id": "monserrat-leon", "nombre": "Monserrat de León"}, {"id": "sandra-mejia", "nombre": "Sandra Mejía"},
          {"id": "sandra-rodriguez", "nombre": "Sandra Rodriguez"}, {"id": "jose-luis", "nombre": "Jose Luis Villarreal"}]
    assert emparejar("Marco Perez", us) == "marco-perez"
    assert emparejar("Cinthia Heredia", us) == "cinthia-gabriela"          # tokens dentro del nombre largo
    assert emparejar("Monserrat de Leon", us) == "monserrat-leon"
    assert emparejar("Sandra Mejia", us) == "sandra-mejia" and emparejar("Sandra Rodriguez", us) == "sandra-rodriguez"
    assert emparejar("Jose Luis Villarreal", us) == "jose-luis"
    assert emparejar("Nadie Conocido", us) is None
    assert emparejar("Cinthia Heredia", us, {"Cinthia Heredia": ""}) is None      # forzado a sin asesor
    assert emparejar("Cinthia Heredia", us, {"cinthia heredia": "marco-perez"}) == "marco-perez"
    r = {"rec_sid": "HS1", "fecha": "2026-09-11T17:00:00+00:00", "asesor": "Cinthia Heredia", "duracion_s": 93,
         "origen": "hubspot", "global_pond": "3.5", "cumple": False, "objetivo_min": True, "hubo_objecion": True,
         "tipo_objecion": "lo_pienso", "e1_apertura": 4, "evidencia": json.dumps({"1_apertura": {"estrellas": 4, "evidencia": "hola"}})}
    f = fila(r, us, {})
    assert f["crm"] == "hubspot" and f["asesor_id"] == "cinthia-gabriela" and f["pond"] == 3.5 and f["sig_paso"] is True
    assert f["notas"]["e1_apertura"] == [4, "hola"] and f["notas"]["o4_retomar"] == [0, ""] and f["objecion"] == "lo_pienso"
    assert f["fecha"] == epoch("2026-09-11T17:00:00+00:00") > 0
    print("selftest ok")


if __name__ == "__main__":
    if "--selftest" in sys.argv:
        selftest()
        sys.exit(0)
    c = build()
    con = sum(1 for x in c["llamadas"] if x["asesor_id"])
    print("llamadas: %d en %d días · %d con asesor del CRM (sin usuarios del corte no se cruza)" % (len(c["llamadas"]), c["dias"], con))
