# Dashboard Ventas

Dashboard visual para el **control de asesores de ventas**. Lee el CRM (primera fuente: **Kommo**), normaliza la información y la presenta en un tablero pensado para monitoreo diario (pantalla en oficina, laptop o celular). Está preparado para sumar más fuentes de datos y para desplegarse en **Railway**.

## Qué muestra

- **Indicadores del periodo**: valor ganado, leads nuevos, pipeline abierto, conversión, leads sin atención y tareas vencidas.
- **Ranking de asesores** por valor ganado.
- **Embudo** del pipeline principal (leads abiertos por etapa).
- **Tendencia semanal** de leads nuevos, ganados y perdidos.
- **Leads por canal** de origen (WhatsApp, Web Form, TikTok, etc.).
- **Detalle por asesor**: nuevos, abiertos, ganados, perdidos, conversión, leads sin movimiento, tareas vencidas, días promedio a cierre y última actividad.
- **Alertas** por severidad: leads olvidados y tareas vencidas, con liga directa al registro en el CRM.
- Filtro de periodo (7 / 30 / 90 / 180 días), refresco automático cada 5 minutos y vista de tabla para cada gráfico.
- Sin credenciales arranca en **modo demo** con datos ficticios, para ver el tablero funcionando desde el primer deploy.

## Arquitectura

```
Fuentes                 Modelo normalizado        Métricas                 Salida
src/lib/sources/*  →    src/lib/model.ts     →    src/lib/metrics.ts  →    src/app (UI)
  kommo.ts (API v4)     Advisor, Pipeline,        totales, por asesor,      /api/snapshot (JSON)
  mock.ts (demo)        Lead, Task, Snapshot      embudo, semanas,          /api/health
                                                  canales, alertas
```

- `src/lib/sources/kommo.ts`: cliente de la API v4 de Kommo (cuenta, usuarios, pipelines, leads, tareas). Maneja paginación (250 por página), respuestas `204` (colección vacía), reintentos ante `429`/`5xx` y respeta el límite de 7 peticiones por segundo.
- `src/lib/sources/mock.ts`: generador de datos demo (determinista).
- `src/lib/cache.ts`: caché en memoria del snapshot (`CACHE_TTL_SECONDS`). Si el CRM falla, sirve el último snapshot bueno y avisa en pantalla.
- `src/lib/metrics.ts`: cálculo puro de métricas; lo usan la página y el endpoint JSON.
- `src/proxy.ts`: protección opcional con usuario y contraseña (Basic Auth).

Stack: Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4 y Recharts 3.

## Deploy en Railway

### ¿Proyecto nuevo o servicio nuevo?

En Railway un **proyecto** agrupa **servicios** (apps, bases de datos) que comparten entorno, variables compartidas y red privada.

- Si el proyecto que ya tienes es de otra aplicación sin relación con este dashboard, crea un **proyecto nuevo**: aislamiento total, variables y dominio propios, sin riesgo de afectar lo existente. Es la opción recomendada para empezar.
- Si el proyecto existente es de la misma operación y planeas compartir una base de datos u otros servicios, agrega este repositorio como **servicio nuevo** dentro de ese proyecto.

En ambos casos el flujo es el mismo: **New → GitHub Repo → `rcc622/Dashboard-Ventas`** y elegir la rama. Railway detecta Next.js, ejecuta `npm run build` y arranca con `npm run start`. El archivo `railway.json` ya define el healthcheck (`/api/health`) y la política de reinicio.

### Pasos

1. Railway → **New Project** (o abrir el proyecto existente) → **Deploy from GitHub repo** → seleccionar el repositorio y la rama.
2. En **Variables** del servicio agregar:
   - `KOMMO_SUBDOMAIN` y `KOMMO_ACCESS_TOKEN` (ver siguiente sección).
   - `DASHBOARD_PASSWORD` (y opcionalmente `DASHBOARD_USER`) para que el tablero pida contraseña. Muy recomendable: sin esto, cualquiera con la URL ve los datos del CRM.
3. **Settings → Networking → Generate Domain** para obtener la URL pública.
4. Abrir `https://<dominio>/api/health`. Debe responder `{"ok":true,"source":"kommo",...}`. Si dice `"source":"mock"`, faltan las variables de Kommo.

### Conexión con Kommo

