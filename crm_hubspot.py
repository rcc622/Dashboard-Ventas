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
import sys, os, re, json, time, urllib.request, urllib.parse, urllib.error
from datetime import date, datetime, timedelta, timezone

import zonas

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
# El nombre del deal trae el origen pegado al final: "Hiram Cardenas - FB-form".
# Es la convencion del equipo y es lo unico que hay cuando el picklist esta vacio,
# que es mas de la mitad de las veces.
_SUFIJO = re.compile(r"\s-\s*([A-Za-z\u00c1-\u00fa][A-Za-z\u00c1-\u00fa\- ]{2,20})\s*$")
# Etiquetas que aparecen en el nombre pero no son valores del picklist.
_ALIAS = {"facebook": "Redes Sociales", "fb-form": "FB-form", "wapp-fb": "Wapp-FB",
          "wapp-ig": "Wapp-IG", "instagram": "Instagram", "web form": "Web Form",
          "referido": "Referido", "directo": "Directo", "cambaceo": "Cambaceo",
          "tiktok": "TikTok", "expo": "Expo", "correo": "Correo",
          "whatsapp": "WhatsApp"}

# Canal de entrada, con los mismos nombres que usa crm_kommo.py para que la
# grafica de canales lea igual venga de donde venga el corte.
CANAL = {"FB-form": "Meta Ads", "Wapp-FB": "Meta Ads", "Wapp-IG": "Meta Ads",
         "WA-FB D": "Meta Ads", "WA-IG D": "Meta Ads", "Redes Sociales": "Meta Ads",
         "Instagram": "Meta Ads", "TikTok": "Redes org\u00e1nico",
         "Web Form": "Web org\u00e1nico", "Referido": "Referido",
         "Directo": "Directo", "WhatsApp": "Directo", "Correo": "Directo",
         "Cambaceo": "Cambaceo", "Expo": "Cambaceo"}


def origen_de(props, nombre=""):
    """El origen del registro: el picklist si esta lleno, si no el sufijo del nombre."""
    o = (props.get("origen") or "").strip()
    if o:
        return o
    m = _SUFIJO.search(nombre or "")
    return _ALIAS.get(m.group(1).strip().lower(), "") if m else ""


def canal_de(props, nombre=""):
    return CANAL.get(origen_de(props, nombre), "Sin origen")


# La zona sale de `city` + `ciudad` + `state` (ver zonas.py). `zona_operativa` está
# vacío en toda la base (verificado 2026-07-26). Antes solo se miraba el picklist
# `ciudad`, que tiene cinco cajones: un lead de Tampico acababa contado como
# Monterrey y entraba a la cuenta de leads que "faltó asignar".
PROPS_ZONA = ["city", "ciudad", "state", "otra_ciudad"]


def zona_de(p):
    """(zona, motivo) de un contacto. zona ∈ MTY/SLT/TRC/MVA/FUERA/AMBIGUO/SIN_DATO."""
    return zonas.clasificar(city=p.get("city") or "", ciudad=p.get("ciudad") or "",
                            state=p.get("state") or "",
                            otra_ciudad=p.get("otra_ciudad") or "")


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
            print("  aviso: corte en 60k registros de %s" % objeto, file=sys.stderr)
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


VENTANAS = (7, 14, 28)
# Ventanas largas. El ciclo de venta ronda los 86 dias: preguntarle a 7 dias
# cuanto convierte un asesor da siempre cero. La conversion se mide aqui.
VENTANAS_LARGAS = (30, 60, 90)


