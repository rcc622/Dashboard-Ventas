import { engineState, ensureLoaded, intervalMin, refreshHours, runSync } from "./engine";

/**
 * Programador: al arrancar carga lo persistido y sincroniza; luego corre una
 * incremental cada SYNC_INTERVAL_MIN y una completa cada REFRESH_HOURS
 * (mismo ritmo de 6 h que mkt-dashboard y el Sheet de leads).
 */
export function startScheduler(): void {
  if (engineState.schedulerStarted) return;
  engineState.schedulerStarted = true;

  const incMs = intervalMin() * 60_000;
  const fullMs = refreshHours() * 3_600_000;
  const log = (msg: string) => console.log(`[sync] ${msg}`);

  const schedule = () => {
    engineState.nextIncrementalAt = new Date(Date.now() + incMs).toISOString();
  };

  void (async () => {
    await ensureLoaded();
    const snap = engineState.snapshot;
    const age = snap ? Date.now() - Date.parse(snap.fetchedAt) : Number.POSITIVE_INFINITY;
    const mode = age > fullMs ? "full" : "incremental";
    log(`arranque: ${snap ? `snapshot de hace ${Math.round(age / 60_000)} min` : "sin snapshot"} → ${mode}`);
    engineState.nextFullAt = new Date(Date.now() + fullMs).toISOString();
    schedule();
    await runSync(mode, "arranque").catch(() => undefined);
  })();

  const inc = setInterval(() => {
    schedule();
    void runSync("incremental", "programada").catch(() => undefined);
  }, incMs);
  inc.unref?.();

  const full = setInterval(() => {
    engineState.nextFullAt = new Date(Date.now() + fullMs).toISOString();
    void runSync("full", "programada").catch(() => undefined);
  }, fullMs);
  full.unref?.();

  log(`programador activo: incremental cada ${intervalMin()} min, completa cada ${refreshHours()} h`);
}
