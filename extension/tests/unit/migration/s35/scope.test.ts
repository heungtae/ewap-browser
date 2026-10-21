import { expect, it } from "vitest";
import {
  assertScope,
  executeSchema,
  grantSchema,
  stepSchema,
} from "../../../../../packages/integration-adapters/src/contracts.js";
import { catalog } from "../../../../../apps/agent-server/src/mcp/catalog.js";
import { ToolRegistry } from "../../../../../packages/tool-registry/src/index.js";
const grant = {
  clientId: "client",
  revision: 1,
  profileId: "profile",
  origins: ["https://fixture.test"],
  tabIds: [1],
  modes: ["ask", "act"] as ("ask" | "act")[],
  tools: ["web.fill"] as const,
  externalController: true,
  expiresAt: 100,
};
const scope = {
  profileId: "profile",
  origin: "https://fixture.test",
  tabId: 1,
  mode: "act" as const,
};
const valid = () => grantSchema.parse(grant);
it("S35 scope validation admits only exact paired profile/site/tab/mode and unexpired grants", () => {
  expect(() => assertScope(valid(), scope, 1)).not.toThrow();
  for (const changed of [
    { profileId: "foreign" },
    { tabId: 9 },
    { origin: "https://elsewhere.test" },
  ])
    expect(() => assertScope(valid(), { ...scope, ...changed }, 1)).toThrow(
      "MCP_SCOPE_DENIED",
    );
  expect(() => assertScope({ ...valid(), modes: ["ask"] }, scope, 1)).toThrow(
    "MCP_SCOPE_DENIED",
  );
  expect(() => assertScope(valid(), scope, 100)).toThrow("MCP_SCOPE_DENIED");
});
it("S35 exact origins and closed caller contracts reject forged authority", () => {
  expect(() =>
    executeSchema.parse({
      ...scope,
      origin: "https://fixture.test/path",
      requestId: "request",
      objective: "test",
    }),
  ).toThrow();
  expect(() =>
    executeSchema.parse({
      ...scope,
      requestId: "request",
      objective: "test",
      owner: "other",
    }),
  ).toThrow();
  expect(() =>
    stepSchema.parse({
      taskHandle: crypto.randomUUID(),
      callId: "call",
      input: {},
      approvalId: "fake",
    }),
  ).toThrow();
});
it("S35 catalog exposes only negotiated registered capabilities, never unqualified completion/analysis", () => {
  const registry = new ToolRegistry();
  registry.register("web.fill", {
    execute: async () => ({
      toolCallId: "call",
      tool: "web.fill",
      status: "unavailable",
      data: null,
    }),
    verify: async () => false,
  });
  expect(catalog(valid(), registry).tools.map((t) => t.name)).toContain(
    "web__fill",
  );
  const ask = catalog({ ...valid(), modes: ["ask"] }, registry);
  expect(ask.tools.map((t) => t.name)).not.toContain("web__fill");
  const high = catalog({ ...valid(), externalController: false }, registry);
  expect(high.tools).toHaveLength(3);
  expect(high.tools.map((t) => t.name)).not.toContain("task__complete");
  expect(high.tools.map((t) => t.name)).not.toContain("analysis__run");
});
