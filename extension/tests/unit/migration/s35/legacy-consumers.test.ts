import { expect, it, vi } from "vitest";
import {
  legacyEnterpriseDecision,
  legacyBusinessCall,
  legacyAudit,
  legacyStudioPreview,
} from "../../../../../apps/agent-server/src/integrations/legacy-consumers.js";
const request = {
  run_id: "run",
  tab_id: 1,
  document_epoch: "epoch",
  origin: "https://fixture.test",
  capability: "click" as const,
  risk: "R2" as const,
  profile: { id: "profile", version: 1 },
};
const proof = {
  tabId: 1,
  origin: "https://fixture.test",
  documentEpoch: "epoch",
  pageScopeEpoch: "scope",
  pageDigest: "digest",
};
const freshness = () => ({
  expected: proof,
  current: () => proof,
  expiresAt: new Date(Date.now() + 60000).toISOString(),
});
it.each([false, true])(
  "S35 enterprise deny/managed auto remain original rejection paths: %s",
  async (managed_auto) => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        decision: managed_auto ? "ALLOW" : "DENY",
        managed_auto,
      }),
    );
    await expect(
      legacyEnterpriseDecision(
        {
          schema_version: 1,
          mode: "enterprise",
          pdp_url: "https://policy.test/decide",
        },
        async () => ({
          organization_id: "org",
          user_id: "user",
          device_id: "device",
        }),
        request,
        fetcher,
      ),
    ).rejects.toThrow(
      managed_auto
        ? "ENTERPRISE_POLICY_UNAVAILABLE"
        : "ENTERPRISE_POLICY_DENIED",
    );
  },
);
it("S35 Business MCP adapter keeps its proprietary binding/envelope and rejects MCP JSON-RPC substitution", async () => {
  const binding = {
    server_id: "server",
    endpoint: "https://business.test",
    tool_id: "field",
    title: "Field",
    description: "Read",
    arguments: {
      type: "object" as const,
      additionalProperties: false as const,
      properties: {},
      required: [],
    },
    result_key: "value",
    value_kind: "text" as const,
    max_result_chars: 100,
  };
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValue(Response.json({ jsonrpc: "2.0", id: 1, result: {} }));
  await expect(
    legacyBusinessCall(
      binding,
      { kind: "CALL_PAGE_BUSINESS_TOOL", arguments: {} },
      { requestId: "request", runId: "run", nonce: "nonce", digest: "digest" },
      freshness(),
      fetcher,
    ),
  ).rejects.toThrow("BUSINESS_MCP_PROTOCOL_ERROR");
  const body = JSON.parse(String(fetcher.mock.calls[0]![1]!.body));
  expect(body).toMatchObject({
    kind: "CALL_PAGE_BUSINESS_TOOL",
    request_id: "request",
    resolver_request_nonce: "nonce",
    page_context_digest: "digest",
  });
  expect(body).not.toHaveProperty("jsonrpc");
});
it("S35 audit original serialization excludes raw extra fields and Studio preview grants no execution", () => {
  expect(
    legacyAudit({ event: "terminal", run_id: "run", outcome: "UNKNOWN" }),
  ).toMatchObject({ protocol: "browser-audit/v1" });
  expect(() =>
    legacyAudit({
      event: "terminal",
      run_id: "run",
      outcome: "UNKNOWN",
      secret: "forbidden",
    } as Parameters<typeof legacyAudit>[0]),
  ).toThrow();
  const preview = legacyStudioPreview({
    source_valid: true,
    signature_valid: false,
    fingerprint_match: true,
    workflow_targets_unique: true,
    policy_allowed: false,
    regression_selected: true,
    chrome_evidence: false,
  });
  expect(preview.executable).toBe(false);
  expect(preview.checks.some((c) => !c.passed)).toBe(true);
});
it("S35 stale Business MCP page proof rejects before any outbound call", async () => {
  const binding = {
    server_id: "server",
    endpoint: "https://business.test",
    tool_id: "field",
    title: "Field",
    description: "Read",
    arguments: {
      type: "object" as const,
      additionalProperties: false as const,
      properties: {},
      required: [],
    },
    result_key: "value",
    value_kind: "text" as const,
    max_result_chars: 100,
  };
  const fetcher = vi.fn<typeof fetch>();
  await expect(
    legacyBusinessCall(
      binding,
      { kind: "CALL_PAGE_BUSINESS_TOOL", arguments: {} },
      { requestId: "request", runId: "run", nonce: "nonce", digest: "digest" },
      { ...freshness(), current: () => undefined },
      fetcher,
    ),
  ).rejects.toThrow("PAGE_SCOPE_STALE");
  expect(fetcher).not.toHaveBeenCalled();
});
