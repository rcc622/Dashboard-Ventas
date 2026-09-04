import { integraciones, syncIntegraciones } from "@/lib/integraciones";
import type { Snapshot, SyncMode, SyncRun } from "@/lib/model";
import { getActiveSource } from "@/lib/sources";
import { getStore } from "@/lib/store";

/**
 * Motor de sincronía: una sola corrida a la vez, snapshot en memoria respaldado
 * por el store (archivo o Postgres), bitácora de corridas y estado observable.
 * El estado vive en globalThis para compartirse entre las instancias de módulo
 * que Next.js crea (instrumentation, rutas, páginas).
 */

export interface SyncStatus {
  source: string;
  demo: boolean;
  store: string;
  loaded: boolean;
  running: SyncRun | null;
  lastRun: SyncRun | null;
  lastSuccessAt: string | null;
  lastError: string | null;
  snapshotAt: string | null;
  /** true si la última corrida buena es más vieja que 3 intervalos. */
  stale: boolean;
  nextIncrementalAt: string | null;
  nextFullAt: string | null;
  intervalMin: number;
  refreshHours: number;
  counts: Record<string, number>;
  integraciones: Array<{ id: string; label: string; configurada: boolean; ok: boolean | null; syncedAt: string | null; error: string | null; registros: number; vinculados: number; destino: string | null }>;
}

interface EngineState {
  snapshot: Snapshot | null;
  loaded: boolean;
  loading: Promise<void> | null;
  inflight: Promise<SyncRun> | null;
  running: SyncRun | null;
  lastRun: SyncRun | null;
  lastSuccessAt: string | null;
  lastError: string | null;
  runs: SyncRun[];
  pendingFull: boolean;
  debounceTimer: ReturnType<typeof setTimeout> | null;
  nextIncrementalAt: string | null;
  nextFullAt: string | null;
  schedulerStarted: boolean;
  listeners: Array<() => void>;
}

const state: EngineState = ((globalThis as { __syncEngine?: EngineState }).__syncEngine ??= {
  snapshot: null,
  loaded: false,
  loading: null,
  inflight: null,
  running: null,
  lastRun: null,
  lastSuccessAt: null,
  lastError: null,
  runs: [],
  pendingFull: false,
  debounceTimer: null,
  nextIncrementalAt: null,
  nextFullAt: null,
  schedulerStarted: false,
  listeners: [],
});

export const engineState = state;

export function intervalMin(): number {
  return Math.max(1, Number(process.env.SYNC_INTERVAL_MIN) || 10);
}

export function refreshHours(): number {
  return Math.max(0.25, Number(process.env.REFRESH_HOURS) || 6);
}

const log = (msg: string, ...rest: unknown[]) => console.log(`[sync] ${msg}`, ...rest);

/** Carga el snapshot persistido (una sola vez por proceso). */
export async function ensureLoaded(): Promise<void> {
  if (state.loaded) return;
  if (!state.loading) {
    state.loading = (async () => {
      try {
        const store = getStore();
        const saved = await store.load();
        // Un snapshot guardado por otra fuente (p. ej. demo) no sirve cuando ya hay CRM.
        const source = getActiveSource();
        if (saved && saved.source === source.id) {
          // Snapshots guardados por versiones previas: campos nuevos vacíos.
          saved.ventas ??= [];
          saved.proyectos ??= [];
          saved.integraciones ??= {};
          state.snapshot = saved;
          state.lastSuccessAt = saved.fetchedAt;
          log(`snapshot cargado de ${store.describe()} (${saved.leads.length} leads, ${saved.fetchedAt})`);
        }
        state.runs = await store.recentRuns(50);
        const lastOk = state.runs.find((r) => r.ok);
        if (lastOk && (!state.lastSuccessAt || lastOk.finishedAt! > state.lastSuccessAt)) state.lastSuccessAt = lastOk.finishedAt;
      } catch (err) {
        log("no se pudo cargar el snapshot persistido:", err instanceof Error ? err.message : err);
      } finally {
        state.loaded = true;
      }
    })();
  }
  await state.loading;
}

function counts(s: Snapshot): Record<string, number> {
  const porCanal: Record<string, number> = {};
  for (const l of s.leads) porCanal[l.canal] = (porCanal[l.canal] ?? 0) + 1;
  return {
    leads: s.leads.length,
    abiertos: s.leads.filter((l) => l.status === "open").length,
    contactos: s.contacts.length,
    asesores: s.advisors.length,
    tareas: s.tasks.length,
    actividades: s.activities.length,
    sinOrigen: porCanal["Sin origen"] ?? 0,
    sinCiudad: s.leads.filter((l) => l.zona === "SIN_DATO").length,
    ventas: s.ventas.length,
    proyectos: s.proyectos.length,
  };
}

/**
 * Ejecuta una sincronía. Si ya hay una en curso, devuelve esa misma corrida
 * (y si se pidió `full` mientras corre una incremental, encola la completa).
 */
