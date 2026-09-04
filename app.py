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
import base64, gzip, hmac, json, os, subprocess, sys, threading, time, traceback
from datetime import datetime, timedelta, timezone
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.environ.get("DASH_DATA", os.path.join(HERE, "data"))
OUT = os.environ.get("DASH_OUT", os.path.join(HERE, "out"))
# Dashboard de ventas (/ventas): React compilado en ventas/dist + corte de
# ventas_kommo.py en el volumen. Mismo basic auth que la portada.
# DASH_MODO separa los dos tableros en servicios distintos de Railway:
#   marketing -> solo Meta + CRM de marketing (como antes de /ventas)
#   ventas    -> solo el corte de ventas; / redirige a /ventas/
#   ambos     -> los dos en el mismo proceso (default)
DASH_MODO = (os.environ.get("DASH_MODO") or "ambos").strip().lower()
VENTAS_DIST = os.path.join(HERE, "ventas", "dist")
VENTAS_JSON = os.path.join(DATA, "ventas.json")
CTYPES = {".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
          ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png",
          ".ico": "image/x-icon", ".woff2": "font/woff2", ".json": "application/json"}
PORT = int(os.environ.get("PORT", "8080"))
REFRESH_HOURS = float(os.environ.get("REFRESH_HOURS", "6"))
USER = os.environ.get("DASH_USER", "")
PASS = os.environ.get("DASH_PASS", "")
TZ = timezone(timedelta(hours=-6))   # America/Monterrey
# Cola de instrucciones escritas desde el dashboard. Vive en el volumen para
# que sobreviva a los deploys; el servicio solo la escribe, nunca la ejecuta.
COLA = os.path.join(DATA, "instrucciones.jsonl")
# Bitácora de pausas aplicadas desde la página. Append-only, en el volumen.
PAUSAS = os.path.join(DATA, "pausas.jsonl")
# Kill-switch: sin esto el endpoint contesta pero NO escribe a Meta. Se quita en
# Railway sin redesplegar, que es justo lo que quieres cuando algo sale mal.
_PAUSA_ENV = os.environ.get("PAUSA_ACTIVA", "") == "1"
# El seguro también se arma desde la página, pero NUNCA para siempre: el botón
# escribe una ventana de 24 h en el volumen y al vencer se desarma solo. La
# variable de entorno sigue mandando como encendido permanente; este archivo es
# el modo "ármalo ahora sin entrar a Railway".
PAUSA_ARMADA = os.path.join(DATA, "pausa_armada.json")
ARMADO_HORAS = 24


def pausa_activa():
    if _PAUSA_ENV:
        return True
    try:
        with open(PAUSA_ARMADA, encoding="utf-8") as f:
            hasta = json.load(f).get("hasta", "")
        return bool(hasta) and ahora().isoformat() < hasta
    except Exception:
        return False


def _estado_armado():
    if _PAUSA_ENV:
        return {"armada": True, "modo": "env", "hasta": None}
    try:
        with open(PAUSA_ARMADA, encoding="utf-8") as f:
            hasta = json.load(f).get("hasta", "")
    except Exception:
        hasta = ""
    viva = bool(hasta) and ahora().isoformat() < hasta
    return {"armada": viva, "modo": "boton" if viva else "apagada",
            "hasta": hasta if viva else None}
# Un botón que apaga 40 anuncios de un clic no es un botón, es un accidente.
PAUSA_MAX = int(os.environ.get("PAUSA_MAX_POR_LOTE", "5") or 5)
PRESET_PAUSA = os.environ.get("PAUSA_PRESET", "last_14d")

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


# 1500 s y no 900: el corte de Kommo ahora barre el log de eventos (~2-3 min)
def _corre(nombre, args, timeout=1500):
    r = subprocess.run([_py()] + args, capture_output=True, text=True,
                       encoding="utf-8", errors="replace", cwd=HERE, timeout=timeout)
    linea = "== %s == rc=%d\n%s" % (nombre, r.returncode, (r.stdout or "").strip())
    if r.returncode != 0:
        linea += "\nSTDERR: " + (r.stderr or "").strip()[:900]
    return r.returncode == 0, linea


