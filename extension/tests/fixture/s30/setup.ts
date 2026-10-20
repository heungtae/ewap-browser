import { digest } from "../../../../packages/codebase-schema/src/index.js";
import {
  ToolRegistry,
  type ToolContext,
  type Effect,
  type SemanticRef,
  type ToolId,
  type ToolHandler,
} from "../../../../packages/tool-registry/src/index.js";
import {
  Approvals,
  UiAuthority,
  type PolicySnapshot,
} from "../../../../packages/policy-engine/src/index.js";
export async function setup(tool: ToolId = "web.fill") {
  const policy: PolicySnapshot = {
    revision: 1,
    mode: "full",
    siteAllowed: true,
    deniedTools: [],
    autoUnsubmitted: true,
    boundedWrite: false,
  };
  const now = Date.now();
  const context: ToolContext = {
    taskId: "task",
    stepId: "step",
    mode: "act",
    runtimeEpoch: 1,
    planRevision: 1,
    cancellationGeneration: 0,
    profileId: "profile",
    partitionId: "partition",
    windowId: 1,
    tabId: 1,
    frameId: 0,
    documentId: "document",
    documentEpoch: 1,
    routeEpoch: 1,
    graphRevision: 1,
    entityRevision: 1,
    capabilityRevision: 1,
    capabilityDigest: "0".repeat(64),
    policyRevision: 1,
    policyDigest: await digest(policy),
    leaseId: "lease",
    leaseExpiresAt: now + 60000,
    deadline: now + 60000,
  };
  const registry = new ToolRegistry();
  // Availability-only fixture handler, not a production provider registration.
  const handler: ToolHandler = {
    async execute() {
      return { toolCallId: "fixture", tool, status: "unavailable", data: null };
    },
    async verify() {
      return false;
    },
  };
  registry.register(tool, handler);
  const capabilities = new Set([tool]);
  context.capabilityDigest = (
    await registry.snapshot(context, capabilities)
  ).digest;
  const ui = new UiAuthority("fixture");
  const principal = ui.authenticate({
    extensionId: "fixture",
    url: "chrome-extension://fixture/sidepanel/index.html",
    documentId: "ui-document",
    profileId: context.profileId,
    windowId: context.windowId,
  });
  const approvals = new Approvals(
    ui,
    () => policy,
    () => context,
  );
  const target: SemanticRef = {
    id: "action",
    kind: "action",
    partitionId: "partition",
    revision: 1,
  };
  const effect: Effect = {
    mechanism: "edit_control",
    business: "unsubmitted",
    sensitive: false,
    bulk: false,
    disclosure: false,
  };
  return {
    policy,
    context,
    registry,
    capabilities,
    ui,
    principal,
    approvals,
    target,
    effect,
  };
}
