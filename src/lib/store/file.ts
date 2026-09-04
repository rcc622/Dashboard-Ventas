import { promises as fs } from "node:fs";
import path from "node:path";
import type { Snapshot, SyncRun } from "@/lib/model";
import type { SnapshotStore } from "./index";

const MAX_RUNS = 500;

/** Snapshot en JSON + bitácora de corridas en JSONL, en un directorio (volumen). */
export class FileStore implements SnapshotStore {
  readonly kind = "file" as const;

  constructor(private readonly dir: string) {}

  describe(): string {
    return `archivos en ${path.resolve(this.dir)}`;
  }

  private get snapshotPath() {
    return path.join(this.dir, "snapshot.json");
  }

  private get runsPath() {
    return path.join(this.dir, "sync-runs.jsonl");
  }

  async load(): Promise<Snapshot | null> {
    try {
      const raw = await fs.readFile(this.snapshotPath, "utf8");
      return JSON.parse(raw) as Snapshot;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw err;
    }
  }

  async save(snapshot: Snapshot): Promise<void> {
    await fs.mkdir(this.dir, { recursive: true });
    const tmp = `${this.snapshotPath}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(snapshot), "utf8");
    await fs.rename(tmp, this.snapshotPath);
  }

  async appendRun(run: SyncRun): Promise<void> {
    await fs.mkdir(this.dir, { recursive: true });
    await fs.appendFile(this.runsPath, JSON.stringify(run) + "\n", "utf8");
    const lines = await this.readRuns();
    if (lines.length > MAX_RUNS * 2) {
      await fs.writeFile(this.runsPath, lines.slice(-MAX_RUNS).map((r) => JSON.stringify(r)).join("\n") + "\n");
    }
  }

  async recentRuns(limit: number): Promise<SyncRun[]> {
    const runs = await this.readRuns();
    return runs.slice(-limit).reverse();
  }

  private async readRuns(): Promise<SyncRun[]> {
    try {
      const raw = await fs.readFile(this.runsPath, "utf8");
      return raw
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line) as SyncRun);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw err;
    }
  }
}
