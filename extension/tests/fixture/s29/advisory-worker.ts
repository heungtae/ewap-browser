import {
  identifyContext,
  buildGraph,
  importAdvisory,
} from "../../../../packages/codebase-builder/src/index.js";
import {
  digest,
  bytes,
} from "../../../../packages/codebase-schema/src/index.js";
import {
  openDatabase,
  CodebaseRepository,
  writeAdvisory,
  AdvisoryManager,
} from "../../../../packages/codebase-repository/src/index.js";
import { pairedCodebaseProfile } from "../../../../apps/chrome-extension/src/codebase/profile-scope.js";
import { batch } from "../../unit/migration/s29/support.js";
export async function seedAdvisoryManager() {
  const api = (
    globalThis as typeof globalThis & {
      chrome: {
        storage: {
          session: { get(key: string): Promise<Record<string, unknown>> };
        };
      };
    }
  ).chrome;
  const pairing = (await api.storage.session.get("s28Pairing")).s28Pairing as {
    installationId: string;
    profileId: string;
  };
  const base = await batch();
  const { digest: _digest, bytes: _bytes, ...body } = base;
  body.context = await identifyContext({
    taskId: "task_manager_fixture",
    profile: pairedCodebaseProfile(pairing.installationId, pairing.profileId),
    url: "https://fixture.test/manager",
    accountGuard: "synthetic_account",
    source: base.context.source,
  });
  const graph = await buildGraph({
    ...body,
    digest: await digest(body),
    bytes: bytes(body),
  });
  const db = await openDatabase(indexedDB, graph.context.profileGuard);
  try {
    await new CodebaseRepository(db, graph.context.profileGuard).commit(graph);
    for (const revision of [1, 2])
      await writeAdvisory(
        db,
        await importAdvisory(
          {
            source: "learned",
            sourceId: "fixture_profile",
            sourceRevision: revision,
            successfulAt: Date.now() - 1000 + revision,
            title: "Fixture search recipe",
            steps: [
              {
                tool: "fill_by_ref",
                label: revision === 1 ? "Query" : "Query and inspect",
              },
            ],
          },
          graph.entities[0]!,
        ),
        Date.now(),
      );
    await writeAdvisory(
      db,
      await importAdvisory(
        {
          source: "recorded",
          sourceId: "fixture_workflow",
          sourceRevision: 1,
          successfulAt: Date.now(),
          title: "Fixture recorded workflow",
          steps: [{ tool: "click_by_ref", label: "Search" }],
        },
        graph.entities[0]!,
      ),
      Date.now(),
    );
    const manager = new AdvisoryManager(db, graph.context.profileGuard);
    const page = await manager.request({
      kind: "advisory.profiles",
      cursor: null,
      filter: "",
      limit: 10,
    });
    return {
      profileGuard: graph.context.profileGuard,
      scope: {
        partitionId: graph.context.partitionId,
        pageKey: graph.context.pageKey,
      },
      revision: page.revision,
    };
  } finally {
    db.close();
  }
}
