# Dashboard Ventas

Capa de **sincronía omnicanal** del CRM de Kenet Solar más un dashboard de control de asesores encima. Lee **Kommo** con las mismas credenciales y reglas que el salesbot (`rcc622/Kommo-ia`) y el dashboard de marketing (`rcc622/MKT-Autonomus`), guarda un snapshot normalizado (volumen o Postgres) y lo expone en JSON/CSV para el dashboard, Google Sheets, mesa de ayuda, comisiones y las integraciones que vengan. Corre en Railway.

> El dashboard visual va a cambiar. Lo que se queda es la capa de datos: `src/lib` (fuentes, modelo, sync, store, exportes) y las rutas `/api/*`.

## Qué sincroniza

De Kommo, para la ventana `KOMMO_LOOKBACK_DAYS` (default 120 días; leads creados, cerrados o tocados en ese periodo):

| Entidad | Detalle |
|---|---|
| Leads | pipeline, etapa, asesor, monto, fechas, etiquetas, razón de descarte, `utm_*`, origen, id de anuncio, recibo CFE, intentos de llamada, cotización entregada, levantamiento solicitado, última asignación, mensajes del cliente |
| Contactos | ciudad (**vive en el contacto**, no en el lead), interés, teléfono (llave de dedup), última asignación |
| Asesores | nombre, activo, vendedor o no (admins/sistema no cuentan), zona por grupo `KS-<zona>` |
| Tareas | abiertas (para vencidas / sin tarea) y completadas (como actividad) |
| Actividades | tarea completada, llamada contestada / no contestada (notas `call_in`/`call_out` del lead **y** del contacto, patas de Twilio colapsadas), cotización, levantamiento, descarte, asignación |

Cada lead sale clasificado con las reglas canónicas compartidas con los otros dos proyectos:

- **Canal** (`src/lib/kenet/canal.ts`, mismo criterio que `canal_del_lead` de MKT-Autonomus + TikTok y Google por `utm_source`): Meta Ads · Google Ads · TikTok Ads · Web orgánico · Redes orgánico · Referido · Directo · Sin origen.
- **Zona** (`src/lib/kenet/zonas.ts`, port de `zonas.py`): MTY · SLT · TRC · MVA · FUERA · AMBIGUO · SIN_DATO a partir de la ciudad del contacto; `zonaEfectiva` cae a la zona del asesor o del número de WhatsApp cuando no hay ciudad.
- **IDs de la cuenta** (`src/lib/kenet/ids.ts`): pipelines, etapas, campos personalizados, usuarios, fuentes de chat. Si cambia algo en Kommo se cambia ahí (y en Kommo-ia / MKT-Autonomus).

## Cómo corre la sincronía

```
arranque ──► carga snapshot persistido ──► incremental (o completa si el snapshot es viejo)
cada SYNC_INTERVAL_MIN (10 min) ──► incremental: solo leads tocados desde el último corte (+15 min de margen),
                                     sus contactos, tareas, eventos y llamadas nuevas, fusionados sobre el snapshot
cada REFRESH_HOURS (6 h)        ──► completa: vuelve a bajar toda la ventana (limpia borrados/fusionados)
webhook de Kommo                ──► agenda una incremental (agrupa avisos en 20 s)
«Actualizar» en el dashboard    ──► incremental inmediata
```

- Una sola corrida a la vez; si falla, se conserva el último snapshot bueno y el error queda visible en `/api/sync/status` y en pantalla.
- Respeta el límite de Kommo (7 req/s), pagina de 250 en 250 y reintenta ante `429`/`5xx`.
- Todo queda en la bitácora `sync_runs` (modo, motivo, duración, peticiones, conteos, error).

### Persistencia

| Opción | Cuándo | Cómo |
|---|---|---|
| **Volumen** (`DASH_DATA`, default `./data`) | arranque rápido, igual que `mkt-dashboard` | En Railway: Settings → Volumes → montar en `/data` y poner `DASH_DATA=/data`. Guarda `snapshot.json` y `sync-runs.jsonl`. |
| **Postgres** (`DATABASE_URL`) | cuando otras integraciones deban leer el CRM por SQL | Railway → New → Database → Postgres y `DATABASE_URL=${{Postgres.DATABASE_URL}}`. Crea solas las tablas `crm_leads`, `crm_contacts`, `crm_advisors`, `crm_pipelines`, `crm_tasks`, `crm_activities`, `crm_snapshot`, `sync_runs`. También sirve la cadena de Supabase. |

