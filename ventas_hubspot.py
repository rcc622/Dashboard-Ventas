#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Parte HubSpot del corte de ventas (/ventas). Misma forma que ventas_kommo.build();
ventas_corte.py junta las dos. Solo lectura, token HUBSPOT_TOKEN (crm_hubspot.py).

Qué es cada cosa en HubSpot:
  · lead     = DEAL creado en los últimos 90 días, o cerrado en ese lapso aunque sea
               más viejo (el ciclo son ~86 días: una venta de hoy suele venir de un
               deal de hace tres meses). Todo deal tiene dueño y vive en un pipeline
               de ventas → funnel 4 «Asignado», 5 ganado, 0 perdido.
  · etapa    = la del deal, mapeada al índice canónico del embudo (CANON_HS).
  · tareas   = objeto tasks: completadas por `hs_task_completion_date`; abiertas con
               vencimiento entre hace 90 días y dentro de 14. Se asocian a CONTACTOS,
               no a deals, así que por lead solo se sabe si hay «próxima actividad»
               (`notes_next_activity_date`): 1 abierta, vencida si ya pasó.
  · llamadas = objeto calls: contestada = COMPLETED o duración > 0.
  · cotización = fecha de entrada a «Propuesta entregada» (hs_v2_date_entered_1409289353,
               la propiedad calculada de etapa existe desde el 4-ago-2026; antes, el deal que
               HOY está en esa etapa). levantamiento = deal que HOY está en «Levantamiento
               hecho», con la fecha en que entró a esa etapa. Los que
               ya avanzaron no se pueden fechar (el portal no tiene hs_date_entered_*).
  · levantamiento agendado / hecho = fechas de entrada a esas dos etapas
               (hs_v2_date_entered_1432144491 y _1409289354).
  · descarte = deal perdido, fecha = closedate, razón = closed_lost_reason /
               razon_de_descarte / nombre de la etapa de pérdida.
  · ciudad   = propiedad `ciudad` del deal (picklist que llena el formulario; la
               mantiene al día hs_ciudad.py). 85 de cada 100 deals recientes la traen.
  · deals SIN dueño no entran: no hay asesor a quién medírselos.
