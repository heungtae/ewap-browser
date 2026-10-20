import { setup } from "./setup.js";
import { digest } from "../../../../packages/codebase-schema/src/index.js";
import {
  LiveBindings,
  IndexedDbDispatchJournal,
} from "../../../../packages/browser-runtime/src/index.js";
import {
  ToolRuntime,
  ArgumentSources,
} from "../../../../packages/tool-runtime/src/index.js";
import { openDatabase } from "../../../../packages/codebase-repository/src/index.js";
import type { ReviewedAdapter } from "../../../../packages/browser-runtime/src/index.js";
export async function runtimeFixture(factory: IDBFactory) {
  const f = await setup();
  const db = await openDatabase(factory, await digest(crypto.randomUUID()));
  const journal = new IndexedDbDispatchJournal(db, f.context.partitionId);
  const bindings = new LiveBindings(() => f.context);
  const sources = new ArgumentSources(f.ui, () => f.context);
  const argument = sources.admit(f.principal, "requested");
  const intent = { action: f.target, argument };
  const state = {
    value: "",
    dispatches: 0,
    intents: 0,
    partial: false,
    verifierFails: false,
  };
  const adapter: ReviewedAdapter = {
    tool: "web.fill",
    context: structuredClone(f.context),
    snapshot: {
      bindingId: "binding",
      target: f.target,
      observationDigest: await digest("observed"),
      predicate: { ...f.target, id: "predicate", kind: "predicate" },
      effect: f.effect,
      verifierId: "fixture-verifier",
      adapterId: "fixture-adapter",
    },
    async preflight() {},
    async observe(value) {
      if (state.verifierFails) throw new Error("VERIFIER_GONE");
      return {
        passed: state.value === value,
        digest: await digest(state.value),
      };
    },
    async dispatch(value, before) {
      before();
      state.dispatches++;
      state.value = String(value);
      if (state.partial) {
        const error = new Error("PARTIAL_DISPATCH") as Error & {
          commands: number;
        };
        error.commands = 1;
        throw error;
      }
      return { commands: 1 };
    },
  };
  bindings.install(adapter);
  const ports = {
    registry: f.registry,
    capabilities: f.capabilities,
    arguments: sources,
    browser: bindings,
    journal,
    intent: {
      async record() {
        state.intents++;
      },
    },
    approvals: f.approvals,
    context: () => f.context,
    policy: () => f.policy,
    now: Date.now,
  };
  return {
    ...f,
    db,
    journal,
    bindings,
    sources,
    intent,
    state,
    adapter,
    ports,
    runtime: new ToolRuntime(ports),
  };
}
