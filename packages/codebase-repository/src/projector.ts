import {
  canonical,
  projectionOperationSchema,
  projectionPayloadSchema,
  projectionQueryResultSchema,
  type ProjectionOperation,
  type ProjectionPayload,
  type Snapshot,
} from "@contextpilot/codebase-schema";
import type { CodebaseReadService } from "./read-service.js";
// Requested projections are transient DTOs; the IndexedDB snapshot remains SSOT.
export class CodebaseProjector {
  constructor(private read: CodebaseReadService) {}
  catalog() {
    return this.read.catalog();
  }
  async project(
    raw: ProjectionOperation,
    expected: { revision: number; digest: string },
  ): Promise<ProjectionPayload> {
    const operation = projectionOperationSchema.parse(raw),
      before = await this.read.catalog();
    if (
      before.revision !== expected.revision ||
      before.digest !== expected.digest
    )
      throw Error("PROJECTION_STALE");
    let payload: ProjectionPayload;
    if (operation.kind === "dataset" || operation.kind === "query") {
      const data = await this.read.dataset(operation.id, expected.revision);
      if (data.digest !== operation.digest) throw Error("PROJECTION_STALE");
      payload =
        operation.kind === "dataset"
          ? { kind: "dataset", dataset: data }
          : {
              kind: "query",
              result: projectionQueryResultSchema.parse(
                await this.read.query(
                  operation.id,
                  expected.revision,
                  operation.query,
                ),
              ),
            };
    } else {
      const metadata = (entity: Snapshot["entities"][number]) => {
        const { sample: _sample, ...value } = entity;
        return value;
      };
      const evidence = (ids: Set<string>) =>
        before.evidence
          .filter((e) => ids.has(e.id))
          .map((e) => {
            const { observation: _observation, ...descriptor } = e;
            return descriptor;
          });
      if (operation.kind === "search") {
        const name = operation.name.normalize("NFC").toLowerCase();
        const found = before.entities
          .filter(
            (e) =>
              e.status === "observed" &&
              e.name.normalize("NFC").toLowerCase().includes(name) &&
              (!operation.entityKind || operation.entityKind === e.kind),
          )
          .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
        const remaining = found.filter(
            (e) => operation.after === null || e.id > operation.after,
          ),
          selected = remaining.slice(0, operation.limit);
        payload = {
          kind: "search",
          coverage: before.coverage,
          entities: selected.map(metadata),
          evidence: evidence(new Set(selected.flatMap((e) => e.evidenceIds))),
          matched: found.length,
          cursor:
            remaining.length > operation.limit ? selected.at(-1)!.id : null,
        };
      } else {
        const entity = before.entities.find(
          (e) => e.id === operation.id && e.status === "observed",
        );
        if (!entity) throw Error("ENTITY_UNAVAILABLE");
        payload = {
          kind: "inspect",
          coverage: before.coverage,
          entity: metadata(entity),
          sample: operation.includeSample ? entity.sample : null,
          evidence: evidence(new Set(entity.evidenceIds)),
        };
      }
    }
    const after = await this.read.catalog();
    if (
      after.revision !== before.revision ||
      after.digest !== before.digest ||
      canonical(after.context) !== canonical(before.context)
    )
      throw Error("PROJECTION_STALE");
    return projectionPayloadSchema.parse(payload);
  }
}
