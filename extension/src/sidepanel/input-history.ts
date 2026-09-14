export class InputHistory {
  private readonly entries: string[] = [];
  private cursor = 0;
  private draft = "";

  add(value: string): void {
    if (!value) return;
    if (this.entries.at(-1) !== value) this.entries.push(value);
    this.cursor = this.entries.length;
    this.draft = "";
  }

  previous(current: string): string | undefined {
    if (!this.entries.length) return;
    if (this.cursor === this.entries.length) this.draft = current;
    this.cursor = Math.max(0, this.cursor - 1);
    return this.entries[this.cursor];
  }

  next(): string | undefined {
    if (!this.entries.length || this.cursor === this.entries.length) return;
    this.cursor += 1;
    return this.cursor === this.entries.length
      ? this.draft
      : this.entries[this.cursor];
  }

  reset(): void {
    this.entries.length = 0;
    this.cursor = 0;
    this.draft = "";
  }
}
