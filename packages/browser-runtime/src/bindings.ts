import { canonical, digest } from "@contextpilot/codebase-schema";
import type {
  Argument,
  BrowserPort,
  Observation,
  PreparedStep,
  TargetSnapshot,
  ToolContext,
  ToolId,
} from "@contextpilot/tool-registry";
export interface ReviewedAdapter {
  snapshot: TargetSnapshot;
  tool: ToolId;
  context: ToolContext;
  preflight(argument: Argument): Promise<void>;
  observe(argument: Argument): Promise<Observation>;
  dispatch(
    argument: Argument,
    before: () => void,
  ): Promise<{ commands: number }>;
}
// Only trusted collector/adapter code may install these ephemeral bindings.
export class LiveBindings implements BrowserPort {
  private entries = new Map<string, ReviewedAdapter>();
  constructor(private current: () => ToolContext) {}
  install(adapter: ReviewedAdapter): void {
    if (this.entries.size >= 256) throw new Error("BINDING_LIMIT");
    if (this.entries.has(adapter.snapshot.bindingId))
      throw new Error("BINDING_COLLISION");
    this.entries.set(adapter.snapshot.bindingId, adapter);
  }
  revoke(): void {
    this.entries.clear();
  }
  private check(adapter: ReviewedAdapter, context: ToolContext) {
    if (
      canonical(adapter.context) !== canonical(context) ||
      canonical(context) !== canonical(this.current())
    )
      throw new Error("BINDING_STALE");
  }
  async resolve(
    tool: ToolId,
    intent: unknown,
    context: ToolContext,
  ): Promise<TargetSnapshot> {
    const input = intent as Record<string, unknown>;
    const ref = input.action ?? input.target ?? input.route ?? input.tab;
    const matches = [...this.entries.values()].filter(
      (a) => a.tool === tool && canonical(a.snapshot.target) === canonical(ref),
    );
    if (matches.length !== 1) throw new Error("TARGET_NOT_UNIQUE");
    this.check(matches[0]!, context);
    return structuredClone(matches[0]!.snapshot);
  }
  private get(step: PreparedStep) {
    const adapter = this.entries.get(step.bindingId);
    if (!adapter) throw new Error("BINDING_UNAVAILABLE");
    this.check(adapter, step.context);
    if (
      adapter.tool !== step.tool ||
      canonical(adapter.snapshot.target) !== canonical(step.target) ||
      canonical(adapter.snapshot.predicate) !== canonical(step.predicate) ||
      canonical(adapter.snapshot.effect) !== canonical(step.effect) ||
      adapter.snapshot.observationDigest !== step.observationDigest
    )
      throw new Error("BINDING_MISMATCH");
    return adapter;
  }
  async preflight(step: PreparedStep, argument: Argument): Promise<void> {
    await this.get(step).preflight(argument);
  }
  async observe(step: PreparedStep, argument: Argument) {
    return this.get(step).observe(argument);
  }
  async dispatch(step: PreparedStep, argument: Argument, before: () => void) {
    const adapter = this.get(step);
    await adapter.preflight(argument);
    if ((await digest(argument)) !== step.argumentDigest)
      throw new Error("ARGUMENT_CHANGED");
    return adapter.dispatch(argument, () => {
      this.get(step);
      before();
    });
  }
}
