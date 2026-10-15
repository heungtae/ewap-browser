import { pageSnapshotParts } from "../contracts/page-snapshot-parts.js";
import type { PageReadScope } from "../contracts/types.js";
import { isPlainObject } from "../security/validation.js";
type Binding = { document_epoch: string; page_scope_epoch: string };
type Dependencies = {
  binding(): Binding;
  origin(): string;
  url(): string;
  prepare(): Promise<boolean>;
  nodes(scope: PageReadScope): { nodes: unknown[]; truncated: boolean };
  workflow(): unknown;
  visibleText(): string;
  articleText(): string;
};
export const createSnapshotPartReader =
  (dependencies: Dependencies) =>
  async (raw: unknown): Promise<unknown> => {
    if (
      !isPlainObject(raw) ||
      !pageSnapshotParts.some((part) => part === raw.part) ||
      !["all_dom", "visible_only", "interactive"].includes(String(raw.scope))
    )
      return { ok: false, code: "INVALID_ARGUMENT" };
    const url = dependencies.url();
    if (raw.part === "document" && !(await dependencies.prepare()))
      return { ok: false, code: "DOCUMENT_NOT_REGISTERED" };
    const binding = { ...dependencies.binding(), url };
    if (
      raw.part !== "document" &&
      (!isPlainObject(raw.binding) ||
        raw.binding.document_epoch !== binding.document_epoch ||
        raw.binding.page_scope_epoch !== binding.page_scope_epoch ||
        raw.binding.url !== url)
    )
      return { ok: false, code: "PAGE_SCOPE_STALE" };
    let data: Record<string, unknown>;
    switch (raw.part) {
      case "document":
        data = { origin: dependencies.origin() };
        break;
      case "nodes":
        data = dependencies.nodes(raw.scope as PageReadScope);
        break;
      case "workflow":
        data = { workflow: dependencies.workflow() };
        break;
      case "visible_text":
        data = { text: dependencies.visibleText() };
        break;
      default:
        data = { text: dependencies.articleText() };
    }
    const latest = dependencies.binding();
    if (
      url !== dependencies.url() ||
      binding.document_epoch !== latest.document_epoch ||
      binding.page_scope_epoch !== latest.page_scope_epoch
    )
      return { ok: false, code: "PAGE_SCOPE_STALE" };
    return { ok: true, binding, ...data };
  };
