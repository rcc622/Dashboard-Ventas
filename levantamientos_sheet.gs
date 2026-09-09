/**
 * Levantamientos → dashboard /ventas. Lectura, nada más.
 *
 * Devuelve en JSON los levantamientos de ayuda a cierre de las dos fuentes que hoy existen:
 *
 *   1. EXCEL DE MTY «LEVANTAMIENTOS (Responses)», pestaña «2026 Levantamientos». Es el que
 *      operaciones mantiene a mano: columna Estado («Completada» / «No iniciada») y Fecha
 *      Finalización. Solo cuentan las prioridades de CIERRE (Randall 9-sep): las de
 *      «Instalación F y R», TICKET, FIDE, baterías y PTR son visitas de post-venta y no entran.
 *
 *   2. SHEET NUEVO POR ZONA «Reporte de levantamiento — Kenet Solar (respuestas)», pestañas
 *      MTY / SLT / MVA / TRC, que llenan las cuadrillas desde el formulario. La respuesta
 *      «¿Se realizó el levantamiento?» es la que manda. Monterrey se mudará aquí; mientras
 *      tanto conviven las dos fuentes y cada fila dice de cuál viene.
 *
 * DESPLIEGUE (una vez):
 *   1. script.google.com → Nuevo proyecto → pega este archivo → guarda.
 *   2. Implementar → Nueva implementación → «Aplicación web»:
 *        Ejecutar como: Yo · Quién tiene acceso: Cualquier persona
 *      (lo protege el TOKEN; sin «cualquier persona» Railway no entra).
 *   3. Autoriza (Revisar permisos → Permitir).
 *   4. Copia la URL /exec y ponla en Railway, servicio mkt-ventas:
 *        LEVANTAMIENTOS_URL=<url>
 *   OJO: editar el código NO actualiza la URL /exec. Después de cada cambio hay que ir a
 *   Implementar → Administrar implementaciones → ✏️ → Versión: «Nueva versión» → Implementar.
 *
 * Uso:  GET  <url>?token=kenet-levantamientos-2026            → todo
 *       GET  <url>?token=…&dias=180                           → solo lo de los últimos 180 días
 *       GET  <url>?token=…&accion=ping                        → prueba de vida, sin datos
 */

var TOKEN = 'kenet-levantamientos-2026';   // el mismo que LEVANTAMIENTOS_TOKEN en Railway
var DIAS_DEFAULT = 400;                    // ventana por defecto, por fecha de solicitud o de visita

// --- Fuente 1: el Excel de MTY que llena operaciones ---
var MTY_ID = '1Tddw84Fcri4oXyyW8eigPocCuTxZBHMku_-5y117P9U';
var MTY_GID = 574652653;                   // pestaña «2026 Levantamientos» (por gid: sobrevive renombres)
// Prioridades que SÍ son ayuda a cierre. Se compara en minúsculas y sin acentos.
var PRIORIDADES = ['ayuda cierre', 'urgente cierre', 'urgente mejoravit', 'urgente cierre comercial'];

// --- Fuente 2: el sheet nuevo, una pestaña por zona ---
var FORM_ID = '1blqheWiJMFEmMPnGyGnGl7wSO6_IfXizRliQ2VSHzps';
var FORM_ZONAS = ['MTY', 'SLT', 'MVA', 'TRC'];

function doGet(e) {
  try {
    var p = (e && e.parameter) || {};
    if (String(p.token || '') !== TOKEN) return _json({ error: 'token invalido' });
    if (p.accion === 'ping') return _json(_ping());
    var dias = Number(p.dias || DIAS_DEFAULT);
    // En SEGUNDOS, como `_ts`: comparar contra milisegundos dejaba fuera TODAS las filas.
    var desde = dias > 0 ? Math.round((Date.now() - dias * 86400000) / 1000) : 0;
    var filas = _delExcelMty(desde).concat(_delFormPorZona(desde));
    return _json({ ok: true, generado: new Date().toISOString(), dias: dias, filas: filas });
  } catch (err) {
    return _json({ error: String(err).slice(0, 300) });
  }
}

/** Prueba de vida: confirma que las dos hojas se abren y cuántas filas tienen, sin traer datos. */
function _ping() {
  var out = { ok: true, mty: null, form: {} };
  try {
    var sh = _pestanaPorGid(MTY_ID, MTY_GID);
    out.mty = { hoja: sh.getName(), filas: Math.max(0, sh.getLastRow() - 1) };
  } catch (err) {
    out.mty = { error: String(err).slice(0, 140) };
  }
  FORM_ZONAS.forEach(function (z) {
    try {
      var s = SpreadsheetApp.openById(FORM_ID).getSheetByName(z);
      out.form[z] = s ? Math.max(0, s.getLastRow() - 1) : 'no existe la pestaña';
    } catch (err) {
      out.form[z] = String(err).slice(0, 140);
    }
  });
  return out;
}

