/**
 * Arranque del servidor (Next.js instrumentation hook): enciende el
 * programador de sincronía. SYNC_DISABLED=1 lo apaga (útil en CI).
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.SYNC_DISABLED === "1") return;
  const { startScheduler } = await import("./lib/sync/scheduler");
  startScheduler();
}
