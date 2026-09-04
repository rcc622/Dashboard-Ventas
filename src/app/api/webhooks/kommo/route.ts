import { NextResponse } from "next/server";
import { requestIncremental } from "@/lib/sync/engine";

export const dynamic = "force-dynamic";

/**
 * Webhook nativo de Kommo (Ajustes → Integraciones → Webhooks). Kommo manda
 * form-urlencoded con llaves tipo `leads[add][0][id]`; aquí solo se toma nota
 * de qué cambió y se agenda una incremental (con debounce, los avisos llegan en ráfaga).
 *
 * Si existe KOMMO_WEBHOOK_SECRET, la URL debe traer ?key=<secreto>
 * (o el header X-Webhook-Key). Esta ruta no pasa por el Basic Auth.
 */
const ENTIDAD = /^(leads|contacts|task|tasks|companies|customers)\[(\w+)\]\[\d+\]\[id\]$/;

export async function POST(request: Request) {
  const url = new URL(request.url);
  const secret = process.env.KOMMO_WEBHOOK_SECRET?.trim();
  if (secret) {
    const key = url.searchParams.get("key") ?? request.headers.get("x-webhook-key") ?? "";
    if (key !== secret) return NextResponse.json({ ok: false, error: "clave inválida" }, { status: 401 });
  }

  const cambios: Record<string, Record<string, string[]>> = {};
  const registrar = (entidad: string, accion: string, id: string) => {
    ((cambios[entidad] ??= {})[accion] ??= []).push(id);
  };

  const contentType = request.headers.get("content-type") ?? "";
  try {
    if (contentType.includes("application/json")) {
      const body = (await request.json()) as Record<string, unknown>;
      for (const [entidad, acciones] of Object.entries(body)) {
        if (!acciones || typeof acciones !== "object") continue;
        for (const [accion, items] of Object.entries(acciones as Record<string, unknown>)) {
          if (!Array.isArray(items)) continue;
          for (const it of items) {
            const id = (it as { id?: unknown })?.id;
            if (id !== undefined) registrar(entidad, accion, String(id));
          }
        }
      }
    } else {
      const params = new URLSearchParams(await request.text());
      for (const [k, v] of params) {
        const m = ENTIDAD.exec(k);
        if (m) registrar(m[1], m[2], v);
      }
    }
  } catch {
    // cuerpo ilegible: igual vale como aviso de «algo cambió»
  }

  requestIncremental("webhook Kommo", Number(process.env.WEBHOOK_DEBOUNCE_MS) || 20_000);
  return NextResponse.json({ ok: true, queued: "incremental", cambios });
}

export function GET() {
  return NextResponse.json({ ok: true, hint: "Configura esta URL como webhook en Kommo (método POST)." });
}
