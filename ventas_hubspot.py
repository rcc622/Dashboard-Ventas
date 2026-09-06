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
  · cotización / levantamiento = deal que HOY está en «Propuesta entregada» /
               «Levantamiento hecho», con la fecha en que entró a esa etapa. Los que
               ya avanzaron no se pueden fechar (el portal no tiene hs_date_entered_*).
  · descarte = deal perdido, fecha = closedate, razón = closed_lost_reason /
               razon_de_descarte / nombre de la etapa de pérdida.
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
    """{stage_id: (label, orden, cerrada, pipeline_label)}"""
    out = {}
    for p in h._req("GET", "/crm/v3/pipelines/deals").get("results", []):
        for s in p.get("stages", []):
            out[s["id"]] = (s.get("label") or s["id"], s.get("displayOrder", 0),
                            str((s.get("metadata") or {}).get("isClosed")).lower() == "true", p.get("label") or p["id"])
    return out


def build():
    t0 = time.time()
    hoy = int(time.time())
    desde = hoy - DIAS_HISTORIA * 86400
    own = owners_()
    etapas = etapas_()
    print("hubspot: %d owners · %d etapas" % (len(own), len(etapas)))

    props_d = ["dealname", "dealstage", "pipeline", "amount", "closedate", "createdate", "hubspot_owner_id",
               "hubspot_owner_assigneddate", "hs_lastmodifieddate", "hs_is_closed", "hs_is_closed_won",
               "closed_lost_reason", "razon_de_descarte", "hs_v2_date_entered_current_stage",
               "notes_next_activity_date", "notes_last_contacted", "origen"]
    deals = {}
    for d in buscar("deals", "createdate", desde, hoy + 86400, props_d):
        deals[d["id"]] = d["properties"]
    n_creados = len(deals)
    for d in buscar("deals", "closedate", desde, hoy + 86400, props_d):
        deals.setdefault(d["id"], d["properties"])
    print("hubspot: deals %d creados + %d cerrados viejos" % (n_creados, len(deals) - n_creados))

    leads, eventos, usados = [], [], set()
    sin_dueno = 0
    for did, p in deals.items():
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
        cot = entro if c == 2 else 0
        lev = entro if c == 4 else 0
        lid = "h:" + did
        leads.append({
            "id": lid, "crm": "hubspot", "nombre": (p.get("dealname") or "Deal " + did).strip(),
            "creado": seg(p.get("createdate")), "embudo": "ventas", "pipeline": pipe,
            "etapa": lbl, "etapa_id": c, "asesor_id": uid, "asesor": own.get(str(uid), {}).get("nombre", "") if uid else "",
            "presupuesto": num(p.get("amount")), "recibo": False, "respondio": funnel != 0 and (orden >= 1 or funnel == 5),
            "funnel": funnel, "funnel_label": {5: "5·Ganado", 0: "0·Perdido"}.get(funnel, "4·Asignado (en Ventas/Hunting)"),
            "tareas_abiertas": 1 if nad else 0, "tareas_vencidas": 1 if nad and nad < hoy else 0, "pc_vencida": False,
            "tags": [x for x in [p.get("origen")] if x], "dias_sin_cambio": max(0, (hoy - (seg(p.get("hs_lastmodifieddate")) or hoy)) // 86400),
            "link": "https://app.hubspot.com/contacts/%s/record/0-3/%s" % (PORTAL, did),
            "msjs": 0, "llamadas_cf": 0, "tel": "", "sin_tarea": funnel == 4 and not nad, "razon": razon,
            "asignacion": asig, "tareas_completadas": 0, "ult_tarea": 0, "ult_llamada": 0,
            "cotizacion": cot, "levantamiento": lev, "ult_actividad": seg(p.get("notes_last_contacted")), "cerrado": cerrado,
        })
        if perdido and cerrado:
            eventos.append({"ts": cerrado, "tipo": "descarte", "asesor_id": uid, "lead": lid, "asignacion": asig, "embudo": "ventas", "crm": "hubspot"})
        if cot:
            eventos.append({"ts": cot, "tipo": "cotizacion", "asesor_id": uid, "lead": lid, "asignacion": asig, "embudo": "ventas", "crm": "hubspot"})
        if lev:
            eventos.append({"ts": lev, "tipo": "levantamiento", "asesor_id": uid, "lead": lid, "asignacion": asig, "embudo": "ventas", "crm": "hubspot"})

    print("hubspot: deals sin dueño fuera del corte: %d" % sin_dueno)

    n_ll = 0
    for c in buscar("calls", "hs_timestamp", desde, hoy + 86400, ["hs_timestamp", "hs_call_status", "hs_call_duration", "hubspot_owner_id"]):
        p = c["properties"]
        uid = p.get("hubspot_owner_id") or None
        ok = p.get("hs_call_status") == "COMPLETED" or num(p.get("hs_call_duration")) > 0
        eventos.append({"ts": seg(p.get("hs_timestamp")), "tipo": "llamada_ok" if ok else "llamada_no",
                        "asesor_id": uid, "lead": "", "asignacion": 0, "embudo": "ventas", "crm": "hubspot"})
        if uid:
            usados.add(str(uid))
        n_ll += 1
    print("hubspot: llamadas %d" % n_ll)

    n_t = 0
    for t in buscar("tasks", "hs_task_completion_date", desde, hoy + 86400, ["hs_task_completion_date", "hubspot_owner_id"],
                    extra=[{"propertyName": "hs_task_status", "operator": "EQ", "value": "COMPLETED"}], paso=10):
        p = t["properties"]
        uid = p.get("hubspot_owner_id") or None
        eventos.append({"ts": seg(p.get("hs_task_completion_date")), "tipo": "tarea", "asesor_id": uid,
                        "lead": "", "asignacion": 0, "embudo": "ventas", "crm": "hubspot"})
        if uid:
            usados.add(str(uid))
        n_t += 1
    print("hubspot: tareas completadas %d" % n_t)

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

    eventos = [e for e in eventos if e["ts"]]
    usuarios = {oid: {"nombre": o["nombre"], "zona": o.get("zona", "")} for oid, o in own.items() if oid in usados}
    print("hubspot: resumen %d leads · %d actividades · %d asesores con actividad · %.0f s"
          % (len(leads), len(eventos), len(usuarios), time.time() - t0))
    return {"crm": "hubspot", "generado": datetime.now(TZ).isoformat(timespec="seconds"),
            "usuarios": usuarios, "etapas": None, "leads": leads, "eventos": eventos, "tareas_abiertas": abiertas}


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
