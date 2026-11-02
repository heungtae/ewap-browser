import { expect, it } from "vitest";
import { importAdvisory } from "../../../../../packages/codebase-builder/src/index.js";
import {
  AdvisoryManager,
  readAdvisory,
  writeAdvisory,
} from "../../../../../packages/codebase-repository/src/index.js";
import {
  managementCommandSchema,
  profilesPageSchema,
} from "../../../../../packages/codebase-schema/src/index.js";
import { managementFixture } from "./management-fixture.js";
it("pages recipes without duplication and reads eligible candidates beyond disabled records", async () => {
  const f = await managementFixture();
  try {
    for (let i = 0; i < 21; i++) {
      const record = await importAdvisory(
        { ...f.input, sourceId: `recipe_${i}` },
        f.graph.entities[0]!,
      );
      await writeAdvisory(f.db, record, 1000);
    }
    const first = await f.manager.request({
      kind: "advisory.profile",
      scope: f.scope,
    });
    if (!("profile" in first)) throw Error("PROFILE_EXPECTED");
    expect(first.profile).toMatchObject({ recipeCount: 22, truncated: true });
    expect(first.profile.recipes).toHaveLength(20);
    const next = await f.manager.request({
      kind: "advisory.profile",
      scope: f.scope,
      cursor: first.profile.cursor,
    });
    if (!("profile" in next)) throw Error("PROFILE_EXPECTED");
    expect(next.profile).toMatchObject({ cursor: null, truncated: false });
    expect(
      new Set(
        [...first.profile.recipes, ...next.profile.recipes].map((r) => r.id),
      ).size,
    ).toBe(22);
    await f.manager.request({
      kind: "advisory.feature",
      revision: first.revision,
      enabled: false,
    });
    const read = await readAdvisory(
      f.db,
      f.scope.partitionId,
      f.scope.pageKey,
      1,
      1001,
    );
    expect(read.entities).toEqual([f.recorded.entity]);
    expect(read.management).toMatchObject([{ source: "recorded" }]);
    expect(read.partial).toBe(read.cursor !== null);
  } finally {
    f.db.close();
  }
});
it("seeks workflow continuations and preserves numeric source history ordering", async () => {
  const f = await managementFixture();
  try {
    const record = await importAdvisory(
      { ...f.input, source: "recorded", sourceId: "second_recorded" },
      f.graph.entities[0]!,
    );
    await writeAdvisory(f.db, record, 1000);
    const first = await f.manager.request({
      kind: "advisory.workflows",
      cursor: null,
      limit: 1,
    });
    if (!("items" in first) || !("partial" in first))
      throw Error("PAGE_EXPECTED");
    expect(first).toMatchObject({ partial: true });
    const last = await f.manager.request({
      kind: "advisory.workflows",
      cursor: first.cursor,
      limit: 1,
    });
    if (!("items" in last)) throw Error("PAGE_EXPECTED");
    expect(last).toMatchObject({ partial: false, cursor: null });
    expect(first.items).toHaveLength(1);
    expect(last.items).toHaveLength(1);
    expect(last.items).not.toEqual(first.items);
    for (let sourceRevision = 2; sourceRevision <= 12; sourceRevision++) {
      await writeAdvisory(
        f.db,
        await importAdvisory(
          { ...f.input, sourceRevision },
          f.graph.entities[0]!,
        ),
        1000,
      );
    }
    const history = await f.manager.request({
      kind: "advisory.history",
      scope: f.scope,
      id: f.learned.entity.id,
      cursor: 5,
      limit: 5,
    });
    expect(history).toMatchObject({
      items: [6, 7, 8, 9, 10].map((sourceRevision) => ({ sourceRevision })),
      cursor: 10,
    });
    expect(
      await f.manager.request({
        kind: "advisory.history",
        scope: f.scope,
        id: f.learned.entity.id,
        cursor: 10,
        limit: 5,
      }),
    ).toMatchObject({
      items: [{ sourceRevision: 11 }, { sourceRevision: 12 }],
      cursor: null,
    });
  } finally {
    f.db.close();
  }
});
it("rolls back expired changes and keeps rediscovery observation-only until newer source evidence", async () => {
  const f = await managementFixture();
  try {
    let clock = 1001;
    const expired = new AdvisoryManager(
      f.db,
      f.graph.context.profileGuard,
      () => (clock += 10000),
    );
    await expect(
      expired.request({
        kind: "advisory.feature",
        revision: 2,
        enabled: false,
      }),
    ).rejects.toThrow("MANAGEMENT_EXPIRED");
    await f.manager.request({
      kind: "advisory.rediscover",
      revision: 2,
      scope: f.scope,
      id: f.learned.entity.id,
    });
    expect((await f.read()).entities).toEqual([f.recorded.entity]);
    await writeAdvisory(
      f.db,
      await importAdvisory(
        { ...f.input, sourceRevision: 2 },
        f.graph.entities[0]!,
      ),
      1000,
    );
    expect((await f.read()).entities).toHaveLength(2);
    await expect(
      f.manager.request({
        kind: "advisory.feature",
        revision: 3,
        enabled: false,
      }),
    ).rejects.toThrow("MANAGEMENT_STALE");
  } finally {
    f.db.close();
  }
});
it("rejects authority-bearing management input and output", async () => {
  const f = await managementFixture();
  try {
    expect(
      managementCommandSchema.safeParse({
        kind: "advisory.update",
        revision: 2,
        scope: f.scope,
        id: null,
        patch: { grant: "old" },
      }).success,
    ).toBe(false);
    const list = await f.manager.request({
      kind: "advisory.profiles",
      cursor: null,
      filter: "",
      limit: 10,
    });
    expect(profilesPageSchema.safeParse(list).success).toBe(true);
    expect(
      profilesPageSchema.safeParse({ ...list, liveRef: "stale" }).success,
    ).toBe(false);
    await expect(
      f.manager.request({
        kind: "advisory.workflows",
        cursor: null,
        limit: 21,
      }),
    ).rejects.toThrow();
  } finally {
    f.db.close();
  }
});
