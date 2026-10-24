import { expect, it } from "vitest";
import { convertMg03 } from "../../../../../apps/chrome-extension/src/migration/mg03-convert.js";
import { setup, receipt } from "../../learned-profile/helpers.js";
import { savedWorkflow, savedSource } from "./mg03-support.js";
it("imports disabled saved workflows only as advisory, without historical fingerprints", () => {
  const snapshot = savedSource();
  const before = structuredClone(snapshot);
  const result = convertMg03(snapshot);
  expect(result.records[0]).toMatchObject({
    sourceId: savedWorkflow.id,
    executable: false,
    requiresFreshValidation: true,
    metadata: {
      enabled: false,
      title: savedWorkflow.title,
      declaration: savedWorkflow.declaration,
    },
  });
  expect(JSON.stringify(result)).not.toContain("old-binding");
  expect(snapshot).toEqual(before);
});
it("keeps malformed/unsupported/duplicate records in explicit quarantine counts", () => {
  const snapshot = {
    saved_workflows_v1: {
      schema_version: 1,
      records: [
        savedWorkflow,
        { ...savedWorkflow, id: "invalid" },
        savedWorkflow,
        {
          ...savedWorkflow,
          declaration: {
            ...savedWorkflow.declaration,
            steps: [{ tool: "run_script" }],
          },
        },
      ],
    },
  };
  const result = convertMg03(snapshot);
  expect(result.sourceCount).toBe(4);
  expect(result.records).toHaveLength(1);
  expect(result.quarantine.map((q) => q.reason)).toEqual([
    "INVALID_RECORD",
    "DUPLICATE_ID",
    "INVALID_RECORD",
  ]);
});
it("quarantines an unsupported container rather than silently dropping its contents", () => {
  const result = convertMg03({
    saved_workflows_v1: { schema_version: 2, records: [savedWorkflow] },
  });
  expect(result.quarantine).toEqual([
    {
      sourceKey: "saved_workflows_v1",
      sourceIndex: -1,
      reason: "INVALID_CONTAINER",
    },
  ]);
  expect(result.sourceCount).toBe(1);
  expect(convertMg03({}).sourceCount).toBe(0);
});
it("retains learned metadata/history and controls without commands, guards, identities or receipts", async () => {
  const f = setup();
  await f.store.commit(
    await receipt(f.store, undefined, [
      { channel: "read", operation: "read_page", target_guard: "d".repeat(64) },
    ]),
  );
  const catalog = await f.store.snapshot();
  catalog.enabled = false;
  const profile = catalog.records[0]!;
  profile.name = "Saved procedure";
  profile.notes = "Original note";
  profile.auto_update = false;
  // Explicit old-v1 compatibility also accepted by the original catalog reader.
  const { commands: _commands, ...old } = profile;
  const result = convertMg03({
    learned_page_profiles_v1: { ...catalog, records: [old] },
  });
  expect(result.records).toHaveLength(1);
  expect(result.records[0]?.metadata).toMatchObject({
    name: "Saved procedure",
    notes: "Original note",
    auto_update: false,
    catalogEnabled: false,
  });
  const target = JSON.stringify(result);
  for (const forbidden of [
    "target_guard",
    "page_match",
    "context_guard",
    "commands",
    "receipts",
  ])
    expect(target).not.toContain(forbidden);
  expect(result.records[0]?.metadata).toMatchObject({
    recipes: [
      {
        history: expect.any(Array),
        steps: [{ channel: "read", operation: "read_page" }],
      },
    ],
  });
});
