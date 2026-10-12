import type { PageMethodIntent } from "../contracts/page-method-types.js";
import { digestCanonical } from "../security/canonical.js";
import type { RequestContext } from "./request-context.js";

export type Injection = {
  frameId?: number;
  documentId?: string;
  result?: unknown;
};
export type Scope = {
  document_epoch: string;
  page_scope_epoch: string;
};
export type Dependencies = {
  scripting?: {
    executeScript(input: {
      target: { tabId: number; documentIds: string[] };
      world: "MAIN";
      func: (...args: never[]) => unknown;
      args: unknown[];
    }): Promise<Injection[]>;
  };
  beforeDispatch(tabId: number, context: RequestContext): Promise<void>;
  documentFor(
    tabId: number,
    frameId: number,
  ): { epoch: string; documentId: string } | undefined;
  scope(tabId: number): Scope | undefined;
  now?(): number;
};

export const pageMethodApprovalDigest = (
  intent: Omit<PageMethodIntent, "approval_digest" | "document_id">,
): string =>
  digestCanonical({
    kind: intent.kind,
    run_id: intent.run_id,
    tab_id: intent.tab_id,
    document_epoch: intent.document_epoch,
    page_scope_epoch: intent.page_scope_epoch,
    invocation_id: intent.invocation_id,
    request_id: intent.request_id,
    origin: intent.origin,
    request_generation: intent.request_generation,
    source_evidence_id: intent.source_evidence_id,
    ...(intent.plan_id ? { plan_id: intent.plan_id } : {}),
    ...(intent.plan_revision === undefined
      ? {}
      : { plan_revision: intent.plan_revision }),
    method: intent.method,
    arguments: intent.arguments,
    arguments_digest: intent.arguments_digest,
    capability: intent.capability,
  });
