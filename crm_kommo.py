#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Extractor Kommo -> crm_recon.json para el dashboard.

Es el reemplazo de las consultas manuales al MCP de HubSpot. Escribe el MISMO
contrato (ver docstring de dashboard.py), solo cambia "source" a "kommo".

Uso:
    python kommo_crm.py --probe            # explora la cuenta: pipelines, campos, usuarios
    python kommo_crm.py --days 7           # escribe plan_g_data/crm_recon.json
    python kommo_crm.py --days 7 --dry     # imprime sin escribir

Credenciales: Kommo Salesbot/fase1-webhook/.env  (KOMMO_SUBDOMAIN, KOMMO_LONG_TOKEN)
"""
import sys, os, json, time, urllib.request, urllib.parse, urllib.error
from datetime import date, datetime, timedelta, timezone

import zonas

sys.stdout.reconfigure(encoding="utf-8")
HERE = os.path.dirname(os.path.abspath(__file__))
ENV_PATH = os.environ.get("KOMMO_ENV", os.path.join(HERE, "Kommo Salesbot", "fase1-webhook", ".env"))
OUT = os.path.join(os.environ.get("DASH_DATA", os.path.join(HERE, "data")), "crm_recon.json")

# Zona horaria de operación (Kommo devuelve epoch UTC)
TZ = timezone(timedelta(hours=-6))   # America/Monterrey


def load_env(path=ENV_PATH):
    """Lee el .env local si existe; en un contenedor no hay archivo, así que las
    variables de entorno son la fuente y siempre ganan sobre el archivo."""
    env = {}
    try:
        for ln in open(path, encoding="utf-8-sig"):
            ln = ln.strip()
            if ln and not ln.startswith("#") and "=" in ln:
                k, v = ln.split("=", 1)
                env[k.strip()] = v.strip().strip('"').strip("'")
    except FileNotFoundError:
        pass
    for k in ("KOMMO_SUBDOMAIN", "KOMMO_LONG_TOKEN"):
        if os.environ.get(k):
            env[k] = os.environ[k]
    if not (env.get("KOMMO_SUBDOMAIN") and env.get("KOMMO_LONG_TOKEN")):
        sys.exit("Faltan KOMMO_SUBDOMAIN o KOMMO_LONG_TOKEN "
                 "(ni en %s ni en las variables de entorno)." % path)
    return env


ENV = load_env()
SUB = ENV.get("KOMMO_SUBDOMAIN", "")
TOKEN = ENV.get("KOMMO_LONG_TOKEN", "")
if not (SUB and TOKEN):
    sys.exit("Faltan KOMMO_SUBDOMAIN o KOMMO_LONG_TOKEN en el .env.")
BASE = "https://%s.kommo.com/api/v4/" % SUB


def get(path, **params):
    """GET a la API de Kommo. Devuelve {} en 204 (sin contenido)."""
    url = BASE + path
    if params:
        url += "?" + urllib.parse.urlencode(params, doseq=True)
    req = urllib.request.Request(url, headers={
        "Authorization": "Bearer " + TOKEN,
        "User-Agent": "kenet-dashboard/1.0",
    })
    for intento in range(3):
        try:
            with urllib.request.urlopen(req, timeout=45) as r:
                body = r.read().decode("utf-8")
                return json.loads(body) if body.strip() else {}
        except urllib.error.HTTPError as e:
            if e.code == 204:
                return {}
            if e.code == 429 and intento < 2:      # rate limit: Kommo permite 7 req/s
                time.sleep(2 * (intento + 1))
                continue
            detalle = e.read().decode("utf-8", "replace")[:300]
            raise SystemExit("HTTP %s en %s\n%s" % (e.code, path, detalle))
        except urllib.error.URLError as e:
            if intento < 2:
                time.sleep(2)
                continue
            raise SystemExit("Red: %s" % e)
    return {}


def paged(path, embedded_key, **params):
    """Itera todas las páginas de un endpoint de listado."""
    page, params = 1, dict(params)
    params.setdefault("limit", 250)
    while True:
        params["page"] = page
        r = get(path, **params)
        items = (r.get("_embedded") or {}).get(embedded_key, [])
        if not items:
            return
        for it in items:
            yield it
        if not (r.get("_links") or {}).get("next"):
            return
        page += 1
        if page > 200:      # ponytail: tope de seguridad, 50k registros
            print("  aviso: corte en 200 páginas de %s" % path, file=sys.stderr)
            return


def epoch(d):
    return int(datetime(d.year, d.month, d.day, tzinfo=TZ).timestamp())


# ---------------------------------------------------------------- probe
def probe():
    """Explora la cuenta para mapear IDs antes de escribir el extractor final."""
    acc = get("account")
    print("Cuenta: %s (id %s)" % (acc.get("name"), acc.get("id")))

    print("\n== PIPELINES Y ETAPAS ==")
    for pl in paged("leads/pipelines", "pipelines"):
        print("  [%s] %s" % (pl["id"], pl["name"]))
        for st in (pl.get("_embedded") or {}).get("statuses", []):
            print("        %-8s %-34s tipo=%s" % (st["id"], st["name"][:34], st.get("type")))

    print("\n== USUARIOS ==")
    for u in paged("users", "users"):
        print("  %-10s %-30s %s" % (u["id"], (u.get("name") or "")[:30], u.get("email", "")))

    print("\n== CAMPOS PERSONALIZADOS DE LEAD ==")
    for f in paged("leads/custom_fields", "custom_fields"):
        enums = (f.get("enums") or [])[:8]
        ev = " | ".join("%s=%s" % (e.get("id"), e.get("value")) for e in enums)
        print("  %-10s %-32s %-12s %s" % (f["id"], (f.get("name") or "")[:32], f.get("type"), ev))

    print("\n== CAMPOS PERSONALIZADOS DE CONTACTO ==")
    for f in paged("contacts/custom_fields", "custom_fields"):
        enums = (f.get("enums") or [])[:8]
        ev = " | ".join("%s=%s" % (e.get("id"), e.get("value")) for e in enums)
        print("  %-10s %-32s %-12s %s" % (f["id"], (f.get("name") or "")[:32], f.get("type"), ev))

    print("\n== ETIQUETAS DE LEAD ==")
    for t in paged("leads/tags", "tags"):
        print("  %-10s %s" % (t["id"], t.get("name")))

    print("\n== MUESTRA: 3 leads recientes (estructura cruda) ==")
    n = 0
    for l in paged("leads", "leads", order={"created_at": "desc"}, limit=3):
        print(json.dumps(l, ensure_ascii=False, indent=1)[:1400])
        n += 1
        if n >= 1:
            break
    print("\nSiguiente paso: pasar los IDs relevantes a MAP (abajo en este archivo) y correr sin --probe.")


# ---------------------------------------------------------------- mapeo
# IDs reales de la cuenta 30948147, confirmados con --probe el 2026-07-26.
MAP = {
    # OJO: la ciudad vive en el CONTACTO, no en el lead. Es un desplegable con
    # los mismos valores que HubSpot, así que la zona migra sin traducción.
    "campo_ciudad_contacto": 1823968,
    # No existe un campo "Origen" como el picklist de HubSpot. La atribución
    # llega por `utm_source`, que el salesbot escribe cuando el lead entra por
    # un anuncio Click-to-WhatsApp (objeto `referral` del webhook de Meta).
    "campo_utm_source": 1823742,
    "campo_utm_medium": 1823738,       # "ctwa" = Meta, "wix-form" = el sitio
    # Sí existe un picklist de Origen; el comentario de arriba decía que no y por
    # eso todo lo que no era Meta caía en "Sin origen". Valores observados:
    # Facebook - Ad / Facebook - Organic / Instagram - Organic / Tiktok - Organic /
    # Web Form - Organic / Directo. Está vacío en la mayoría, así que es el primer
    # criterio, no el único.
    "campo_origen": 1833317,
    "campo_utm_campaign": 1823740,     # nombre de la campaña
    "campo_utm_content": 1823736,      # nombre del anuncio
    "campo_utm_term": 1823744,         # id del anuncio, para cruzar con Meta sin ambigüedad
    "campo_fbclid": 1823754,
    "origen_meta": ["meta", "facebook", "instagram", "fb", "ig"],
    # Ganado y perdido son globales en Kommo: valen en cualquier pipeline.
    "status_won": [142],
    # Pipeline que manda para efectos de venta. Decisión pendiente de confirmar
    # con el equipo: hoy hay varios con su propia etapa "ganado".
    "pipeline_ventas": 14175132,
    # Fuentes de lead observadas. La de WhatsApp trae teléfono; las de redes
    # traen nombre de usuario y caen todas en el pipeline REDES ORGANICO.
    "source_whatsapp": 23045767,
    "source_redes": [23044953, 23044955, 23044957],
    # usuario -> zona. El NOMBRE ya no se escribe aqui: sale de /users en cada
    # corte, asi que un asesor nuevo aparece solo. Este dict queda unicamente
    # para la zona, que Kommo no guarda en el usuario.
    "zona_por_usuario": {
        9230887: "", 15137632: "",
    },
    # Usuarios que NO son vendedores: sus leads no cuentan como «asignados» ni
    # aparecen en el reparto. Randall (15621244) es admin de sistema; el robot
    # le deja leads encima y eso inflaba la asignación.
    "no_vendedores": [15621244],
}


def asignado_a(lead):
    """El dueño del lead SI cuenta como asignación de venta; None si no tiene
    dueño o si el dueño está en no_vendedores (admins, sistema)."""
    uid = lead.get("responsible_user_id")
    return uid if uid and uid not in MAP["no_vendedores"] else None


# El padrón de asesores NO se cuenta aquí: lo publica el servidor de asignación
# (kommo-salesbot-ia, /health → "padron"), que ya aplica las reglas de verdad:
# grupo Kommo KS-{zona} + rol KS-VENTAS (turno) / KS-SEGUIMIENTO (auxiliar).
# Contarlo dos veces con dos reglas es como se desincroniza. Sin respuesta, el
# dashboard cae a su padrón fijo y lo dice.
KOMMO_IA_URL = os.environ.get("KOMMO_IA_URL",
                              "https://kommo-salesbot-ia-production.up.railway.app")


def padron():
    """{"padron": {zona: {"turno": [...], "seguimiento": [...]}},
        "asesores_por_zona": {zona: n}} o {} si el servidor no contesta."""
    try:
        with urllib.request.urlopen(KOMMO_IA_URL + "/health", timeout=20) as r:
            h = json.loads(r.read().decode("utf-8"))
    except Exception as e:
        print("  aviso: padrón no disponible (%s); el dashboard usa el fijo" % str(e)[:80])
        return {}
    p = h.get("padron") or {}
    if not p:
        return {}
    return {"padron": p,
            "asesores_por_zona": {z: len(v.get("turno") or []) + len(v.get("seguimiento") or [])
                                  for z, v in p.items()},
            "padron_version": h.get("version", "")}


_usuarios = {}


def usuarios():
    """{id: {'rep': nombre, 'zone': zona}} leido de Kommo en cada corte.

    Antes esto era un dict a mano con dos nombres: cualquier asesor dado de alta
    despues quedaba fuera del reparto sin que nada lo avisara.
    """
    if _usuarios:
        return _usuarios
    # La zona sale del padrón (grupo KS-{zona}); MAP["zona_por_usuario"] solo
    # desempata si el padrón no contesta.
    zona_por_nombre = {n: z for z, v in (PADRON.get("padron") or {}).items()
                       for n in (v.get("turno") or []) + (v.get("seguimiento") or [])}
    try:
        for u in paged("users", "users"):
            nombre = (u.get("name") or u.get("email") or "usuario %s" % u["id"]).strip()
            _usuarios[u["id"]] = {
                "rep": nombre,
                "zone": zona_por_nombre.get(nombre) or MAP["zona_por_usuario"].get(u["id"], "")}
    except SystemExit:
        pass
    return _usuarios


PADRON = padron()

# La cobertura vive en zonas.py, compartida con crm_hubspot.py y el dashboard:
# una sola definición de qué ciudad es nuestra y cuál no.


def cf(entity, field_id):
    """Lee un custom field de un lead/contacto por id."""
    for f in entity.get("custom_fields_values") or []:
        if f.get("field_id") == field_id:
            vals = f.get("values") or [{}]
            return vals[0].get("value")
    return None


_cache_contactos = {}


def ciudad_del_lead(lead):
    """La ciudad sale del CONTACTO, no del lead.

    Este era un bug real del primer borrador: leía `campo_zona` del lead, donde
    ese campo no existe. Se cachea por contacto porque un extractor de 900 leads
    haría 900 llamadas de más.
    """
    contactos = (lead.get("_embedded") or {}).get("contacts") or []
    if not contactos:
        return ""
    cid = contactos[0]["id"]
    if cid not in _cache_contactos:
        try:
            _cache_contactos[cid] = cf(get("contacts/%s" % cid), MAP["campo_ciudad_contacto"])
        except SystemExit:
            _cache_contactos[cid] = None
    return _cache_contactos[cid] or ""


def precarga_ciudades(leads):
    """Baja de un jalón la ciudad de todos los contactos que hagan falta.

    `ciudad_del_lead` pegándole a la API contacto por contacto son miles de
    llamadas a 7 req/s, y el refresh no cabe en su ventana de 15 minutos. Kommo
    acepta `filter[id][]` con una lista, así que la misma información baja en
    centenas. OJO: tiene que ser `filter[id][]`; con `filter[id]` a secas Kommo
    se queda con el último id de la lista y devuelve un solo contacto, sin error.
    """
    faltan = set()
    for l in leads:
        cs = (l.get("_embedded") or {}).get("contacts") or []
        if cs and cs[0]["id"] not in _cache_contactos:
            faltan.add(cs[0]["id"])
    faltan = sorted(faltan)
    for i in range(0, len(faltan), 100):
        lote = faltan[i:i + 100]
        try:
            for c in paged("contacts", "contacts", **{"filter[id][]": lote}):
                _cache_contactos[c["id"]] = cf(c, MAP["campo_ciudad_contacto"])
        except SystemExit as e:
            print("  aviso: un lote de contactos no bajo (%s)" % str(e)[:120], file=sys.stderr)
        # Lo que no volvió (borrado, sin permiso) se marca para no volver a
        # pedirlo de uno en uno más adelante.
        for cid in lote:
            _cache_contactos.setdefault(cid, None)
    return len(faltan)


def zona_del_lead(lead):
    """(zona, motivo) — MTY/SLT/TRC/MVA si es asignable, si no FUERA/AMBIGUO/SIN_DATO."""
    c = ciudad_del_lead(lead)
    return zonas.clasificar(city=c, ciudad=c)


# Google Ads no manda su id de anuncio: sus leads entran por el formulario del
# sitio con el nombre de la campaña en `utm_campaign` y la palabra clave en
# `utm_term`. Las campañas de búsqueda se llaman KS_<ZONA>_SEARCH_<algo>.
TOKEN_GOOGLE = "SEARCH"


def canal_del_lead(lead):
    """De dónde vino el lead. Un solo lugar donde se decide el canal.

    OJO al leerlo: el único canal con gasto medible en este dashboard es Meta.
    Google entra identificado pero su gasto vive en Google Ads, que todavía no
    está conectado; lo orgánico no tiene gasto que atribuir.
    """
    # El picklist va DESPUES de Google a proposito: sus valores no incluyen a
    # Google, asi que un lead de Search acaba marcado "Web Form - Organic" y se
    # perderia como organico. La campana es el dato duro.
    camp0 = (cf(lead, MAP["campo_utm_campaign"]) or "").strip()
    if TOKEN_GOOGLE in camp0.upper():
        return "Google Ads"
    o = (cf(lead, MAP["campo_origen"]) or "").strip().lower()
    if o:
        if "organic" in o:
            return "Web orgánico" if "web" in o else "Redes orgánico"
        if "ad" in o:
            # "Web Form - Ad" = form llenado tras click pagado; la fuente dice
            # de quién fue el ad (gclid -> utm_source=google en el salesbot).
            if "web" in o and "google" in (cf(lead, MAP["campo_utm_source"]) or "").strip().lower():
                return "Google Ads"
            return "Meta Ads"
        if "directo" in o:
            return "Directo"
    med = (cf(lead, MAP["campo_utm_medium"]) or "").strip().lower()
    if med == "ctwa" or es_de_meta(lead):
        return "Meta Ads"
    if med == "wix-form" or (cf(lead, MAP["campo_utm_source"]) or "").strip().lower() == "web":
        return "Web orgánico"
    if lead.get("source_id") in MAP["source_redes"]:
        return "Redes orgánico"
    if lead.get("source_id") == MAP["source_whatsapp"]:
        return "Directo"
    return "Sin origen"


def es_de_meta(lead):
    """Meta si el salesbot marcó el origen, o si trae el identificador de clic."""
    src = (cf(lead, MAP["campo_utm_source"]) or "").strip().lower()
    if src and any(m in src for m in MAP["origen_meta"]):
        return True
    return bool(cf(lead, MAP["campo_fbclid"]))


def nombres_estados():
    """{status_id: nombre} de todos los pipelines, mas los globales."""
    out = {142: "Ganado", 143: "Perdido"}
    try:
        r = get("leads/pipelines")
        for pl in (r.get("_embedded") or {}).get("pipelines", []):
            for st in (pl.get("_embedded") or {}).get("statuses", []):
                out.setdefault(st["id"], st.get("name") or st["id"])
    except SystemExit:
        pass
    return out


def etapas_ventas():
    """(sorts, prop_sort, prop_nombre) del pipeline de ventas.

    sorts = {status_id: sort} de sus etapas. prop_sort/prop_nombre = la etapa
    «propuesta» (por nombre: propuesta/cotiza/presupuesto); None si el pipeline
    no trae una — el dashboard entonces omite ese paso del embudo en vez de
    inventarlo.
    """
    sorts, prop = {}, None
    try:
        r = get("leads/pipelines/%d" % MAP["pipeline_ventas"])
        for st in (r.get("_embedded") or {}).get("statuses", []):
            sorts[st["id"]] = st.get("sort", 0)
            n = (st.get("name") or "").lower()
            if prop is None and any(t in n for t in ("propuesta", "cotiza", "presupuesto")):
                prop = (st.get("sort", 0), st.get("name"))
    except SystemExit:
        pass
    return (sorts, prop[0] if prop else None, prop[1] if prop else None)


# Un toque de un usuario real. El bot firma con created_by=0, así que un mensaje
# saliente a secas no distingue nada: el bot le escribe a todos.
TIPOS_CONTACTO = "outgoing_chat_message,task_completed"


def primer_contacto_humano(ini, fin, usuarios_reales):
    """{lead_id: epoch del primer toque humano} en el rango.

    Una sola pasada por el log de eventos filtrada por tipo — 4,000 eventos en
    ~13 s. Hacerlo por lead serían miles de llamadas.
    """
    primero = {}
    for e in paged("events", "events", **{
            "filter[created_at][from]": epoch(ini),
            "filter[created_at][to]": epoch(fin) + 86399,
            "filter[type]": TIPOS_CONTACTO, "limit": 250}):
        if e.get("created_by") not in usuarios_reales:
            continue
        if e.get("entity_type") != "lead":
            continue
        lid, t = e.get("entity_id"), e.get("created_at") or 0
        if lid and (lid not in primero or t < primero[lid]):
            primero[lid] = t
    return primero


VENTANAS = (7, 14, 28)
# El ciclo de venta ronda los 86 dias: la conversion por asesor y el rendimiento
# por anuncio solo tienen sentido en estas ventanas.
VENTANAS_LARGAS = (30, 60, 90)


def build(days=7):
    hoy = date.today()
    ini7, ini30 = hoy - timedelta(days=days), hoy - timedelta(days=30)
    ini90 = hoy - timedelta(days=90)
    USR = usuarios()

    leads90, leads7, leads30, won7, won30 = [], [], [], [], []
    for l in paged("leads", "leads",
                   **{"filter[created_at][from]": epoch(ini90),
                      "filter[created_at][to]": epoch(hoy) + 86399,
                      "with": "contacts,source_id"}):
        cre = datetime.fromtimestamp(l["created_at"], TZ).date()
        leads90.append(l)
        if cre >= ini30:
            leads30.append(l)
        if cre >= ini7:
            leads7.append(l)
    # OJO: `filter[statuses][0][status_id]` SOLO funciona acompañado de su
    # `pipeline_id`. Suelto, Kommo lo ignora en silencio y devuelve todos los
    # cerrados — ganados y perdidos revueltos. Como "ganado" (142) es global y
    # vale en cualquier pipeline, se filtra del lado de acá.
    won90 = []
    for l in paged("leads", "leads",
                   **{"filter[closed_at][from]": epoch(ini90),
                      "filter[closed_at][to]": epoch(hoy) + 86399,
                      "with": "contacts"}):
        if l.get("status_id") not in MAP["status_won"]:
            continue
        cerr = datetime.fromtimestamp(l.get("closed_at") or 0, TZ).date()
        won90.append(l)
        if cerr >= ini30:
            won30.append(l)
        if cerr >= ini7:
            won7.append(l)

    def es_meta(l):
        """UNA sola definición de «lead de Meta»: la del canal.

        Antes era `es_de_meta`, que se queda con cualquier lead que traiga
        `fbclid` — incluidos los que entran por una campaña de búsqueda de Google
        y solo arrastran el clic viejo. El dashboard clasifica por canal, así que
        había dos poblaciones distintas: la dona decía 274 y el embudo 276, y el
        paso «Tiene asesor» salía en 101% del anterior. Con esta, todo lo que
        cuelga de `leads_meta` —asignados, zona, ventas— habla del mismo grupo.
        """
        return canal_del_lead(l) == "Meta Ads"

    # TODOS los leads, no solo los de Meta: desde que el mapa por zona se abre
    # por canal, `zona(l)` se pregunta de cada lead de cualquier origen. Con la
    # precarga acotada a Meta, los demas caian en `ciudad_del_lead` uno por uno
    # —una llamada por contacto a 7 req/s— y el refresh no terminaba nunca.
    # En lotes de 100 son unas decenas de requests para los 90 dias completos.
    # won90 y no wm90: wm90 se filtra mas abajo y aqui todavia no existe.
    n = precarga_ciudades(leads90 + won90)
    print("  ciudades precargadas: %d contactos" % n, file=sys.stderr)
    # La zona se resuelve una vez por lead: cada ventana la reusa en vez de
    # volver a pegarle a la API de contactos.
    zcache = {}

    def zona(l):
        if l["id"] not in zcache:
            zcache[l["id"]] = zona_del_lead(l)[0]
        return zcache[l["id"]]

    origen7 = {}
    for l in leads7:
        o = canal_del_lead(l)
        origen7[o] = origen7.get(o, 0) + 1

    # La zona sale de la ciudad del contacto; el asesor solo aporta su nombre.
    # Si un asesor no está en MAP, igual cuenta para la zona — lo que no se puede
    # es atribuirle la fila del reparto por asesor.
    asign_zona, por_rep = {}, {}
    for l in leads7:
        uid = asignado_a(l)
        if not (es_meta(l) and uid):
            continue
        z = zona(l)
        if z in zonas.ASIGNABLE:
            asign_zona[z] = asign_zona.get(z, 0) + 1
        if uid in USR:
            por_rep[uid] = por_rep.get(uid, 0) + 1

    # --- Rendimiento por anuncio -------------------------------------------
    # Meta ya dice cuánto costó cada anuncio y cuántas conversaciones trajo. Lo que
    # Meta NO sabe es cuáles de esas conversaciones acabaron en un lead atendido y
    # en una venta. Eso vive aquí, y se une por el id del anuncio (utm_term).
    def _ad(l):
        """(ad_id, nombre, campaña) del lead, o None si no trae atribución."""
        contenido = str(cf(l, MAP["campo_utm_content"]) or "")
        aid = str(cf(l, MAP["campo_utm_term"]) or "")
        # Los leads atribuidos antes de que el bot resolviera nombres traen el id
        # en `utm_content` y `utm_term` vacío. Se aceptan igual: sin este rescate
        # desaparecerían de la tabla por un detalle de cuándo entraron.
        if not aid and contenido.isdigit():
            aid = contenido
        if not aid:
            return None
        # Si el nombre es en realidad el id, se deja vacío: el dashboard lo
        # resuelve con el nombre que Meta ya trae en sus insights.
        return (aid, "" if contenido.isdigit() else contenido,
                cf(l, MAP["campo_utm_campaign"]) or "")

    def por_anuncio_de(ls, ws):
        """Una tabla de anuncios por ventana.

        Antes era una sola de 7 días que el dashboard tenía que contrastar contra
        el gasto de 30/60/90, avisando que las columnas no se podían dividir
        entre sí. Ahora cada ventana trae su propio corte.
        """
        acc = {}

        def fila(l):
            d = _ad(l)
            if d is None:
                return None
            aid, nombre, camp = d
            f = acc.setdefault(aid, {"ad_id": aid, "ad_name": nombre,
                                     "campaign_name": camp, "leads": 0,
                                     "asignados": 0, "ventas": 0, "mxn": 0.0})
            if not f["ad_name"] and nombre:
                f["ad_name"] = nombre
            return f

        for l in ls:
            f = fila(l)
            if f is None:
                continue
            f["leads"] += 1
            if asignado_a(l):
                f["asignados"] += 1
        for l in ws:
            f = fila(l)
            if f is None:
                continue
            f["ventas"] += 1
            f["mxn"] += float(l.get("price") or 0)
        return sorted(acc.values(), key=lambda f: -f["leads"])

    def suma(ls):
        return {"count": len(ls), "mxn": sum(float(x.get("price") or 0) for x in ls)}

    def ttc(ls):
        ds = [(l["closed_at"] - l["created_at"]) / 86400.0
              for l in ls if l.get("closed_at") and l.get("created_at")]
        return round(sum(ds) / len(ds), 2) if ds else 0

    wm7, wm30 = [l for l in won7 if es_meta(l)], [l for l in won30 if es_meta(l)]
    wm90 = [l for l in won90 if es_meta(l)]

    # Las seis ventanas: sin esto el dashboard mueve la ventana y la parte del
    # CRM se queda congelada en 7. leads90/wm90 ya traen el rango completo, así
    # que se recortan en memoria en vez de repegarle a la API.
    def en_ventana(ls, v, campo="created_at"):
        corte = hoy - timedelta(days=v)
        return [l for l in ls
                if datetime.fromtimestamp(l.get(campo) or 0, TZ).date() >= corte]

    # Kommo no guarda la zona en el usuario, asi que en las ventanas cortas se
    # deduce de los leads que le tocaron. Las largas no resuelven ciudad (cuesta
    # una llamada por contacto), asi que heredan la zona que ya se vio: sin esto,
    # a 30/60/90 dias todos los asesores saldrian sin zona y sin meta contra la
    # cual medirse, justo en las ventanas donde se mide la conversion.
    zona_de_rep = {u["rep"]: u["zone"] for u in USR.values() if u["zone"]}
    ESTADOS = nombres_estados()
    PV_SORTS, PROP_SORT, PROP_NOMBRE = etapas_ventas()
    # el barrido de contacto cubre los 90 días completos, una sola vez
    contacto = primer_contacto_humano(ini90, hoy, set(USR))
    por_ventana = {}
    for v in VENTANAS + VENTANAS_LARGAS:
        ls = en_ventana(leads90, v)
        metas = [l for l in ls if es_meta(l)]
        wv = en_ventana(wm90, v, "closed_at")
        # TODAS las ventas cerradas en la ventana, de cualquier canal: el cierre
        # por asesor y el embudo total salen de aquí; wv (solo Meta) queda para
        # won_meta y el marcador por zona, que se miden contra el gasto de Meta.
        wall = en_ventana(won90, v, "closed_at")
        pz, lleg, rep, fuera_ciudad = {}, {}, {}, {}
        for l in metas:
            tiene = bool(asignado_a(l))
            z = zona(l)
            if z in zonas.ASIGNABLE:
                lleg[z] = lleg.get(z, 0) + 1
                if tiene:
                    pz[z] = pz.get(z, 0) + 1
            elif z == "FUERA":
                cd = zonas.norm(ciudad_del_lead(l)) or "?"
                fuera_ciudad[cd] = fuera_ciudad.get(cd, 0) + 1
            uid = asignado_a(l)
            if tiene and uid in USR:
                nom = USR[uid]["rep"]
                zr = USR[uid]["zone"] or (z if z in zonas.ASIGNABLE else "")
                if zr:
                    zona_de_rep.setdefault(nom, zr)
                rep[nom] = rep.get(nom, 0) + 1
        # Ventas por asesor: dueño del lead ganado, de CUALQUIER canal (antes
        # solo Meta: escondía los cierres de referidos/orgánico). No se casa
        # lead-con-venta (el que cerró hoy entró hace ~86 días); es la foto del
        # periodo, que es lo que sirve para comparar asesores entre sí.
        rep_v = {}
        for l in wall:
            uid = asignado_a(l)
            if uid not in USR:
                continue
            a = rep_v.setdefault(USR[uid]["rep"], [0, 0.0])
            a[0] += 1
            a[1] += float(l.get("price") or 0)
        # Solo las de origen Meta, aparte: el CAC/ROAS del asesor reparte gasto
        # de Meta y dividirlo contra ventas de otros origenes inflaba el retorno.
        rep_vm = {}
        for l in wv:
            uid = asignado_a(l)
            if uid not in USR:
                continue
            a = rep_vm.setdefault(USR[uid]["rep"], [0, 0.0])
            a[0] += 1
            a[1] += float(l.get("price") or 0)
        # Cohorte: los leads que le ENTRARON al asesor en la ventana y que a la
        # fecha ya están ganados, vengan de la ventana que vengan sus cierres.
        # La conversión de periodo dividía ventas de leads viejos entre leads
        # nuevos y castigaba justo al que más recibía.
        coh = {}
        for l in ls:      # cohorte de TODOS sus leads ya ganados, no solo Meta
            uid = asignado_a(l)
            if uid not in USR or l.get("status_id") != 142:
                continue
            coh[USR[uid]["rep"]] = coh.get(USR[uid]["rep"], 0) + 1
        asesores = [{"rep": n, "zone": zona_de_rep.get(n, ""), "leads": k,
                     "ventas": rep_v.get(n, [0, 0.0])[0],
                     "mxn": rep_v.get(n, [0, 0.0])[1],
                     "ventas_meta": rep_vm.get(n, [0, 0.0])[0],
                     "mxn_meta": rep_vm.get(n, [0, 0.0])[1],
                     "cohorte": coh.get(n, 0)}
                    for n, k in sorted(rep.items(), key=lambda kv: -kv[1])]
        # Un asesor puede cerrar en la ventana sin recibir un lead nuevo: la venta
        # viene de un lead viejo. Dejarlo fuera escondería la venta.
        vistos = {a["rep"] for a in asesores}
        for n, (cnt, mxn) in rep_v.items():
            if n not in vistos:
                asesores.append({"rep": n, "zone": zona_de_rep.get(n, ""), "leads": 0,
                                 "ventas": cnt, "mxn": mxn,
                                 "ventas_meta": rep_vm.get(n, [0, 0.0])[0],
                                 "mxn_meta": rep_vm.get(n, [0, 0.0])[1]})
        wz = {}
        for l in wv:
            # La ciudad del CLIENTE, que es la que compara peras con peras contra
            # el gasto de esa zona. Antes se usaba la del asesor porque resolver
            # la del lead costaba una llamada por venta; con la precarga ya no.
            z = zona(l)
            if z not in zonas.ASIGNABLE:
                # Muchas ventas cerradas no traen ciudad en el contacto. Antes de
                # tirarlas, la zona del asesor que cerro: perder la venta del
                # marcador es peor que atribuirla a la zona de quien la hizo.
                uid = asignado_a(l)
                z = zona_de_rep.get(USR[uid]["rep"], "") if uid in USR else ""
            if z not in zonas.ASIGNABLE:
                continue
            a = wz.setdefault(z, {"count": 0, "mxn": 0.0})
            a["count"] += 1
            a["mxn"] += float(l.get("price") or 0)
        # Ventas por ORIGEN: todas las cerradas en la ventana, clasificadas por
        # su canal de entrada. El retorno por origen divide el ingreso de cada
        # canal entre el gasto de SU plataforma; mezclar el ingreso de referidos
        # u organico contra el gasto de Meta era lo que inflaba el retorno.
        wc = {}
        for l in wall:
            c = canal_del_lead(l)
            a = wc.setdefault(c, {"count": 0, "mxn": 0.0})
            a["count"] += 1
            a["mxn"] += float(l.get("price") or 0)
        # Y el mismo corte abierto por zona: alimenta el filtro de Origen de la
        # seccion de retorno. Zona = ciudad del cliente, y si la venta no la
        # trae, la del asesor que cerro — la misma regla que won_meta_por_zona.
        wzc = {}
        for l in wall:
            z = zona(l)
            if z not in zonas.ASIGNABLE:
                uid = asignado_a(l)
                z = zona_de_rep.get(USR[uid]["rep"], "") if uid in USR else ""
            if z not in zonas.ASIGNABLE:
                continue
            a = wzc.setdefault(canal_del_lead(l), {}) \
                   .setdefault(z, {"count": 0, "mxn": 0.0})
            a["count"] += 1
            a["mxn"] += float(l.get("price") or 0)
        # Ventas por asesor abiertas por canal, para la misma tabla filtrada.
        rep_vc = {}
        for l in wall:
            uid = asignado_a(l)
            if uid not in USR:
                continue
            a = rep_vc.setdefault(USR[uid]["rep"], {}) \
                      .setdefault(canal_del_lead(l), [0, 0.0])
            a[0] += 1
            a[1] += float(l.get("price") or 0)
        for a_ in asesores:
            a_["por_canal"] = rep_vc.get(a_["rep"], {})
        canales, google = {}, {}
        # Sangrado de Google: zona por la ciudad del contacto (LADA no viene en
        # el form del sitio como campo aparte). Pocos leads, foto honesta.
        gf = {"leads": 0, "en_zona": 0, "fuera": 0, "sin_dato": 0, "ciudades_fuera": {}}
        # Embudo de COHORTE: los mismos leads que entraron en la ventana, por
        # canal, en cada paso. Propuesta y venta son FOTO de su etapa actual;
        # por eso a 7 días «cerró venta» sale casi en cero — un lead tarda ~3
        # meses en firmar — y ningún paso puede superar al anterior.
        asig_c, prop_c, ven_c = {}, {}, {}
        # El mismo corte abierto por ZONA: sin esto la seccion por zona del
        # dashboard solo sabe de Meta (`asignados_por_zona` cuenta metas) y el
        # filtro de canal no tenia con que responder fuera de Meta.
        lead_zc, asig_zc, etapas_c = {}, {}, {}
        ven_mxn, ven_dias = 0.0, []
        for l in ls:
            c = canal_del_lead(l)
            canales[c] = canales.get(c, 0) + 1
            zc = zona(l)
            asignado = asignado_a(l)
            if zc in zonas.ASIGNABLE:
                lz = lead_zc.setdefault(c, {})
                lz[zc] = lz.get(zc, 0) + 1
                if asignado:
                    az = asig_zc.setdefault(c, {})
                    az[zc] = az.get(zc, 0) + 1
            if (l.get("pipeline_id") == MAP["pipeline_ventas"]
                    or l.get("status_id") in (142, 143)):
                k3 = (l.get("status_id"), ESTADOS.get(l.get("status_id"),
                                                      str(l.get("status_id"))))
                ec = etapas_c.setdefault(c, {})
                ec[k3] = ec.get(k3, 0) + 1
            if asignado:
                asig_c[c] = asig_c.get(c, 0) + 1
            sid = l.get("status_id")
            if sid == 142 or (PROP_SORT is not None and sid != 143
                              and l.get("pipeline_id") == MAP["pipeline_ventas"]
                              and PV_SORTS.get(sid, -1) >= PROP_SORT):
                prop_c[c] = prop_c.get(c, 0) + 1
            if sid == 142:
                ven_c[c] = ven_c.get(c, 0) + 1
                ven_mxn += float(l.get("price") or 0)
                if l.get("closed_at") and l.get("created_at"):
                    ven_dias.append((l["closed_at"] - l["created_at"]) / 86400.0)
            if c != "Google Ads":
                continue
            gf["leads"] += 1
            zg = zona(l)
            if zg in zonas.ASIGNABLE:
                gf["en_zona"] += 1
            elif zg == "FUERA":
                gf["fuera"] += 1
                cd = zonas.norm(ciudad_del_lead(l)) or "?"
                gf["ciudades_fuera"][cd] = gf["ciudades_fuera"].get(cd, 0) + 1
            else:
                gf["sin_dato"] += 1
            # De Google llega la campaña y la palabra clave, no el id del anuncio:
            # es lo mas fino que se puede cruzar sin conectar Google Ads.
            k = ((cf(l, MAP["campo_utm_campaign"]) or "?").strip(),
                 (cf(l, MAP["campo_utm_term"]) or "").strip())
            g = google.setdefault(k, {"campana": k[0], "keyword": k[1],
                                      "leads": 0, "asignados": 0})
            g["leads"] += 1
            if asignado_a(l):
                g["asignados"] += 1
        # -- contacto humano y su velocidad --------------------------------
        toques = [(l["id"], contacto.get(l["id"])) for l in metas]
        contactados = sum(1 for _, t in toques if t)
        horas = sorted((t - l["created_at"]) / 3600.0
                       for l, (_, t) in zip(metas, toques)
                       if t and t >= l["created_at"])
        mediana_h = horas[len(horas) // 2] if horas else None
        # -- dónde está hoy cada lead de la cohorte (pipeline de ventas) ----
        etapas = {}
        for l in metas:
            if l.get("pipeline_id") != MAP["pipeline_ventas"] \
                    and l.get("status_id") not in (142, 143):
                continue
            k2 = (l.get("status_id"), ESTADOS.get(l.get("status_id"),
                                                  str(l.get("status_id"))))
            etapas[k2] = etapas.get(k2, 0) + 1
        d = {
            "embudo": {
                "asignados_por_canal": asig_c,
                "propuesta_por_canal": prop_c,
                "ventas_por_canal": ven_c,
                "ventas_total": {"count": sum(ven_c.values()), "mxn": ven_mxn},
                "etapa_propuesta": PROP_NOMBRE,
                "leads_zona_por_canal": lead_zc,
                "asignados_zona_por_canal": asig_zc,
                "etapas_por_canal": {ca: [{"id": i, "nombre": n3, "n": n4}
                                          for (i, n3), n4 in sorted(d3.items(),
                                                                    key=lambda kv: -kv[1])]
                                     for ca, d3 in etapas_c.items()},
            },
            # Ciclo de la COHORTE: cuánto tardaron en firmar los leads de esta
            # ventana que ya cerraron. None si todavía no cierra ninguno.
            "ttc_dias": round(sum(ven_dias) / len(ven_dias), 1) if ven_dias else None,
            "contactados": contactados,
            "primer_contacto_horas": round(mediana_h, 1) if mediana_h is not None else None,
            "etapas": [{"id": i, "nombre": n2, "n": c}
                       for (i, n2), c in sorted(etapas.items(), key=lambda kv: -kv[1])],
            "leads_por_canal": canales,
            "google_fuga": gf,
            "google_por_campana": sorted(google.values(), key=lambda x: -x["leads"]),
            "leads_total": len(ls), "leads_meta": len(metas),
            "asignados": sum(1 for l in metas if asignado_a(l)),
            "por_asesor": asesores,
            "won_meta": suma(wv),
            "won_meta_por_zona": wz,
            "won_por_canal": wc,
            "won_zona_por_canal": wzc,
        }
        veredictos = zonas.resumen(zona(l) for l in metas)
        d.update({
            "asignados_por_zona": {z: pz.get(z, 0) for z in zonas.ZONAS},
            # Fuera de cobertura no es "faltó asignarlo": no hay a quién. Se mide
            # aparte, contra la campaña que lo trajo. Igual que HubSpot.
            "asignables": sum(veredictos[z] for z in zonas.ZONAS),
            "llegaron_por_zona": {z: lleg.get(z, 0) for z in zonas.ZONAS},
            "sin_asignar_por_zona": {z: lleg.get(z, 0) - pz.get(z, 0)
                                     for z in zonas.ZONAS},
            "fuera_de_zona": veredictos["FUERA"],
            "zona_ambigua": veredictos["AMBIGUO"],
            "sin_ciudad": veredictos["SIN_DATO"],
            "fuera_por_ciudad": dict(sorted(fuera_ciudad.items(),
                                            key=lambda kv: -kv[1])[:15]),
        })
        por_ventana[str(v)] = d

    out = {
        "por_ventana": por_ventana,
        "source": "kommo",
        "_generado": datetime.now(TZ).isoformat(timespec="seconds"),
        "window_7d": {"start": ini7.isoformat(), "end": hoy.isoformat()},
        "window_30d": {"start": ini30.isoformat(), "end": hoy.isoformat()},
        # OJO: son las etiquetas de `leads_by_origen_7d`, no los tokens con los
        # que se detecta Meta (esos viven en MAP["origen_meta"]).
        "meta_origen_set": ["Meta Ads"],
        "leads_by_origen_7d": origen7,
        "leads_total_7d": len(leads7),
        "leads_unassigned_7d": sum(1 for l in leads7 if not asignado_a(l)),
        "leads_meta_30d": sum(1 for l in leads30 if es_meta(l)),
        "leads_total_30d": len(leads30),
        "ttc_meta_30d_days": ttc(wm30),
        "ttc_blended_30d_days": ttc(won30),
        "assigned_meta_by_zone_7d": {z: asign_zona.get(z, 0) for z in ("MTY", "SLT", "TRC", "MVA")},
        "assigned_by_rep_7d": [
            {"rep": USR[u]["rep"], "zone": USR[u]["zone"], "leads": n}
            for u, n in sorted(por_rep.items(), key=lambda kv: -kv[1]) if u in USR],
        "won_7d": suma(won7), "won_30d": suma(won30),
        "won_meta_7d": suma(wm7), "won_meta_30d": suma(wm30),
    }
    out.update(PADRON)          # padron, asesores_por_zona, padron_version (si contestó)
    # Ids de usuario por zona: el dashboard arma con ellos los links a la lista
    # de leads de Kommo filtrada por los asesores de esa zona.
    out["usuarios_por_zona"] = {}
    for uid, u in USR.items():
        if u.get("zone"):
            out["usuarios_por_zona"].setdefault(u["zone"], []).append(uid)
    # Rendimiento por anuncio: leads y ventas que el CRM sí vio, en cada ventana.
    # El dashboard lo une con el gasto de Meta por `ad_id`.
    for v in VENTANAS + VENTANAS_LARGAS:
        out["por_anuncio_%dd" % v] = por_anuncio_de(en_ventana(leads90, v),
                                                    en_ventana(wm90, v, "closed_at"))
    return out


if __name__ == "__main__":
    if "--probe" in sys.argv:
        probe()
    else:
        days = int(sys.argv[sys.argv.index("--days") + 1]) if "--days" in sys.argv else 7
        data = build(days)
        if "--dry" in sys.argv:
            print(json.dumps(data, ensure_ascii=False, indent=2))
        else:
            with open(OUT, "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
            print("Escrito:", OUT)
            print("  leads 7d=%d · asignados=%d · won-meta 7d=%d"
                  % (data["leads_total_7d"], sum(data["assigned_meta_by_zone_7d"].values()),
                     data["won_meta_7d"]["count"]))
