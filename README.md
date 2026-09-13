# Dashboard de ventas — Kenet Solar

Tablero `/ventas` (Kommo + HubSpot + app de comisiones + llamadas calificadas). Corre en Railway (servicio mkt-ventas).

- Servidor: `python app.py` (Python stdlib, sin dependencias).
- UI: `cd ventas && npm install && npm run build` y commitear `ventas/dist/`.
- Pruebas: `python ventas_corte.py --selftest`, `python ventas_kommo.py --selftest`, `python ventas_hubspot.py --selftest`.

Detalles y reglas en `CLAUDE.md`.