export async function runSync(mode: SyncMode, reason: string): Promise<SyncRun> {
  await ensureLoaded();
  if (state.inflight) {
    if (mode === "full" && state.running?.mode !== "full") state.pendingFull = true;
    return state.inflight;
  }
  state.inflight = execute(mode, reason).finally(() => {
    state.inflight = null;
    if (state.pendingFull) {
      state.pendingFull = false;
      void runSync("full", "encolada");
    }
  });
  return state.inflight;
}

async function execute(requested: SyncMode, reason: string): Promise<SyncRun> {
  const source = getActiveSource();
  const store = getStore();
  const prev = state.snapshot;
  const canIncrement = Boolean(prev && prev.source === source.id && source.fetchIncremental && prev.cursor);
  const mode: SyncMode = requested === "incremental" && canIncrement ? "incremental" : "full";

  const run: SyncRun = {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    mode,
    reason,
    source: source.id,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    ok: null,
    durationMs: null,
    requests: 0,
    counts: {},
    error: null,
  };
  state.running = run;
  const t0 = Date.now();
  log(`inicio ${mode} (${reason}) fuente=${source.id}`);

  try {
    const snapshot =
      mode === "incremental" && prev
        ? await source.fetchIncremental!(prev, prev.cursor!.leadsUpdatedAt || prev.fetchedAt)
        : await source.fetchSnapshot();
    snapshot.ventas ??= [];
    snapshot.proyectos ??= [];
    snapshot.integraciones ??= {};
    await syncIntegraciones(snapshot, prev);
    state.snapshot = snapshot;
    run.counts = counts(snapshot);
    run.requests = source.lastRequestCount?.() ?? 0;
    try {
      await store.save(snapshot);
    } catch (err) {
      snapshot.warnings.push(`No se pudo guardar en ${store.describe()}: ${err instanceof Error ? err.message : String(err)}`);
      log("error guardando snapshot:", err instanceof Error ? err.message : err);
    }
    run.ok = true;
    state.lastSuccessAt = snapshot.fetchedAt;
    state.lastError = null;
  } catch (err) {
    run.ok = false;
    run.error = err instanceof Error ? err.message : String(err);
    state.lastError = run.error;
    log(`falló ${mode}: ${run.error}`);
  } finally {
    run.finishedAt = new Date().toISOString();
    run.durationMs = Date.now() - t0;
    state.running = null;
    state.lastRun = run;
    state.runs = [run, ...state.runs].slice(0, 100);
    try {
      await store.appendRun(run);
    } catch (err) {
      log("no se pudo registrar la corrida:", err instanceof Error ? err.message : err);
    }
    log(`fin ${mode} ok=${run.ok} ${run.durationMs}ms req=${run.requests} ${JSON.stringify(run.counts)}`);
    for (const fn of state.listeners.splice(0)) fn();
  }
  return run;
}

/** Pide una incremental agrupando avisos cercanos (webhooks). */
export function requestIncremental(reason: string, debounceMs = 20_000): void {
  if (state.debounceTimer) clearTimeout(state.debounceTimer);
  state.debounceTimer = setTimeout(() => {
    state.debounceTimer = null;
    void runSync("incremental", reason).catch(() => undefined);
  }, debounceMs);
  state.debounceTimer.unref?.();
}

/** Snapshot actual; si todavía no hay ninguno, espera a la corrida en curso (o la lanza). */
export async function currentSnapshot(): Promise<Snapshot | null> {
  await ensureLoaded();
  if (state.snapshot) return state.snapshot;
  await runSync("full", "primera lectura");
  return state.snapshot;
}

export function getStatus(): SyncStatus {
  const source = getActiveSource();
  const mins = intervalMin();
  const lastOkMs = state.lastSuccessAt ? Date.parse(state.lastSuccessAt) : 0;
  return {
    source: source.id,
    demo: source.id === "mock",
    store: getStore().describe(),
    loaded: state.loaded,
    running: state.running,
    lastRun: state.lastRun,
    lastSuccessAt: state.lastSuccessAt,
    lastError: state.lastError,
    snapshotAt: state.snapshot?.fetchedAt ?? null,
    stale: !lastOkMs || Date.now() - lastOkMs > 3 * mins * 60_000,
    nextIncrementalAt: state.nextIncrementalAt,
    nextFullAt: state.nextFullAt,
    intervalMin: mins,
    refreshHours: refreshHours(),
    counts: state.snapshot ? counts(state.snapshot) : {},
    integraciones: integraciones.map((i) => {
      const e = state.snapshot?.integraciones?.[i.id];
      return {
        id: i.id,
        label: i.label,
        configurada: i.isConfigured(),
        ok: e?.ok ?? null,
        syncedAt: e?.syncedAt ?? null,
        error: e?.error ?? null,
        registros: e?.registros ?? 0,
        vinculados: e?.vinculados ?? 0,
        destino: i.destino(),
      };
    }),
  };
}

export function recentRuns(limit = 20): SyncRun[] {
  return state.runs.slice(0, limit);
}
