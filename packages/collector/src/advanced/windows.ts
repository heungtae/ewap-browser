import {
  bytes,
  canonical,
  digest,
  type Context,
} from "@contextpilot/codebase-schema";
import { scrub } from "../dom/privacy.js";
import { evidence } from "./evidence.js";
import type { Scalar } from "./main-reader.js";
export interface DataWindow {
  cursor: string;
  revision: string;
  filterDigest: string;
  fields: string[];
  total: number | null;
  eof: boolean;
  rows: { key: string | null; index: number | null; cells: Scalar[] }[];
}
export class WindowAccumulator {
  private windows = 0;
  private size = 0;
  private eof = false;
  private cursors = new Set<string>();
  private reasons = new Set<string>();
  private rows = new Map<string, { index: number | null; cells: Scalar[] }>();
  private total: number | null = null;
  private signature: string | null = null;
  constructor(
    private context: Context,
    private id: string,
    private fields: string[],
    private observedAt: number,
  ) {
    this.context = structuredClone(context);
    if (
      !fields.length ||
      fields.length > 50 ||
      new Set(fields).size !== fields.length
    )
      throw new Error("FIELD_LIMIT");
    this.fields = fields.map((f) => scrub(f, 200));
    if (
      this.fields.some((f) => !f) ||
      new Set(this.fields).size !== this.fields.length
    )
      throw new Error("FIELD_LIMIT");
  }
  count(): number {
    return this.rows.size;
  }
  async add(window: DataWindow): Promise<void> {
    if (this.windows >= 50 || this.cursors.has(window.cursor)) {
      this.reasons.add("WINDOW_LIMIT");
      return;
    }
    if (window.rows.length > 200 || bytes(window) > 8 * 1024 * 1024)
      throw new Error("WINDOW_LIMIT");
    if (
      window.total !== null &&
      (!Number.isSafeInteger(window.total) || window.total < 0)
    )
      throw new Error("INVALID_TOTAL");
    const signature = canonical([
      window.revision,
      window.filterDigest,
      window.fields,
      window.total,
    ]);
    if (this.signature !== null && this.signature !== signature)
      throw new Error("DATA_SOURCE_CHANGED");
    if (
      canonical(window.fields.map((f) => scrub(f, 200))) !==
      canonical(this.fields)
    )
      throw new Error("FIELDS_CHANGED");
    this.signature = signature;
    this.total = window.total;
    this.windows++;
    this.cursors.add(window.cursor);
    for (let i = 0; i < window.rows.length; i++) {
      const row = window.rows[i]!;
      if (
        row.cells.length !== this.fields.length ||
        row.cells.some(
          (v) =>
            v !== null && !["string", "number", "boolean"].includes(typeof v),
        )
      )
        throw new Error("ROW_SHAPE");
      const cells = row.cells.map((v) => {
        if (typeof v === "string") {
          if (v.length > 4096) this.reasons.add("CELL_TRUNCATED");
          return scrub(v, 4096);
        }
        if (typeof v === "number" && !Number.isFinite(v))
          throw new Error("ROW_SHAPE");
        return v;
      });
      if (
        row.index !== null &&
        (!Number.isSafeInteger(row.index) || row.index < 0)
      )
        throw new Error("ROW_INDEX");
      if (!row.key || row.key.length > 256 || row.index === null)
        this.reasons.add("ROW_IDENTITY_MISSING");
      const key = `row_${(await digest([window.revision, row.key ?? [window.cursor, i]])).slice(0, 40)}`;
      const old = this.rows.get(key);
      if (old) {
        if (canonical(old) !== canonical({ index: row.index, cells }))
          this.reasons.add("RECYCLED_ROW_CHANGED");
        continue;
      }
      const length = bytes(cells);
      if (this.rows.size >= 10000 || this.size + length > 7 * 1024 * 1024) {
        this.reasons.add(this.rows.size >= 10000 ? "ROW_LIMIT" : "BYTE_LIMIT");
        break;
      }
      this.rows.set(key, { index: row.index, cells });
      this.size += length;
    }
    this.eof ||= window.eof;
  }
  async finish(
    provenance: "dom" | "registered" = "dom",
    restored: boolean | null = null,
  ) {
    const ordered = [...this.rows.entries()].sort(
      (a, b) => (a[1].index ?? Infinity) - (b[1].index ?? Infinity),
    );
    const complete =
      this.eof &&
      this.total !== null &&
      ordered.length === this.total &&
      ordered.every(([, row], index) => row.index === index) &&
      !this.reasons.size;
    const reasons = [...this.reasons];
    if (!complete && !this.eof) reasons.push("EOF_UNPROVEN");
    if (!complete && this.total === null) reasons.push("TOTAL_UNKNOWN");
    if (!complete && this.total !== null && !this.reasons.size)
      reasons.push("ROW_GAP");
    if (restored === false) reasons.push("RESTORE_FAILED");
    return evidence({
      schema: "wca.collector/v1",
      id: this.id,
      context: this.context,
      kind: "table",
      provenance,
      fields: this.fields,
      rows: ordered.map(([, r]) => r.cells),
      rowIds: ordered.map(([key]) => key),
      coverage: {
        status: complete && restored !== false ? "complete" : "partial",
        reasons,
        total: this.total,
        windows: this.windows,
        restored,
      },
      observedAt: this.observedAt,
      expiresAt: this.observedAt + 86400000,
      executable: false,
    });
  }
}
