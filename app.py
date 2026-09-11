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
import base64, gzip, hashlib, hmac, json, os, re, secrets, subprocess, sys, threading, time, traceback
import urllib.error, urllib.parse, urllib.request
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
# Link «Ventas» de la barra flotante: en marketing apunta al servicio mkt-ventas.
VENTAS_URL = os.environ.get("VENTAS_URL") or "/ventas/"
VENTAS_JSON = os.path.join(DATA, "ventas.json")
# VENTAS_PUBLICO=1 sirve /ventas (tablero, corte, config, histórico) SIN contraseña; pedido de
# Randall 4-sep. Solo /ventas: /estado, /cola, /pausar y la portada de marketing siguen con auth.
VENTAS_PUBLICO = (os.environ.get("VENTAS_PUBLICO") or "").strip().lower() in ("1", "true", "si", "sí")
VENTAS_USUARIOS = os.path.join(DATA, "ventas_usuarios.json")  # accesos por usuario/contraseña de /ventas (POST /ventas/usuarios)
VENTAS_SECRET_FILE = os.path.join(DATA, "ventas_secret.txt")   # firma de la cookie de sesión si no hay VENTAS_SECRET
VENTAS_CONFIG = os.path.join(DATA, "ventas_config.json")   # metas en pesos desde la página (POST /ventas/config)
# El acomodo del tablero de CADA CUENTA (Randall 9-sep: «al ser una cuenta de usuario, web y móvil
# deben mostrar lo mismo»). Antes vivía solo en el localStorage del navegador, así que el teléfono
# empezaba de cero. {uid: {clave: layout}}; el layout es opaco para el servidor, solo se acota.
VENTAS_TABLEROS = os.path.join(DATA, "ventas_tableros.json")
TABLERO_MAX = 200_000       # bytes por cuenta: un acomodo con gráficas propias ronda los 10 KB
CLAVE_TABLERO = re.compile(r"^[a-z0-9][a-z0-9:_-]{0,59}$")


def leer_tableros():
    try:
        with open(VENTAS_TABLEROS, encoding="utf-8") as f:
            d = json.load(f)
        return d if isinstance(d, dict) else {}
    except (OSError, ValueError):
        return {}


def validar_tablero(body):
    """(clave, layout) del cuerpo; `layout` None = borrar. Levanta ValueError si viene mal."""
    if not isinstance(body, dict):
        raise ValueError("cuerpo inválido")
    clave = str(body.get("clave") or "")
    if not CLAVE_TABLERO.match(clave):
        raise ValueError("clave inválida")
    layout = body.get("layout")
    if layout is None:
        return clave, None
    # Cualquier ajuste chico de la vista: el acomodo de widgets («admin», «ficha») o las columnas
    # elegidas de una tabla («cols-asesores»). El servidor solo lo acota; la forma la valida quien lo usa.
    if not isinstance(layout, dict):
        raise ValueError("layout inválido")
    if len(json.dumps(layout)) > TABLERO_MAX:
        raise ValueError("layout demasiado grande")
    return clave, layout
VENTAS_HIST = os.path.join(DATA, "ventas_hist.jsonl")      # foto diaria del pipeline (la escribe ventas_corte.py)
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
  <a href="%(ventas_url)s" style="color:#9AA8C6;font-weight:700;text-decoration:none" title="Dashboard de ventas">Ventas &rsaquo;</a>
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


_SLUG = re.compile(r"^[a-z0-9][a-z0-9-]{0,60}$")
_ZONA = re.compile(r"^[A-Z]{2,15}$")   # MTY… y también SEGUIMIENTO / TRAINING (grupos KS-* de Kommo)


