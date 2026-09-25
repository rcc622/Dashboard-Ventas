#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Parte Kommo del corte de ventas (/ventas): leads de los últimos 90 días (o
cerrados en ese lapso), actividades reales (tareas completadas, llamadas,
cotizaciones, levantamientos, descartes) y tareas abiertas por asesor.

Es el port a Python de `Kommo Salesbot/dashboard_leads_kenet.gs` (v2026-08-20e,
verificado E2E contra la API). Misma lógica, mismo significado de cada columna;
solo cambia el destino: `build()` devuelve la parte que `ventas_corte.py` junta
con HubSpot y escribe en `data/ventas.json`.

Uso:
    python ventas_kommo.py            # resumen del corte (no escribe; eso lo hace ventas_corte.py)
    python ventas_kommo.py --selftest # asserts sin tocar la API

Credenciales: las mismas de crm_kommo.py (KOMMO_SUBDOMAIN / KOMMO_LONG_TOKEN,
por env o por el .env que apunte KOMMO_ENV).
"""
import sys, os, re, json, time
from collections import Counter
from datetime import datetime, timezone, timedelta

if "--selftest" not in sys.argv:
    import crm_kommo as k     # cliente, paginación y env: un solo lugar

TZ = timezone(timedelta(hours=-6))

# ——— IDs reales de la cuenta (mismos del .gs) ———
PIPE_CADENCIA = 14157248     # CADENCIA RECIBO CFE
PIPE_VENTAS = 14175132       # Ventas
PIPE_HUNTING = 14213728      # HUNTING
PIPE_LEADSNUEVOS = 12753132
ST_ENTRANTES = 109293108     # CADENCIA · Entrantes (aún no confirma interés)
FIELD_RECIBO = 1833111       # checkbox "Recibo CFE recibido"
FIELD_LLAMADAS = 1833303     # numeric "Intentos llamada" (lo mantiene el server)
FIELD_ASIGNADO = 1833389     # date "Última asignación" — vive en el CONTACTO
FIELD_CIUDAD = 1823968       # text "Ciudad" — vive en el CONTACTO (la llena el bot al precalificar)
FIELD_MUNICIPIO = 1833639    # text "Municipio" del formulario de levantamiento; respaldo del anterior
# Lo que guarda la página /agendar del servicio kommo-salesbot-ia (Railway) en el LEAD al agendar un levantamiento
# (Randall 24-sep: «lee la data de las páginas para agendar levantamiento… que se coordine el ID»). La página no
# tiene base propia: escribe estos campos, mueve la etapa y crea el evento del calendario.
FIELD_CITA = 1831443         # date_time «Próxima cita» = día y hora de la visita
FIELD_LEV_DIRECCION = 1833327  # requerido en /agendar desde el 12-ago
FIELD_LEV_ZONA = 1833703     # «Zona del levantamiento», solo lo escribe /agendar (8-sep)
FIELD_LEV_ASESOR = 1833893   # «Asesor del levantamiento» (23-sep)
FIELD_GRUPO_ORIGEN = 1833905  # «Grupo de origen» Pago/Orgánico/Asesor: lo sella el server de Kommo (24-sep)
FIELD_COTIZACION = 1833423   # date_time "Cotización entregada" (a mano; cubre el 25 %: solo respaldo)
ET_PROPUESTA = 109436768     # etapa «Propuesta entregada» del embudo Ventas: entrar aquí ES la cotización
ET_LEV_AGENDADO = 110266952  # etapa «Levantamiento agendado»: entrar aquí ES agendar la visita
ET_LEV_HECHO = 109436772     # etapa «Levantamiento hecho»: entrar aquí ES que la visita ya se hizo
FIELD_LEVANTAMIENTO = 1833425  # date_time "Levantamiento solicitado"
TIPO_PRIMER_CONTACTO = 3953735
ST_GANADO, ST_PERDIDO = 142, 143
DIAS_HISTORIA = int(os.environ.get("VENTAS_DIAS", "90") or 90)
DEDUP_LLAMADA = 15           # segundos: las dos patas de Twilio llegan como 2 notas
EMBUDO = {PIPE_VENTAS: "ventas", PIPE_HUNTING: "hunting", PIPE_LEADSNUEVOS: "nuevo", PIPE_CADENCIA: "cadencia"}
ZONAS = ("MTY", "SLT", "TRC", "MVA")

FUNNEL = {0: "0·Perdido", 1: "1·No contestó (sin recibo)", 2: "2·Respondió SIN recibo",
          3: "3·Con recibo (pre-Ventas)", 4: "4·Asignado (en Ventas/Hunting)", 5: "5·Ganado"}



# El campo «Origen» del lead (1833317) manda cuando dice un canal sin anuncio (Referido, Cambaceo, Expo, Expansión) o
# «Llamada entrante» (Randall 24-sep: llamada que entra, la contesta un asesor y el lead se le asigna a él).
# `crm_kommo.canal_del_lead` (compartido con marketing) solo entiende orgánico / anuncio / directo y con «Referido»
# caía a «Sin origen» (Randall 24-sep, lead 24924939). Para lo demás sigue la regla de marketing.
_MANDA_CAMPO = ("referid", "cambaceo", "expo", "expansi", "llamada entrante")
def origen_lead(l):
    crudo = (k.cf(l, k.MAP["campo_origen"]) or "").strip()
    base = crudo.lower().replace("ó", "o")
    if crudo and base.startswith(_MANDA_CAMPO):
        return crudo
    canal = k.canal_del_lead(l)
    return crudo if canal == "Sin origen" and crudo else canal

def num(v):
    try:
        return float(v or 0)
    except (TypeError, ValueError):
        return 0.0


def fecha_cf(v):
    """date_time de Kommo llega como epoch (número o string) o como ISO."""
    if not v:
        return 0
    try:
        n = float(v)
        if n > 1000000000:
            return int(n)
    except (TypeError, ValueError):
        pass
    try:
        return int(datetime.fromisoformat(str(v).replace("Z", "+00:00")).timestamp())
    except ValueError:
        return 0


def zona_grupo(nombre):
    """'KS-MTY' -> 'MTY', 'KS-TRAINING' -> 'TRAINING': todo grupo KS-<X> es un equipo del tablero
    (Randall 6-sep: también KS-SEGUIMIENTO y KS-TRAINING). Cualquier otro grupo (Sales Office) -> ''."""
    n = (nombre or "").strip().upper()
    if not n.startswith("KS-"):
        return ""
    z = re.sub(r"[^A-Z]", "", n[3:])
    return z[:15] if len(z) >= 2 else ""


# ---------------------------------------------------------------- puras
def dedup_llamadas(raw, ventana=DEDUP_LLAMADA):
    """Colapsa notas call_in/call_out del mismo lead/contacto a menos de
    `ventana` segundos en UNA llamada; sobrevive la duración mayor (la pata con
    conversación). ponytail: dedup por ventana, no por CallSid — dos legs traen SIDs distintos."""
    raw = sorted(raw, key=lambda x: (x["ent"], x["eid"] or 0, x["ts"]))
    out, last = [], None
    for x in raw:
        if last and last["ent"] == x["ent"] and last["eid"] == x["eid"] and (x["ts"] - last["fin"]) <= ventana:
            last["fin"] = x["ts"]
            if x["dur"] > last["dur"]:
                last["dur"] = x["dur"]
            continue
        last = dict(x, fin=x["ts"])
        out.append(last)
    return out


def clasifica(lead, etapa_nombre, tags, con_recibo, nmsg):
    """(funnel 0-5, respondió). Espejo exacto del .gs."""
    sid, pid = lead.get("status_id"), lead.get("pipeline_id")
    ganado = sid == ST_GANADO or bool(re.search(r"closed.*won|ganado", etapa_nombre or "", re.I))
    perdido = sid == ST_PERDIDO or bool(re.search(r"closed.*lost|perdido", etapa_nombre or "", re.I))
    respondio = (nmsg > 0 or con_recibo or "IA activa" in tags or "IA off" in tags
                 or (sid != ST_ENTRANTES and pid != PIPE_LEADSNUEVOS))
    if ganado:
        f = 5
    elif perdido:
        f = 0
    elif pid in (PIPE_VENTAS, PIPE_HUNTING):
        f = 4
    elif con_recibo:
        f = 3
    elif respondio:
        f = 2
    else:
        f = 1
    return f, respondio


# ---------------------------------------------------------------- API
def aviso(msg):
    print("  aviso: " + msg, file=sys.stderr)


def eventos_(tipo, desde, **extra):
    params = {"filter[type]": tipo, "filter[created_at][from]": desde, "limit": 250}
    params.update(extra)
    try:
        for e in k.paged("events", "events", **params):
            yield e
    except SystemExit as e:
        aviso("eventos %s: %s" % (tipo, str(e)[:120]))


def entrada_etapa(e, ids):
    """(status_id, lead_id, ts) si el evento es una entrada a una de esas etapas del embudo Ventas."""
    if e.get("entity_type") != "lead":
        return None
    va = e.get("value_after") or []
    st = ((va[0] or {}).get("lead_status") or {}) if isinstance(va, list) and va else {}
    if st.get("id") in ids and st.get("pipeline_id") == PIPE_VENTAS and e.get("entity_id"):
        return st["id"], e["entity_id"], e.get("created_at") or 0
    return None


def entradas_etapas(desde, ids):
    """{status_id: {lead_id: [ts, …]}} entradas a cada etapa, en orden.

    De aquí salen tres señales, todas del MISMO barrido del historial (el endpoint de eventos da 100
    por página: ~120 llamadas y ~80 s a 90 días, así que leerlo una vez y repartir sale gratis):
      · «Propuesta entregada» = la cotización de verdad (decisión de Randall 5-sep tras el
        diagnóstico: el campo de fecha lo llena una persona a mano y cubre el 25 %). La primera
        entrada es la cotización; las siguientes son recotizaciones.
      · «Levantamiento agendado» y «Levantamiento hecho» = cuántas visitas se agendaron y cuántas de
        esas ya se hicieron (Randall 9-sep). Se guarda la PRIMERA entrada a cada una."""
    out = {i: {} for i in ids}
    for e in eventos_("lead_status_changed", desde, limit=100):
        r = entrada_etapa(e, ids)
        if r:
            out[r[0]].setdefault(r[1], []).append(r[2])
    for d in out.values():
        for v in d.values():
            v.sort()
    return out


def msgs_entrantes(desde):
    """{lead_id: n} mensajes ENTRANTES — proxy de «el cliente sí contesta»."""
    out = Counter()
    for tp in ("incoming_chat_message", "incoming_sms_message"):
        for ev in eventos_(tp, desde):
            if ev.get("entity_type") == "lead":
                out[ev.get("entity_id")] += 1
    return out


def asignaciones_por_evento(desde):
    """{lead_id: ts de la última vez que cambió de responsable}."""
    out = {}
    for ev in eventos_("entity_responsible_changed", desde, **{"filter[entity]": "lead"}):
        ts = ev.get("created_at") or 0
        if ts > out.get(ev.get("entity_id"), 0):
            out[ev.get("entity_id")] = ts
    return out


def notas_llamada(desde):
    raw = []
    for ent in ("leads", "contacts"):
        try:
            for n in k.paged(ent + "/notes", "notes", **{
                    "filter[note_type][0]": "call_in", "filter[note_type][1]": "call_out",
                    "filter[updated_at][from]": desde}):
                pr = n.get("params") or {}
                raw.append({"ent": ent, "eid": n.get("entity_id"), "ts": n.get("created_at") or 0,
                            "dur": num(pr.get("duration")), "user": n.get("responsible_user_id")})
        except SystemExit as e:
            aviso("notas llamada %s: %s" % (ent, str(e)[:120]))
    return raw


def pipelines_():
    pipes, etapas, orden = {}, {}, {}
    for p in (k.get("leads/pipelines").get("_embedded") or {}).get("pipelines", []):
        pipes[p["id"]] = p["name"]
        lst = []
        for s in (p.get("_embedded") or {}).get("statuses", []):
            etapas[s["id"]] = {"n": s["name"], "tipo": s.get("type", 0), "pid": p["id"]}
            if s.get("type") != 1 and s["id"] not in (ST_GANADO, ST_PERDIDO):
                lst.append({"id": s["id"], "nombre": s["name"], "sort": s.get("sort", 0)})
        orden[p["id"]] = sorted(lst, key=lambda x: x["sort"])
    return pipes, etapas, orden


def embebido_(path, key, **params):
    try:
        return (k.get(path, **params).get("_embedded") or {}).get(key, [])
    except SystemExit as e:
        aviso("%s: %s" % (path, str(e)[:120]))
        return []


def leads_(desde):
    """Leads creados en la ventana + los cerrados en la ventana aunque sean más
    viejos (una venta de hoy suele ser un lead de hace meses) + los ABIERTOS más viejos
    que la ventana (Randall 11-sep: leads activos, tareas vencidas y sin tarea son foto de
    hoy, sin importar las fechas del tablero). Sin duplicar."""
    filtro = {"with": "contacts,source_id", "filter[pipeline_id][0]": PIPE_CADENCIA, "filter[pipeline_id][1]": PIPE_VENTAS,
              "filter[pipeline_id][2]": PIPE_HUNTING, "filter[pipeline_id][3]": PIPE_LEADSNUEVOS}
    out = {}
    for l in k.paged("leads", "leads", **dict(filtro, **{"filter[created_at][from]": desde})):
        out[l["id"]] = l
    n = len(out)
    try:
        for l in k.paged("leads", "leads", **dict(filtro, **{"filter[closed_at][from]": desde})):
            out.setdefault(l["id"], l)
    except SystemExit as e:
        aviso("leads cerrados: %s" % str(e)[:120])
    n2 = len(out)
    try:
        for l in k.paged("leads", "leads", **dict(filtro, **{"filter[created_at][to]": desde})):
            if l.get("status_id") not in (ST_GANADO, ST_PERDIDO):
                out.setdefault(l["id"], l)
    except SystemExit as e:
        aviso("leads abiertos viejos: %s" % str(e)[:120])
    print("leads %dd: %d creados + %d cerrados viejos + %d abiertos viejos" % (DIAS_HISTORIA, n, n2 - n, len(out) - n2))
    return list(out.values())


def build():
    t0 = time.time()
    hoy = int(time.time())
    desde = hoy - DIAS_HISTORIA * 86400

    # Rol de Kommo (la columna «Leads» de Ajustes › Usuarios): KS-VENTAS, KS-TRAINING, KS-SEGUIMIENTO;
    # los administradores no tienen rol. Randall (6-sep) quiere ver a los de Training y Seguimiento.
    roles = {r["id"]: r.get("name") or "" for r in embebido_("roles", "roles")}
    users, user_group, user_activo, user_rol = {}, {}, {}, {}
    for u in k.paged("users", "users"):
        rg = u.get("rights") or {}
        users[u["id"]] = (u.get("name") or u.get("email") or str(u["id"])).strip()
        user_group[u["id"]] = rg.get("group_id")      # sí viene con este token (verificado 6-sep)
        user_activo[u["id"]] = bool(rg.get("is_active", True))
        user_rol[u["id"]] = "Administrador" if rg.get("is_admin") else (roles.get(rg.get("role_id")) or "")
    grupos = {g["id"]: g["name"] for g in embebido_("account", "users_groups", **{"with": "users_groups"})}
    tipos_tarea = {t["id"]: t["name"] for t in embebido_("account", "task_types", **{"with": "task_types"})}
    razones = {r["id"]: r["name"] for r in embebido_("leads/loss_reasons", "loss_reasons")}
    pipes, etapas, orden = pipelines_()
    canon = {s["id"]: i for i, s in enumerate(orden.get(PIPE_VENTAS, []))}
    print("usuarios %d · grupos %d · pipelines %d" % (len(users), len(grupos), len(pipes)))

    MSG = msgs_entrantes(desde)
    print("mensajes entrantes: %d leads" % len(MSG))

    # Tareas ABIERTAS por lead (+ lista para «Mi día»)
    tareas, abiertas = {}, []
    try:
        for t in k.paged("tasks", "tasks", **{"filter[is_completed]": 0, "filter[entity_type]": "leads"}):
            L = tareas.setdefault(t["entity_id"], {"abiertas": 0, "vencidas": 0, "pc": False})
            L["abiertas"] += 1
            vence = t.get("complete_till") or 0
            if vence and (not L.get("prox") or vence < L["prox"]):
                L["prox"] = vence     # la más próxima (o la más vencida): la que el asesor tiene que atender primero
            vencida = bool(vence and vence < hoy)
            if vencida:
                L["vencidas"] += 1
                if t.get("task_type_id") == TIPO_PRIMER_CONTACTO or re.search(r"primer contacto", t.get("text") or "", re.I):
                    L["pc"] = True
            abiertas.append({"id": "k:%d" % t["id"], "crm": "kommo", "lead": "k:%d" % t["entity_id"], "_lead": t["entity_id"],
                             "asesor_id": t.get("responsible_user_id"), "texto": (t.get("text") or "").strip(),
                             "tipo": tipos_tarea.get(t.get("task_type_id"), "Tarea"),
                             "vence": vence, "vencida": vencida, "_grupo": t.get("group_id")})
    except SystemExit as e:
        aviso("tareas abiertas: %s" % str(e)[:120])
    print("tareas abiertas: %d" % len(abiertas))

    # Tareas COMPLETADAS: la fecha es cuándo se marcó (updated_at); el asesor es
    # el de la TAREA, no el del lead.
    hechas, ev_tareas = {}, []
    try:
        for t in k.paged("tasks", "tasks", **{"filter[is_completed]": 1, "filter[entity_type]": "leads",
                                              "filter[updated_at][from]": desde}):
            H = hechas.setdefault(t["entity_id"], {"n": 0, "ult": 0})
            H["n"] += 1
            ts = t.get("updated_at") or t.get("complete_till") or 0
            H["ult"] = max(H["ult"], ts)
            ev_tareas.append({"ts": ts, "lead": t["entity_id"], "user": t.get("responsible_user_id")})
    except SystemExit as e:
        aviso("tareas completadas: %s" % str(e)[:120])
    print("tareas completadas: %d" % len(ev_tareas))

    leads = leads_(desde)

    # Contacto → lead (llamadas registradas en el contacto) y CF 1833389 y 1823968 del contacto.
    C2L, L2C, ASIG, CIUDAD, CONTACTO = {}, {}, {}, {}, {}
    for l in leads:
        cs = (l.get("_embedded") or {}).get("contacts") or []
        if cs:
            C2L[cs[0]["id"]] = l["id"]
            L2C[l["id"]] = cs[0]["id"]
    ids = sorted(C2L)
    for i in range(0, len(ids), 100):
        try:
            for c in k.paged("contacts", "contacts", **{"filter[id][]": ids[i:i + 100]}):
                ASIG[c["id"]] = fecha_cf(k.cf(c, FIELD_ASIGNADO))
                CIUDAD[c["id"]] = (k.cf(c, FIELD_CIUDAD) or "").strip()
                CONTACTO[c["id"]] = (c.get("name") or "").strip()
        except SystemExit as e:
            aviso("lote de contactos: %s" % str(e)[:120])
    ASIG_EV = asignaciones_por_evento(desde)
    LLAM = dedup_llamadas(notas_llamada(desde))
    print("llamadas (dedup): %d · cambios de responsable: %d leads" % (len(LLAM), len(ASIG_EV)))
    HIST = entradas_etapas(desde, (ET_PROPUESTA, ET_LEV_AGENDADO, ET_LEV_HECHO))
    PROP, AGEND, HECHO = HIST[ET_PROPUESTA], HIST[ET_LEV_AGENDADO], HIST[ET_LEV_HECHO]
    print("entradas a Propuesta entregada (historial): %d leads, %d recotizaciones"
          % (len(PROP), sum(len(v) - 1 for v in PROP.values())))
    print("levantamientos (historial): %d agendados · %d hechos · %d de los agendados ya hechos"
          % (len(AGEND), len(HECHO), sum(1 for x in AGEND if x in HECHO)))

    llam_por_lead = {}
    for c in LLAM:
        lead = c["eid"] if c["ent"] == "leads" else C2L.get(c["eid"])
        c["lead"] = lead
        if lead and c["ts"] > llam_por_lead.get(lead, 0):
            llam_por_lead[lead] = c["ts"]

    filas, LINFO = [], {}
    ev_cot, ev_recot, ev_lev, ev_desc = [], [], [], []
    n_cf_solo = 0
    grupo_por_user = {}
    for l in leads:
        pid = l.get("pipeline_id")
        et = etapas.get(l.get("status_id")) or {"n": str(l.get("status_id")), "tipo": 0, "pid": pid}
        tags = [t.get("name") for t in ((l.get("_embedded") or {}).get("tags") or []) if t.get("name")]
        cfv = {f.get("field_id"): (f.get("values") or [{}])[0].get("value") for f in (l.get("custom_fields_values") or [])}
        con_recibo = bool(cfv.get(FIELD_RECIBO))
        nmsg = MSG.get(l["id"], 0)
        funnel, respondio = clasifica(l, et["n"], tags, con_recibo, nmsg)
        T = tareas.get(l["id"], {"abiertas": 0, "vencidas": 0, "pc": False})
        H2 = hechas.get(l["id"], {"n": 0, "ult": 0})
        ts_llam = llam_por_lead.get(l["id"], 0)
        # Cotización = primera entrada a Propuesta entregada (historial); el campo de fecha solo si no hay historial.
        ents = PROP.get(l["id"]) or []
        ts_cot = ents[0] if ents else fecha_cf(cfv.get(FIELD_COTIZACION))
        if ts_cot and not ents:
            n_cf_solo += 1
        ts_lev = fecha_cf(cfv.get(FIELD_LEVANTAMIENTO))
        cs = (l.get("_embedded") or {}).get("contacts") or []
        ts_asig = max(ASIG.get(cs[0]["id"], 0) if cs else 0, ASIG_EV.get(l["id"], 0)) or l.get("created_at") or 0
        uid = l.get("responsible_user_id") or None
        asesor = users.get(uid) or (str(uid) if uid else "")
        if uid and l.get("group_id"):
            grupo_por_user.setdefault(uid, Counter())[l["group_id"]] += 1
        lid = "k:%d" % l["id"]
        LINFO[l["id"]] = {"asig": ts_asig, "asesor_id": uid, "pipe": EMBUDO.get(pid, "cadencia"), "nombre": l.get("name") or "", "id": lid}
        if ts_cot:
            ev_cot.append({"ts": ts_cot, "lead": l["id"]})
        for t in ents[1:]:
            ev_recot.append({"ts": t, "lead": l["id"]})
        if ts_lev:
            ev_lev.append({"ts": ts_lev, "lead": l["id"]})
        if l.get("loss_reason_id") and l.get("closed_at"):
            ev_desc.append({"ts": l["closed_at"], "lead": l["id"]})
        filas.append({
            "id": lid, "crm": "kommo", "nombre": l.get("name") or "", "creado": l.get("created_at") or 0,
            "embudo": EMBUDO.get(pid, "cadencia"), "pipeline": pipes.get(pid, str(pid)),
            "etapa": et["n"], "etapa_id": canon.get(l.get("status_id"), -1) if funnel == 4 and pid == PIPE_VENTAS else -1,
            "asesor_id": uid, "asesor": asesor,
            "presupuesto": num(l.get("price")), "recibo": con_recibo, "respondio": respondio,
            "funnel": funnel, "funnel_label": FUNNEL[funnel],
            "tareas_abiertas": T["abiertas"], "tareas_vencidas": T["vencidas"], "pc_vencida": T["pc"], "prox_tarea": T.get("prox", 0),
            "tags": tags, "dias_sin_cambio": max(0, (hoy - (l.get("updated_at") or hoy)) // 86400),
            # La ciudad vive en el CONTACTO (la deja el bot al precalificar); el «Municipio» del
            # formulario de levantamiento es el respaldo cuando el contacto no la trae (Randall 8-sep).
            "ciudad": CIUDAD.get(L2C.get(l["id"]), "") or str(cfv.get(FIELD_MUNICIPIO) or "").strip(),
            # De dónde vino el lead: la misma regla que el tablero de marketing (crm_kommo.canal_del_lead).
            # El nombre del contacto sirve para casar la venta de la app de comisiones con su lead: el
            # nombre del lead en Kommo casi siempre es «Lead #123».
            "origen": origen_lead(l), "contacto": CONTACTO.get(L2C.get(l["id"]), ""),
            "link": "https://%s.kommo.com/leads/detail/%d" % (k.SUB, l["id"]),
            "msjs": nmsg, "llamadas_cf": int(num(cfv.get(FIELD_LLAMADAS))),
            # Los tags se renombraron el 12-ago (Contactado → Respondió): se aceptan ambos.
            "tel": ("Contactó" if ("Respondió" in tags or "📞 Contactado" in tags)
                    else "No contesta" if ("No respondió" in tags or "📵 No contesta" in tags) else ""),
            "sin_tarea": funnel == 4 and T["abiertas"] == 0,
            "razon": razones.get(l.get("loss_reason_id"), ""),
            "asignacion": ts_asig,
            "tareas_completadas": H2["n"], "ult_tarea": H2["ult"], "ult_llamada": ts_llam,
            "cotizacion": ts_cot, "recotizaciones": max(0, len(ents) - 1), "levantamiento": ts_lev,
            # Agendar y hacer la visita son dos cosas distintas: la primera entrada a cada etapa.
            "lev_agendado": (AGEND.get(l["id"]) or [0])[0], "lev_hecho": (HECHO.get(l["id"]) or [0])[0],
            # Agendado por /agendar = trae dirección o zona del levantamiento; la visita es la «Próxima cita».
            "lev_cita": int(num(cfv.get(FIELD_CITA))) if (cfv.get(FIELD_LEV_DIRECCION) or cfv.get(FIELD_LEV_ZONA)) else 0,
            "lev_asesor": str(cfv.get(FIELD_LEV_ASESOR) or "").strip(),
            "grupo": str(cfv.get(FIELD_GRUPO_ORIGEN) or "").strip(),
            "ult_actividad": max(H2["ult"], ts_llam, ts_cot, ts_lev),
            "cerrado": l.get("closed_at") or 0,
        })

    # Eventos: una fila por hecho real, con la fecha de asignación del lead para
    # que el filtro de asignación también pueda acotar actividades.
    eventos = []

    def ev_row(ts, tipo, lead_id, user_id=None):
        i = LINFO.get(lead_id)
        if not i or not ts:
            return
        eventos.append({"ts": ts, "tipo": tipo, "asesor_id": user_id or i["asesor_id"], "lead": i["id"],
                        "asignacion": i["asig"], "embudo": i["pipe"], "crm": "kommo"})

    for e in ev_tareas:
        ev_row(e["ts"], "tarea", e["lead"], e["user"])
    # Sin asesor explícito → dueño del lead: el responsible de la NOTA es el del
    # token que la escribió y la bitácora firma todo con la cuenta admin.
    for c in LLAM:
        if c.get("lead"):
            ev_row(c["ts"], "llamada_ok" if c["dur"] > 0 else "llamada_no", c["lead"])
    for e in ev_cot:
        ev_row(e["ts"], "cotizacion", e["lead"])
    for e in ev_recot:
        ev_row(e["ts"], "recotizacion", e["lead"])
    print("cotizaciones: %d (de ellas %d solo por el campo de fecha) · recotizaciones: %d" % (len(ev_cot), n_cf_solo, len(ev_recot)))
    for e in ev_lev:
        ev_row(e["ts"], "levantamiento", e["lead"])
    for e in ev_desc:
        ev_row(e["ts"], "descarte", e["lead"])

    for t in abiertas:
        i = LINFO.get(t.pop("_lead"))
        t["lead_nombre"] = i["nombre"] if i else ""
        t["link"] = "https://%s.kommo.com/leads/detail/%s" % (k.SUB, t["lead"][2:])
        g = t.pop("_grupo", None)
        if t["asesor_id"] and g:
            grupo_por_user.setdefault(t["asesor_id"], Counter())[g] += 1

    # Equipo del asesor: su grupo en /users (rights.group_id); si no viniera, la moda del group_id
    # de sus leads y tareas. `activo` deja que el corte incluya a los de un grupo KS-* aunque no
    # tengan leads todavía (Randall 6-sep: ver a los de KS-SEGUIMIENTO y KS-TRAINING).
    usuarios = {}
    for uid, nombre in users.items():
        g = grupo_por_user.get(uid)
        gid = user_group.get(uid) or (g.most_common(1)[0][0] if g else None)
        usuarios[uid] = {"nombre": nombre, "zona": zona_grupo(grupos.get(gid, "")) if gid else "", "activo": user_activo.get(uid, True), "rol": user_rol.get(uid, "")}

    print("kommo: resumen %d leads · %d actividades · %d tareas abiertas · %.0f s"
          % (len(filas), len(eventos), len(abiertas), time.time() - t0))
    return {"crm": "kommo", "generado": datetime.now(TZ).isoformat(timespec="seconds"),
            "usuarios": usuarios, "etapas": [{"id": i, "nombre": s["nombre"]} for i, s in enumerate(orden.get(PIPE_VENTAS, []))],
            # Etapas reales (abiertas, en orden) de cada pipeline que se dibuja como embudo por CRM (Randall 19-sep).
            "embudos": {"Ventas": [s["nombre"] for s in orden.get(PIPE_VENTAS, [])],
                        "Hunting": [s["nombre"] for s in orden.get(PIPE_HUNTING, [])]},
            "leads": filas, "eventos": eventos, "tareas_abiertas": abiertas}


def selftest():
    # Origen: «Referido» del campo manda; lo demás, la regla de marketing (con un crm_kommo de mentira)
    global k
    from types import SimpleNamespace
    k = SimpleNamespace(MAP={"campo_origen": 1}, cf=lambda l, f: l.get("o"), canal_del_lead=lambda l: l.get("canal", "Sin origen"))
    assert origen_lead({"o": "Referido"}) == "Referido"
    assert origen_lead({"o": "Referido", "canal": "Meta Ads"}) == "Referido"
    assert origen_lead({"o": "Expansión"}) == "Expansión"
    assert origen_lead({"o": "Llamada entrante", "canal": "Meta Ads"}) == "Llamada entrante"
    assert origen_lead({"o": "Web Form - Ad", "canal": "Meta Ads"}) == "Meta Ads"
    assert origen_lead({"canal": "Meta Ads"}) == "Meta Ads" and origen_lead({}) == "Sin origen"
    # dedup: dos patas de Twilio a 2 s = 1 llamada con la duración mayor; a 60 s = 2
    raw = [{"ent": "leads", "eid": 1, "ts": 100, "dur": 0, "user": 1},
           {"ent": "leads", "eid": 1, "ts": 102, "dur": 40, "user": 1},
           {"ent": "leads", "eid": 1, "ts": 400, "dur": 0, "user": 1},
           {"ent": "contacts", "eid": 1, "ts": 101, "dur": 5, "user": 1}]
    d = dedup_llamadas(raw)
    assert len(d) == 3, d
    assert d[0]["ent"] == "contacts" and d[1]["dur"] == 40 and d[2]["dur"] == 0, d
    # funnel
    L = {"status_id": ST_ENTRANTES, "pipeline_id": PIPE_CADENCIA}
    assert clasifica(L, "Entrantes", [], False, 0) == (1, False)
    assert clasifica(L, "Entrantes", [], False, 2) == (2, True)
    assert clasifica(L, "Entrantes", [], True, 0) == (3, True)
    assert clasifica({"status_id": 109665668, "pipeline_id": PIPE_VENTAS}, "Por contactar", [], False, 0) == (4, True)
    assert clasifica({"status_id": ST_GANADO, "pipeline_id": PIPE_VENTAS}, "Closed - won", [], False, 0)[0] == 5
    assert clasifica({"status_id": ST_PERDIDO, "pipeline_id": PIPE_VENTAS}, "Closed - lost", [], False, 0)[0] == 0
    assert clasifica({"status_id": 109293116, "pipeline_id": PIPE_CADENCIA}, "Diario", [], False, 0) == (2, True)
    # fechas de custom field
    assert fecha_cf("1788471684") == 1788471684 and fecha_cf(1788471684.0) == 1788471684
    iso = int(datetime(2026, 9, 1, 10, tzinfo=timezone.utc).timestamp())
    assert fecha_cf("2026-09-01T10:00:00+00:00") == iso and fecha_cf("") == 0
    assert zona_grupo("KS-MTY") == "MTY" and zona_grupo("Sales Office") == "" and zona_grupo(None) == ""
    assert zona_grupo("KS-TRAINING") == "TRAINING" and zona_grupo("ks-Seguimiento ") == "SEGUIMIENTO" and zona_grupo("KS-") == ""
    # historial de etapas: solo cuenta la entrada a Propuesta entregada del embudo Ventas, de un lead
    ev = {"entity_type": "lead", "entity_id": 7, "created_at": 55, "value_after": [{"lead_status": {"id": ET_PROPUESTA, "pipeline_id": PIPE_VENTAS}}]}
    TRES = (ET_PROPUESTA, ET_LEV_AGENDADO, ET_LEV_HECHO)
    assert entrada_etapa(ev, TRES) == (ET_PROPUESTA, 7, 55)
    assert entrada_etapa(dict(ev, value_after=[{"lead_status": {"id": ET_LEV_HECHO, "pipeline_id": PIPE_VENTAS}}]), TRES) == (ET_LEV_HECHO, 7, 55)
    assert entrada_etapa(dict(ev, value_after=[{"lead_status": {"id": ET_LEV_HECHO, "pipeline_id": PIPE_HUNTING}}]), TRES) is None
    assert entrada_etapa(ev, (ET_PROPUESTA,)) == (ET_PROPUESTA, 7, 55)
    assert entrada_etapa(dict(ev, value_after=[{"lead_status": {"id": ET_LEV_HECHO, "pipeline_id": PIPE_VENTAS}}]), (ET_PROPUESTA,)) is None
    assert entrada_etapa(dict(ev, value_after=[{"lead_status": {"id": ET_PROPUESTA, "pipeline_id": PIPE_HUNTING}}]), (ET_PROPUESTA,)) is None
    assert entrada_etapa(dict(ev, entity_type="contact"), (ET_PROPUESTA,)) is None and entrada_etapa(dict(ev, value_after=[]), (ET_PROPUESTA,)) is None
    print("selftest OK")


if __name__ == "__main__":
    if "--selftest" in sys.argv:
        selftest()
        sys.exit(0)
    parte = build()
    print(json.dumps({"usuarios": parte["usuarios"], "etapas": parte["etapas"], "leads": len(parte["leads"]),
                      "eventos": len(parte["eventos"]), "tareas": len(parte["tareas_abiertas"])}, ensure_ascii=False, indent=1))
