import type { BrowserStorage } from "./browser-api.js";
import type {
  DiagnosticsLevel,
  DiagnosticRecord,
} from "../contracts/diagnostic-types.js";
import { validDiagnostic } from "../contracts/diagnostics-validation.js";
type Persisted = {
  level: DiagnosticsLevel | "off" | "basic";
  records: DiagnosticRecord[];
  dropped_count: number;
  debug_until_ms: number;
};

const storageKey = "execution_diagnostics_v1";
const maxRecords = 2_000;
const ttlMs = 30 * 60_000;
const levelRank: Record<DiagnosticsLevel, number> = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
  trace: 4,
};

export class DiagnosticsStorage {
  protected level: DiagnosticsLevel = "error";
  protected sequence = 0;
  protected droppedCount = 0;
  protected readonly records: DiagnosticRecord[] = [];
  protected debugUntil = 0;
  protected timer: ReturnType<typeof setTimeout> | undefined;
  protected queue = Promise.resolve();
  protected storageFailed = false;

  public constructor(protected readonly storage?: BrowserStorage) {}
  public async restore(): Promise<void> {
    try {
      const saved = (await this.storage?.session.get?.(storageKey))?.[
        storageKey
      ] as Partial<Persisted> | undefined;
      if (!saved) return;
      if (Array.isArray(saved.records))
        this.records.push(
          ...saved.records.filter(validDiagnostic).slice(-maxRecords),
        );
      this.sequence = Math.max(0, ...this.records.map((r) => r.sequence));
      this.droppedCount =
        typeof saved.dropped_count === "number" &&
        Number.isSafeInteger(saved.dropped_count) &&
        saved.dropped_count >= 0
          ? saved.dropped_count
          : 0;
      this.debugUntil =
        typeof saved.debug_until_ms === "number" ? saved.debug_until_ms : 0;
      this.level = this.restoreLevel(saved.level);
      this.retainAtLevel();
      this.prune(Date.now());
    } catch {
      this.storageFailed = true;
    }
  }
  protected prune(now: number): void {
    if (this.level === "trace" && now >= this.debugUntil) {
      this.level = "error";
      this.retainAtLevel();
      this.persist();
    }
    while (this.records[0] && now - this.records[0].timestamp_ms > ttlMs)
      this.records.shift();
  }

  protected persist(immediate = false): void {
    if (this.timer && !immediate) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    if (!immediate) {
      this.timer = setTimeout(() => this.persist(true), 500);
      return;
    }
    const value: Persisted = {
      level: this.level,
      records: this.records,
      dropped_count: this.droppedCount,
      debug_until_ms: this.debugUntil,
    };
    const snapshot = structuredClone(value);
    this.queue = this.queue.then(async () => {
      try {
        await this.storage?.session.set?.({ [storageKey]: snapshot });
        this.storageFailed = false;
      } catch {
        this.storageFailed = true;
      }
    });
  }

  private restoreLevel(
    value: Persisted["level"] | undefined,
  ): DiagnosticsLevel {
    if (value === "trace")
      return this.debugUntil > Date.now() ? "trace" : "error";
    if (value === "debug")
      return this.debugUntil > Date.now() ? "trace" : "error";
    // Older `basic` diagnostics recorded every lifecycle transition.  Do not
    // continue that collection after upgrading; a user must opt into trace.
    if (value === "info" || value === "warn" || value === "error") return value;
    return "error";
  }

  protected retainAtLevel(): void {
    const retained = this.records.filter(
      (record) => levelRank[record.level] <= levelRank[this.level],
    );
    this.records.splice(0, this.records.length, ...retained);
  }
}
