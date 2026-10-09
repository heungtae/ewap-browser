import {
  traceBranch,
  traceDecision,
  traceMethod,
} from "../diagnostics/method-trace.js";
import type { CapabilityInventory } from "./contracts.js";

export type ToolSchemaRef = { name: string };
export type UnsupportedCapability = { name: string; reason: string };

export const ACT_READ_TOOLS = [
  "read_page",
  "get_page_text",
  "find",
  "read_semantic_projection",
  "list_page_resources",
  "search_page_resources",
  "read_page_resource",
] as const;

// Name-level agreement only: executor binding/shape/version checks belong to
// the PAH-3 read-loop integration, not to this allowlist guard.
export const ASK_READ_ALLOWLIST = [
  "read_semantic_projection",
  "read_page",
  "get_page_text",
  "find",
  "screenshot",
  "zoom",
  "tabs_context",
  "read_batch",
] as const;

export const assertCapabilityToolAgreement = (
  capabilities: CapabilityInventory,
  offeredSchemas: ToolSchemaRef[],
  unsupported: UnsupportedCapability[] = [],
): { read: string[]; propose: string[] } =>
  traceMethod(
    "page-act-harness/capability-check.ts:assertCapabilityToolAgreement",
    {
      read_count: capabilities.read.length,
      propose_count: capabilities.propose.length,
      schema_count: offeredSchemas.length,
    },
    (context) => {
      const method =
        "page-act-harness/capability-check.ts:assertCapabilityToolAgreement";
      const schemaNames = new Set(offeredSchemas.map((schema) => schema.name));
      const declared = [...capabilities.read, ...capabilities.propose];
      const overlap = capabilities.read.filter((name) =>
        capabilities.propose.includes(name),
      );
      if (overlap.length > 0) {
        traceBranch(
          context,
          method,
          "fail",
          overlap[0] ?? "unknown",
          "read/propose overlap",
        );
        throw new Error(`CAPABILITY_OVERLAP:${overlap[0]}`);
      }
      for (const name of declared) {
        if (!schemaNames.has(name)) {
          traceBranch(
            context,
            method,
            "fail",
            name,
            "capability without tool schema",
          );
          throw new Error(`CAPABILITY_WITHOUT_SCHEMA:${name}`);
        }
      }
      for (const schema of offeredSchemas) {
        if (!declared.includes(schema.name)) {
          traceBranch(
            context,
            method,
            "fail",
            schema.name,
            "tool schema without capability",
          );
          throw new Error(`SCHEMA_WITHOUT_CAPABILITY:${schema.name}`);
        }
      }
      for (const item of unsupported) {
        if (declared.includes(item.name) || schemaNames.has(item.name)) {
          traceBranch(
            context,
            method,
            "fail",
            item.name,
            "unsupported also offered",
          );
          throw new Error(`UNSUPPORTED_OFFERED:${item.name}`);
        }
      }
      traceDecision("page-act-harness.capability.agreement", {
        read: capabilities.read,
        propose: capabilities.propose,
        unsupported: unsupported.map((item) => item.name),
      });
      return { read: capabilities.read, propose: capabilities.propose };
    },
  );

export const listActReadTools = (): string[] => [...ACT_READ_TOOLS];

export const guardAskReadOnly = (toolNames: string[]): void =>
  traceMethod(
    "page-act-harness/capability-check.ts:guardAskReadOnly",
    { tool_count: toolNames.length },
    (context) => {
      const allowed = new Set<string>([...ASK_READ_ALLOWLIST]);
      const leaked = toolNames.filter((name) => !allowed.has(name));
      traceDecision("page-act-harness.ask.readonly_guard", {
        tool_count: toolNames.length,
        leaked,
      });
      if (leaked.length > 0) {
        traceBranch(
          context,
          "page-act-harness/capability-check.ts:guardAskReadOnly",
          "fail",
          leaked[0] ?? "unknown",
          "non-read-only tool in Ask mode",
        );
        throw new Error(`ASK_MUTATION_LEAK:${leaked[0]}`);
      }
    },
  );

export const guardActScriptConsent = (
  scriptRead: CapabilityInventory["script_read"],
  bodyRequested: boolean,
): void =>
  traceMethod(
    "page-act-harness/capability-check.ts:guardActScriptConsent",
    { script_read: scriptRead, body_requested: bodyRequested },
    (context) => {
      const method =
        "page-act-harness/capability-check.ts:guardActScriptConsent";
      if (scriptRead === "UNSUPPORTED" && bodyRequested) {
        traceBranch(
          context,
          method,
          "fail",
          "SCRIPT_UNSUPPORTED",
          "script channel unavailable",
        );
        throw new Error("SCRIPT_UNSUPPORTED");
      }
      if (scriptRead !== "AVAILABLE" && bodyRequested) {
        traceBranch(
          context,
          method,
          "fail",
          "SCRIPT_CONSENT_REQUIRED",
          "consent gate",
        );
        throw new Error("SCRIPT_CONSENT_REQUIRED");
      }
      traceDecision("page-act-harness.script.guard_pass", {
        script_read: scriptRead,
      });
    },
  );
