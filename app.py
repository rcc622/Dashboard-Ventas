#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Servicio del Dashboard Kenet — corre en Railway 24/7.

- Sirve el dashboard en / detrás de basic auth (usuario y contraseña de env vars).
- Un hilo en segundo plano refresca los datos cada REFRESH_HOURS (default 6).
- GET  /estado    JSON con el último refresh, si fue exitoso y cuándo toca el siguiente.
- POST /refrescar dispara un refresh manual (requiere auth).
- GET  /salud     liveness sin auth, para el health check de Railway.

Solo stdlib: sin dependencias que instalar ni mantener.

Variables de entorno (en Railway, nunca en el repo):
    META_TOKEN          obligatoria — token de system user de Meta
    META_AD_ACCOUNT     obligatoria — cuenta principal (771839424126319)
    DASH_USER/DASH_PASS obligatorias — credenciales de acceso al dashboard
    HUBSPOT_TOKEN       opcional — Private App de solo lectura; sin ella el CRM
                        se queda en el último corte y la página lo advierte
    KOMMO_SUBDOMAIN     opcional — cuando la migración esté lista
    KOMMO_LONG_TOKEN
    REFRESH_HOURS       opcional, default 6
    PORT                la pone Railway
"""
import base64, hmac, json, os, subprocess, sys, threading, time, traceback
from datetime import datetime, timedelta, timezone
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.environ.get("DASH_DATA", os.path.join(HERE, "data"))
OUT = os.environ.get("DASH_OUT", os.path.join(HERE, "out"))
PORT = int(os.environ.get("PORT", "8080"))
REFRESH_HOURS = float(os.environ.get("REFRESH_HOURS", "6"))
USER = os.environ.get("DASH_USER", "")
PASS = os.environ.get("DASH_PASS", "")
TZ = timezone(timedelta(hours=-6))   # America/Monterrey

_estado = {
    "ultimo_intento": None, "ultimo_exito": None, "ok": None,
    "corriendo": False, "log": "", "proximo": None,
    "crm_source": None, "crm_generado": None, "arranques": 0,
}
_lock = threading.Lock()


def ahora():
    return datetime.now(TZ)


def _py():
    return sys.executable or "python3"


def _corre(nombre, args, timeout=900):
    r = subprocess.run([_py()] + args, capture_output=True, text=True,
                       encoding="utf-8", errors="replace", cwd=HERE, timeout=timeout)
    linea = "== %s == rc=%d\n%s" % (nombre, r.returncode, (r.stdout or "").strip())
    if r.returncode != 0:
        linea += "\nSTDERR: " + (r.stderr or "").strip()[:900]
    return r.returncode == 0, linea


def refrescar():
    """Jala Meta (siempre) + CRM (si hay token) y regenera el HTML."""
    with _lock:
        if _estado["corriendo"]:
            return False
        _estado.update(corriendo=True, ultimo_intento=ahora().isoformat(timespec="seconds"))
    log, ok = [], True
    try:
        # CRM primero: si falla, el dashboard igual se genera con el corte anterior.
        if os.environ.get("HUBSPOT_TOKEN"):
            bien, l = _corre("CRM HubSpot", ["crm_hubspot.py"])
            log.append(l)
            if not bien:
                log.append("aviso: el CRM falló; se usa el corte anterior de crm_recon.json")
        elif os.environ.get("KOMMO_LONG_TOKEN"):
            bien, l = _corre("CRM Kommo", ["crm_kommo.py", "--days", "7"])
            log.append(l)
            if not bien:
                log.append("aviso: el CRM falló; se usa el corte anterior de crm_recon.json")
        else:
            log.append("== CRM ==\nsin token configurado; se usa el último corte manual")

        bien, l = _corre("Meta + dashboard", ["dashboard.py", "--refresh"])
        log.append(l)
        ok = bien
    except subprocess.TimeoutExpired:
        log.append("TIMEOUT: el refresh pasó de 15 minutos")
        ok = False
    except Exception:
        log.append("EXCEPCIÓN:\n" + traceback.format_exc()[:1200])
        ok = False

    crm_src = crm_gen = None
    try:
        with open(os.path.join(DATA, "crm_recon.json"), encoding="utf-8-sig") as f:
            c = json.load(f)
        crm_src, crm_gen = c.get("source"), c.get("_generado") or (c.get("window_7d") or {}).get("end")
    except Exception:
        pass

    with _lock:
        _estado.update(corriendo=False, ok=ok, log="\n".join(log),
                       crm_source=crm_src, crm_generado=crm_gen,
                       proximo=(ahora() + timedelta(hours=REFRESH_HOURS)).isoformat(timespec="seconds"))
        if ok:
            _estado["ultimo_exito"] = ahora().isoformat(timespec="seconds")
    print("[refresh] ok=%s %s" % (ok, ahora().isoformat(timespec="seconds")), flush=True)
    return ok


def bucle():
    """Refresca al arrancar y luego cada REFRESH_HOURS."""
    time.sleep(5)          # deja que el puerto quede escuchando antes del primer jalón
    while True:
        try:
            refrescar()
        except Exception:
            traceback.print_exc()
        time.sleep(max(600, REFRESH_HOURS * 3600))


def html_actual():
    try:
        files = sorted(f for f in os.listdir(OUT)
                       if f.startswith("dashboard_kenet_") and f.endswith(".html"))
        return os.path.join(OUT, files[-1]) if files else None
    except FileNotFoundError:
        return None


BARRA = """
<div id="kbar" style="position:fixed;right:14px;bottom:14px;z-index:9999;display:flex;gap:10px;
  align-items:center;background:#0E1420;color:#EAEFFB;border:2px solid #29344D;padding:9px 13px;
  font:13px 'Segoe UI',system-ui,sans-serif;box-shadow:0 6px 24px rgba(0,0,0,.35)">
  <span id="kmsg" style="font:11.5px ui-monospace,Consolas,monospace;color:#9AA8C6">%(msg)s</span>
  <button id="kbtn" style="font:700 13px 'Segoe UI',system-ui,sans-serif;background:#2B5BFF;
    color:#fff;border:none;padding:7px 15px;cursor:pointer">Actualizar ahora</button>