// ---------------------------------------------------------------- fuente 1: Excel de MTY
function _delExcelMty(desde) {
  var sh = _pestanaPorGid(MTY_ID, MTY_GID);
  var datos = sh.getDataRange().getValues();
  if (datos.length < 2) return [];
  var col = _columnas(datos[0], {
    asesor: ['ya cuando', 'asesor'], cliente: ['cliente'], tel: ['telefono', 'teléfono'],
    paneles: ['paneles'], municipio: ['municipio'], prioridad: ['prioridad'],
    solicitud: ['fecha solicitud'], fin: ['fecha finalizacion', 'fecha finalización'],
    estado: ['estado'], lead: ['lead_id']
  });
  var out = [];
  for (var i = 1; i < datos.length; i++) {
    var r = datos[i];
    var prio = _norm(_v(r, col.prioridad));
    if (PRIORIDADES.indexOf(prio) < 0) continue;              // fuera lo que no es ayuda a cierre
    var sol = _ts(_v(r, col.solicitud)), fin = _ts(_v(r, col.fin));
    if (desde && Math.max(sol, fin) && Math.max(sol, fin) < desde) continue;
    var estado = String(_v(r, col.estado) || '').trim();
    if (!sol && !fin && !_v(r, col.cliente)) continue;         // fila vacía
    out.push({
      fuente: 'excel-mty', zona: 'MTY',
      asesor: String(_v(r, col.asesor) || '').trim(),
      cliente: String(_v(r, col.cliente) || '').trim(),
      tel: String(_v(r, col.tel) || '').trim(),
      municipio: String(_v(r, col.municipio) || '').trim(),
      prioridad: String(_v(r, col.prioridad) || '').trim(),
      paneles: Number(_v(r, col.paneles)) || 0,
      solicitado: sol, finalizado: fin,
      estado: estado,
      hecho: /complet/i.test(estado) || !!fin,
      lead: String(_v(r, col.lead) || '').trim()
    });
  }
  return out;
}

// ---------------------------------------------------------------- fuente 2: el sheet por zona
function _delFormPorZona(desde) {
  var ss = SpreadsheetApp.openById(FORM_ID);
  var out = [];
  FORM_ZONAS.forEach(function (z) {
    var sh = ss.getSheetByName(z);
    if (!sh || sh.getLastRow() < 2) return;
    var datos = sh.getDataRange().getValues();
    var col = _columnas(datos[0], {
      marca: ['marca temporal'], zona: ['zona'], tecnico: ['tecnico', 'técnico'],
      fecha: ['fecha del levantamiento'], cliente: ['nombre del cliente'],
      tel: ['telefono del cliente', 'teléfono del cliente'],
      realizo: ['se realizo el levantamiento', 'se realizó el levantamiento'],
      municipio: ['municipio'], paneles: ['paneles que caben']
    });
    for (var i = 1; i < datos.length; i++) {
      var r = datos[i];
      var visita = _ts(_v(r, col.fecha)) || _ts(_v(r, col.marca));
      if (desde && visita && visita < desde) continue;
      var cliente = String(_v(r, col.cliente) || '').trim();
      if (!cliente && !visita) continue;
      var resp = String(_v(r, col.realizo) || '').trim();
      out.push({
        fuente: 'form-zonas', zona: z,
        asesor: String(_v(r, col.tecnico) || '').trim(),   // en el form el que reporta es el técnico
        cliente: cliente,
        tel: String(_v(r, col.tel) || '').trim(),
        municipio: String(_v(r, col.municipio) || '').trim(),
        prioridad: '', paneles: Number(_v(r, col.paneles)) || 0,
        // El reporte se llena DESPUÉS de ir: la fecha de la visita es a la vez solicitud y cierre.
        solicitado: visita, finalizado: /^s[ií]/i.test(resp) ? visita : 0,
        estado: resp,
        hecho: /^s[ií]/i.test(resp),
        lead: ''
      });
    }
  });
  return out;
}

// ---------------------------------------------------------------- utilidades
/** La pestaña por gid, no por nombre: si alguien la renombra esto sigue funcionando. */
function _pestanaPorGid(id, gid) {
  var hojas = SpreadsheetApp.openById(id).getSheets();
  for (var i = 0; i < hojas.length; i++) if (hojas[i].getSheetId() === gid) return hojas[i];
  throw new Error('no existe la pestaña gid ' + gid);
}

/** Encabezado → índice de columna, buscando por texto normalizado. -1 si no está. */
function _columnas(encabezado, mapa) {
  var norm = encabezado.map(function (h) { return _norm(h); });
  var out = {};
  for (var k in mapa) {
    out[k] = -1;
    for (var i = 0; i < mapa[k].length && out[k] < 0; i++) {
      var buscado = _norm(mapa[k][i]);
      for (var j = 0; j < norm.length; j++) {
        if (norm[j] && norm[j].indexOf(buscado) >= 0) { out[k] = j; break; }
      }
    }
  }
  return out;
}

function _v(fila, i) { return i >= 0 && i < fila.length ? fila[i] : ''; }

/** Fecha (o texto de fecha) → epoch en SEGUNDOS; 0 si no se puede leer. */
function _ts(v) {
  if (!v) return 0;
  if (Object.prototype.toString.call(v) === '[object Date]') return Math.round(v.getTime() / 1000);
  var d = new Date(v);
  return isNaN(d.getTime()) ? 0 : Math.round(d.getTime() / 1000);
}

/** minúsculas, sin acentos y con los espacios colapsados, para comparar sin sorpresas. */
// Los combining marks van escapados: si se escriben literales, Apps Script no guarda el archivo.
function _norm(s) {
  return String(s == null ? '' : s).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/\s+/g, ' ').trim();
}

function _json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
