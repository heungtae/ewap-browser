import type { Capability } from "../policy/permission-manager.js";

/**
 * A deliberately small contract for code which is shipped in the extension.
 * None of these values originate with a page, a profile, or a model.
 */
export type PageApiAction = {
  action_id: string;
  label: string;
  description: string;
  effect: "local-ui-only";
  risk: "R1";
  option_ids: readonly string[];
  option_labels: Readonly<Record<string, string>>;
  completion: { control_name: string; option_name: string };
};

export type PageApiAdapter = {
  adapter_id: string;
  version: number;
  origins: readonly string[];
  matchesPath(path: string): boolean;
  actions: readonly PageApiAction[];
};

export type PageApiActionRef = {
  action_ref: string;
  adapter_id: string;
  adapter_version: number;
  action_id: string;
  option_ids: readonly string[];
  option_labels: Readonly<Record<string, string>>;
  label: string;
  description: string;
  completion: PageApiAction["completion"];
};

/** This is not a DOM ActionIntent.  In particular it intentionally has no ref_id. */
export type PageApiIntent = {
  kind: "page_api";
  run_id: string;
  tab_id: number;
  frame_id: 0;
  document_id: string;
  document_epoch: string;
  page_scope_epoch: string;
  origin: string;
  adapter_id: string;
  adapter_version: number;
  action_id: string;
  option_id: string;
  completion_digest: string;
  capability: Extract<Capability, "page_api">;
  approval_digest: string;
};

export type PageApiDispatchResult =
  | { ok: true; outcome: "VERIFIED" | "ALREADY_SATISFIED" }
  | { ok: false; outcome: "FAILED" | "UNKNOWN"; code: string };