Railway permite tráfico HTTPS de salida sin restricciones, así que la app consulta la API de Kommo directamente. No hace falta IP fija ni ningún servicio intermedio.

1. En Kommo: **Ajustes → Integraciones → Crear integración → Integración privada**.
2. Pestaña **Keys and scopes → Generate long-lived token**. Elegir la vigencia (hasta 5 años) y **guardar el token**: Kommo no lo vuelve a mostrar.
3. Poner el subdominio de la cuenta (`https://<subdominio>.kommo.com`) en `KOMMO_SUBDOMAIN` y el token en `KOMMO_ACCESS_TOKEN`.

El token hereda los permisos del usuario que crea la integración. Para leer `/users` (nombres de los asesores) ese usuario debe ser **administrador**; si no lo es, el tablero muestra a los asesores por ID y lo indica con un aviso.

## Variables de entorno

| Variable | Default | Descripción |
|---|---|---|
| `KOMMO_SUBDOMAIN` | — | Subdominio de la cuenta de Kommo. |
| `KOMMO_ACCESS_TOKEN` | — | Token de larga duración de la integración privada. |
| `KOMMO_BASE_DOMAIN` | `kommo.com` | Dominio base, solo si la cuenta vive en otro dominio. |
| `KOMMO_BASE_URL` | — | Avanzado: URL base completa; sustituye subdominio + dominio. |
| `KOMMO_LOOKBACK_DAYS` | `180` | Solo se leen leads con actividad en los últimos N días. |
| `CACHE_TTL_SECONDS` | `300` | Segundos que se conserva el snapshot antes de volver a consultar el CRM. |
| `DASHBOARD_STALE_DAYS` | `3` | Días sin movimiento para marcar un lead abierto como "sin atención". |
| `DASHBOARD_TZ` | `America/Monterrey` | Zona horaria para mostrar fechas. |
| `DASHBOARD_USER` | `admin` | Usuario del Basic Auth. |
| `DASHBOARD_PASSWORD` | — | Si se define, el tablero pide usuario y contraseña (`/api/health` queda libre). |

Ver `.env.example`.

## Correr en local

```bash
npm install
cp .env.example .env.local   # llenar KOMMO_SUBDOMAIN y KOMMO_ACCESS_TOKEN
npm run dev                  # http://localhost:3000
```

Sin `.env.local` la app arranca en modo demo. Otros comandos: `npm run build`, `npm run start`, `npm run typecheck`.

## Endpoints

| Ruta | Descripción |
|---|---|
| `/` | Dashboard. Parámetros: `?dias=7\|30\|90\|180`, `&refresh=1` para ignorar la caché. |
| `/api/health` | Healthcheck (no consulta el CRM). |
| `/api/snapshot?dias=30` | Métricas en JSON, las mismas que la página. `&full=1` agrega el snapshot normalizado (leads, asesores, pipelines, tareas). `&refresh=1` ignora la caché. |

El endpoint JSON permite consumir las métricas desde Google Sheets / Apps Script, reportes semanales u otros sistemas.

## Cómo agregar otra fuente de datos

1. Crear `src/lib/sources/<nombre>.ts` que exporte un objeto `DataSource`:

   ```ts
   import type { DataSource, Snapshot } from "@/lib/model";

   export const hubspotSource: DataSource = {
     id: "hubspot",
     label: "HubSpot",
     isConfigured: () => Boolean(process.env.HUBSPOT_TOKEN),
     async fetchSnapshot(): Promise<Snapshot> {
       // llamar la API, traducir a Advisor / Pipeline / Lead / Task y devolver el Snapshot
     },
   };
   ```

2. Agregar el nuevo `id` al tipo `SourceId` en `src/lib/model.ts`.
3. Registrarlo en `src/lib/sources/index.ts` antes de `mockSource`. La primera fuente configurada es la que se usa.

Métricas y UI no cambian: solo conocen el modelo normalizado.

## Siguientes pasos sugeridos

- **Histórico**: agregar Postgres en Railway y guardar un snapshot diario para tendencias reales y comparativas contra periodos anteriores.
- **Metas por asesor**: leads/día y cierres/mes con semáforo contra meta.
- **Webhooks de Kommo** para refrescar al instante cuando cambia un lead.
- **Más fuentes**: HubSpot, Meta Ads (costo por lead por zona), Google Sheets (metas), Odoo.
- **Vista TV** con rotación automática de secciones para pantalla de oficina.
