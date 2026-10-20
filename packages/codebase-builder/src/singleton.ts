import { opaque, type Edge, type Entity } from "@contextpilot/codebase-schema";
export async function addSingleton(
  root: Entity,
  entities: Entity[],
  edges: Edge[],
): Promise<void> {
  const id = await opaque("entity", [root.id, "singleton"]);
  entities.push({ ...root, id, kind: "singleton", stableKey: null });
  edges.push({
    id: await opaque("edge", [root.parentId, id]),
    partitionId: root.partitionId,
    from: root.parentId!,
    to: id,
    kind: "contains",
    evidenceIds: root.evidenceIds,
    status: "observed",
  });
  root.parentId = id;
}