</div>
<script>
(function(){
  var b=document.getElementById('kbtn'), m=document.getElementById('kmsg'), t=null;
  function poll(){
    fetch('/estado').then(r=>r.json()).then(function(s){
      if(s.corriendo){ m.textContent='actualizando… (2-4 min)'; return; }
      clearInterval(t); b.disabled=false; b.textContent='Actualizar ahora';
      if(s.ok===false){ m.textContent='falló el último refresh'; m.style.color='#FF5C7A'; }
      else location.reload();
    }).catch(function(){ clearInterval(t); b.disabled=false; });
  }
  b.addEventListener('click',function(){
    b.disabled=true; b.textContent='Actualizando…'; m.style.color='#9AA8C6';
    fetch('/refrescar',{method:'POST'}).then(function(){ t=setInterval(poll,4000); });
  });
})();
</script>
"""


class H(BaseHTTPRequestHandler):
    server_version = "kenet-dash"

    def log_message(self, fmt, *a):
        pass

    def _send(self, code, body, ctype="text/html; charset=utf-8", extra=None):
        data = body.encode("utf-8") if isinstance(body, str) else body
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Robots-Tag", "noindex, nofollow")
        self.send_header("Referrer-Policy", "no-referrer")
        for k, v in (extra or {}).items():
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(data)

    def _autorizado(self):
        if not (USER and PASS):
            return False           # sin credenciales configuradas no se sirve nada
        h = self.headers.get("Authorization", "")
        if not h.startswith("Basic "):
            return False
        try:
            u, _, p = base64.b64decode(h[6:]).decode("utf-8").partition(":")
        except Exception:
            return False
        # compare_digest para no filtrar la contraseña por tiempo de respuesta
        return hmac.compare_digest(u, USER) and hmac.compare_digest(p, PASS)

    def _pide_auth(self):
        cuerpo = ("<h1>Dashboard Kenet</h1><p>Acceso restringido.</p>"
                  if USER and PASS else
                  "<h1>Sin configurar</h1><p>Faltan DASH_USER y DASH_PASS "
                  "en las variables de entorno del servicio.</p>")
        self._send(401, cuerpo, extra={"WWW-Authenticate": 'Basic realm="Kenet"'})

    def do_GET(self):
        ruta = self.path.split("?")[0]
        if ruta == "/salud":
            return self._send(200, json.dumps({"ok": True, "arranques": _estado["arranques"]}),
                              "application/json")
        if not self._autorizado():
            return self._pide_auth()
        if ruta == "/estado":
            with _lock:
                return self._send(200, json.dumps(_estado, ensure_ascii=False),
                                  "application/json")
        p = html_actual()
        if not p:
            with _lock:
                corriendo = _estado["corriendo"]
            msg = ("Generando el primer dashboard, tarda unos minutos. Recarga en un rato."
                   if corriendo else
                   "Todavía no hay dashboard generado. Usa el botón Actualizar o revisa /estado.")
            return self._send(503, "<h1>Dashboard Kenet</h1><p>%s</p>%s"
                              % (msg, BARRA % {"msg": "sin datos aún"}))
        with open(p, encoding="utf-8") as f:
            doc = f.read()
        with _lock:
            ue, ok = _estado["ultimo_exito"], _estado["ok"]
        msg = ("actualizado %s" % ue[11:16]) if ue else "datos del archivo"
        if ok is False:
            msg = "último refresh falló"
        return self._send(200, doc + BARRA % {"msg": msg})

    def do_POST(self):
        if not self._autorizado():
            return self._pide_auth()
        if not self.path.startswith("/refrescar"):
            return self._send(404, "no")
        with _lock:
            if _estado["corriendo"]:
                return self._send(409, json.dumps({"error": "ya está corriendo"}),
                                  "application/json")
        threading.Thread(target=refrescar, daemon=True).start()
        return self._send(202, json.dumps({"ok": True}), "application/json")


if __name__ == "__main__":
    os.makedirs(DATA, exist_ok=True)
    os.makedirs(OUT, exist_ok=True)
    _estado["arranques"] += 1
    if not (USER and PASS):
        print("AVISO: faltan DASH_USER/DASH_PASS — el servicio responderá 401 a todo.", flush=True)
    threading.Thread(target=bucle, daemon=True).start()
    print("Dashboard escuchando en :%d · refresh cada %sh" % (PORT, REFRESH_HOURS), flush=True)
    ThreadingHTTPServer(("0.0.0.0", PORT), H).serve_forever()