Si existe `DATABASE_URL` manda Postgres; si no, el volumen. Sin ninguno de los dos funciona igual, pero cada deploy arranca de cero (y vuelve a bajar todo).

## Deploy en Railway

### ¿Environment nuevo, proyecto nuevo o servicio nuevo?

- **Servicio nuevo dentro del proyecto existente** (`hearty-intuition`, environment `production`): es la opción correcta. Ahí ya viven `kommo-salesbot-ia`, `mkt-dashboard` y `mkt-dashboard-kommo`; un servicio más comparte con ellos variables por referencia y red privada, y es donde se van a colgar mesa de ayuda, comisiones y lo que siga.
- **Environment nuevo: no.** Un environment de Railway es una copia paralela de *todo* el proyecto (production / staging): duplicaría los servicios, no compartiría datos y no «conecta» nada. Tiene sentido después, como `staging`, para probar sin tocar producción.
- **Proyecto nuevo: tampoco.** Aislaría el dashboard justo de los servicios con los que tiene que hablar.

### Pasos

1. Railway → proyecto `hearty-intuition` → **New → GitHub Repo → `rcc622/Dashboard-Ventas`**, rama `main` (o la rama de trabajo). Railway detecta Next.js, corre `npm run build` y arranca con `npm run start`. `railway.json` trae healthcheck en `/api/health` y política de reinicio.
2. **Variables** (Settings → Variables), tomando el token del salesbot por referencia, sin copiarlo:
   ```
   KOMMO_SUBDOMAIN=${{kommo-salesbot-ia.KOMMO_SUBDOMAIN}}
   KOMMO_LONG_TOKEN=${{kommo-salesbot-ia.KOMMO_LONG_TOKEN}}
   DASH_USER=admin
   DASH_PASS=<contraseña>
   DASH_DATA=/data
   KOMMO_WEBHOOK_SECRET=<cadena larga>
   ```
   Opcionales: `KOMMO_PIPELINES=14175132,14157248,14213728,12753132` (solo Ventas, Cadencia, Hunting y Leads Nuevos, como el Sheet), `DATABASE_URL=${{Postgres.DATABASE_URL}}`, `SYNC_INTERVAL_MIN`, `REFRESH_HOURS`, `KOMMO_LOOKBACK_DAYS`.
3. **Volumen**: Settings → Volumes → Add Volume → mount path `/data`.
4. **Dominio**: Settings → Networking → Generate Domain.
5. Comprobar: `https://<dominio>/api/health` → `"source":"kommo"`; `https://<dominio>/estado` → última corrida y conteos.

### Webhook de Kommo (refresco al instante)

Kommo → Ajustes → Integraciones → **Webhooks** → Agregar:

- URL: `https://<dominio>/api/webhooks/kommo?key=<KOMMO_WEBHOOK_SECRET>`
- Eventos: lead agregado / editado / cambio de etapa / cambio de responsable, tarea agregada / completada, contacto editado.

El webhook no pasa por el Basic Auth (Kommo no puede mandarlo); lo protege el secreto de la URL. Sin webhook todo sigue funcionando con el ciclo de 10 minutos.

### Conexión con Kommo

Railway tiene salida HTTPS libre: la app consulta la API de Kommo directo, sin IP fija ni intermediarios. El token es el de larga duración de la integración privada del salesbot (Kommo → Ajustes → Integraciones → integración privada → Keys and scopes). Hereda los permisos del usuario que creó la integración; para leer `/users` (nombres y grupos de asesores) debe ser administrador. Si no, el tablero muestra a los asesores por ID y lo avisa.

## Rutas

| Ruta | Descripción |
|---|---|
| `/` | Dashboard. `?dias=7\|30\|90\|180`, `&refresh=1` fuerza una incremental. |
| `/api/health` · `/salud` | Liveness para Railway (sin auth). Incluye resumen de la sincronía. |
| `/api/sync/status` · `/estado` | Estado: última corrida buena, error, si está desfasada, próximas corridas, conteos, últimas 20 corridas. |
| `POST /api/sync/run?mode=full\|incremental&wait=1` · `/refrescar` | Dispara una corrida. Sin `wait=1` responde 202 y corre en fondo. |
| `POST /api/webhooks/kommo?key=…` | Webhook de Kommo. |
| `/api/export/leads.csv` · `.json` | Un renglón por lead. Las primeras 28 columnas son las de `Leads_Data` del Sheet; después van canal, origen, zona, ciudad, utm, teléfono… |
| `/api/export/actividades.csv` · `.json` | Un renglón por actividad. Primeras 6 columnas = `Eventos_Data` del Sheet. |
| `/api/snapshot?dias=30&full=1` | Métricas calculadas (+ snapshot normalizado completo con `full=1`). |

