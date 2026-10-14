import { createLearnedProfileStore } from "../../../src/learned-profile/store.js";
import type { LocalStorage } from "../../../src/learned-profile/identity.js";
import type {
  PageMatch,
  LearnedTask,
  SuccessReceipt,
  LearnedStep,
} from "../../../src/learned-profile/types.js";
export const match: PageMatch = {
  origin: "https://example.test",
  page_key: "a".repeat(64),
  scope: "all_dom",
  context_guard: "b".repeat(64),
  structure_guard: "c".repeat(64),
};
export const task: LearnedTask = {
  kind: "help",
  mode: "ask",
  target: "page",
  coverage: "visible",
  input: "none",
};
export const snapshot = {
  document_epoch: "doc-one",
  frame_id: 0,
  scope: "all_dom" as const,
  nodes: [],
  visible_text: "account one",
};
export function setup() {
  const reorder = (value: unknown): unknown =>
    Array.isArray(value)
      ? value.map(reorder)
      : typeof value === "object" && value !== null
        ? Object.fromEntries(
            Object.keys(value)
              .sort()
              .map((k) => [k, reorder((value as Record<string, unknown>)[k])]),
          )
        : value;
  const data: Record<string, unknown> = {};
  let now = 1_800_000_000_000;
  const storage: LocalStorage = {
    get: async (key) =>
      reorder({ [key]: data[key] }) as Record<string, unknown>,
    set: async (v) => {
      Object.assign(data, structuredClone(v));
    },
  };
  const store = createLearnedProfileStore(storage, () => now);
  return {
    data,
    storage,
    store,
    advance: (ms: number) => {
      now += ms;
    },
  };
}
export async function receipt(
  store: ReturnType<typeof createLearnedProfileStore>,
  t = task,
  steps: LearnedStep[] = [
    { channel: "read", operation: "read_semantic_projection" },
  ],
): Promise<SuccessReceipt> {
  const ticket = (await store.lookup(match))!;
  return {
    receipt_id: crypto.randomUUID(),
    ticket,
    task: t,
    steps,
    completed: true,
    required_failure: false,
    mutation_unknown: false,
    full_recipe: true,
  };
}
