import {
  traceBranch,
  traceDecision,
  traceMethod,
} from "../diagnostics/method-trace.js";
import { isSensitive } from "../security/redaction.js";
import {
  composeBootstrapEnvelope,
  type PageNodeInput,
} from "./bootstrap-composer.js";
import { listActReadTools } from "./capability-check.js";
import type { BootstrapEnvelope } from "./contracts.js";

// Executor-level definition tool -> offered propose_* schema. Mirrors
// service-worker/act-tools.ts genericActTools without importing the
// service-worker graph (keeps the harness free of product cycles).
export const EXECUTOR_TO_PROPOSE: Record<string, string> = {
  click_by_ref: "propose_click",
  navigate: "propose_navigate",
  set_text_by_ref: "propose_set_text",
  select_option_by_ref: "propose_select_option",
  set_checked_by_ref: "propose_set_checked",
  press_key_by_ref: "propose_press_key",
};

export type ActEntrySnapshotNode = {
  role: string;
  name: string;
  visible: boolean;
  enabled: boolean;
  autocomplete?: string;
};

export type ActEntryBridgeInput = {
  request_id: string;
  request_revision: number;
  mode: "act" | "ask";
  text: string;
  document_epoch: string;
  page_scope_epoch: string;
  origin?: string;
  path?: string;
  nodes: ActEntrySnapshotNode[];
  definition_tools: string[];
  inventory_id: string;
  observation_evidence_id: string;
  script_read: "AVAILABLE" | "CONSENT_REQUIRED" | "UNSUPPORTED";
};

export const toHarnessNode = (node: ActEntrySnapshotNode): PageNodeInput => ({
  role: node.role,
  name: node.name,
  visible: node.visible,
  enabled: node.enabled,
  sensitive: isSensitive(node.role, node.name, node.autocomplete),
});

export const proposeNamesFor = (definitionTools: string[]): string[] =>
  traceMethod(
    "page-act-harness/act-entry-bridge.ts:proposeNamesFor",
    { definition_count: definitionTools.length },
    () => {
      const known: string[] = [];
      const unknown: string[] = [];
      for (const tool of definitionTools) {
        const name = EXECUTOR_TO_PROPOSE[tool];
        if (name !== undefined) known.push(name);
        else unknown.push(tool);
      }
      // Unknown executor tools are dropped from the declaration (never
      // invented as propose schemas); the drop is traced so mapping drift
      // between act-tools.ts and this mirror stays visible.
      if (unknown.length > 0)
        traceDecision("page-act-harness.entry.unknown_tools", { unknown });
      return [...new Set(known)];
    },
  );

// Propose schema -> snapshot roles that justify offering it. Used to tell a
// legitimate narrowing (page changed, targets gone) from a bug (targets
// still visible while the tool vanished). Tools without a role mapping are
// exempt from the check rather than failed.
const PROPOSE_TO_ROLES: Record<string, string[]> = {
  propose_click: ["button", "tab", "menuitem", "option"],
  propose_navigate: ["link", "menuitem"],
  propose_set_text: ["textbox"],
  propose_select_option: ["combobox"],
  propose_set_checked: ["checkbox", "radio"],
};

export const findUnjustifiedDrops = (
  declaredPropose: string[],
  offeredSchemas: Array<{ name: string }>,
  nodes: Array<{ role: string; visible: boolean; enabled: boolean }>,
): string[] =>
  traceMethod(
    "page-act-harness/act-entry-bridge.ts:findUnjustifiedDrops",
    { declared_count: declaredPropose.length },
    () => {
      const offered = new Set(offeredSchemas.map((schema) => schema.name));
      const unjustified = declaredPropose.filter((name) => {
        if (offered.has(name)) return false;
        const roles = PROPOSE_TO_ROLES[name];
        if (roles === undefined) return false;
        return nodes.some(
          (node) => roles.includes(node.role) && node.visible && node.enabled,
        );
      });
      traceDecision("page-act-harness.entry.drops_checked", {
        declared: declaredPropose,
        unjustified,
      });
      return unjustified;
    },
  );

export const composeActEntryEnvelope = (
  input: ActEntryBridgeInput,
): {
  envelope: BootstrapEnvelope;
  propose_tools: string[];
  entry_roles: string[];
} =>
  traceMethod(
    "page-act-harness/act-entry-bridge.ts:composeActEntryEnvelope",
    { request_revision: input.request_revision, mode: input.mode },
    () => {
      const proposeTools = proposeNamesFor(input.definition_tools);
      const nodes = input.nodes.map(toHarnessNode);
      const entryRoles = [
        ...new Set(
          nodes
            .filter(
              (node) => node.visible && node.enabled && node.sensitive !== true,
            )
            .map((node) => node.role),
        ),
      ];
      const envelope = composeBootstrapEnvelope({
        request_id: input.request_id,
        request_revision: input.request_revision,
        mode: input.mode,
        text: input.text,
        document_epoch: input.document_epoch,
        page_scope_epoch: input.page_scope_epoch,
        ...(input.origin !== undefined ? { origin: input.origin } : {}),
        ...(input.path !== undefined ? { path: input.path } : {}),
        nodes,
        read_tools: listActReadTools(),
        propose_tools: proposeTools,
        script_read: input.script_read,
        inventory_id: input.inventory_id,
        observation_evidence_id: input.observation_evidence_id,
      });
      traceDecision("page-act-harness.entry.composed", {
        request_revision: input.request_revision,
        propose_tools: proposeTools,
        entry_roles: entryRoles,
      });
      return { envelope, propose_tools: proposeTools, entry_roles: entryRoles };
    },
  );

// Declared (chat-start definitions) ⊆ offered (step-runner tool schemas):
// silently narrowing the declared set — e.g. dropping the text-input tool
// while the page still shows a textbox — fails loudly instead of steering
// the model into an unrelated workflow step.
export const assertHarnessSubsetOffered = (
  declaredPropose: string[],
  offeredSchemas: Array<{ name: string }>,
): void =>
  traceMethod(
    "page-act-harness/act-entry-bridge.ts:assertHarnessSubsetOffered",
    { declared_count: declaredPropose.length },
    (context) => {
      const offered = new Set(offeredSchemas.map((schema) => schema.name));
      const dropped = declaredPropose.filter((name) => !offered.has(name));
      traceDecision("page-act-harness.entry.subset_checked", {
        declared: declaredPropose,
        dropped,
      });
      if (dropped.length > 0) {
        traceBranch(
          context,
          "page-act-harness/act-entry-bridge.ts:assertHarnessSubsetOffered",
          "fail",
          dropped[0] ?? "unknown",
          "declared propose tool missing from offered schemas",
        );
        throw new Error(`HARNESS_TOOL_NARROWING:${dropped.join(",")}`);
      }
    },
  );
