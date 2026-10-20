import {
  digest,
  opaque,
  type Context,
  type Entity,
  type Observation,
} from "@contextpilot/codebase-schema";
export async function identifyContext(input: {
  taskId: string;
  profile: string;
  url: string;
  accountGuard: string | null;
  source: Context["source"];
}): Promise<Context> {
  const url = new URL(input.url);
  if (
    !["https:", "http:"].includes(url.protocol) ||
    url.username ||
    url.password
  )
    throw new Error("INVALID_ORIGIN");
  const profileGuard = await digest(input.profile);
  const partitionId = await opaque("partition", [
    profileGuard,
    url.origin,
    input.accountGuard ?? ["unknown", input.taskId],
  ]);
  return {
    taskId: input.taskId,
    partitionId,
    pageKey: await opaque("page", [partitionId, url.href]),
    profileGuard,
    origin: url.origin,
    accountKnown: input.accountGuard !== null,
    source: input.source,
  };
}
export async function fingerprints(
  r: Observation,
): Promise<{ structureFingerprint: string; stateFingerprint: string }> {
  return {
    structureFingerprint: await digest([
      "structure-v1",
      r.kind,
      r.role,
      r.name,
      r.control,
      r.inputType,
      r.required,
      r.min,
      r.max,
      r.pattern,
      r.step,
      r.options,
      r.headers,
    ]),
    stateFingerprint: await digest([
      "state-v1",
      r.visible,
      r.enabled,
      r.editable,
      r.checked,
      r.selected,
      r.sample,
    ]),
  };
}
export async function entityIdentity(
  r: Observation,
  parentId: string,
  prior: Entity[],
  batchId: string,
  ambiguous: boolean,
  fingerprint: string,
): Promise<string> {
  const singletons = new Set(
    prior
      .filter((e) => e.kind === "singleton" && e.parentId === parentId)
      .map((e) => e.id),
  );
  const eligible = prior.filter(
    (e) =>
      (e.parentId === parentId ||
        (e.parentId !== null && singletons.has(e.parentId))) &&
      e.kind === (r.kind ?? "control") &&
      e.status !== "tombstone" &&
      e.status !== "stale" &&
      (r.stableKey
        ? e.stableKey === r.stableKey
        : e.name === r.name && e.structureFingerprint === fingerprint),
  );
  if (!ambiguous && eligible.length === 1) return eligible[0]!.id;
  return opaque("entity", [batchId, r.evidenceId]);
}
