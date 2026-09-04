import { NextResponse } from "next/server";
import { ensureLoaded, getStatus, recentRuns } from "@/lib/sync/engine";

export const dynamic = "force-dynamic";

/** Estado de la sincronía (alias: /estado). */
export async function GET() {
  await ensureLoaded();
  const status = getStatus();
  return NextResponse.json({ ok: !status.stale && !status.lastError, ...status, runs: recentRuns(20) });
}
