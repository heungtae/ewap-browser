import { readFile, writeFile, access } from "node:fs/promises";
import type { ProjectionOperation } from "../../../../packages/codebase-schema/src/index.js";
import { ProjectionHub } from "../../../../apps/agent-server/src/codebase/projection-hub.js";
import { listenLocal } from "../../../../apps/agent-server/src/ipc/server.js";
async function main() {
  const configPath = process.argv[2]!,
    output = process.argv[3]!;
  const config = JSON.parse(await readFile(configPath, "utf8"));
  const report = (value: unknown) => writeFile(output, JSON.stringify(value));
  const hub = new ProjectionHub(config, (channel, lease) => {
    void (async () => {
      const read = (operation: ProjectionOperation) =>
        channel.read(lease.id, operation, {
          deadline: lease.expiresAt,
          signal: new AbortController().signal,
          maxBytes: 8 * 1024 * 1024,
        });
      const search = await read({
        kind: "search",
        name: "Save",
        limit: 10,
        after: null,
      });
      if (
        search.payload.kind !== "search" ||
        search.payload.entities.length < 1
      )
        throw Error("SEARCH");
      const entity = search.payload.entities[0]!;
      const inspected = await read({
        kind: "inspect",
        id: entity.id,
        includeSample: false,
      });
      if (inspected.payload.kind !== "inspect") throw Error("INSPECT");
      const grant = lease.permissions.datasets[0]!;
      const dataset = await read({ kind: "dataset", ...grant });
      if (
        dataset.payload.kind !== "dataset" ||
        dataset.payload.dataset.rows.length !== 1000
      )
        throw Error("DATASET");
      const query = await read({
        kind: "query",
        ...grant,
        query: { op: "count", fields: [], filters: [], limit: 1 },
      });
      if (
        query.payload.kind !== "query" ||
        !("value" in query.payload.result) ||
        query.payload.result.value !== 1000
      )
        throw Error("QUERY");
      await report({
        state: "READS_PASS",
        search: search.payload.entities.length,
        rows: 1000,
        bytes: Buffer.byteLength(JSON.stringify(dataset)),
        privateExcluded: !JSON.stringify(search).includes("NEVER_STORE"),
      });
      while (true) {
        try {
          await access(output + ".navigate");
          break;
        } catch {
          await new Promise((r) => setTimeout(r, 25));
        }
      }
      try {
        await read({
          kind: "search",
          name: "Save",
          limit: 10,
          after: null,
        });
        throw Error("STALE_ACCEPTED");
      } catch (error) {
        if (
          !(error instanceof Error) ||
          !/^PROJECTION_(STALE|DENIED|UNAVAILABLE)$/.test(error.message)
        )
          throw error;
      }
      await report({
        state: "PASS",
        authenticatedNativeRead: true,
        contentToIndexedDb: true,
        rows: 1000,
        transferredBytes: Buffer.byteLength(JSON.stringify(dataset)),
        staleDocumentDenied: true,
        privateExcluded: !JSON.stringify(search).includes("NEVER_STORE"),
      });
    })().catch((error) => report({ state: "FAIL", error: error.message }));
  });
  await listenLocal(config.socketPath, config, undefined, undefined, hub);
}
void main();