def validar_config(body):
    """Configuración de metas de /ventas: solo llaves conocidas, números en rango, slugs
    y zonas sanas. Devuelve el objeto limpio o lanza ValueError con el motivo."""
    if not isinstance(body, dict):
        raise ValueError("el cuerpo debe ser un objeto")

    def numero(v, nombre, minimo):
        try:
            x = float(v)
        except (TypeError, ValueError):
            raise ValueError("%s no es un número" % nombre)
        if x != x or x < minimo or x > 1e12:
            raise ValueError("%s fuera de rango" % nombre)
        return x

    def tabla(v, nombre, patron):
        if v is None:
            return {}
        if not isinstance(v, dict) or len(v) > 500:
            raise ValueError("%s debe ser un objeto" % nombre)
        out = {}
        for k, x in v.items():
            if not isinstance(k, str) or not patron.match(k):
                raise ValueError("llave inválida en %s: %r" % (nombre, k))
            out[k] = int(round(numero(x, "%s[%s]" % (nombre, k), 0)))
        return out

    ocultos = body.get("ocultos") or []
    if not isinstance(ocultos, list) or len(ocultos) > 500 or not all(isinstance(x, str) and _SLUG.match(x) for x in ocultos):
        raise ValueError("ocultos debe ser una lista de asesores")
    equipos = body.get("equipos") or {}
    if not isinstance(equipos, dict) or len(equipos) > 500:
        raise ValueError("equipos debe ser un objeto")
    for k, v in equipos.items():
        if not (isinstance(k, str) and _SLUG.match(k) and isinstance(v, str) and (v == "-" or _ZONA.match(v))):
            raise ValueError("equipo inválido: %r" % ((k, v),))
    cmap = body.get("comisiones_map") or {}
    if not isinstance(cmap, dict) or len(cmap) > 500:
        raise ValueError("comisiones_map debe ser un objeto")
    for k, v in cmap.items():
        if not (isinstance(k, str) and 0 < len(k) <= 80 and isinstance(v, str) and (v == "" or _SLUG.match(v))):
            raise ValueError("cruce de comisiones inválido: %r" % ((k, v),))
    return {"meta_mxn": int(round(numero(body.get("meta_mxn", 800000), "meta_mxn", 1))),
            "cotizado_x": round(numero(body.get("cotizado_x", 10), "cotizado_x", 0.1), 2),
            "cotizado_dias": int(round(numero(body.get("cotizado_dias", 90), "cotizado_dias", 1))),
            "metas_zona": tabla(body.get("metas_zona"), "metas_zona", _ZONA),
            "metas": tabla(body.get("metas"), "metas", _SLUG),
            "ocultos": sorted(set(ocultos)), "equipos": dict(equipos), "comisiones_map": dict(cmap)}


# ---------------------------------------------------------------- accesos de /ventas
# Pedido de Randall 4-sep: cada asesor y cada administrador entra con su usuario y contraseña.
# Los accesos viven en data/ventas_usuarios.json (contraseña = PBKDF2-SHA256 con sal, nunca en
# claro); la sesión es una cookie firmada con HMAC (VENTAS_SECRET o un secreto generado una vez
# en el volumen). Un asesor solo recibe SU parte del corte (ver corte_para); el admin, todo.
# DASH_USER/DASH_PASS siguen entrando como administrador: es la llave maestra si se pierde todo.
# Identificador de entrada: correo completo o usuario corto. Los dos conviven: las cuentas
# viejas siguen entrando con su usuario y las nuevas se dan de alta con el correo de la persona.
_USUARIO = re.compile(r"^[a-z0-9._+-]{3,64}$|^[a-z0-9._+-]{1,64}@[a-z0-9-]+(\.[a-z0-9-]+)+$")
_SESION_SEG = 30 * 86400
_LOGIN_FALLOS = {}           # ip -> [intentos, bloqueado_hasta]
_CORTE_CACHE = {"mtime": None, "corte": None}


def _secreto():
    s = os.environ.get("VENTAS_SECRET")
    if s:
        return s.encode("utf-8")
    try:
        with open(VENTAS_SECRET_FILE, "rb") as f:
            v = f.read().strip()
        if v:
            return v
    except FileNotFoundError:
        pass
    v = secrets.token_hex(32).encode("ascii")
    os.makedirs(DATA, exist_ok=True)
    with open(VENTAS_SECRET_FILE, "wb") as f:
        f.write(v)
    return v


def leer_usuarios():
    try:
        with open(VENTAS_USUARIOS, encoding="utf-8") as f:
            d = json.load(f)
        return [u for u in (d.get("usuarios") or []) if isinstance(u, dict)]
    except (FileNotFoundError, ValueError):
        return []


def hash_password(pwd, salt=None):
    salt = salt or secrets.token_hex(16)
    h = hashlib.pbkdf2_hmac("sha256", pwd.encode("utf-8"), bytes.fromhex(salt), 200_000).hex()
    return salt, h


def _b64(b):
    return base64.urlsafe_b64encode(b).decode("ascii").rstrip("=")


def _unb64(s):
    return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))


def firmar_sesion(uid, rol, nombre):
    cuerpo = _b64(json.dumps({"uid": uid, "rol": rol, "nombre": nombre, "exp": int(time.time()) + _SESION_SEG},
                             ensure_ascii=False).encode("utf-8"))
    return cuerpo + "." + hmac.new(_secreto(), cuerpo.encode("ascii"), hashlib.sha256).hexdigest()


def leer_sesion(token):
    try:
        cuerpo, firma = token.split(".", 1)
        if not hmac.compare_digest(firma, hmac.new(_secreto(), cuerpo.encode("ascii"), hashlib.sha256).hexdigest()):
            return None
        d = json.loads(_unb64(cuerpo).decode("utf-8"))
        if d.get("exp", 0) < time.time() or d.get("rol") not in ("admin", "asesor"):
            return None
        return d
    except Exception:
        return None


