import { readLearnedCatalog } from "./catalog-codec.js";
import { taskKey } from "./task-key.js";
import { applyRecipeFailure } from "./failure-feedback.js";
import { applyManagement } from "./management.js";
import { replaceRecipe } from "./replace-recipe.js";
import { validateCatalog, validateSteps, validateTask } from "./validation.js";
import {
  STORAGE_KEY,
  TTL,
  type LearnedCatalog,
  type LearningTicket,
  type PageMatch,
  type SuccessReceipt,
} from "./types.js";
import type { LocalStorage } from "./identity.js";
export function createLearnedProfileStore(
  storage: LocalStorage,
  now = Date.now,
) {
  let queue = Promise.resolve();
  const transact = <T>(
    work: (catalog: LearnedCatalog) => Promise<T>,
  ): Promise<T> => {
    const result = queue.then(async () => {
      const raw = (await storage.get(STORAGE_KEY))[STORAGE_KEY];
      const catalog = readLearnedCatalog(raw);
      return work(structuredClone(catalog));
    });
    queue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  };
  const persist = async (c: LearnedCatalog) => {
    c.catalog_revision++;
    validateCatalog(c);
    await storage.set({ [STORAGE_KEY]: c });
  };
  return {
    snapshot: () => transact(async (c) => c),
    lookup: (match: PageMatch): Promise<LearningTicket | undefined> =>
      transact(async (c) => {
        if (!c.enabled) return undefined;
        const profile = c.records.find(
          (p) =>
            p.page_match.origin === match.origin &&
            p.page_match.page_key === match.page_key &&
            p.page_match.scope === match.scope &&
            p.page_match.context_guard === match.context_guard,
        );
        return {
          catalog_revision: c.catalog_revision,
          match,
          ...(profile ? { profile } : {}),
        };
      }),
    commit: (receipt: SuccessReceipt) =>
      transact(async (c) => {
        if (
          !c.enabled ||
          c.catalog_revision !== receipt.ticket.catalog_revision ||
          c.receipts.includes(receipt.receipt_id)
        )
          return "DISCARDED" as const;
        if (
          receipt.completed !== true ||
          receipt.required_failure !== false ||
          receipt.mutation_unknown !== false ||
          receipt.full_recipe !== true
        )
          return "INELIGIBLE" as const;
        const task = validateTask(receipt.task),
          steps = validateSteps(receipt.steps);
        if (task.mode === "ask" && steps.some((s) => s.channel !== "read"))
          return "INELIGIBLE" as const;
        let p = receipt.ticket.profile
          ? c.records.find(
              (r) => r.profile_id === receipt.ticket.profile!.profile_id,
            )
          : undefined;
        if (
          receipt.ticket.profile &&
          (!p ||
            !p.enabled ||
            !p.auto_update ||
            p.revision !== receipt.ticket.profile.revision ||
            p.management_revision !==
              receipt.ticket.profile.management_revision)
        )
          return "DISCARDED" as const;
        const at = now();
        if (!p) {
          p = {
            schema_version: 1,
            profile_id: crypto.randomUUID(),
            revision: 0,
            management_revision: 0,
            source: "local_success",
            authority: "advisory",
            page_match: receipt.ticket.match,
            name: "",
            notes: "",
            enabled: true,
            auto_update: true,
            recipes: [],
            commands: [],
            created_at: at,
            updated_at: at,
          };
          c.records.push(p);
        }
        const existing = p.recipes.find(
          (r) => taskKey(r.task) === taskKey(task),
        );
        if (
          existing &&
          (!existing.enabled ||
            !existing.auto_update ||
            existing.lifecycle === "disabled")
        )
          return "DISCARDED" as const;
        if (!existing && p.recipes.length >= 5) return "CAPACITY" as const;
        replaceRecipe(
          p,
          existing,
          task,
          steps,
          at,
          existing?.lifecycle === "quarantined",
        );
        if (
          p.page_match.structure_guard !== receipt.ticket.match.structure_guard
        )
          for (const sibling of p.recipes)
            if (taskKey(sibling.task) !== taskKey(task))
              sibling.lifecycle = "stale";
        p.page_match = receipt.ticket.match;
        p.revision++;
        p.updated_at = at;
        c.receipts = [...c.receipts, receipt.receipt_id].slice(-256);
        c.records = [
          p,
          ...c.records
            .filter((r) => r !== p)
            .sort((a, b) => b.updated_at - a.updated_at),
        ].slice(0, 100);
        while (
          new TextEncoder().encode(JSON.stringify(c)).length >
          2 * 1024 * 1024
        )
          c.records.pop();
        await persist(c);
        return "SAVED" as const;
      }),
    feedback: (ticket: LearningTicket, recipeId: string) =>
      transact(async (c) => {
        const next = applyRecipeFailure(c, ticket, recipeId, now());
        if (next) await persist(c);
        return next;
      }),
    manage: (
      expected: number,
      operation: "feature" | "clear" | "delete" | "update" | "rediscover",
      id?: string,
      patch?: {
        enabled?: boolean;
        auto_update?: boolean;
        name?: string;
        notes?: string;
        recipe_id?: string;
      },
    ) =>
      transact(async (c) => {
        applyManagement(c, expected, operation, id, patch);
        await persist(c);
        return c;
      }),
    validRecipes: (ticket: LearningTicket, mode: "ask" | "act") =>
      (ticket.profile?.enabled ? ticket.profile.recipes : []).filter(
        (r) =>
          r.enabled &&
          r.lifecycle === "active" &&
          r.task.mode === mode &&
          r.successful_at + TTL > now() &&
          ticket.match.structure_guard ===
            ticket.profile!.page_match.structure_guard,
      ) ?? [],
  };
}
