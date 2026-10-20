import { canonical, digest } from "@contextpilot/codebase-schema";
import { UiAuthority, type UiPrincipal } from "@contextpilot/policy-engine";
import type {
  Argument,
  ArgumentPort,
  ResolvedArgument,
  SemanticRef,
  ToolContext,
  ToolId,
} from "@contextpilot/tool-registry";
export class ArgumentSources implements ArgumentPort {
  private sources = new Map<
    string,
    { ref: SemanticRef; value: Argument; context: string }
  >();
  constructor(
    private ui: UiAuthority,
    private current: () => ToolContext,
  ) {}
  admit(principal: UiPrincipal, value: Argument): SemanticRef {
    const context = this.current();
    this.ui.assert(principal, context.profileId, context.windowId);
    if (this.sources.size >= 64 || JSON.stringify(value).length > 10000)
      throw new Error("ARGUMENT_LIMIT");
    const ref: SemanticRef = {
      id: `argument_${crypto.randomUUID()}`,
      partitionId: context.partitionId,
      revision: context.planRevision,
      kind: "argument",
    };
    this.sources.set(ref.id, {
      ref,
      value: structuredClone(value),
      context: canonical(context),
    });
    return structuredClone(ref);
  }
  async resolve(
    tool: ToolId,
    intent: unknown,
    context: ToolContext,
  ): Promise<ResolvedArgument> {
    const input = intent as {
      argument?: SemanticRef;
      arguments?: { parameter: string; source: SemanticRef }[];
    };
    const lookup = (ref: SemanticRef): Argument => {
      const source = this.sources.get(ref.id);
      if (
        !source ||
        canonical(source.ref) !== canonical(ref) ||
        source.context !== canonical(context) ||
        canonical(context) !== canonical(this.current())
      )
        throw new Error("ARGUMENT_SOURCE_STALE");
      return structuredClone(source.value);
    };
    let value: Argument = "";
    const refs: SemanticRef[] = [];
    if (input.argument) {
      refs.push(input.argument);
      value = lookup(input.argument);
    } else if (tool === "web.invoke_action") {
      const result: Record<string, string | number | boolean> = Object.create(
        null,
      ) as Record<string, string | number | boolean>;
      for (const entry of input.arguments ?? []) {
        if (Object.hasOwn(result, entry.parameter))
          throw new Error("DUPLICATE_PARAMETER");
        const v = lookup(entry.source);
        if (typeof v === "object") throw new Error("ARGUMENT_TYPE");
        refs.push(entry.source);
        result[entry.parameter] = v;
      }
      value = result;
    }
    return { value, sourceDigest: await digest(refs) };
  }
  revoke(): void {
    this.sources.clear();
  }
}