def autenticar(usuario, pwd):
    """Devuelve {uid, rol, nombre} o None. DASH_USER/DASH_PASS = administrador maestro."""
    usuario = (usuario or "").strip().lower()
    if USER and PASS and hmac.compare_digest(usuario, USER.lower()) and hmac.compare_digest(pwd or "", PASS):
        return {"uid": "admin", "rol": "admin", "nombre": "Administrador"}
    for u in leer_usuarios():
        if u.get("usuario") == usuario and u.get("salt") and u.get("hash"):
            if hmac.compare_digest(hash_password(pwd or "", u["salt"])[1], u["hash"]):
                if u.get("activo") is False:
                    return None
                return {"uid": u.get("id") or usuario, "rol": u.get("rol") or "asesor", "nombre": u.get("nombre") or usuario}
            return None
    return None


def validar_usuarios(body, actuales):
    """Lista completa de accesos que manda la página. Contraseña opcional: sin ella se conserva la
    que ya tenía ese usuario. Devuelve la lista lista para escribir (con salt/hash)."""
    if not isinstance(body, dict) or not isinstance(body.get("usuarios"), list) or len(body["usuarios"]) > 300:
        raise ValueError("usuarios debe ser una lista")
    previos = {u.get("usuario"): u for u in actuales}
    out, vistos = [], set()
    for x in body["usuarios"]:
        if not isinstance(x, dict):
            raise ValueError("acceso inválido")
        usuario = str(x.get("usuario") or "").strip().lower()
        if not _USUARIO.match(usuario):
            raise ValueError("«%s» no sirve para entrar: escribe un correo completo, o un usuario corto de 3 a 64 letras minúsculas, números, punto o guion" % usuario)
        if usuario in vistos or (USER and usuario == USER.lower()):
            raise ValueError("ese correo ya tiene cuenta: %s" % usuario)
        vistos.add(usuario)
        rol = x.get("rol") if x.get("rol") in ("admin", "asesor") else "asesor"
        activo = x.get("activo") is not False
        uid = str(x.get("id") or "").strip()
        if rol == "asesor" and not _SLUG.match(uid):
            raise ValueError("la cuenta %s debe estar ligada a un vendedor: sin eso no sabemos qué tablero mostrarle" % usuario)
        if rol == "admin":
            uid = "admin:" + usuario
        nombre = str(x.get("nombre") or usuario).strip()[:80]
        pwd = x.get("password")
        if pwd:
            if not isinstance(pwd, str) or len(pwd) < 6 or len(pwd) > 200:
                raise ValueError("la contraseña de %s debe tener al menos 6 caracteres" % usuario)
            salt, h = hash_password(pwd)
        elif usuario in previos and previos[usuario].get("hash"):
            salt, h = previos[usuario]["salt"], previos[usuario]["hash"]
        else:
            raise ValueError("falta la contraseña de %s" % usuario)
        out.append({"id": uid, "usuario": usuario, "nombre": nombre, "rol": rol, "activo": activo, "salt": salt, "hash": h})
    # A propósito NO se exige que quede un administrador en la lista: DASH_USER/DASH_PASS entra
    # siempre como administrador maestro, así que un tablero con puras cuentas de vendedor es
    # válido y común. La página lo avisa, pero no lo bloquea.
    return out


def usuarios_publicos(lista):
    return [{"id": u.get("id"), "usuario": u.get("usuario"), "nombre": u.get("nombre"), "rol": u.get("rol"),
             "activo": u.get("activo") is not False} for u in lista]


def corte_cargado():
    st = os.stat(VENTAS_JSON)
    if _CORTE_CACHE["mtime"] != st.st_mtime:
        with open(VENTAS_JSON, encoding="utf-8") as f:
            _CORTE_CACHE["corte"] = json.load(f)
        _CORTE_CACHE["mtime"] = st.st_mtime
    return _CORTE_CACHE["corte"]


# ---------------------------------------------------------------- Quitar de la asignación (pedido de Randall 5-sep)
# Es la función «Sanciones 24h» del Sheet «Dashboard Leads Kenet», ahora desde el tablero.
# Kommo: el server de turnos (Kommo Salesbot/fase1-webhook/sanciones.py) lee esa pestaña cada 60 s
#   por su Apps Script; SANCIONADO = sin leads nuevos hasta el corte de las 10:00 del día siguiente,
#   que reevalúa y reescribe TODAS las filas. Aquí se escribe la misma pestaña con la misma URL y
#   token que el servicio Kommo-ia (SANCIONES_SHEET_URL / SANCIONES_SHEET_TOKEN). El Apps Script
#   reemplaza la hoja completa con lo que se manda: se lee, se cambia UNA fila y se manda todo.
# HubSpot: el reparto de leads va por equipo, así que quitar = sacar al usuario de su equipo por la
#   API de usuarios (necesita los permisos settings.users.read/write y settings.users.teams.read en la
#   app privada) y guardar el equipo previo en el volumen para poder regresarlo. Nada de esto borra
#   ni reasigna leads ya asignados.
SANCIONES_URL = os.environ.get("SANCIONES_SHEET_URL", "").strip()
SANCIONES_TOKEN = os.environ.get("SANCIONES_SHEET_TOKEN", "kenet-sanciones-2026").strip()
VENTAS_SANCIONES = os.path.join(DATA, "ventas_sanciones.json")
_MTY = timezone(timedelta(hours=-6))   # Monterrey no tiene horario de verano desde 2022


