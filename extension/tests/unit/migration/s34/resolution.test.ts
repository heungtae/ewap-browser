import { expect, it } from "vitest";
import { resolveInput } from "../../../../../packages/analysis-engine/src/resolve.js";
import { fixture } from "./support.js";
it("S34 resolves only selected approved fields with original lineage and deterministic query totals", async () => {
  const f = await fixture();
  const input = await f.input();
  expect(input.datasets[0]?.rows).toEqual([[10], [20]]);
  expect(input.datasets[0]?.digest).toBe(f.data.digest);
  expect(input.datasets[0]?.aggregates).toContainEqual({
    op: "sum",
    field: "amount",
    value: 30,
  });
  expect(JSON.stringify(input)).not.toMatch(
    /private|example|partition|pageKey|locator|approval/,
  );
});
it("S34 sanitizes approved text and objective instead of uploading raw secrets or URLs", async () => {
  const f = await fixture();
  f.request.datasets[0]!.fields = ["note"];
  f.request.objective = "token=private https://private.test/path";
  const input = await f.input();
  expect(JSON.stringify(input)).not.toMatch(/private|example\.test|https:\/\//);
  expect(input.datasets[0]?.redacted).toBe(true);
});
it.each([
  "digest",
  "partition",
  "page",
  "revision",
  "expired",
  "consent",
  "oversize",
])("S34 rejects %s sources before analyst egress", async (kind) => {
  const f = await fixture();
  if (kind === "digest") f.request.datasets[0]!.digest = "a".repeat(64);
  if (kind === "partition") f.request.partitionId = "foreign_partition";
  if (kind === "page") f.request.datasets[0]!.pageKey = "foreign_page";
  if (kind === "revision") f.request.datasets[0]!.graphRevision = 9;
  if (kind === "expired") f.tick(100);
  if (kind === "consent") f.port.authorized = async () => false;
  if (kind === "oversize") f.request.maxBytes = 1;
  await expect(f.input()).rejects.toThrow(/ANALYSIS_/);
});
it("S34 rejects changed dataset bodies even when caller retains the old digest", async () => {
  const f = await fixture();
  f.data.rows[0]![0] = 900;
  await expect(f.input()).rejects.toThrow("ANALYSIS_DATASET_BINDING");
});
it("S34 denies locator/token columns and duplicate refs", async () => {
  const f = await fixture();
  f.request.datasets[0]!.fields = ["approval_token"];
  await expect(f.input()).rejects.toThrow("ANALYSIS_FORBIDDEN_FIELD");
  f.request.datasets.push(f.request.datasets[0]!);
  await expect(resolveInput(f.request, f.port, f.now)).rejects.toThrow(
    "ANALYSIS_DUPLICATE_DATASET",
  );
});
it("S34 expiry during authorization cannot produce a fresh-looking projection", async () => {
  const f = await fixture();
  f.port.authorized = async () => {
    f.tick(100);
    return true;
  };
  await expect(f.input()).rejects.toThrow("ANALYSIS_DATASET_BINDING");
});
