import { traceDecision, traceMethod } from "../diagnostics/method-trace.js";
import {
  PAGE_ACT_CONTEXT_VERSION,
  validateBootstrapEnvelope,
  type BootstrapEnvelope,
  type ObservedControl,
} from "./contracts.js";

export type PageNodeInput = {
  role: string;
  name: string;
  visible: boolean;
  enabled: boolean;
  sensitive?: boolean;
};

export type BootstrapInput = {
  request_id: string;
  request_revision: number;
  mode: "act" | "ask";
  text: string;
  document_epoch: string;
  page_scope_epoch: string;
  origin?: string;
  path?: string;
  nodes: PageNodeInput[];
  description_excerpt?: string;
  description_evidence_id?: string;
  omitted?: string[];
  read_tools: string[];
  propose_tools: string[];
  unsupported?: Array<{ name: string; reason: string }>;
  script_read: "AVAILABLE" | "CONSENT_REQUIRED" | "UNSUPPORTED";
  inventory_id: string;
  observation_evidence_id: string;
  max_controls?: number;
};

const stripUrlSecrets = (value: string): string => {
  try {
    const parsed = new URL(value, "https://placeholder.local");
    parsed.username = "";
    parsed.password = "";
    parsed.search = "";
    parsed.hash = "";
    const out = parsed.toString();
    return out.startsWith("https://placeholder.local")
      ? out.slice("https://placeholder.local".length) || "/"
      : `${parsed.origin}${parsed.pathname}`;
  } catch {
    return value.split(/[?#]/)[0]?.replace(/[^/]*@/, "") ?? "";
  }
};

export const sanitiseOriginPath = (origin: string, path: string): string =>
  `${stripUrlSecrets(origin)}${stripUrlSecrets(path)}`.replace(
    /([^:])\/{2,}/g,
    "$1/",
  );

const toControl = (node: PageNodeInput, index: number): ObservedControl => ({
  model_ref: `m${index + 1}`,
  role: node.role,
  name: node.name.slice(0, 160),
  visible: node.visible,
  enabled: node.enabled,
});

export const composeBootstrapEnvelope = (
  input: BootstrapInput,
): BootstrapEnvelope =>
  traceMethod(
    "page-act-harness/bootstrap-composer.ts:composeBootstrapEnvelope",
    {
      request_revision: input.request_revision,
      mode: input.mode,
      node_count: input.nodes.length,
    },
    () => {
      if (input.mode === "ask" && input.propose_tools.length > 0) {
        traceDecision("page-act-harness.bootstrap.ask_leak", {
          propose_tools: input.propose_tools,
        });
        throw new Error("ASK_MUTATION_LEAK:propose-in-ask-bootstrap");
      }
      const isCredentialRole = (role: string): boolean =>
        role === "password" || role === "otp" || role === "one-time-code";
      const executable = input.nodes.filter(
        (node) =>
          node.visible &&
          node.enabled &&
          !node.sensitive &&
          !isCredentialRole(node.role),
      );
      const hiddenCount = input.nodes.filter((node) => !node.visible).length;
      const disabledCount = input.nodes.filter(
        (node) => node.visible && !node.enabled,
      ).length;
      const sensitiveCount = input.nodes.filter(
        (node) => node.sensitive === true || isCredentialRole(node.role),
      ).length;
      const maxControls = input.max_controls ?? 20;
      const controls = executable.slice(0, maxControls).map(toControl);
      const truncated = executable.length > controls.length;
      const hasExcerpt = Boolean(input.description_excerpt);
      const omitted = [
        ...(input.omitted ?? []),
        ...(input.origin && input.path
          ? [`target:${sanitiseOriginPath(input.origin, input.path)}`]
          : ["target:WITHHELD"]),
        ...(hiddenCount > 0 ? [`hidden-nodes:${hiddenCount}`] : []),
        ...(disabledCount > 0 ? [`disabled-nodes:${disabledCount}`] : []),
        ...(sensitiveCount > 0 ? [`sensitive-nodes:${sensitiveCount}`] : []),
        ...(truncated
          ? [`controls-truncated:${executable.length - controls.length}`]
          : []),
        ...(hasExcerpt ? [] : ["page-description:NOT_READ"]),
        ...(input.description_excerpt && !input.description_evidence_id
          ? ["page-description:NEEDS_EVIDENCE_ID"]
          : []),
      ];
      const resourceItems =
        hasExcerpt && input.description_evidence_id
          ? [
              {
                resource_id: input.description_evidence_id,
                kind: "page_description",
                state: "AVAILABLE" as const,
              },
            ]
          : [];
      const envelope: BootstrapEnvelope = {
        context_version: PAGE_ACT_CONTEXT_VERSION,
        request: {
          request_id: input.request_id,
          revision: input.request_revision,
          mode: input.mode,
          text: input.text,
        },
        binding: {
          document_epoch: input.document_epoch,
          page_scope_epoch: input.page_scope_epoch,
        },
        observation: {
          evidence_id: input.observation_evidence_id,
          scope: "visible_only",
          controls,
          coverage: {
            complete: false,
            reason: "INITIAL_SUMMARY",
            scope_detail: "visible_only_synopsis",
            omitted,
          },
        },
        resources: {
          inventory_id: input.inventory_id,
          items: resourceItems,
          next_cursor: truncated ? "cursor-controls-1" : null,
        },
        workflow_inventory: {
          sources: ["saved", "profile", "page_generated"],
          state: "NOT_READ",
        },
        capabilities: {
          read: input.read_tools,
          propose: input.propose_tools,
          script_read: input.script_read,
        },
        omitted,
        ...(input.unsupported && input.unsupported.length > 0
          ? { unsupported_capabilities: input.unsupported }
          : {}),
        ...(input.description_excerpt && input.description_evidence_id
          ? {
              description_excerpt: {
                evidence_id: input.description_evidence_id,
                text: input.description_excerpt.slice(0, 2000),
              },
            }
          : {}),
      };
      const validated = validateBootstrapEnvelope(envelope);
      traceDecision("page-act-harness.bootstrap.composed", {
        request_revision: input.request_revision,
        executable_controls: executable.length,
        supplied_controls: controls.length,
        hidden_count: hiddenCount,
        disabled_count: disabledCount,
        sensitive_count: sensitiveCount,
        omitted,
        read_tools: input.read_tools,
        propose_tools: input.propose_tools,
      });
      return validated;
    },
  );

export const isExecutionTarget = (node: PageNodeInput): boolean =>
  node.visible &&
  node.enabled &&
  node.sensitive !== true &&
  node.role !== "password" &&
  node.role !== "otp" &&
  node.role !== "one-time-code";
