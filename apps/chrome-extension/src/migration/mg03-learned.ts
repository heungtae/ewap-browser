import { isPlainObject } from "../../../../extension/src/security/validation.js";
import { validateProfile } from "../../../../extension/src/learned-profile/validation.js";
import type { LearnedStep } from "../../../../extension/src/learned-profile/types.js";
// Guards/commands/receipts and old page identity hashes are deliberately absent
// from the target advisory projection. The original remains only in local backup.
const steps = (input: LearnedStep[]) =>
  input.map(({ channel, operation }) => ({ channel, operation }));
export function learnedMetadata(input: unknown, catalogEnabled: boolean) {
  const profile = validateProfile(
    isPlainObject(input) && input.commands === undefined
      ? { ...input, commands: [] }
      : input,
  );
  return {
    id: profile.profile_id,
    metadata: {
      kind: "learned_recipe_metadata",
      name: profile.name,
      notes: profile.notes,
      enabled: profile.enabled,
      catalogEnabled,
      auto_update: profile.auto_update,
      revision: profile.revision,
      created_at: profile.created_at,
      updated_at: profile.updated_at,
      recipes: profile.recipes.map((recipe) => ({
        recipe_id: recipe.recipe_id,
        revision: recipe.revision,
        name: recipe.name,
        task: recipe.task,
        steps: steps(recipe.steps),
        enabled: recipe.enabled,
        auto_update: recipe.auto_update,
        lifecycle: recipe.lifecycle,
        successful_at: recipe.successful_at,
        history: recipe.history.map(({ steps: historySteps, ...entry }) => ({
          ...entry,
          ...(historySteps ? { steps: steps(historySteps) } : {}),
        })),
      })),
    },
  };
}
