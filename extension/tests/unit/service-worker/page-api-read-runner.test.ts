import { afterEach, expect, it, vi } from "vitest";
import { createPageApiReadRunner } from "../../../src/service-worker/page-api-read-runner.js";
import { validatePageApiReadResult } from "../../../src/page-api/read-adapter.js";
const binding = {
  run_id: "read-one",
  tab_id: 1,
  document_id: "document",
  document_epoch: "epoch",
  page_scope_epoch: "scope",
  origin: "https://page-api-fixture.invalid",
  path: "/variant",
  adapter_id: "fixture_summary",
  adapter_version: 1,
  option_id: "summary",
};
const setup = () => {
  const current = { ...binding };
  const authorize = vi.fn(async () => true);
  const executeScript = vi.fn(async () => [
    {
      frameId: 0,
      documentId: "document",
      result: {
        records: [{ category: "North", count: 12 }],
        total: 1,
        eof: true,
      },
    },
  ]);
  const runner = createPageApiReadRunner({
    current: () => current,
    authorize,
    scripting: { executeScript },
  });
  return { current, authorize, executeScript, runner };
};
afterEach(() => vi.useRealTimers());
it("read-only fixture uses separate R0 authorization and closed ephemeral context", async () => {
  const s = setup();
  expect(await s.runner.read(binding)).toMatchObject({
    ok: true,
    context: {
      coverage: "complete",
      records: [{ index: 0, cells: ["North", "12"] }],
    },
  });
  expect(s.authorize).toHaveBeenCalledWith(binding, "page_api_read", "R0");
  expect(s.executeScript).toHaveBeenCalledWith(
    expect.objectContaining({
      world: "MAIN",
      target: { tabId: 1, documentIds: ["document"] },
      args: ["summary"],
    }),
  );
  expect(await s.runner.read(binding)).toEqual({
    ok: false,
    code: "POLICY_DENIED",
  });
  expect(s.executeScript).toHaveBeenCalledOnce();
});
it.each([
  { origin: "https://evil.invalid" },
  { path: "/variant/other" },
  { adapter_version: 2 },
  { option_id: "fetch(secret)" },
  { candidate_ref: "discovery-candidate" },
])("read binding rejects unsupported input %j", async (change) => {
  const s = setup();
  expect(await s.runner.read({ ...binding, ...change })).toEqual({
    ok: false,
    code: "PAGE_API_UNAVAILABLE",
  });
  expect(s.authorize).not.toHaveBeenCalled();
  expect(s.executeScript).not.toHaveBeenCalled();
});
it("denied policy never enters MAIN", async () => {
  const s = setup();
  s.authorize.mockResolvedValue(false);
  expect(await s.runner.read(binding)).toEqual({
    ok: false,
    code: "POLICY_DENIED",
  });
  expect(s.executeScript).not.toHaveBeenCalled();
});
it("scope change during authorization never enters MAIN", async () => {
  const s = setup();
  s.authorize.mockImplementation(async () => {
    s.current.page_scope_epoch = "new";
    return true;
  });
  expect(await s.runner.read(binding)).toEqual({
    ok: false,
    code: "PAGE_SCOPE_STALE",
  });
  expect(s.executeScript).not.toHaveBeenCalled();
});
it("scope change during read discards records", async () => {
  const s = setup();
  s.executeScript.mockImplementation(async () => {
    s.current.page_scope_epoch = "new";
    return [
      {
        frameId: 0,
        documentId: "document",
        result: { records: [], total: 0, eof: true },
      },
    ];
  });
  expect(await s.runner.read(binding)).toEqual({
    ok: false,
    code: "PAGE_SCOPE_STALE",
  });
});
it("Stop discards late records and never retries", async () => {
  const s = setup();
  const stop = new AbortController();
  s.executeScript.mockImplementation(async () => {
    stop.abort();
    return [
      {
        frameId: 0,
        documentId: "document",
        result: { records: [], total: 0, eof: true },
      },
    ];
  });
  expect(await s.runner.read(binding, stop.signal)).toEqual({
    ok: false,
    code: "REQUEST_CANCELLED",
  });
  expect(await s.runner.read(binding)).toEqual({
    ok: false,
    code: "POLICY_DENIED",
  });
});
it("hung read has a bounded deadline and no retry", async () => {
  vi.useFakeTimers();
  const s = setup();
  s.executeScript.mockImplementation(() => new Promise(() => undefined));
  const pending = s.runner.read(binding);
  await vi.advanceTimersByTimeAsync(5001);
  expect(await pending).toEqual({ ok: false, code: "PAGE_API_TIMEOUT" });
  expect(await s.runner.read(binding)).toEqual({
    ok: false,
    code: "POLICY_DENIED",
  });
});
it.each([
  {
    records: [{ category: "safe", count: 1, token: "secret" }],
    total: 1,
    eof: true,
  },
  {
    records: [{ category: "https://secret.invalid", count: 1 }],
    total: 1,
    eof: true,
  },
  { records: [{ category: "safe", count: 1 }], total: 2, eof: true },
  { records: [], total: 0, eof: true, cursor: "secret" },
])("raw result outside closed schema is rejected %j", (value) => {
  expect(validatePageApiReadResult(value)).toBeUndefined();
});
it("result cap downgrades complete coverage", () => {
  expect(
    validatePageApiReadResult({
      records: Array.from({ length: 101 }, () => ({
        category: "public category",
        count: 1,
      })),
      total: 101,
      eof: true,
    }),
  ).toMatchObject({
    coverage: "partial",
    truncated: true,
    collected_count: 101,
    records: expect.any(Array),
  });
});

it("policy failure denies read without exposing details", async () => {
  const s = setup();
  s.authorize.mockRejectedValue(new Error("raw policy secret"));
  expect(await s.runner.read(binding)).toEqual({
    ok: false,
    code: "POLICY_DENIED",
  });
  expect(s.executeScript).not.toHaveBeenCalled();
});
it("MAIN read failure is closed and never retried", async () => {
  const s = setup();
  s.executeScript.mockRejectedValue(new Error("raw page secret"));
  expect(await s.runner.read(binding)).toEqual({
    ok: false,
    code: "PAGE_API_CALL_FAILED",
  });
  expect(await s.runner.read(binding)).toEqual({
    ok: false,
    code: "POLICY_DENIED",
  });
  expect(s.executeScript).toHaveBeenCalledOnce();
});

it("UTF-8 byte cap rejects oversized read data even within record and cell caps", () => {
  expect(
    validatePageApiReadResult({
      records: Array.from({ length: 100 }, () => ({
        category: "가".repeat(160),
        count: 1,
      })),
      total: 100,
      eof: true,
    }),
  ).toBeUndefined();
});
