import { NextResponse } from "next/server";
import { getActiveSource } from "@/lib/sources";

export const dynamic = "force-dynamic";

/** Healthcheck para Railway. No toca el CRM. */
export function GET() {
  const source = getActiveSource();
  return NextResponse.json({
    ok: true,
    source: source.id,
    demo: source.id === "mock",
    time: new Date().toISOString(),
  });
}
