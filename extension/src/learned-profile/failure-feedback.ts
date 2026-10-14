import type { LearnedCatalog, LearningTicket } from "./types.js";
export function applyRecipeFailure(
  catalog: LearnedCatalog,
  ticket: LearningTicket,
  recipeId: string,
  at: number,
): LearningTicket | undefined {
  if (!catalog.enabled || catalog.catalog_revision !== ticket.catalog_revision)
    return undefined;
  const p = catalog.records.find(
    (p) => p.profile_id === ticket.profile?.profile_id,
  );
  const r = p?.recipes.find((r) => r.recipe_id === recipeId);
  if (
    !p ||
    !r ||
    !p.enabled ||
    !r.enabled ||
    p.management_revision !== ticket.profile?.management_revision
  )
    return undefined;
  r.lifecycle = "quarantined";
  r.history = [
    ...r.history,
    { revision: r.revision, at, kind: "failure" as const },
  ].slice(-23);
  p.revision++;
  return {
    catalog_revision: catalog.catalog_revision + 1,
    match: ticket.match,
    profile: structuredClone(p),
  };
}
