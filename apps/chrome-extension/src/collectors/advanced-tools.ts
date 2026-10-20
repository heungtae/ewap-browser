import {
  bytes,
  canonical,
  digest,
  type Context,
} from "@contextpilot/codebase-schema";
import {
  inputSchemas,
  type SemanticRef,
  type ToolContext,
  type ToolId,
  type ToolRegistry,
} from "@contextpilot/tool-registry";
import {
  CollectorBudget,
  validateEvidence,
  boundedEvidence,
  type AdvancedEvidence,
} from "@contextpilot/collector/advanced";
export interface AdvancedTarget {
  ref: SemanticRef;
  context: ToolContext;
  source: Context;
  current(): boolean;
  table?(
    coverage: "viewport" | "complete",
    cursor: string | null,
    signal: AbortSignal,
  ): Promise<AdvancedEvidence>;
  chart?(
    channel: "accessible" | "registered" | "visual",
    signal: AbortSignal,
  ): Promise<AdvancedEvidence>;
  network?(limit: number, signal: AbortSignal): Promise<AdvancedEvidence>;
}
export function installAdvancedTools(
  registry: ToolRegistry,
  targets: readonly AdvancedTarget[],
  budget: CollectorBudget,
) {
  targets = targets.map((t) => ({
    ...t,
    ref: structuredClone(t.ref),
    context: structuredClone(t.context),
    source: structuredClone(t.source),
  }));
  for (const target of targets) {
    const c = target.context,
      s = target.source;
    if (
      target.ref.partitionId !== s.partitionId ||
      c.partitionId !== s.partitionId ||
      c.taskId !== s.taskId ||
      c.tabId !== s.source.tabId ||
      c.frameId !== s.source.frameId ||
      c.documentEpoch !== s.source.documentEpoch ||
      c.routeEpoch !== s.source.routeEpoch ||
      c.cancellationGeneration !== s.source.cancellationGeneration
    )
      throw new Error("COLLECTOR_SCOPE");
  }
  const installed: ToolId[] = [];
  for (const tool of [
    "web.get_table_data",
    "web.get_chart_data",
    "web.get_observed_api",
  ] as const) {
    const capable = targets.filter((t) =>
      tool === "web.get_table_data"
        ? !!t.table
        : tool === "web.get_chart_data"
          ? !!t.chart
          : !!t.network,
    );
    if (!capable.length) continue;
    const delivered = new Map<
      string,
      { digest: string; context: string; input: string }
    >();
    registry.register(tool, {
      async execute(raw, context) {
        const input = inputSchemas[tool].parse(raw);
        const ref = "page" in input ? input.page : input.target;
        const matches = capable.filter(
          (t) =>
            canonical(t.ref) === canonical(ref) &&
            canonical(t.context) === canonical(context) &&
            t.current(),
        );
        if (matches.length !== 1) throw new Error("COLLECTOR_TARGET_STALE");
        const target = matches[0]!;
        const collected = await budget.run(
          target.source.pageKey,
          ref.id,
          (signal) => {
            if (tool === "web.get_table_data" && "coverage" in input)
              return target.table!(input.coverage, input.cursor, signal);
            if (tool === "web.get_chart_data" && "channel" in input)
              return target.chart!(input.channel, signal);
            if ("limit" in input) return target.network!(input.limit, signal);
            throw new Error("COLLECTOR_INPUT");
          },
        );
        if (!target.current()) throw new Error("DOCUMENT_CHANGED");
        await validateEvidence(collected, target.source, Date.now());
        budget.chargeBytes(bytes(collected));
        const data = await boundedEvidence(collected);
        const expected =
          tool === "web.get_table_data"
            ? "table"
            : tool === "web.get_chart_data"
              ? "chart"
              : "network";
        if (data.kind !== expected || bytes(data) > 262144)
          throw new Error("COLLECTOR_OUTPUT_LIMIT");
        if (delivered.size >= 64) throw new Error("TOOL_BUDGET_EXHAUSTED");
        const toolCallId = `read_${crypto.randomUUID()}`;
        delivered.set(toolCallId, {
          digest: data.digest,
          context: canonical(context),
          input: await digest(input),
        });
        return { toolCallId, tool, status: "completed", data };
      },
      async verify(raw, context, result) {
        const parsed = inputSchemas[tool].safeParse(raw);
        if (!parsed.success) return false;
        const ref =
          "page" in parsed.data ? parsed.data.page : parsed.data.target;
        const old = delivered.get(result.toolCallId);
        if (
          !old ||
          result.tool !== tool ||
          result.status !== "completed" ||
          old.context !== canonical(context) ||
          old.input !== (await digest(parsed.data))
        )
          return false;
        const target = capable.find(
          (t) =>
            canonical(t.ref) === canonical(ref) &&
            canonical(t.context) === canonical(context) &&
            t.current(),
        );
        if (!target) return false;
        try {
          return (
            (await validateEvidence(result.data, target.source, Date.now()))
              .digest === old.digest
          );
        } catch {
          return false;
        }
      },
    });
    installed.push(tool);
  }
  return installed;
}