class _SoloVentas(Exception):
    """Corta el refresh después del corte de ventas cuando DASH_MODO=ventas."""


def refrescar():
    """Jala Meta (siempre) + CRM (si hay token) y regenera el HTML."""
    with _lock:
        if _estado["corriendo"]:
            return False
        _estado.update(corriendo=True, ultimo_intento=ahora().isoformat(timespec="seconds"))
    log, ok = [], True
    try:
        # CRM primero: si falla, el dashboard igual se genera con el corte anterior.
        if DASH_MODO == "ventas":
            log.append("== modo ventas == se omite Meta y el CRM de marketing")
        elif os.environ.get("HUBSPOT_TOKEN"):
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

        # Corte del dashboard de ventas (/ventas): Kommo + HubSpot, los que tengan
        # token. Opcional: si falla queda el ventas.json anterior y la página lo
        # dice por la fecha de «generado».
        if DASH_MODO != "marketing" and (os.environ.get("KOMMO_LONG_TOKEN") or os.environ.get("HUBSPOT_TOKEN")):
            bien, l = _corre("Ventas (Kommo+HubSpot)", ["ventas_corte.py"])
            log.append(l)
            if not bien:
                log.append("aviso: ventas_corte falló; se usa el corte anterior de ventas.json")

        if DASH_MODO == "ventas":
            ok = bien if 'bien' in dir() else True
            raise _SoloVentas()
        # Google Ads: opcional; si falla no tumba el resto (queda el corte previo)
        if os.environ.get("GOOGLE_ADS_REFRESH_TOKEN"):
            bien, l = _corre("Google Ads", ["google_ads.py"], timeout=300)
            log.append(l)
            if not bien:
                log.append("aviso: Google Ads falló; se usa el corte anterior")

        bien, l = _corre("Meta + dashboard", ["dashboard.py", "--refresh"])
        log.append(l)
        ok = bien
    except _SoloVentas:
        pass
    except subprocess.TimeoutExpired:
        log.append("TIMEOUT: el refresh pasó de 25 minutos")
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
  <a href="/ventas/" style="color:#9AA8C6;font-weight:700;text-decoration:none" title="Dashboard de ventas">Ventas &rsaquo;</a>
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


