import { expect, it } from "vitest";
import { importAdvisory } from "../../../../../packages/codebase-builder/src/index.js";
import { writeAdvisory } from "../../../../../packages/codebase-repository/src/index.js";
import { managementFixture } from "./management-fixture.js";
it("lists page-scoped learned metadata, separate recorded workflows and immutable source history", async () => {
  const f = await managementFixture();
  try {
    expect(
      await f.manager.request({
        kind: "advisory.profiles",
        cursor: null,
        filter: "fixture",
        limit: 10,
      }),
    ).toMatchObject({
      revision: 2,
      enabled: true,
      items: [{ scope: f.scope, recipeCount: 1 }],
      cursor: null,
      partial: false,
    });
    expect(
      await f.manager.request({
        kind: "advisory.workflows",
        cursor: null,
        limit: 20,
      }),
    ).toMatchObject({
      items: [
        {
          id: f.recorded.entity.id,
          name: "Saved workflow",
          source: "recorded",
        },
      ],
    });
    expect(
      await f.manager.request({
        kind: "advisory.history",
        scope: f.scope,
        id: f.learned.entity.id,
        cursor: 0,
        limit: 20,
      }),
    ).toMatchObject({
      items: [{ sourceRevision: 1, successfulAt: 999, stepLabels: ["Query"] }],
      cursor: null,
    });
    expect(
      JSON.stringify(
        await f.manager.request({ kind: "advisory.profile", scope: f.scope }),
      ),
    ).not.toContain("capability");
  } finally {
    f.db.close();
  }
});
it("preserves observed source titles while editable overrides and disable flags control advisory reuse", async () => {
  const f = await managementFixture();
  try {
    await f.manager.request({
      kind: "advisory.update",
      revision: 2,
      scope: f.scope,
      id: f.learned.entity.id,
      patch: { name: "Custom recipe", enabled: false },
    });
    expect((await f.read()).entities).toHaveLength(1);
    expect(
      await f.manager.request({ kind: "advisory.profile", scope: f.scope }),
    ).toMatchObject({
      profile: { recipes: [{ name: "Custom recipe", enabled: false }] },
    });
    await expect(
      f.manager.request({
        kind: "advisory.feature",
        revision: 2,
        enabled: false,
      }),
    ).rejects.toThrow("MANAGEMENT_STALE");
    await f.manager.request({
      kind: "advisory.update",
      revision: 3,
      scope: f.scope,
      id: null,
      patch: { notes: "Local note", autoUpdate: false },
    });
    const next = await importAdvisory(
      { ...f.input, sourceRevision: 2 },
      f.graph.entities[0]!,
    );
    await expect(writeAdvisory(f.db, next, 1002)).rejects.toThrow(
      "IMPORT_MANAGEMENT_DISABLED",
    );
  } finally {
    f.db.close();
  }
});
it("deletes only selected source metadata, keeps replay receipts and prevents old source resurrection", async () => {
  const f = await managementFixture();
  try {
    await f.manager.request({
      kind: "advisory.delete",
      revision: 2,
      scope: f.scope,
      id: null,
    });
    expect((await f.read()).entities).toHaveLength(1);
    expect(await writeAdvisory(f.db, f.learned, 1002)).toBe("DELETED");
    expect((await f.read()).entities).toHaveLength(1);
    expect(
      await f.manager.request({
        kind: "advisory.history",
        scope: f.scope,
        id: f.learned.entity.id,
        cursor: 0,
        limit: 20,
      }),
    ).toMatchObject({ items: [] });
    const next = await importAdvisory(
      { ...f.input, sourceRevision: 2 },
      f.graph.entities[0]!,
    );
    await writeAdvisory(f.db, next, 1003);
    expect((await f.read()).entities).toHaveLength(2);
  } finally {
    f.db.close();
  }
});
it("fences simultaneous manager writers and global feature changes against recorded workflows", async () => {
  const f = await managementFixture();
  try {
    const results = await Promise.allSettled(
      [true, false].map((enabled) =>
        f.manager.request({ kind: "advisory.feature", revision: 2, enabled }),
      ),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    await f.manager.request({
      kind: "advisory.feature",
      revision: 3,
      enabled: false,
    });
    expect((await f.read()).entities).toHaveLength(1);
    await f.manager.request({ kind: "advisory.clear", revision: 4 });
    expect(
      await f.manager.request({
        kind: "advisory.profiles",
        cursor: null,
        filter: "",
        limit: 10,
      }),
    ).toMatchObject({ items: [] });
    expect((await f.read()).entities).toHaveLength(1);
  } finally {
    f.db.close();
  }
});