Todo menos `/api/health`, `/salud` y `/api/webhooks/*` pide Basic Auth cuando existe `DASH_PASS`.

### Sheets / Apps Script

Para alimentar el Sheet actual (o cualquier otro) desde aquí en vez de pegarle a Kommo:

```js
var r = UrlFetchApp.fetch('https://<dominio>/api/export/leads.csv', {
  headers: { Authorization: 'Basic ' + Utilities.base64Encode('admin:' + PASS) }
});
var filas = Utilities.parseCsv(r.getContentText());
```

## Integraciones (mesa de ayuda, comisiones, …)

- **Lectura del CRM**: con `DATABASE_URL` las tablas `crm_*` quedan en Postgres; mesa de ayuda (Supabase) y comisiones (Supabase) pueden consultarlas por SQL, o consumir `/api/export/*.json` por HTTP. Si se prefiere una sola base, `DATABASE_URL` acepta la cadena de conexión de Supabase.
- **Nuevas fuentes**: un archivo en `src/lib/sources/<nombre>.ts` que implemente `DataSource` (y opcionalmente `fetchIncremental`), registrado en `src/lib/sources/index.ts`. Métricas, exportes y UI no cambian: solo conocen el modelo normalizado (`src/lib/model.ts`).

## Variables de entorno

| Variable | Default | Descripción |
|---|---|---|
| `KOMMO_SUBDOMAIN` | — | Subdominio de la cuenta (`samuelkenetsolarcom`). |
| `KOMMO_LONG_TOKEN` | — | Token de larga duración (se acepta `KOMMO_ACCESS_TOKEN`). |
| `KOMMO_LOOKBACK_DAYS` | `120` | Ventana del corte completo. |
| `KOMMO_PIPELINES` | todos los no archivados | Ids de pipelines a incluir, separados por coma. |
| `KOMMO_WEBHOOK_SECRET` | — | Clave que debe traer la URL del webhook (`?key=`). |
| `SYNC_INTERVAL_MIN` | `10` | Minutos entre incrementales. |
| `REFRESH_HOURS` | `6` | Horas entre cortes completos. |
| `SYNC_DISABLED` | — | `1` apaga el programador (CI). |
| `DASH_DATA` | `./data` | Directorio del snapshot (volumen `/data` en Railway). Alias: `DATA_DIR`. |
| `DATABASE_URL` | — | Postgres; si existe manda sobre el volumen. |
| `DASH_USER` / `DASH_PASS` | `admin` / — | Basic Auth (alias `DASHBOARD_USER` / `DASHBOARD_PASSWORD`). |
| `DASHBOARD_STALE_DAYS` | `3` | Días sin movimiento para «sin atención». |
| `DASHBOARD_TZ` | `America/Monterrey` | Zona horaria de fechas y exportes. |
| `KOMMO_BASE_URL` | — | Avanzado: URL base completa (pruebas). |

## Arquitectura

```
src/lib/kenet/        ids.ts (IDs de la cuenta) · canal.ts (canal) · zonas.ts (zona)
src/lib/sources/      kommo.ts (API v4: corte completo e incremental) · mock.ts (demo) · index.ts (registro)
src/lib/model.ts      modelo normalizado: Advisor, Pipeline, Lead, Contact, Task, Activity, Snapshot, SyncRun
src/lib/sync/         engine.ts (una corrida a la vez, estado, bitácora) · scheduler.ts (10 min / 6 h)
src/lib/store/        file.ts (volumen) · postgres.ts (tablas crm_*)
src/lib/export.ts     Leads_Data / Eventos_Data compatibles con el Sheet
src/lib/metrics.ts    métricas del dashboard
src/app/              página, rutas /api/*, proxy.ts (Basic Auth), instrumentation.ts (arranque del programador)
tests/kenet.test.ts   casos de zona (los mismos de zonas.py) y de canal
```

Stack: Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4, Recharts 3, `pg`.

## Correr en local

```bash
npm install
cp .env.example .env.local     # llenar KOMMO_SUBDOMAIN y KOMMO_LONG_TOKEN
npm run dev                    # http://localhost:3000 (sin .env.local arranca en demo)
npm run build && npm run start # producción
npm run typecheck              # tipos
npm run test:unit              # reglas de zona y canal
```