CHAT = """
<div id="kc-abre" style="position:fixed;left:14px;bottom:14px;z-index:9999;background:#0E1420;
  color:#EAEFFB;border:2px solid #29344D;padding:9px 15px;cursor:pointer;
  font:700 13px 'Segoe UI',system-ui,sans-serif;box-shadow:0 6px 24px rgba(0,0,0,.35)">
  &#128172; Copiloto IA</div>
<div id="kc-panel" style="display:none;position:fixed;left:14px;bottom:14px;z-index:10000;
  width:min(430px,94vw);height:min(560px,80vh);background:#0E1420;color:#EAEFFB;
  border:2px solid #29344D;box-shadow:0 10px 34px rgba(0,0,0,.5);
  font:13px 'Segoe UI',system-ui,sans-serif;display:none;flex-direction:column">
  <div style="display:flex;justify-content:space-between;align-items:center;
    padding:10px 12px;border-bottom:1px solid #29344D">
    <b>Copiloto IA</b>
    <span>
      <button id="kc-limpia" title="borrar conversación" style="background:none;border:none;
        color:#9AA8C6;cursor:pointer;font-size:12px">limpiar</button>
      <button id="kc-x" style="background:none;border:none;color:#EAEFFB;cursor:pointer;
        font-size:16px;font-weight:700">&times;</button>
    </span>
  </div>
  <div id="kc-msgs" style="flex:1;overflow-y:auto;padding:12px;display:flex;
    flex-direction:column;gap:8px"></div>
  <div id="kc-img" style="display:none;align-items:center;gap:8px;padding:6px 10px;
    border-top:1px solid #29344D;font-size:11.5px;color:#9AA8C6">
    <img id="kc-thumb" style="height:34px;border:1px solid #29344D" alt="captura">
    <span>captura lista para enviar</span>
    <button id="kc-img-x" style="background:none;border:none;color:#FF5C7A;
      cursor:pointer;font-size:12px">quitar</button>
  </div>
  <div style="display:flex;gap:8px;padding:10px;border-top:1px solid #29344D">
    <textarea id="kc-in" rows="2" placeholder="Pregunta o encarga algo&hellip; (Enter env&iacute;a &middot; Ctrl+V pega una captura)"
      style="flex:1;resize:none;background:#151D2E;color:#EAEFFB;border:1px solid #29344D;
      padding:8px;font:13px 'Segoe UI',system-ui,sans-serif"></textarea>
    <button id="kc-go" style="font:700 13px 'Segoe UI',system-ui,sans-serif;background:#2B5BFF;
      color:#fff;border:none;padding:0 16px;cursor:pointer">&rsaquo;</button>
  </div>
</div>
<script>
(function(){
  var abre=document.getElementById('kc-abre'), panel=document.getElementById('kc-panel'),
      msgs=document.getElementById('kc-msgs'), inp=document.getElementById('kc-in'),
      go=document.getElementById('kc-go'), H=[], IMG=null;
  var imgBar=document.getElementById('kc-img'), imgThumb=document.getElementById('kc-thumb');
  try{ H=JSON.parse(sessionStorage.kchat||'[]'); }catch(e){}
  function pinta(){
    msgs.innerHTML='';
    H.forEach(function(m){
      var d=document.createElement('div');
      d.style.cssText='max-width:88%;padding:8px 11px;white-space:pre-wrap;'+
        'word-wrap:break-word;line-height:1.45;'+
        (m.role==='user'
          ? 'align-self:flex-end;background:#2B5BFF;color:#fff'
          : 'align-self:flex-start;background:#151D2E;border:1px solid #29344D');
      if(m.imagen){
        var im=document.createElement('img');
        im.src=m.imagen; im.alt='captura';
        im.style.cssText='display:block;max-width:100%;margin-bottom:6px;border:1px solid #29344D';
        d.appendChild(im);
      }
      d.appendChild(document.createTextNode(m.content||''));
      msgs.appendChild(d);
    });
    msgs.scrollTop=msgs.scrollHeight;
  }
  // Ctrl+V con una captura en el portapapeles: se reescala (máx 1568px, JPEG)
  // para que el request no pese megas, y queda lista para el siguiente envío.
  function setImg(dataUrl){
    IMG=dataUrl;
    imgBar.style.display=dataUrl?'flex':'none';
    if(dataUrl) imgThumb.src=dataUrl;
  }
  document.getElementById('kc-img-x').addEventListener('click',function(){ setImg(null); });
  panel.addEventListener('paste',function(ev){
    var items=(ev.clipboardData||{}).items||[];
    for(var i=0;i<items.length;i++){
      if(items[i].type.indexOf('image')!==0) continue;
      ev.preventDefault();
      var f=items[i].getAsFile(), url=URL.createObjectURL(f), img=new Image();
      img.onload=function(){
        var MAX=1568, esc=Math.min(1, MAX/Math.max(img.width,img.height));
        var c=document.createElement('canvas');
        c.width=Math.round(img.width*esc); c.height=Math.round(img.height*esc);
        c.getContext('2d').drawImage(img,0,0,c.width,c.height);
        setImg(c.toDataURL('image/jpeg',0.85));
        URL.revokeObjectURL(url);
      };
      img.src=url;
      return;
    }
  });
  function espera(on){
    var e=document.getElementById('kc-wait');
    if(e) e.remove();
    if(on){
      e=document.createElement('div');
      e.id='kc-wait';
      e.style.cssText='align-self:flex-start;color:#9AA8C6;font-style:italic';
      e.textContent='pensando\\u2026 (puede tardar ~1 min si consulta Meta)';
      msgs.appendChild(e); msgs.scrollTop=msgs.scrollHeight;
    }
    go.disabled=on; inp.disabled=on;
  }
  function manda(){
    var t=inp.value.trim();
    if((!t&&!IMG)||go.disabled) return;
    inp.value='';
    var m={role:'user',content:t||'(captura)'};
    if(IMG) m.imagen=IMG;
    setImg(null);
    H.push(m); pinta(); espera(true);
    // Al servidor solo viajan las 2 capturas m\\u00e1s recientes; las viejas van
    // como texto para no mandar megas en cada turno.
    var conImg=[]; H.forEach(function(x,i){ if(x.imagen) conImg.push(i); });
    var keep={}; conImg.slice(-2).forEach(function(i){ keep[i]=1; });
    var payload=H.map(function(x,i){
      if(x.imagen&&!keep[i]) return {role:x.role,content:'[captura anterior] '+(x.content||'')};
      return x;
    });
    fetch('/copiloto',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({mensajes:payload})})
    .then(function(r){ return r.json(); })
    .then(function(d){
      espera(false);
      var tx = d.error ? ('\\u26a0 '+d.error) : (d.texto||'(sin respuesta)');
      if(d.encoladas && d.encoladas.length)
        tx += '\\n\\n\\u2705 Encolado ('+d.encoladas.length+'): se aplica en la pr\\u00f3xima sesi\\u00f3n con topes.';
      H.push({role:'assistant',content:tx});
      // sessionStorage aguanta ~5MB: el texto se guarda, las capturas no.
      try{ sessionStorage.kchat=JSON.stringify(H.slice(-24).map(function(x){
        return x.imagen?{role:x.role,content:'[captura] '+(x.content||'')}:x; })); }catch(e){}
      pinta();
    })
    .catch(function(e){ espera(false); H.push({role:'assistant',content:'\\u26a0 error de red: '+e}); pinta(); });
  }
  abre.addEventListener('click',function(){ panel.style.display='flex'; abre.style.display='none'; pinta(); inp.focus(); });
  document.getElementById('kc-x').addEventListener('click',function(){ panel.style.display='none'; abre.style.display='block'; });
  document.getElementById('kc-limpia').addEventListener('click',function(){ H=[]; sessionStorage.removeItem('kchat'); pinta(); });
  go.addEventListener('click',manda);
  inp.addEventListener('keydown',function(ev){ if(ev.key==='Enter'&&!ev.shiftKey){ ev.preventDefault(); manda(); } });
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

    def _ventas(self, ruta):
        """Sirve el build de ventas/ y su corte. Solo lectura, detrás del auth."""
        if ruta == "/ventas":
            return self._send(302, "", extra={"Location": "/ventas/"})
        rel = ruta[len("/ventas/"):] or "index.html"
        if rel == "data.json":
            try:
                with open(VENTAS_JSON, "rb") as f:
                    cuerpo = f.read()
            except FileNotFoundError:
                cuerpo = None
            if cuerpo is not None:
                # Con los dos CRM el corte pasa de 15 MB; comprimido baja a ~2.
                if "gzip" in (self.headers.get("Accept-Encoding") or ""):
                    return self._send(200, gzip.compress(cuerpo, 6), "application/json",
                                      extra={"Content-Encoding": "gzip", "Vary": "Accept-Encoding"})
                return self._send(200, cuerpo, "application/json")
            if True:
                return self._send(404, json.dumps({"error": "todavía no hay corte de ventas"}),
                                  "application/json")
        raiz = os.path.normpath(VENTAS_DIST)
        p = os.path.normpath(os.path.join(raiz, rel))
        if not p.startswith(raiz + os.sep) or not os.path.isfile(p):
            return self._send(404, "no")
        with open(p, "rb") as f:
            return self._send(200, f.read(), CTYPES.get(os.path.splitext(p)[1].lower(),
                                                        "application/octet-stream"))

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

    def _encolar(self):
        """Guarda una instrucción escrita en el dashboard. NO ejecuta nada.

        El servicio no toca Meta ni el CRM: solo deja el texto en la cola del
        volumen para que alguien con permisos de escritura lo aplique. Pausar
        campañas mueve dinero; que lo haga un endpoint HTTP sin nadie viendo es
        justo lo que no queremos.
        """
        try:
            n = int(self.headers.get("Content-Length") or 0)
            if n > 8000:
                return self._send(413, json.dumps({"error": "muy largo"}), "application/json")
            body = json.loads(self.rfile.read(n).decode("utf-8") or "{}")
        except Exception:
            return self._send(400, json.dumps({"error": "json inválido"}), "application/json")
        texto = (body.get("texto") or "").strip()
        if not texto:
            return self._send(400, json.dumps({"error": "vacío"}), "application/json")
        fila = {"ts": datetime.now(TZ).isoformat(timespec="seconds"),
                "accion": str(body.get("accion") or "")[:200],
                "texto": texto[:4000], "estado": "pendiente"}
        with _lock:
            try:
                with open(COLA, "a", encoding="utf-8") as f:
                    f.write(json.dumps(fila, ensure_ascii=False) + "\n")
            except Exception as e:
                return self._send(500, json.dumps({"error": str(e)}), "application/json")
        print("INSTRUCCIÓN encolada: %s — %s" % (fila["accion"][:60], texto[:120]), flush=True)
        return self._send(201, json.dumps({"ok": True}), "application/json")

    def _pausar(self):
        """Pausa anuncios marcados por la regla. La ÚNICA puerta de escritura
        que tiene la página, y pasa por cuatro barreras.

        Lo que manda el navegador es una lista de ids y nada más. El servidor
        vuelve a pedirle a Meta los insights, vuelve a correr la regla y solo
        pausa lo que HOY sigue tocándola. Si alguien edita el HTML, manda un id
        a mano o el anuncio se recuperó desde el último refresh, no pasa: la
        decisión no se toma con lo que llegó por HTTP.
        """
        try:
            n = int(self.headers.get("Content-Length") or 0)
            body = json.loads(self.rfile.read(min(n, 8000)).decode("utf-8") or "{}")
        except Exception:
            return self._send(400, json.dumps({"error": "json inválido"}), "application/json")
        pedidos = [str(x) for x in (body.get("ad_ids") or []) if str(x).strip()]
        if not pedidos:
            return self._send(400, json.dumps({"error": "sin anuncios"}), "application/json")
        if len(pedidos) > PAUSA_MAX:
            return self._send(400, json.dumps(
                {"error": "máximo %d anuncios por vez" % PAUSA_MAX}), "application/json")

        try:
            sys.path.insert(0, HERE)
            import meta
            flagged, err = meta.candidatos_pausa(PRESET_PAUSA)
            if err is not None:
                return self._send(502, json.dumps(
                    {"error": "Meta no respondió", "detalle": str(err)[:300]}),
                    "application/json")
        except SystemExit as e:          # meta.py aborta si falta el token
            return self._send(500, json.dumps({"error": str(e)[:200]}), "application/json")
        except Exception as e:
            return self._send(500, json.dumps({"error": repr(e)[:200]}), "application/json")

        vigentes = {str(r["id"]): (r, motivos) for r, motivos in flagged}
        resultados = []
        for aid in pedidos:
            if aid not in vigentes:
                # Ya no toca ninguna regla, o vive en una campaña KE. No se toca.
                resultados.append({"ad_id": aid, "ok": False,
                                   "motivo": "ya no cumple ninguna regla de pausa"})
                continue
            r, motivos = vigentes[aid]
            if not pausa_activa():
                resultados.append({"ad_id": aid, "ok": False, "anuncio": r["name"],
                                   "motivo": "PAUSA_ACTIVA no está en 1 (kill-switch)"})
                continue
            try:
                rr = meta.post(aid, status="PAUSED")
                bien = bool(rr.get("success", "error" not in rr))
            except Exception as e:
                rr, bien = {"error": repr(e)[:200]}, False
            fila = {"ts": ahora().isoformat(timespec="seconds"), "ad_id": aid,
                    "anuncio": r["name"], "adset": r["adset"], "zona": r["zone"],
                    "spend": round(r["spend"], 2), "resultados": r["res"],
                    "motivos": motivos, "ok": bien,
                    "respuesta": str(rr)[:300], "por": USER}
            with _lock:
                try:
                    with open(PAUSAS, "a", encoding="utf-8") as f:
                        f.write(json.dumps(fila, ensure_ascii=False) + "\n")
                except Exception:
                    pass
            print("PAUSA %s %s — %s" % ("OK" if bien else "FALLÓ", r["name"][:50],
                                        "; ".join(motivos)), flush=True)
            resultados.append({"ad_id": aid, "ok": bien, "anuncio": r["name"],
                               "motivo": "; ".join(motivos) if bien else str(rr)[:160]})
        hechas = sum(1 for x in resultados if x["ok"])
        return self._send(200, json.dumps(
            {"pausados": hechas, "activo": pausa_activa(), "resultados": resultados},
            ensure_ascii=False), "application/json")

    def _armar_pausa(self):
        """Arma o desarma el seguro de pausa desde la página, por 24 h máximo.

        No toca ningún anuncio: solo abre la ventana en la que el botón de pausa
        SÍ escribe. Todo lo demás sigue igual — revalidación server-side, tope
        por lote y guardrail KE. Si PAUSA_ACTIVA=1 vive en el entorno, ese modo
        manda y desde aquí no se puede apagar.
        """
        try:
            n = int(self.headers.get("Content-Length", 0) or 0)
            cuerpo = json.loads(self.rfile.read(n).decode("utf-8")) if n else {}
        except Exception:
            cuerpo = {}
        if _PAUSA_ENV:
            return self._send(409, json.dumps(
                {"ok": False, "motivo": "PAUSA_ACTIVA=1 vive en el entorno; "
                 "se apaga en Railway, no desde la página"}), "application/json")
        armar = bool(cuerpo.get("armar"))
        with _lock:
            try:
                if armar:
                    hasta = (ahora() + timedelta(hours=ARMADO_HORAS))                        .isoformat(timespec="seconds")
                    with open(PAUSA_ARMADA, "w", encoding="utf-8") as f:
                        json.dump({"hasta": hasta, "por": USER,
                                   "desde": ahora().isoformat(timespec="seconds")}, f)
                else:
                    try:
                        os.remove(PAUSA_ARMADA)
                    except FileNotFoundError:
                        pass
            except Exception as e:
                return self._send(500, json.dumps({"ok": False,
                                                   "motivo": repr(e)[:200]}),
                                  "application/json")
        est = _estado_armado()
        print("PAUSA %s por %s%s" % ("ARMADA" if est["armada"] else "DESARMADA",
                                     USER, " hasta " + est["hasta"] if est["hasta"] else ""),
              flush=True)
        return self._send(200, json.dumps(dict(est, ok=True), ensure_ascii=False),
                          "application/json")

    def _copiloto(self):
        """Chat con Claude. Lee datos y consulta Meta en solo-lectura; los
        cambios los deja en la cola de instrucciones, nunca los ejecuta."""
        try:
            n = int(self.headers.get("Content-Length") or 0)
            # Las capturas pegadas viajan en base64: una sola puede pesar ~1-2MB.
            if n > 8_000_000:
                return self._send(413, json.dumps({"error": "conversación muy pesada — usa limpiar"}),
                                  "application/json")
            body = json.loads(self.rfile.read(n).decode("utf-8") or "{}")
        except Exception:
            return self._send(400, json.dumps({"error": "json inválido"}), "application/json")
        try:
            import copiloto
            r, err = copiloto.responder(body.get("mensajes"))
        except Exception as e:
            return self._send(500, json.dumps({"error": repr(e)[:300]}), "application/json")
        if err:
            return self._send(502, json.dumps({"error": err}, ensure_ascii=False),
                              "application/json")
        return self._send(200, json.dumps(r, ensure_ascii=False), "application/json")

    def _cerrar(self):
        """Marca una instrucción como aplicada. La cola es append-only: se agrega
        una línea de cierre en vez de reescribir el archivo, así dos escrituras a
        la vez no se pisan y queda el rastro de cuándo se aplicó."""
        try:
            n = int(self.headers.get("Content-Length") or 0)
            body = json.loads(self.rfile.read(min(n, 4000)).decode("utf-8") or "{}")
        except Exception:
            return self._send(400, json.dumps({"error": "json inválido"}), "application/json")
        ts = (body.get("ts") or "").strip()
        if not ts:
            return self._send(400, json.dumps({"error": "falta ts"}), "application/json")
        fila = {"ts": ts, "estado": "hecho", "cerrado": ahora().isoformat(timespec="seconds"),
                "nota": str(body.get("nota") or "")[:600]}
        with _lock:
            with open(COLA, "a", encoding="utf-8") as f:
                f.write(json.dumps(fila, ensure_ascii=False) + "\n")
        return self._send(200, json.dumps({"ok": True}), "application/json")

    def _cola(self):
        """Lo que está pendiente de aplicar. De aquí lo leo yo cuando abras sesión."""
        filas = []
        if os.path.exists(COLA):
            with open(COLA, encoding="utf-8") as f:
                for ln in f:
                    ln = ln.strip()
                    if ln:
                        try:
                            filas.append(json.loads(ln))
                        except Exception:
                            pass
        # Una instrucción sigue pendiente mientras nadie haya escrito su cierre.
        cerrados = {x["ts"] for x in filas if x.get("estado") == "hecho"}
        pend = [x for x in filas
                if x.get("estado") == "pendiente" and x["ts"] not in cerrados]
        return self._send(200, json.dumps(
            {"pendientes": len(pend), "cola": pend, "historial": len(filas)},
            ensure_ascii=False), "application/json")

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
        if ruta == "/cola":
            return self._cola()
        if ruta == "/pausas":
            filas = []
            if os.path.exists(PAUSAS):
                with open(PAUSAS, encoding="utf-8") as f:
                    for ln in f:
                        if ln.strip():
                            try:
                                filas.append(json.loads(ln))
                            except Exception:
                                pass
            return self._send(200, json.dumps(
                {"total": len(filas), "activo": pausa_activa(), "pausas": filas[-50:]},
                ensure_ascii=False), "application/json")
        if ruta == "/estado":
            with _lock:
                return self._send(200, json.dumps(
                    dict(_estado, pausa_activa=pausa_activa(),
                         pausa_armado=_estado_armado(), pausa_max=PAUSA_MAX),
                    ensure_ascii=False), "application/json")
        if ruta == "/ventas" or ruta.startswith("/ventas/"):
            return self._ventas(ruta)
        if DASH_MODO == "ventas":
            return self._send(302, "", extra={"Location": "/ventas/"})
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
        return self._send(200, doc + BARRA % {"msg": msg} + CHAT)

    def do_POST(self):
        if not self._autorizado():
            return self._pide_auth()
        if self.path.startswith("/instruccion"):
            return self._encolar()
        if self.path.startswith("/pausar"):
            return self._pausar()
        if self.path.startswith("/armar-pausa"):
            return self._armar_pausa()
        if self.path.startswith("/copiloto"):
            return self._copiloto()
        if self.path.startswith("/cola/hecho"):
            return self._cerrar()
        if not self.path.startswith("/refrescar"):
            return self._send(404, "no")
        with _lock:
            if _estado["corriendo"]:
                return self._send(409, json.dumps({"error": "ya está corriendo"}),
                                  "application/json")
        threading.Thread(target=refrescar, daemon=True).start()
        return self._send(202, json.dumps({"ok": True}), "application/json")


def sembrar_datos():
    """Si DATA apunta a un volumen recién creado, copia el corte de CRM que viene
    en el repo para que el primer arranque tenga de dónde partir aunque falte token."""
    semilla = os.path.join(HERE, "data", "crm_recon.json")
    destino = os.path.join(DATA, "crm_recon.json")
    if os.path.abspath(semilla) == os.path.abspath(destino) or os.path.exists(destino):
        return
    try:
        import shutil
        shutil.copy2(semilla, destino)
        print("Sembrado el corte inicial de CRM en %s" % destino, flush=True)
    except Exception as e:
        print("No se pudo sembrar el corte inicial: %s" % e, flush=True)


if __name__ == "__main__":
    os.makedirs(DATA, exist_ok=True)
    os.makedirs(OUT, exist_ok=True)
    sembrar_datos()
    _estado["arranques"] += 1
    if not (USER and PASS):
        print("AVISO: faltan DASH_USER/DASH_PASS — el servicio responderá 401 a todo.", flush=True)
    threading.Thread(target=bucle, daemon=True).start()
    print("Dashboard escuchando en :%d · refresh cada %sh" % (PORT, REFRESH_HOURS), flush=True)
    ThreadingHTTPServer(("0.0.0.0", PORT), H).serve_forever()
