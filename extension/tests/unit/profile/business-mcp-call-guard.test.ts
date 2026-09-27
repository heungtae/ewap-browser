import { describe, expect, it } from "vitest";
import {
  assertFreshBusinessMcpCall,
  type BusinessMcpPageProof,
} from "../../../src/profile/business-mcp-call-guard.js";

const proof: BusinessMcpPageProof = {
  tabId: 7,
  origin: "https://fixture.company.test",
  documentEpoch: "document-1",
  pageScopeEpoch: "scope-1",
  pageDigest: "digest-1",
};

describe("Business MCP dispatch guard", () => {
  it("accepts a current page and unexpired Profile", () => {
    expect(() =>
      assertFreshBusinessMcpCall(
        proof,
        { ...proof },
        "2026-09-26T13:00:00Z",
        1,
      ),
    ).not.toThrow();
  });
  it("rejects changed tabs, documents, scopes, and page content", () => {
    for (const current of [
      undefined,
      { ...proof, tabId: 8 },
      { ...proof, documentEpoch: "document-2" },
      { ...proof, pageScopeEpoch: "scope-2" },
      { ...proof, pageDigest: "digest-2" },
    ])
      expect(() =>
        assertFreshBusinessMcpCall(proof, current, "2026-09-26T13:00:00Z", 1),
      ).toThrow("PAGE_SCOPE_STALE");
  });
  it("rejects a Profile whose expiry has passed at dispatch", () => {
    expect(() =>
      assertFreshBusinessMcpCall(
        proof,
        proof,
        "2026-09-26T13:00:00Z",
        Date.parse("2026-09-26T13:00:00Z"),
      ),
    ).toThrow("PROFILE_UNAVAILABLE");
  });
});
