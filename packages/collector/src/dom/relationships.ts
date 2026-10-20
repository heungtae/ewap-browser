import type { Observation } from "@contextpilot/codebase-schema";
import { scrub } from "./privacy.js";
import { text, type WalkBudget } from "./walk.js";
export class Relationships {
  private labels = new Map<string, string>();
  private owners: { record: Observation; form: Element }[] = [];
  private targets = new Map<string, Observation>();
  observe(element: Element, budget: WalkBudget): void {
    if (
      element.tagName !== "LABEL" ||
      !element.hasAttribute("for") ||
      this.labels.size >= 256
    )
      return;
    const target = element.getAttribute("for")!;
    if (target.length <= 200)
      this.labels.set(target, scrub(text(element, budget)));
  }
  attach(element: Element, record: Observation): void {
    const id = element.getAttribute("id");
    if (id && id.length <= 200) this.targets.set(id, record);
    const formId = element.getAttribute("form");
    if (record.control && formId && formId.length <= 200) {
      const form = element.ownerDocument.getElementById(formId);
      if (form?.tagName === "FORM") this.owners.push({ record, form });
    }
  }
  apply(ids: WeakMap<Element, string>): void {
    for (const [id, label] of this.labels) {
      const record = this.targets.get(id);
      if (
        record &&
        (!record.name ||
          record.name === record.control ||
          record.name === "unknown")
      )
        record.name = label;
    }
    for (const owner of this.owners) {
      const evidenceId = ids.get(owner.form);
      if (evidenceId) owner.record.parentEvidenceId = evidenceId;
    }
  }
}
