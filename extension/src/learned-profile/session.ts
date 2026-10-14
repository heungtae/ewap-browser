import { commandReadCost } from "./command-cost.js";
import { commandMatchesRecipe } from "./command-binding.js";
import { createLearningFeedback } from "./learning-feedback.js";
import { learnedBindingCurrent } from "./binding.js";
import { createLearnedToolExecutor } from "./tool-executor.js";
import { createCommandExecutor } from "./command-executor.js";
import type { ActivePage } from "../service-worker/page-context-runtime.js";
import { isPlainObject } from "../security/validation.js";
import { learnedSessionTools } from "./session-tools.js";
import {
  readKinds,
  type LearnedTask,
  type LearnedStep,
  type LearningTicket,
} from "./types.js";
import type { createLearnedProfileStore } from "./store.js";
export type LearnedStore = ReturnType<typeof createLearnedProfileStore>;
export function createLearnedSession(opts: {
  ticket: LearningTicket;
  store: LearnedStore;
  mode: "ask" | "act";
  current(): boolean;
  snapshot: ActivePage["snapshot"];
  url?: string;
  notify?(
    status: "REUSED" | "SAVED" | "FALLBACK" | "STORE_FAILED" | "REPAIRED",
  ): void;
}) {
  let bindingCurrent = true;
  const originalCurrent = opts.current;
  opts.current = () => bindingCurrent && originalCurrent();
  const recipes = opts.store.validRecipes(opts.ticket, opts.mode);
  const commands =
    opts.ticket.profile?.commands.filter(
      (c) =>
        recipes.some((r) => commandMatchesRecipe(c, r)) &&
        (c.backend !== "read_recipe" ? opts.mode === "act" : true),
    ) ?? [];
  let task: LearnedTask | undefined,
    consumed: string | undefined,
    sealed = false;
  const steps: LearnedStep[] = [
    { channel: "read", operation: "read_semantic_projection" },
  ];
  const feedback = createLearningFeedback(opts, () => consumed);
  const recordFailure = (recoverable = true) => feedback.record(recoverable);
  let fullCoverage = false;
  const { generated, tools, names, context } = learnedSessionTools(
    commands,
    recipes,
  );
  const gate = async () => {
    if (!opts.current()) return false;
    const c = await opts.store.snapshot();
    return (
      opts.current() &&
      c.enabled &&
      c.catalog_revision === opts.ticket.catalog_revision
    );
  };
  const invoke = createCommandExecutor({
    recipes,
    gate,
    current: opts.current,
    select: (id, selected) => {
      opts.notify?.("REUSED");
      consumed = id;
      task = selected;
    },
    observe,
  });
  function observe(name: string, result: unknown) {
    if (
      isPlainObject(result) &&
      (result.ok === false ||
        result.code ||
        (typeof result.status === "string" &&
          !["AVAILABLE", "PROPOSED"].includes(result.status)))
    ) {
      if (
        !["UNSUPPORTED", "BUSINESS_MCP_NOT_CONFIGURED"].includes(
          String(result.code ?? result.status),
        )
      )
        recordFailure();
      return;
    }
    if (["screenshot", "zoom", "read_batch", "business_mcp"].includes(name))
      recordFailure(false);
    if (
      steps.length >= 12 &&
      readKinds.includes(name as (typeof readKinds)[number])
    )
      recordFailure(false);
    if (
      isPlainObject(result) &&
      result.coverage === "complete" &&
      result.truncated !== true
    )
      fullCoverage = true;
    if (isPlainObject(result) && result.truncated === true)
      recordFailure(false);
    if (
      readKinds.includes(name as (typeof readKinds)[number]) &&
      steps.length < 12
    )
      steps.push({
        channel: "read",
        operation: name as (typeof readKinds)[number],
      });
  }
  return {
    tools,
    setNotify: (notify: NonNullable<typeof opts.notify>) => {
      opts.notify = notify;
    },
    bind: (active: ActivePage) => {
      bindingCurrent = learnedBindingCurrent(active, opts.snapshot, opts.url);
    },
    handles: (name: string) => names.has(name),
    readCost: (call: { name: string; arguments: string }) =>
      commandReadCost(call, generated, commands, recipes),
    context,
    observe,
    failure: () => {
      recordFailure(false);
    },
    action: (step: LearnedStep, verified: boolean, recoverable = false) => {
      if (!verified) recordFailure(recoverable);
      else if (steps.length < 12) steps.push(step);
      else recordFailure(false);
    },
    execute: createLearnedToolExecutor({
      gate,
      generated,
      commands,
      recipes,
      mode: opts.mode,
      select: (value, id) => {
        if (id) opts.notify?.("REUSED");
        task = value;
        consumed = id;
      },
      invoke,
      failure: () => {
        recordFailure(false);
      },
    }),
    seal(success: boolean): Promise<string> {
      if (
        sealed ||
        !success ||
        !feedback.eligible ||
        !task ||
        !steps.length ||
        (task.coverage === "full" && !fullCoverage) ||
        !originalCurrent() ||
        (!bindingCurrent && !steps.some((s) => s.operation === "navigate"))
      )
        return Promise.resolve("INELIGIBLE");
      sealed = true;
      const receipt = structuredClone({
        receipt_id: crypto.randomUUID(),
        ticket: opts.ticket,
        task,
        steps,
        completed: true as const,
        required_failure: false as const,
        mutation_unknown: false as const,
        full_recipe: true as const,
        ...(consumed ? { consumed_recipe: consumed } : {}),
      });
      return feedback
        .ready()
        .then((ready) => {
          if (!ready.eligible) return "DISCARDED";
          opts.ticket = ready.ticket;
          receipt.ticket = structuredClone(ready.ticket);
          return opts.store.commit(receipt);
        })
        .then((result) => {
          if (result === "SAVED")
            opts.notify?.(feedback.failed ? "REPAIRED" : "SAVED");
          return result;
        })
        .catch(() => {
          opts.notify?.("STORE_FAILED");
          return "STORE_FAILED";
        });
    },
  };
}
export type LearnedSession = ReturnType<typeof createLearnedSession>;
