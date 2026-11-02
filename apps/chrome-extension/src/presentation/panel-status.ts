export class PanelStatus {
  private lastTask: string | undefined;
  private lastActivity: string | undefined;
  private log: string[] = [];
  private output: HTMLElement | null;
  private activityOutput: HTMLElement | null;
  private trace: HTMLElement | null;
  constructor(document: Document) {
    this.trace = document.getElementById("execution-trace");
    if (this.trace) this.trace.textContent = "아직 기록된 실행이 없습니다.";
    this.output = document.getElementById("status");
    this.activityOutput = document.getElementById("activity-status");
  }
  status = (text: string) => {
    this.lastTask = text;
    if (this.output) this.output.textContent = text;
    this.log.push(text.slice(0, 1000));
    if (this.log.length > 50) this.log.shift();
    if (this.trace) this.trace.textContent = this.log.slice(-3).join("\n");
    const dialogTrace = this.trace?.ownerDocument.getElementById(
      "diagnostics-dialog-trace",
    );
    if (dialogTrace) dialogTrace.textContent = this.trace!.textContent;
  };
  private showActivity(text?: string) {
    if (this.activityOutput) {
      this.activityOutput.textContent = text ?? "";
      this.activityOutput.hidden = !text;
    }
  }
  activity = (text?: string) => {
    this.lastActivity = text;
    this.showActivity(text);
  };
  connection(text: string, available: boolean) {
    if (this.output)
      this.output.textContent = available ? (this.lastTask ?? text) : text;
    this.showActivity(available ? this.lastActivity : text);
  }
}
