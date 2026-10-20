import type { Entity, Snapshot } from "@contextpilot/codebase-schema";
import type { CodebaseRepository } from "./repository.js";
export class CodebaseReadService {
  constructor(
    private repository: CodebaseRepository,
    private partitionId: string,
    private pageKey: string,
    private current: () => boolean = () => true,
  ) {}
  async catalog(): Promise<Snapshot> {
    if (!this.current()) throw new Error("PROJECTION_STALE");
    return this.repository.snapshot(this.partitionId, this.pageKey);
  }
  async search(query: {
    name: string;
    kind?: Entity["kind"];
    limit: number;
    revision: number;
  }) {
    if (
      !Number.isInteger(query.limit) ||
      query.limit < 1 ||
      query.limit > 128 ||
      query.name.length > 200
    )
      throw new Error("QUERY_LIMIT");
    const snapshot = await this.catalog();
    if (snapshot.revision !== query.revision)
      throw new Error("PROJECTION_STALE");
    const normalized = query.name.normalize("NFC").toLowerCase();
    return {
      repositoryId: snapshot.repositoryId,
      partitionId: this.partitionId,
      revision: snapshot.revision,
      digest: snapshot.digest,
      coverage: snapshot.coverage,
      entities: snapshot.entities
        .filter(
          (e) =>
            e.status === "observed" &&
            e.name.toLowerCase().includes(normalized) &&
            (!query.kind || e.kind === query.kind),
        )
        .slice(0, query.limit),
    };
  }
  async inspect(id: string, revision: number) {
    const snapshot = await this.catalog();
    if (snapshot.revision !== revision) throw new Error("PROJECTION_STALE");
    const entity = snapshot.entities.find(
      (e) => e.id === id && e.status === "observed",
    );
    if (!entity) throw new Error("ENTITY_UNAVAILABLE");
    return {
      entity,
      revision: snapshot.revision,
      digest: snapshot.digest,
      coverage: snapshot.coverage,
    };
  }
}
