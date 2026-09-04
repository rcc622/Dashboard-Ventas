import { NextResponse } from "next/server";
import { getStatus, runSync } from "@/lib/sync/engine";

export const dynamic = "force-dynamic";

/**
 * Dispara una sincronía (alias: POST /refrescar).
 *   ?mode=full|incremental (default incremental) · ?wait=1 espera a que termine.
 */
async function handle(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("mode") === "full" ? "full" : "incremental";
  const wait = url.searchParams.get("wait") === "1";
  const promise = runSync(mode, `manual (${mode})`);
  if (wait) {
    const run = await promise;
    return NextResponse.json({ ok: run.ok === true, run, status: getStatus() }, { status: run.ok ? 200 : 502 });
  }
  void promise.catch(() => undefined);
  return NextResponse.json({ ok: true, queued: mode, status: getStatus() }, { status: 202 });
}

export const POST = handle;
export const GET = handle;