def build(dias=7):
    hoy = date.today()
    ini7, ini30 = hoy - timedelta(days=dias), hoy - timedelta(days=30)
    ini90 = hoy - timedelta(days=90)
    own = owners()
    # nombre -> zona. Arranca con el equipo del owner en HubSpot y se completa
    # con la zona de los leads para los que no pertenecen a ningun equipo.
    zona_rep = {d["nombre"]: d["zona"] for d in own.values() if d.get("zona")}

    # hs_sa_first_engagement_date es la marca de primer contacto con mejor
    # llenado del portal (39%); hs_first_outreach_date trae 16% y las notas 23%.
    # hs_time_to_first_engagement viene en milisegundos.
    props_c = ["origen", "hubspot_owner_id", "createdate",
               "hs_sa_first_engagement_date", "hs_time_to_first_engagement"] + PROPS_ZONA
    # 90 dias, no 30: la conversion por asesor y el rendimiento por anuncio se
    # miden en la ventana del ciclo de venta. Las ventanas cortas salen de aqui
    # filtrando en memoria, sin una sola llamada extra a la API.
    c90 = list(search("contacts", rango("createdate", ini90, hoy), props_c))
    # La zona se calcula una sola vez por contacto y se guarda en el propio dict:
    # cada ventana la reusa en vez de reclasificar los contactos seis veces.
    for c in c90:
        c["_zona"], c["_motivo"] = zona_de(c["properties"])

    def desde(d):
        corte = (hoy - timedelta(days=d)).isoformat()
        return [c for c in c90 if (c["properties"].get("createdate") or "")[:10] >= corte]

    c30, c7 = desde(30), desde(dias)
    # hubspot_owner_id en el deal: sin el, la venta no tiene dueno y la columna
    # de conversion por asesor no se puede calcular.
    props_d = ["origen", "amount", "closedate", "days_to_close", "hs_is_closed_won",
               "hubspot_owner_id", "dealname", "pipeline"]
    d90 = [d for d in search("deals", rango("closedate", ini90, hoy), props_d)
           if str((d.get("properties") or {}).get("hs_is_closed_won")).lower() == "true"]
    d30 = [d for d in d90
           if (d["properties"].get("closedate") or "")[:10] >= ini30.isoformat()]
    d7 = [d for d in d30
          if (d["properties"].get("closedate") or "")[:10] >= ini7.isoformat()]

    # Cohorte y etapas viven en los deals CREADOS en la ventana, no en los
    # cerrados: la pregunta es qué pasó con lo que entró, no qué cayó en el
    # calendario. Un solo barrido de 90 días; las ventanas se cortan en memoria.
    dc90 = list(search("deals", rango("createdate", ini90, hoy),
                       ["pipeline", "dealstage", "hubspot_owner_id",
                        "hs_is_closed_won", "createdate", "origen", "dealname",
                        "amount", "days_to_close"]))

    def etiquetas_etapas():
        """({stageId: (label, orden)}, {pipelineId: [(stageId, label, orden)]})."""
        out, por_pipe = {}, {}
        try:
            r = _req("GET", "/crm/v3/pipelines/deals")
            for pl in r.get("results", []):
                for st in pl.get("stages", []):
                    out[st["id"]] = (st.get("label") or st["id"],
                                     st.get("displayOrder", 0))
                    por_pipe.setdefault(pl["id"], []).append(
                        (st["id"], st.get("label") or st["id"],
                         st.get("displayOrder", 0)))
        except SystemExit:
            pass
        return out, por_pipe

    ETAPAS, ETAPAS_PIPE = etiquetas_etapas()
    # El pipeline que manda para el mapa de etapas: el que más deals recibió en
    # los 90 días. Hoy es «Ventas» (922784339, antes «Ciclo de Venta KS»); si el equipo migra de pipeline,
    # esto lo sigue solo.
    _pp = {}
    for d_ in dc90:
        pp = d_["properties"].get("pipeline")
        _pp[pp] = _pp.get(pp, 0) + 1
    PIPE_CICLO = max(_pp, key=_pp.get) if _pp else None

    # La etapa «propuesta» del pipeline que manda, para el paso 4 del embudo.
    # Es foto de etapa actual: cuenta ganados y todo lo que esté en propuesta o
    # más adelante, EXCEPTO las etapas terminales de pérdida (un perdido que
    # pasó por propuesta no se distingue desde el snapshot).
    _PROP = re.compile(r"propuesta|cotiz|presupuesto", re.I)
    _LOST = re.compile(r"perdido|foraneo|foráneo|descart|sin inter", re.I)
    PROP_ORDEN = PROP_NOMBRE = None
    for _sid, _lbl, _orden in ETAPAS_PIPE.get(PIPE_CICLO, []):
        if _PROP.search(_lbl):
            PROP_ORDEN, PROP_NOMBRE = _orden, _lbl
            break

    def llego_a_propuesta(pr):
        if str(pr.get("hs_is_closed_won")).lower() == "true":
            return True
        if PROP_ORDEN is None or pr.get("pipeline") != PIPE_CICLO:
            return False
        lbl, orden = ETAPAS.get(pr.get("dealstage"), ("", -1))
        return orden >= PROP_ORDEN and not _LOST.search(lbl)

    def es_meta(p, nombre=""):
        return origen_de(p, nombre) in ORIGEN_META

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
        z = c["_zona"] if c["_zona"] in zonas.ASIGNABLE else ""
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

    dm7 = [d for d in d7 if es_meta(d["properties"], d["properties"].get("dealname"))]
    dm30 = [d for d in d30 if es_meta(d["properties"], d["properties"].get("dealname"))]
    dm90 = [d for d in d90 if es_meta(d["properties"], d["properties"].get("dealname"))]

    # Las seis ventanas, para que el dashboard pueda moverse sin que la parte
    # del CRM se quede congelada en 7.
    por_ventana = {}
    for v in VENTANAS + VENTANAS_LARGAS:
        cs = desde(v)
        metas = [c for c in cs if es_meta(c["properties"])]
        asignados = sum(1 for c in metas if c["properties"].get("hubspot_owner_id"))
        # Tres cubetas distintas por zona, que antes iban revueltas en una sola:
        #   llegaron   — leads de Meta de esa zona, tengan dueño o no
        #   asignados  — los que ya tienen asesor
        #   sin dueño  — los que están en zona y nadie tomó: el problema de ruteo
        zona, llegaron, rep = {}, {}, {}
        fuera_ciudad = {}
        for c in metas:
            z, motivo = c["_zona"], c["_motivo"]
            tiene = bool(c["properties"].get("hubspot_owner_id"))
            if z in zonas.ASIGNABLE:
                llegaron[z] = llegaron.get(z, 0) + 1
                if tiene:
                    zona[z] = zona.get(z, 0) + 1
            elif z == "FUERA":
                # De qué ciudades viene el gasto tirado: eso es lo accionable en Meta.
                cd = zonas.norm(c["properties"].get("city")
                                or c["properties"].get("otra_ciudad")
                                or c["properties"].get("ciudad")) or "?"
                fuera_ciudad[cd] = fuera_ciudad.get(cd, 0) + 1
            if tiene:
                info = own.get(str(c["properties"]["hubspot_owner_id"]), {})
                if info.get("nombre"):
                    # Por NOMBRE, no por (nombre, zona): un owner sin equipo toma
                    # la zona del lead, que varia entre leads, y con la llave doble
                    # el mismo asesor salia en dos filas con los leads partidos.
                    nom = info["nombre"]
                    zr = info.get("zona") or (z if z in zonas.ASIGNABLE else "")
                    if zr:
                        zona_rep.setdefault(nom, zr)
                    rep[nom] = rep.get(nom, 0) + 1
        veredictos = zonas.resumen(c["_zona"] for c in metas)
        asignables = sum(veredictos[z] for z in zonas.ZONAS)
        corte = (hoy - timedelta(days=v)).isoformat()
        wv = [d for d in dm90 if (d["properties"].get("closedate") or "")[:10] >= corte]
        # TODOS los deals ganados cerrados en la ventana, de cualquier canal:
        # cierre por asesor y embudo total. wv (solo Meta) queda para won_meta
        # y el marcador por zona, que se miden contra el gasto de Meta.
        wall = [d_ for d_ in d90
                if (d_["properties"].get("closedate") or "")[:10] >= corte]
        # Ventas por asesor: el dueno del deal, de CUALQUIER canal (antes solo
        # Meta: escondia los cierres de referidos/organico). No se casa
        # lead-con-venta (el lead que cerro hoy entro hace ~86 dias); es la foto
        # del periodo, que es lo que se usa para comparar asesores entre si.
        rep_v = {}
        for d in wall:
            info = own.get(str(d["properties"].get("hubspot_owner_id") or ""), {})
            if not info.get("nombre"):
                continue
            a = rep_v.setdefault(info["nombre"], [0, 0.0])
            a[0] += 1
            a[1] += float(d["properties"].get("amount") or 0)
        # Solo las de origen Meta, aparte: el CAC/ROAS del asesor reparte gasto
        # de Meta y dividirlo contra ventas de otros origenes inflaba el retorno.
        rep_vm = {}
        for d in wv:
            info = own.get(str(d["properties"].get("hubspot_owner_id") or ""), {})
            if not info.get("nombre"):
                continue
            a = rep_vm.setdefault(info["nombre"], [0, 0.0])
            a[0] += 1
            a[1] += float(d["properties"].get("amount") or 0)
        canales, asig_c = {}, {}
        for c in cs:
            k = canal_de(c["properties"])
            canales[k] = canales.get(k, 0) + 1
            if c["properties"].get("hubspot_owner_id"):
                asig_c[k] = asig_c.get(k, 0) + 1
        # -- contacto humano y su velocidad ---------------------------------
        contactados = sum(1 for c in metas
                          if c["properties"].get("hs_sa_first_engagement_date"))
        _hs_ms = sorted(float(c["properties"]["hs_time_to_first_engagement"])
                        for c in metas
                        if c["properties"].get("hs_time_to_first_engagement"))
        mediana_h = (_hs_ms[len(_hs_ms) // 2] / 3600000.0) if _hs_ms else None
        # -- dónde está hoy cada deal creado en la ventana ------------------
        _corte_v = (hoy - timedelta(days=v)).isoformat()
        dcv = [d_ for d_ in dc90
               if (d_["properties"].get("createdate") or "")[:10] >= _corte_v]
        # Embudo de COHORTE: pasos 2-3 cuentan contactos creados en la ventana;
        # propuesta y venta cuentan NEGOCIOS creados en la ventana (el contacto
        # no tiene etapa). «Cerró venta» = de esos negocios, los YA ganados —
        # por eso a 7 días sale casi en cero con un ciclo de ~3 meses, y ningún
        # paso puede superar al anterior.
        prop_c, ven_c = {}, {}
        ven_mxn, ven_dias = 0.0, []
        for d_ in dcv:
            pr = d_["properties"]
            k = canal_de(pr, pr.get("dealname"))
            if llego_a_propuesta(pr):
                prop_c[k] = prop_c.get(k, 0) + 1
            if str(pr.get("hs_is_closed_won")).lower() == "true":
                ven_c[k] = ven_c.get(k, 0) + 1
                ven_mxn += float(pr.get("amount") or 0)
                if pr.get("days_to_close"):
                    ven_dias.append(float(pr["days_to_close"]))
        et = {}
        for d_ in dcv:
            pr = d_["properties"]
            if pr.get("pipeline") != PIPE_CICLO:
                continue
            et[pr.get("dealstage")] = et.get(pr.get("dealstage"), 0) + 1
        etapas = [{"id": i, "nombre": ETAPAS.get(i, (i, 0))[0], "n": c2}
                  for i, c2 in sorted(et.items(),
                                      key=lambda kv: ETAPAS.get(kv[0], ("", 999))[1])]
        # -- cohorte por dueño: de SUS deals de la ventana, cuántos ya ganó --
        coh = {}
        for d_ in dcv:
            pr = d_["properties"]
            if str(pr.get("hs_is_closed_won")).lower() != "true":
                continue
            info2 = own.get(str(pr.get("hubspot_owner_id") or ""), {})
            if info2.get("nombre"):
                coh[info2["nombre"]] = coh.get(info2["nombre"], 0) + 1
        asesores = [{"rep": n, "zone": zona_rep.get(n, ""), "leads": k,
                     "ventas": rep_v.get(n, [0, 0.0])[0],
                     "mxn": rep_v.get(n, [0, 0.0])[1],
                     "ventas_meta": rep_vm.get(n, [0, 0.0])[0],
                     "mxn_meta": rep_vm.get(n, [0, 0.0])[1],
                     "cohorte": coh.get(n, 0)}
                    for n, k in sorted(rep.items(), key=lambda kv: -kv[1])]
        # Un asesor puede cerrar en la ventana sin haber recibido un lead nuevo:
        # la venta viene de un lead viejo. Dejarlo fuera esconderia la venta.
        vistos = {a["rep"] for a in asesores}
        for n, (cnt, mxn) in rep_v.items():
            if n not in vistos:
                asesores.append({"rep": n, "zone": zona_rep.get(n, ""), "leads": 0,
                                 "ventas": cnt, "mxn": mxn,
                                 "ventas_meta": rep_vm.get(n, [0, 0.0])[0],
                                 "mxn_meta": rep_vm.get(n, [0, 0.0])[1]})
        # Ventas por zona del ASESOR que cerro. El deal no trae ciudad y pedirle
        # su contacto asociado seria una llamada por venta; el equipo del owner ya
        # esta en memoria y es la misma zona contra la que se mide el gasto.
        wz = {}
        for d_ in wv:
            info = own.get(str(d_["properties"].get("hubspot_owner_id") or ""), {})
            z_ = zona_rep.get(info.get("nombre", ""), "")
            if not z_:
                continue
            a = wz.setdefault(z_, {"count": 0, "mxn": 0.0})
            a["count"] += 1
            a["mxn"] += float(d_["properties"].get("amount") or 0)
        # Ventas por ORIGEN: todas las cerradas en la ventana, por su canal de
        # entrada — con el rescate del sufijo del dealname, porque el picklist
        # `origen` viene vacio en mas de la mitad de los ganados. El retorno por
        # origen mide el ingreso de cada canal contra el gasto de SU plataforma.
        wc = {}
        for d_ in wall:
            pr_ = d_["properties"]
            k_ = canal_de(pr_, pr_.get("dealname"))
            a = wc.setdefault(k_, {"count": 0, "mxn": 0.0})
            a["count"] += 1
            a["mxn"] += float(pr_.get("amount") or 0)
        # El mismo corte abierto por zona (la del asesor que cerro, igual que
        # won_meta_por_zona) y por asesor: alimentan el filtro de Origen de la
        # seccion de retorno.
        wzc, rep_vc = {}, {}
        for d_ in wall:
            pr_ = d_["properties"]
            info_ = own.get(str(pr_.get("hubspot_owner_id") or ""), {})
            k_ = canal_de(pr_, pr_.get("dealname"))
            monto_ = float(pr_.get("amount") or 0)
            if info_.get("nombre"):
                a = rep_vc.setdefault(info_["nombre"], {}).setdefault(k_, [0, 0.0])
                a[0] += 1
                a[1] += monto_
            z_ = zona_rep.get(info_.get("nombre", ""), "")
            if not z_:
                continue
            a = wzc.setdefault(k_, {}).setdefault(z_, {"count": 0, "mxn": 0.0})
            a["count"] += 1
            a["mxn"] += monto_
        for a_ in asesores:
            a_["por_canal"] = rep_vc.get(a_["rep"], {})
        por_ventana[str(v)] = {
            # Ciclo de la COHORTE: cuánto tardaron en cerrar los negocios de
            # esta ventana que ya ganaron. None si todavía no gana ninguno.
            "ttc_dias": round(sum(ven_dias) / len(ven_dias), 1) if ven_dias else None,
            "embudo": {
                "asignados_por_canal": asig_c,
                "propuesta_por_canal": prop_c,
                "ventas_por_canal": ven_c,
                "ventas_total": {"count": sum(ven_c.values()), "mxn": ven_mxn},
                "etapa_propuesta": PROP_NOMBRE,
            },
            "contactados": contactados,
            "primer_contacto_horas": round(mediana_h, 1) if mediana_h is not None else None,
            "etapas": etapas,
            "leads_por_canal": canales,
            "won_meta_por_zona": wz,
            "leads_total": len(cs), "leads_meta": len(metas),
            "asignados": asignados,
            "asignados_por_zona": {z: zona.get(z, 0) for z in zonas.ZONAS},
            # Un lead fuera de las zonas de cobertura no cuenta como "faltó
            # asignarlo": no hay a quién asignárselo. Se mide aparte, contra la
            # campaña que lo trajo.
            "asignables": asignables,
            "llegaron_por_zona": {z: llegaron.get(z, 0) for z in zonas.ZONAS},
            "sin_asignar_por_zona": {z: llegaron.get(z, 0) - zona.get(z, 0)
                                     for z in zonas.ZONAS},
            "fuera_de_zona": veredictos["FUERA"],
            "zona_ambigua": veredictos["AMBIGUO"],
            "sin_ciudad": veredictos["SIN_DATO"],
            "fuera_por_ciudad": dict(sorted(fuera_ciudad.items(),
                                            key=lambda kv: -kv[1])[:15]),
            "por_asesor": asesores,
            "won_meta": suma(wv),
            "won_por_canal": wc,
            "won_zona_por_canal": wzc,
        }

    return {
        "por_ventana": por_ventana,
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