def proximo_corte_10():
    ahora = datetime.now(_MTY)
    c = ahora.replace(hour=10, minute=0, second=0, microsecond=0)
    return c + timedelta(days=1) if ahora >= c else c


def sheet_sanciones(rows=None):
    """GET (rows=None) o POST (rows) al Apps Script de la pestaña. Apps Script contesta con una
    redirección 302 al resultado; urllib la sigue sola. Devuelve el JSON del script."""
    if not SANCIONES_URL:
        raise RuntimeError("falta SANCIONES_SHEET_URL en el servicio (la misma del servicio Kommo-ia)")
    if rows is None:
        req = urllib.request.Request(SANCIONES_URL + ("&" if "?" in SANCIONES_URL else "?") + urllib.parse.urlencode({"token": SANCIONES_TOKEN}))
    else:
        req = urllib.request.Request(SANCIONES_URL, data=json.dumps({"token": SANCIONES_TOKEN, "rows": rows}, ensure_ascii=False).encode("utf-8"),
                                     headers={"Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(req, timeout=40) as r:
        d = json.loads(r.read().decode("utf-8") or "{}")
    if d.get("error"):
        raise RuntimeError("el Sheet contestó: %s" % d["error"])
    return d


def filas_sheet():
    out = []
    for r in sheet_sanciones().get("rows") or []:
        try:
            uid = int(str(r.get("user_id")).strip())
        except (TypeError, ValueError):
            continue
        out.append({"user_id": uid, "nombre": r.get("nombre") or "", "estado": str(r.get("estado") or "").strip().upper(),
                    "motivo": r.get("motivo") or "", "hasta": r.get("hasta") or "", "por": r.get("por") or ""})
    return out


def leer_sanciones_local():
    try:
        with open(VENTAS_SANCIONES, encoding="utf-8") as f:
            d = json.load(f)
        d.setdefault("hubspot", {}); d.setdefault("bitacora", [])
        return d
    except (OSError, ValueError):
        return {"hubspot": {}, "bitacora": []}


def escribir_json(ruta, obj):
    os.makedirs(DATA, exist_ok=True)
    tmp = ruta + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, indent=1)
    os.replace(tmp, ruta)


def hs_req(method, path, body=None):
    """Llamada a HubSpot con el token del servicio -> (status, json). Nunca imprime el token."""
    tok = os.environ.get("HUBSPOT_TOKEN", "")
    if not tok:
        raise RuntimeError("falta HUBSPOT_TOKEN")
    req = urllib.request.Request("https://api.hubapi.com" + path, data=json.dumps(body).encode() if body is not None else None, method=method,
                                 headers={"Authorization": "Bearer " + tok, "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=40) as r:
            raw = r.read().decode("utf-8")
            return r.status, (json.loads(raw) if raw.strip() else {})
    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8", "replace")
        try:
            return e.code, json.loads(raw)
        except ValueError:
            return e.code, {"message": raw[:300]}


def hs_usuario(owner_id):
    """Owner de HubSpot (lo que guarda el corte) -> usuario con sus equipos."""
    st, o = hs_req("GET", "/crm/v3/owners/%s" % owner_id)
    if st != 200 or not o.get("userId"):
        raise RuntimeError("el owner %s no tiene usuario (HTTP %s)" % (owner_id, st))
    st, u = hs_req("GET", "/settings/v3/users/%s" % o["userId"])
    if st == 403:
        raise RuntimeError("la app privada no tiene el permiso settings.users.read")
    if st != 200:
        raise RuntimeError("usuario %s: HTTP %s %s" % (o["userId"], st, str(u.get("message", ""))[:160]))
    return u


def hs_poner_equipos(user_id, primario, secundarios):
    st, r = hs_req("PUT", "/settings/v3/users/%s" % user_id, {"primaryTeamId": primario, "secondaryTeamIds": list(secundarios or [])})
    if st == 403:
        raise RuntimeError("la app privada no tiene el permiso settings.users.write (Ajustes › Integraciones › Apps privadas › Ámbitos)")
    if st >= 400:
        raise RuntimeError("no aceptó el cambio de equipo: HTTP %s %s" % (st, str(r.get("message", ""))[:200]))
    return r


def aplicar_sancion(uid, accion, motivo, por):
    """accion = quitar | reactivar. Cada CRM del asesor se intenta por separado: uno que falle no
    detiene al otro, y lo que falló va en `avisos` con la causa."""
    if accion not in ("quitar", "reactivar"):
        raise ValueError("acción desconocida")
    u = next((x for x in (corte_cargado().get("usuarios") or []) if x.get("id") == uid), None)
    if not u:
        raise ValueError("asesor desconocido")
    ids = u.get("ids") or {}
    firma = "Tablero · %s · %s" % (por, datetime.now(_MTY).strftime("%d/%m %H:%M"))
    res = {"uid": uid, "nombre": u["nombre"], "accion": accion, "kommo": None, "hubspot": None, "avisos": []}
    if ids.get("kommo") is not None:
        try:
            filas = filas_sheet()
            fila = {"user_id": int(ids["kommo"]), "nombre": u["nombre"], "estado": "SANCIONADO" if accion == "quitar" else "ACTIVO",
                    "motivo": ((motivo.strip() + " · ") if motivo.strip() else "") + firma if accion == "quitar" else "reactivado · " + firma,
                    "hasta": proximo_corte_10().strftime("%d/%m/%Y 10:00") if accion == "quitar" else "", "por": firma}
            i = next((k for k, f in enumerate(filas) if f["user_id"] == fila["user_id"]), None)
            if i is None:
                filas.append(fila)
            else:
                filas[i] = fila
            sheet_sanciones(filas)
            res["kommo"] = fila
        except Exception as e:  # noqa: BLE001
            res["avisos"].append("Kommo: %s" % e)
    if ids.get("hubspot") is not None:
        try:
            loc = leer_sanciones_local()
            if accion == "quitar":
                usr = hs_usuario(ids["hubspot"])
                prev = {"user_id": usr.get("id"), "primaryTeamId": usr.get("primaryTeamId"), "secondaryTeamIds": usr.get("secondaryTeamIds") or [],
                        "desde": time.time(), "por": firma, "motivo": motivo.strip()}
                if not prev["primaryTeamId"] and not prev["secondaryTeamIds"]:
                    res["avisos"].append("HubSpot: el usuario ya no estaba en ningún equipo")
                else:
                    hs_poner_equipos(usr["id"], None, [])
                    _, chk = hs_req("GET", "/settings/v3/users/%s" % usr["id"])
                    if chk.get("primaryTeamId") or chk.get("secondaryTeamIds"):
                        raise RuntimeError("no quitó el equipo por API; hay que hacerlo en Ajustes › Usuarios y equipos")
                loc["hubspot"][uid] = prev
                res["hubspot"] = prev
            else:
                prev = loc["hubspot"].pop(uid, None)
                if prev and (prev.get("primaryTeamId") or prev.get("secondaryTeamIds")):
                    hs_poner_equipos(prev["user_id"], prev.get("primaryTeamId"), prev.get("secondaryTeamIds"))
                elif not prev:
                    res["avisos"].append("HubSpot: no había registro del equipo previo; revisa Ajustes › Usuarios y equipos")
                res["hubspot"] = {"reactivado": True, "primaryTeamId": (prev or {}).get("primaryTeamId")}
            loc["bitacora"] = (loc["bitacora"] + [{"ts": time.time(), "uid": uid, "accion": accion, "por": por, "motivo": motivo.strip()}])[-500:]
            escribir_json(VENTAS_SANCIONES, loc)
        except Exception as e:  # noqa: BLE001
            res["avisos"].append("HubSpot: %s" % e)
    return res


def estado_sanciones():
    k = {"configurado": bool(SANCIONES_URL), "filas": [], "error": None, "proximo_corte": proximo_corte_10().strftime("%d/%m/%Y 10:00")}
    if SANCIONES_URL:
        try:
            k["filas"] = filas_sheet()
        except Exception as e:  # noqa: BLE001
            k["error"] = str(e)[:200]
    return {"kommo": k, "hubspot": {"quitados": leer_sanciones_local()["hubspot"]}}


def corte_para(uid):
    """El corte reducido a UN asesor: sus leads, actividades y tareas, y él solo en usuarios.
    Así un asesor con sesión no puede bajar la data de los demás aunque pida data.json a mano."""
    c = corte_cargado()
    f = dict(c)
    f["usuarios"] = [u for u in c.get("usuarios", []) if u.get("id") == uid]
    f["leads"] = [l for l in c.get("leads", []) if l.get("asesor_id") == uid]
    f["eventos"] = [e for e in c.get("eventos", []) if e.get("asesor_id") == uid]
    f["tareas_abiertas"] = [t for t in c.get("tareas_abiertas", []) if t.get("asesor_id") == uid]
    f["metas"] = {k: v for k, v in (c.get("metas") or {}).items() if k == uid}
    if isinstance(c.get("comisiones"), dict):
        com = c["comisiones"]
        f["comisiones"] = dict(com, vendedores=[v for v in com.get("vendedores", []) if v.get("asesor_id") == uid],
                               ventas=[v for v in com.get("ventas", []) if v.get("asesor_id") == uid])
    return json.dumps(f, ensure_ascii=False, separators=(",", ":")).encode("utf-8")


class H(BaseHTTPRequestHandler):
    server_version = "kenet-dash"

    def log_message(self, fmt, *a):
        pass

    def _send(self, code, body, ctype="text/html; charset=utf-8", extra=None):
        data = body.encode("utf-8") if isinstance(body, str) else body
        # El dashboard pasa del MB desde que cada bloque se pre-renderiza por
        # canal. Comprimirlo lo deja en ~una decima parte y el navegador lo
        # descomprime solo; se salta lo ya comprimido y lo que no es texto.
        extra = dict(extra or {})
        if (len(data) > 4096 and "Content-Encoding" not in extra
                and (ctype.startswith("text/") or ctype.startswith("application/json")
                     or ctype.startswith("application/javascript")
                     or ctype.startswith("image/svg"))
                and "gzip" in (self.headers.get("Accept-Encoding") or "")):
            data = gzip.compress(data, 6)
            extra["Content-Encoding"] = "gzip"
            extra["Vary"] = "Accept-Encoding"
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
        # En el servicio de marketing el tablero de ventas vive en otro servicio:
        # se manda allá (VENTAS_URL) en vez de servir datos de ejemplo.
        if DASH_MODO == "marketing":
            return self._send(302, "", extra={"Location": os.environ.get("VENTAS_URL") or "/"})
        if ruta == "/ventas":
            return self._send(302, "", extra={"Location": "/ventas/"})
        rel = ruta[len("/ventas/"):] or "index.html"
        if rel == "yo":
            ses = self._sesion()
            return self._send(200 if ses else 401, json.dumps(ses or {"error": "sin sesión"}, ensure_ascii=False), "application/json")
        if rel in ("data.json", "config.json", "hist.json"):
            ses = self._sesion()
            if not ses:
                return self._send(401, json.dumps({"error": "inicia sesión"}), "application/json")
        if rel == "data.json":
            try:
                if ses["rol"] == "asesor":
                    cuerpo = corte_para(ses["uid"])
                else:
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
        if rel == "tablero.json":
            # El acomodo guardado de ESTA cuenta, para que el teléfono vea lo mismo que la computadora.
            ses = self._sesion()
            if not ses:
                return self._send(401, json.dumps({"error": "sin sesión"}), "application/json")
            mios = leer_tableros().get(ses["uid"]) or {}
            return self._send(200, json.dumps({"tableros": mios}, ensure_ascii=False), "application/json")
        if rel == "config.json":
            try:
                with open(VENTAS_CONFIG, "rb") as f:
                    return self._send(200, f.read(), "application/json")
            except FileNotFoundError:
                return self._send(200, "{}", "application/json")
        if rel == "usuarios.json":
            ses = self._sesion()
            if not ses or ses["rol"] != "admin":
                return self._send(403 if ses else 401, json.dumps({"error": "solo administradores"}), "application/json")
            return self._send(200, json.dumps({"usuarios": usuarios_publicos(leer_usuarios())}, ensure_ascii=False), "application/json")
        if rel == "sanciones.json":
            ses = self._sesion()
            if not ses or ses["rol"] != "admin":
                return self._send(403 if ses else 401, json.dumps({"error": "solo administradores"}), "application/json")
            return self._send(200, json.dumps(estado_sanciones(), ensure_ascii=False), "application/json")
        if rel == "estado.json":
            # Estado del refresh para el botón «Actualizar» de /ventas (Randall 7-sep): cualquier sesión.
            if not self._sesion():
                return self._send(401, json.dumps({"error": "sin sesión"}), "application/json")
            try:
                mt = datetime.fromtimestamp(os.path.getmtime(VENTAS_JSON), TZ).isoformat(timespec="seconds")
            except OSError:
                mt = None
            with _lock:
                e = {k: _estado[k] for k in ("corriendo", "ultimo_intento", "ultimo_exito", "ok", "proximo")}
            e["corte_mtime"] = mt
            return self._send(200, json.dumps(e), "application/json")
        if rel == "hist.json":
            filas = []
            if os.path.exists(VENTAS_HIST):
                with open(VENTAS_HIST, encoding="utf-8") as f:
                    for ln in f:
                        if ln.strip():
                            try:
                                filas.append(json.loads(ln))
                            except ValueError:
                                pass
            return self._send(200, json.dumps(filas, ensure_ascii=False), "application/json")
        raiz = os.path.normpath(VENTAS_DIST)
        p = os.path.normpath(os.path.join(raiz, rel))
        if not p.startswith(raiz + os.sep) or not os.path.isfile(p):
            return self._send(404, "no")
        with open(p, "rb") as f:
            return self._send(200, f.read(), CTYPES.get(os.path.splitext(p)[1].lower(),
                                                        "application/octet-stream"))

    # ---- sesiones de /ventas
    def _sesion(self):
        for parte in (self.headers.get("Cookie") or "").split(";"):
            k, _, v = parte.strip().partition("=")
            if k == "ks_sesion" and v:
                return leer_sesion(v)
        return None

    def _ip(self):
        xff = self.headers.get("X-Forwarded-For") or ""
        return (xff.split(",")[0].strip() if xff else self.client_address[0]) or "?"

    def _cookie(self, valor, max_age):
        seguro = "; Secure" if (self.headers.get("X-Forwarded-Proto") or "").lower() == "https" else ""
        return "ks_sesion=%s; Path=/ventas; Max-Age=%d; HttpOnly; SameSite=Lax%s" % (valor, max_age, seguro)

    def _json_body(self, tope=60000):
        n = int(self.headers.get("Content-Length") or 0)
        return json.loads(self.rfile.read(min(n, tope)).decode("utf-8") or "{}")

    def _ventas_post(self, ruta):
        """POST bajo /ventas: login, logout, config (admin) y usuarios (admin)."""
        if DASH_MODO == "marketing":
            return self._send(404, json.dumps({"ok": False, "error": "este servicio no sirve ventas"}), "application/json")
        err = lambda code, msg: self._send(code, json.dumps({"ok": False, "error": msg}, ensure_ascii=False), "application/json")
        if ruta == "/ventas/refrescar":
            # Botón «Actualizar» (Randall 7-sep): regenera el corte ahora, solo administradores; una corrida a la vez.
            ses = self._sesion()
            if not ses or ses["rol"] != "admin":
                return err(403 if ses else 401, "solo administradores")
            with _lock:
                if _estado["corriendo"]:
                    return self._send(409, json.dumps({"ok": False, "corriendo": True, "error": "ya se está actualizando"}), "application/json")
            threading.Thread(target=refrescar, daemon=True).start()
            return self._send(202, json.dumps({"ok": True, "corriendo": True}), "application/json")
        if ruta == "/ventas/login":
            ip = self._ip()
            intentos, hasta = _LOGIN_FALLOS.get(ip, [0, 0])
            if hasta > time.time():
                return err(429, "demasiados intentos; espera un minuto")
            try:
                body = self._json_body(4000)
            except ValueError:
                return err(400, "cuerpo inválido")
            ses = autenticar(str(body.get("usuario") or ""), str(body.get("password") or ""))
            if not ses:
                intentos += 1
                _LOGIN_FALLOS[ip] = [intentos, time.time() + 60 if intentos >= 5 else 0]
                return err(401, "usuario o contraseña incorrectos")
            _LOGIN_FALLOS.pop(ip, None)
            return self._send(200, json.dumps({"ok": True, "yo": ses}, ensure_ascii=False), "application/json",
                              extra={"Set-Cookie": self._cookie(firmar_sesion(ses["uid"], ses["rol"], ses["nombre"]), _SESION_SEG)})
        if ruta == "/ventas/logout":
            return self._send(200, json.dumps({"ok": True}), "application/json", extra={"Set-Cookie": self._cookie("x", 0)})
        ses = self._sesion()
        if not ses:
            return err(401, "inicia sesión")
        if ruta == "/ventas/tablero":
            # Cada quien guarda SU acomodo; no hace falta ser administrador y nadie toca el de otro.
            try:
                clave, layout = validar_tablero(self._json_body(TABLERO_MAX + 2000))
            except (ValueError, TypeError) as e:
                return err(400, str(e))
            todos = leer_tableros()
            mios = dict(todos.get(ses["uid"]) or {})
            if layout is None:
                mios.pop(clave, None)
            else:
                mios[clave] = layout
            todos[ses["uid"]] = mios
            self._escribir(VENTAS_TABLEROS, todos)
            return self._send(200, json.dumps({"ok": True}), "application/json")
        if ruta == "/ventas/tablero/compartir":
            # Aplicarle MI acomodo a otras cuentas (Randall 10-sep: «el orden y acomodo que haga lo
            # pueda aplicar para ciertos usuarios o roles… para acomodarle la vista a los demás»).
            # Solo el administrador, solo a cuentas que existen, y lo que se copia son las mismas
            # claves que ya guarda cada quien (el acomodo, sus fechas, sus columnas).
            if ses["rol"] != "admin":
                return err(403, "solo administradores")
            try:
                cuerpo = self._json_body(TABLERO_MAX * 4)
                destinos = cuerpo.get("destinos") or []
                datos = cuerpo.get("datos") or {}
                if not isinstance(destinos, list) or not destinos:
                    raise ValueError("faltan las cuentas destino")
                if not isinstance(datos, dict) or not datos:
                    raise ValueError("no hay nada que aplicar")
                for clave in datos:
                    if not CLAVE_TABLERO.match(str(clave)):
                        raise ValueError("clave inválida: %s" % clave)
                if len(json.dumps(datos)) > TABLERO_MAX * 3:
                    raise ValueError("el acomodo es demasiado grande")
            except (ValueError, TypeError) as e:
                return err(400, str(e))
            validos = {u.get("id") for u in leer_usuarios()} | {"admin"}
            faltan = [d for d in destinos if d not in validos]
            if faltan:
                return err(400, "cuentas que no existen: " + ", ".join(map(str, faltan[:5])))
            todos = leer_tableros()
            # Marca de tiempo NUEVA: el navegador de la cuenta destino solo adopta lo de la cuenta si
            # es más reciente que lo que él guardó; con la marca vieja del administrador, un tablero que
            # esa persona hubiera tocado después ganaba y hasta pisaba lo compartido.
            ahora_ms = int(time.time() * 1000)
            for uid in destinos:
                suyo = dict(todos.get(uid) or {})
                for clave, valor in datos.items():
                    if valor is None:
                        suyo.pop(clave, None)
                    else:
                        suyo[clave] = dict(valor, ts=ahora_ms) if isinstance(valor, dict) else valor
                todos[uid] = suyo
            self._escribir(VENTAS_TABLEROS, todos)
            return self._send(200, json.dumps({"ok": True, "cuentas": len(destinos)}), "application/json")
        if ses["rol"] != "admin":
            return err(403, "solo administradores")
        if ruta == "/ventas/config":
            try:
                cfg = validar_config(self._json_body())
            except (ValueError, TypeError) as e:
                return err(400, str(e))
            self._escribir(VENTAS_CONFIG, cfg)
            return self._send(200, json.dumps({"ok": True, "config": cfg}, ensure_ascii=False), "application/json")
        if ruta == "/ventas/usuarios":
            try:
                lista = validar_usuarios(self._json_body(), leer_usuarios())
            except (ValueError, TypeError) as e:
                return err(400, str(e))
            self._escribir(VENTAS_USUARIOS, {"usuarios": lista})
            return self._send(200, json.dumps({"ok": True, "usuarios": usuarios_publicos(lista)}, ensure_ascii=False), "application/json")
        if ruta == "/ventas/sancion":
            b = self._json_body()
            if not isinstance(b, dict) or not isinstance(b.get("uid"), str):
                return err(400, "falta uid")
            try:
                res = aplicar_sancion(b["uid"], str(b.get("accion") or ""), str(b.get("motivo") or "")[:200], ses["nombre"] or ses["uid"])
            except ValueError as e:
                return err(400, str(e))
            return self._send(200, json.dumps({"ok": True, "resultado": res, "estado": estado_sanciones()}, ensure_ascii=False), "application/json")
        return err(404, "no")

    def _escribir(self, ruta, obj):
        os.makedirs(DATA, exist_ok=True)
        tmp = ruta + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(obj, f, ensure_ascii=False, indent=1)
        os.replace(tmp, ruta)

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
        if VENTAS_PUBLICO:
            if ruta == "/" and DASH_MODO == "ventas":
                return self._send(302, "", extra={"Location": "/ventas/"})
            if ruta == "/ventas" or ruta.startswith("/ventas/"):
                return self._ventas(ruta)
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
                              % (msg, BARRA % {"msg": "sin datos aún", "ventas_url": VENTAS_URL}))
        with open(p, encoding="utf-8") as f:
            doc = f.read()
        with _lock:
            ue, ok = _estado["ultimo_exito"], _estado["ok"]
        msg = ("actualizado %s" % ue[11:16]) if ue else "datos del archivo"
        if ok is False:
            msg = "último refresh falló"
        return self._send(200, doc + BARRA % {"msg": msg, "ventas_url": VENTAS_URL} + CHAT)

    def do_POST(self):
        ruta = self.path.split("?")[0]
        if ruta.startswith("/ventas/"):
            # Con VENTAS_PUBLICO la puerta es la sesión de /ventas; si no, primero el basic auth.
            if not VENTAS_PUBLICO and not self._autorizado():
                return self._pide_auth()
            return self._ventas_post(ruta)
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
