import { NextResponse } from "next/server";
import { getActiveSource } from "@/lib/sources";
import { getStatus } from "@/lib/sync/engine";

export const dynamic = "force-dynamic";

/** Healthcheck para Railway (alias: /salud). No toca el CRM; siempre 200 si el proceso vive. */
export function GET() {
  const source = getActiveSource();
  const s = getStatus();
  return NextResponse.json({
    ok: true,
    source: source.id,
    demo: source.id === "mock",
    time: new Date().toISOString(),
    sync: {
      lastSuccessAt: s.lastSuccessAt,
      snapshotAt: s.snapshotAt,
      running: Boolean(s.running),
      stale: s.stale,
      lastError: s.lastError,
      store: s.store,
    },
  });
}