"""
import sys, os, json, time
from datetime import datetime, timezone, timedelta

import crm_hubspot as h   # _req, search, owners: un solo cliente

PORTAL = os.environ.get("HUBSPOT_PORTAL", "24082518")
DIAS_HISTORIA = int(os.environ.get("VENTAS_DIAS", "90") or 90)
TZ = timezone(timedelta(hours=-6))

# etapa HubSpot -> índice canónico del embudo (0 Por contactar · 1 Conversación
# iniciada · 2 Propuesta entregada · 3 Levantamiento agendado · 4 Levantamiento
# hecho · 5 Contrato solicitado). Pipelines vivos: «Ventas» (922784339, antes «Ciclo de Venta KS»;
# Randall lo igualó al de Kommo el 5-sep: mismos nombres y la etapa nueva «Levantamiento agendado»
# 1432144491) y «2026».
# Validado con Randall 3-sep contra los nombres reales de ambos CRM:
#   Ventas: Lead entrante=Por contactar · Conversacion Iniciada=Conversación iniciada ·
#   Precalificación hecha=Conversación iniciada (en Kommo la precalificación vive en la cadencia, antes
#   de Ventas) · Propuesta entregada · Levantamiento agendado · Levantamiento hecho · Contrato solicitado (1:1 por nombre).
#   2026 (pipeline viejo): 1er contacto=Por contactar · Sin recibo / Bajo interes=Conversación iniciada
#   (ya hubo contacto) · Cierre Cercano=Levantamiento hecho · Pdte Papeleria / Detalle para cierre=Contrato.
#   ⚠ Toda etapa nueva de «Ventas» va AQUÍ por id: sin entrada, `canon()` adivina por palabra y
#   «Levantamiento agendado» caería en 4 (hecho) y contaría como levantamiento realizado.
PIPE_VENTAS_HS = "922784339"     # pipeline «Ventas»: el ÚNICO que entra al corte (Randall 19-sep). Los «No usar - …»
                                 # tenían 117 deals abiertos de Carolina y el embudo marcaba 924 donde HubSpot dice 809.
ET_PROPUESTA_HS = "1409289353"   # «Propuesta entregada» del pipeline Ventas
ET_LEV_AGENDADO_HS = "1432144491"  # «Levantamiento agendado»
ET_LEV_HECHO_HS = "1409289354"     # «Levantamiento hecho»
CANON_HS = {
    "1409289350": 0, "1409289351": 1, "1409289352": 1, "1409289353": 2, "1432144491": 3, "1409289354": 4, "1409289355": 5,
    "1265092762": 0, "1265092763": 1, "1265092764": 1, "1265092765": 4, "1299026548": 5, "1265092766": 5,
}
# Pipelines viejos («No usar», por zona, Cambaceo…): por palabra clave del nombre de la etapa.
KW = (("contrato", 5), ("firma", 5), ("documentac", 5), ("levantamiento", 4), ("visita", 4),
      ("cotiz", 2), ("propuesta", 2), ("negociac", 2), ("cierre", 2), ("recibo", 1), ("tel", 1))
TIPO_TAREA = {"CALL": "Llamada", "EMAIL": "Correo", "TODO": "Tarea", "LINKED_IN_MESSAGE": "Mensaje", "LINKED_IN_CONNECT": "Mensaje"}
ABIERTAS = ["NOT_STARTED", "IN_PROGRESS", "WAITING", "DEFERRED"]


def canon(stage_id, label):
    if stage_id in CANON_HS:
        return CANON_HS[stage_id]
    l = (label or "").lower()
    return next((i for k, i in KW if k in l), 0)


def seg(v):
    """Fecha de HubSpot (ISO con Z o epoch en ms) -> epoch en segundos; 0 si vacía."""
    if not v:
        return 0
    s = str(v)
    if s.isdigit():
        n = int(s)
        return n // 1000 if n > 10 ** 11 else n
    try:
        return int(datetime.fromisoformat(s.replace("Z", "+00:00")).timestamp())
    except ValueError:
        return 0


def num(v):
    try:
        return float(v or 0)
    except (TypeError, ValueError):
        return 0.0


def asociaciones(de, a, ids):
    """{id de `de`: [ids de `a`]} por la API de asociaciones v4, de a 1000. Si un lote falla se avisa y se sigue."""
    out = {}
    for i in range(0, len(ids), 1000):
        try:
            d = h._req("POST", "/crm/v4/associations/%s/%s/batch/read" % (de, a), {"inputs": [{"id": x} for x in ids[i:i + 1000]]})
        except SystemExit as e:
            print("aviso: asociaciones %s → %s: %s" % (de, a, str(e)[:120]))
            continue
        for r in d.get("results", []):
            out[str(r["from"]["id"])] = [str(x["toObjectId"]) for x in r.get("to", [])]
    return out


def deals_de(objeto, ids, por_id):
    """{id del objeto: [ids de deal del corte]}: primero lo que cuelga del deal y, si no, del contacto (objeto → contacto
    → deal). En HubSpot las tareas y llamadas casi siempre cuelgan del contacto, no del deal."""
    o2d = asociaciones(objeto, "deals", ids)
    o2c = asociaciones(objeto, "contacts", [x for x in ids if not any(("h:" + d) in por_id for d in o2d.get(x, []))])
    c2d = asociaciones("contacts", "deals", sorted({c for cs in o2c.values() for c in cs}))
    out = {}
    for x in ids:
        deals = [d for d in o2d.get(x, []) if ("h:" + d) in por_id] \
            or [d for c in o2c.get(x, []) for d in c2d.get(c, []) if ("h:" + d) in por_id]
        if deals:
            out[x] = list(dict.fromkeys(deals))
    return out


def ligar_llamadas(llamadas, leads, objeto="calls"):
    """Cada llamada de HubSpot a su deal (Randall 24-sep: llamadas de «Conversación iniciada» y de cada etapa). Sin esto
    el evento traía `lead: ""` y nadie sabía a qué lead se le llamó. Si cuelga de varios deals del contacto, va al más
    reciente (el que se está trabajando)."""
    por_id = {l["id"]: l for l in leads}
    a_deal = deals_de(objeto, [c for c, _ in llamadas], por_id)
    n = 0
    for cid, ev in llamadas:
        deals = a_deal.get(cid)
        if not deals:
            continue
        l = max((por_id["h:" + d] for d in deals), key=lambda x: x.get("asignacion") or 0)
        ev.update(lead=l["id"], asignacion=l.get("asignacion") or 0)
        n += 1
    print("hubspot: %s ligadas a un deal del corte %d de %d" % ("llamadas" if objeto == "calls" else "tareas completadas", n, len(llamadas)))


def ligar_tareas(abiertas, leads):
    """Tarea de seguimiento por deal (Randall 23-sep, detalle de las etapas del embudo). Una tarea de HubSpot cuelga del
    deal (~35 %) o solo del contacto: se liga tarea → deal y, si no, tarea → contacto → deal, y se cuenta en los deals del
    corte. Así «vencida» es verdad: la próxima actividad del deal (`notes_next_activity_date`) solo guarda lo que viene, y
    un deal con la tarea atrasada salía «sin tarea». Sin tareas ligadas se queda la próxima actividad como estaba."""
    por_id = {l["id"]: l for l in leads}
    a_deal = deals_de("tasks", [t["id"][2:] for t in abiertas], por_id)
    por_deal, ligadas = {}, 0
    for t in abiertas:
        deals = a_deal.get(t["id"][2:])
        if not deals:
            continue
        ligadas += 1
        l0 = por_id["h:" + deals[0]]
        t.update(lead=l0["id"], lead_nombre=l0["nombre"], link=l0["link"])
        for d in set(deals):
            por_deal.setdefault("h:" + d, []).append(t)
    for lid, ts in por_deal.items():
        l = por_id[lid]
        l["tareas_abiertas"] = len(ts)
        l["tareas_vencidas"] = sum(1 for t in ts if t["vencida"])
        l["prox_tarea"] = min(t["vence"] for t in ts if t["vence"]) if any(t["vence"] for t in ts) else l.get("prox_tarea", 0)
        l["sin_tarea"] = False
    print("hubspot: tareas abiertas ligadas a un deal del corte %d de %d · %d deals con tarea" % (ligadas, len(abiertas), len(por_deal)))


def buscar(obj, prop, ini, fin, props, extra=None, paso=30):
    """search paginado por ventanas de `paso` días: la búsqueda de HubSpot se corta
    en 10,000 resultados por consulta y las tareas pasan de ahí a 90 días."""
    a = ini * 1000
    while a < fin * 1000:
        b = min(fin * 1000, a + paso * 86400 * 1000)
        filtros = [{"propertyName": prop, "operator": "BETWEEN", "value": str(a), "highValue": str(b - 1)}] + (extra or [])
        for it in h.search(obj, filtros, props):
            yield it
        a = b


def owners_():
    """Activos + archivados: los deals viejos siguen apuntando a owners dados de
    baja y sin esto salían como un número sin nombre."""
    out = dict(h.owners())
    try:
        for o in h._req("GET", "/crm/v3/owners/", params={"limit": 500, "archived": "true"}).get("results", []):
            nombre = " ".join(x for x in [o.get("firstName"), o.get("lastName")] if x).strip() or o.get("email") or "?"
            out.setdefault(str(o.get("id")), {"nombre": nombre, "zona": ""})
    except SystemExit as e:
        print("  aviso: owners archivados: %s" % str(e)[:120], file=sys.stderr)
    return out


def etapas_():
    """({stage_id: (label, orden, cerrada, pipeline_label)}, [etapas abiertas de Ventas en orden])"""
    out, ventas = {}, []
    for p in h._req("GET", "/crm/v3/pipelines/deals").get("results", []):
        for s in p.get("stages", []):
            cerrada = str((s.get("metadata") or {}).get("isClosed")).lower() == "true"
            out[s["id"]] = (s.get("label") or s["id"], s.get("displayOrder", 0), cerrada, p.get("label") or p["id"])
            if p["id"] == PIPE_VENTAS_HS and not cerrada:
                ventas.append((s.get("displayOrder", 0), s.get("label") or s["id"]))
    return out, [n for _, n in sorted(ventas)]


def build():
    t0 = time.time()
    hoy = int(time.time())
    desde = hoy - DIAS_HISTORIA * 86400
    own = owners_()
    etapas, etapas_ventas = etapas_()
    print("hubspot: %d owners · %d etapas" % (len(own), len(etapas)))

    props_d = ["dealname", "dealstage", "pipeline", "amount", "closedate", "createdate", "hubspot_owner_id",
               "hubspot_owner_assigneddate", "hs_lastmodifieddate", "hs_is_closed", "hs_is_closed_won",
               "closed_lost_reason", "razon_de_descarte", "hs_v2_date_entered_current_stage",
               "hs_v2_date_entered_" + ET_PROPUESTA_HS,
               "hs_v2_date_entered_" + ET_LEV_AGENDADO_HS, "hs_v2_date_entered_" + ET_LEV_HECHO_HS,
               "notes_next_activity_date", "notes_last_contacted", "origen", "ciudad"]
    deals = {}
    for d in buscar("deals", "createdate", desde, hoy + 86400, props_d):
        deals[d["id"]] = d["properties"]
    n_creados = len(deals)
    for d in buscar("deals", "closedate", desde, hoy + 86400, props_d):
        deals.setdefault(d["id"], d["properties"])
    n_cerr = len(deals)
    # Abiertos más viejos que la ventana (Randall 11-sep): leads activos, tareas vencidas y sin tarea
    # son foto de hoy. ~8,400 deals el 11-sep; en su mayoría de owners archivados, que ya se filtran.
    for d in buscar("deals", "createdate", desde - 6 * 365 * 86400, desde, props_d, paso=365,
                    extra=[{"propertyName": "hs_is_closed", "operator": "EQ", "value": "false"}]):
        deals.setdefault(d["id"], d["properties"])
    print("hubspot: deals %d creados + %d cerrados viejos + %d abiertos viejos" % (n_creados, n_cerr - n_creados, len(deals) - n_cerr))

    leads, eventos, usados = [], [], set()
    sin_dueno = otros_pipes = 0
    for did, p in deals.items():
        if p.get("pipeline") != PIPE_VENTAS_HS:
            otros_pipes += 1
            continue
        # Sin dueño no hay a quién medírselo: el tablero es por asesor. Se cuentan
        # y se avisa, pero no entran (eran ~2,000 de 11,000 en el corte del 3-sep).
        if not p.get("hubspot_owner_id"):
            sin_dueno += 1
            continue
        sid = p.get("dealstage") or ""
        lbl, orden, cerrada, pipe = etapas.get(sid, (sid, 0, False, p.get("pipeline") or ""))
        ganado = str(p.get("hs_is_closed_won")).lower() == "true"
        perdido = (str(p.get("hs_is_closed")).lower() == "true" or cerrada) and not ganado
        funnel = 5 if ganado else 0 if perdido else 4
        c = -1 if (ganado or perdido) else canon(sid, lbl)
        uid = p.get("hubspot_owner_id") or None
        if uid:
            usados.add(str(uid))
        asig = seg(p.get("hubspot_owner_assigneddate")) or seg(p.get("createdate"))
        nad = seg(p.get("notes_next_activity_date"))
        entro = seg(p.get("hs_v2_date_entered_current_stage"))
        cerrado = seg(p.get("closedate")) if (ganado or perdido) else 0
        razon = (p.get("closed_lost_reason") or p.get("razon_de_descarte") or (lbl if perdido else "") or "").strip()
        # Regla 5-sep: la fecha de entrada a Propuesta cuenta aunque el deal ya avanzó, se regresó o cerró;
        # si el deal es de antes de que existiera la propiedad (4-ago), queda la foto de hoy.
        cot = seg(p.get("hs_v2_date_entered_" + ET_PROPUESTA_HS)) or (entro if c == 2 else 0)
        lev = entro if c == 4 else 0
        # Agendar y hacer la visita son dos cosas distintas (Randall 9-sep): la fecha de entrada a
        # cada etapa; si el deal está HOY en ella y no hay propiedad calculada, la fecha de entrada.
        lev_ag = seg(p.get("hs_v2_date_entered_" + ET_LEV_AGENDADO_HS)) or (entro if c == 3 else 0)
        lev_he = seg(p.get("hs_v2_date_entered_" + ET_LEV_HECHO_HS)) or (entro if c == 4 else 0)
        lid = "h:" + did
        leads.append({
            "id": lid, "crm": "hubspot", "nombre": (p.get("dealname") or "Deal " + did).strip(),
            "creado": seg(p.get("createdate")), "embudo": "ventas", "pipeline": pipe,
            "etapa": lbl, "etapa_id": c, "asesor_id": uid, "asesor": own.get(str(uid), {}).get("nombre", "") if uid else "",
            "presupuesto": num(p.get("amount")), "recibo": False, "respondio": funnel != 0 and (orden >= 1 or funnel == 5),
            "funnel": funnel, "funnel_label": {5: "5·Ganado", 0: "0·Perdido"}.get(funnel, "4·Asignado (en Ventas/Hunting)"),
            "tareas_abiertas": 1 if nad else 0, "tareas_vencidas": 1 if nad and nad < hoy else 0, "pc_vencida": False, "prox_tarea": nad or 0,
            "tags": [x for x in [p.get("origen")] if x], "ciudad": (p.get("ciudad") or "").strip(), "origen": (p.get("origen") or "").strip() or "Sin origen",
            "dias_sin_cambio": max(0, (hoy - (seg(p.get("hs_lastmodifieddate")) or hoy)) // 86400),
            "link": "https://app.hubspot.com/contacts/%s/record/0-3/%s" % (PORTAL, did),
            "msjs": 0, "llamadas_cf": 0, "tel": "", "sin_tarea": funnel == 4 and not nad, "razon": razon,
            "asignacion": asig, "tareas_completadas": 0, "ult_tarea": 0, "ult_llamada": 0,
            "cotizacion": cot, "recotizaciones": 0, "levantamiento": lev, "lev_agendado": lev_ag, "lev_hecho": lev_he, "ult_actividad": seg(p.get("notes_last_contacted")), "cerrado": cerrado,
        })
        if perdido and cerrado:
            eventos.append({"ts": cerrado, "tipo": "descarte", "asesor_id": uid, "lead": lid, "asignacion": asig, "embudo": "ventas", "crm": "hubspot"})
        if cot:
            eventos.append({"ts": cot, "tipo": "cotizacion", "asesor_id": uid, "lead": lid, "asignacion": asig, "embudo": "ventas", "crm": "hubspot"})
        if lev:
            eventos.append({"ts": lev, "tipo": "levantamiento", "asesor_id": uid, "lead": lid, "asignacion": asig, "embudo": "ventas", "crm": "hubspot"})

    print("hubspot: fuera del corte: %d deals sin dueño · %d de otros pipelines (solo entra Ventas)" % (sin_dueno, otros_pipes))

    n_ll, llamadas = 0, []
    for c in buscar("calls", "hs_timestamp", desde, hoy + 86400, ["hs_timestamp", "hs_call_status", "hs_call_duration", "hubspot_owner_id"]):
        p = c["properties"]
        uid = p.get("hubspot_owner_id") or None
        ok = p.get("hs_call_status") == "COMPLETED" or num(p.get("hs_call_duration")) > 0
        ev = {"ts": seg(p.get("hs_timestamp")), "tipo": "llamada_ok" if ok else "llamada_no",
              "asesor_id": uid, "lead": "", "asignacion": 0, "embudo": "ventas", "crm": "hubspot"}
        eventos.append(ev)
        llamadas.append((c["id"], ev))
        if uid:
            usados.add(str(uid))
        n_ll += 1
    print("hubspot: llamadas %d" % n_ll)
    ligar_llamadas(llamadas, leads)

    # Tareas completadas también al deal (Randall 24-sep: tareas por lead en el detalle de la conversión).
    n_t, hechas = 0, []
    for t in buscar("tasks", "hs_task_completion_date", desde, hoy + 86400, ["hs_task_completion_date", "hubspot_owner_id"],
                    extra=[{"propertyName": "hs_task_status", "operator": "EQ", "value": "COMPLETED"}], paso=10):
        p = t["properties"]
        uid = p.get("hubspot_owner_id") or None
        ev = {"ts": seg(p.get("hs_task_completion_date")), "tipo": "tarea", "asesor_id": uid,
              "lead": "", "asignacion": 0, "embudo": "ventas", "crm": "hubspot"}
        eventos.append(ev)
        hechas.append((t["id"], ev))
        if uid:
            usados.add(str(uid))
        n_t += 1
    print("hubspot: tareas completadas %d" % n_t)
    ligar_llamadas(hechas, leads, "tasks")

    abiertas = []
    for t in buscar("tasks", "hs_timestamp", desde, hoy + 14 * 86400, ["hs_timestamp", "hs_task_subject", "hs_task_type", "hubspot_owner_id"],
                    extra=[{"propertyName": "hs_task_status", "operator": "IN", "values": ABIERTAS}], paso=15):
        p = t["properties"]
        vence = seg(p.get("hs_timestamp"))
        uid = p.get("hubspot_owner_id") or None
        if uid:
            usados.add(str(uid))
        abiertas.append({"id": "h:" + t["id"], "crm": "hubspot", "lead": "", "lead_nombre": "", "asesor_id": uid,
                         "texto": (p.get("hs_task_subject") or "").strip(), "tipo": TIPO_TAREA.get(p.get("hs_task_type"), "Tarea"),
                         "vence": vence, "vencida": bool(vence and vence < hoy), "link": ""})
    print("hubspot: tareas abiertas %d" % len(abiertas))
    ligar_tareas(abiertas, leads)

    eventos = [e for e in eventos if e["ts"]]
    usuarios = {oid: {"nombre": o["nombre"], "zona": o.get("zona", "")} for oid, o in own.items() if oid in usados}
    print("hubspot: resumen %d leads · %d actividades · %d asesores con actividad · %.0f s"
          % (len(leads), len(eventos), len(usuarios), time.time() - t0))
    return {"crm": "hubspot", "generado": datetime.now(TZ).isoformat(timespec="seconds"),
            "usuarios": usuarios, "etapas": None, "embudos": {"Ventas": etapas_ventas},
            "leads": leads, "eventos": eventos, "tareas_abiertas": abiertas}


def selftest():
    assert canon("1409289353", "Propuesta entregada") == 2 and canon("1409289354", "x") == 4
    assert canon("1432144491", "Levantamiento agendado") == 3, "la etapa nueva de HubSpot (5-sep) debe ser 3, no 4"
    assert canon("1265092763", "Sin recibo") == 1 and canon("1265092765", "Cierre Cercano") == 4
    assert canon("zzz", "Pdte Firmar Contrato") == 5 and canon("zzz", "Recibo para cotizar") == 2
    assert canon("zzz", "Stand By") == 0 and canon("zzz", "Número Teléfono") == 1
    esperado = int(datetime(2026, 9, 3, 19, 57, 1, tzinfo=timezone.utc).timestamp())
    assert seg("2026-09-03T19:57:01.458Z") == esperado and seg(str(esperado * 1000)) == esperado and seg(None) == 0
    print("selftest OK")


if __name__ == "__main__":
    if "--selftest" in sys.argv:
        selftest()
        sys.exit(0)
    parte = build()
    print(json.dumps({"usuarios": parte["usuarios"], "leads": len(parte["leads"]), "eventos": len(parte["eventos"]),
                      "tareas": len(parte["tareas_abiertas"])}, ensure_ascii=False, indent=1))
