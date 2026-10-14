import type { LearnedCatalog } from "./types.js";
export type ManagementPatch = {
  enabled?: boolean;
  auto_update?: boolean;
  name?: string;
  notes?: string;
  recipe_id?: string;
};
export function applyManagement(
  c: LearnedCatalog,
  expected: number,
  operation: "feature" | "clear" | "delete" | "update" | "rediscover",
  id?: string,
  patch?: ManagementPatch,
) {
  if (expected !== c.catalog_revision) throw new Error("STALE_CATALOG");
  if (operation === "feature") c.enabled = patch?.enabled === true;
  else if (operation === "clear") {
    c.records = [];
    c.receipts = [];
  } else {
    const p = c.records.find((r) => r.profile_id === id);
    if (!p) throw new Error("PROFILE_NOT_FOUND");
    const recipe = patch?.recipe_id
      ? p.recipes.find((r) => r.recipe_id === patch.recipe_id)
      : undefined;
    if (patch?.recipe_id && !recipe) throw new Error("RECIPE_NOT_FOUND");
    if (operation === "delete") {
      if (!recipe) c.records = c.records.filter((r) => r !== p);
      else {
        p.recipes = p.recipes.filter((r) => r !== recipe);
        p.commands = p.commands.filter((r) => r.recipe_id !== recipe.recipe_id);
      }
    } else if (operation === "rediscover") {
      for (const r of recipe ? [recipe] : p.recipes) r.lifecycle = "stale";
    } else {
      const target = recipe ?? p;
      if (patch?.enabled !== undefined) target.enabled = patch.enabled;
      if (patch?.auto_update !== undefined)
        target.auto_update = patch.auto_update;
      if (patch?.name !== undefined) target.name = patch.name;
      if (!recipe && patch?.notes !== undefined) p.notes = patch.notes;
    }
    p.management_revision++;
    p.revision++;
  }
}
