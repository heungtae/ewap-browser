export class DirtyRoots {
  private roots = new Set<string>();
  private since: number | undefined;
  private full = 0;
  constructor(
    private indexedComponents: number,
    private root: string,
  ) {}
  mark(root: string, now: number): void {
    this.since ??= now;
    if (this.roots.size < 128) this.roots.add(root);
  }
  flush(now: number): {
    kind: "wait" | "partial" | "full" | "unstable";
    roots: string[];
  } {
    if (this.since === undefined || now - this.since < 250)
      return { kind: "wait", roots: [] };
    const full =
      this.roots.has(this.root) ||
      this.roots.size >= 128 ||
      this.roots.size > this.indexedComponents * 0.2;
    const roots = [...this.roots].sort();
    this.roots.clear();
    this.since = undefined;
    if (full && ++this.full > 2) return { kind: "unstable", roots: [] };
    return {
      kind: full ? "full" : "partial",
      roots: full ? [this.root] : roots,
    };
  }
}
