import { setup } from "../s30/setup.js";
import {
  digest,
  type Context,
} from "../../../../packages/codebase-schema/src/index.js";
import {
  CollectorBudget,
  collectChart,
  evidence,
  readOwnData,
  readStaticTable,
} from "../../../../packages/collector/src/advanced/index.js";
import { CollectorConsent } from "../../../../packages/browser-runtime/src/index.js";
import { installAdvancedTools } from "../../../../apps/chrome-extension/src/collectors/advanced-tools.js";
function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}
export async function composeFixture(
  networkRows: (string | number | boolean | null)[][],
) {
  const f = await setup();
  f.context.mode = "ask";
  const source: Context = {
    taskId: "task",
    partitionId: "partition",
    pageKey: "page",
    profileGuard: "a".repeat(64),
    origin: location.origin,
    accountKnown: true,
    source: {
      tabId: 1,
      frameId: 0,
      documentEpoch: 1,
      routeEpoch: 1,
      sourceRevision: 1,
      sequence: 1,
      cancellationGeneration: 0,
    },
  };
  const signal = new AbortController().signal;
  const budget = new CollectorBudget({
    deadline: Date.now() + 60000,
    now: Date.now,
    current: () => true,
    signal,
  });
  const table = document.createElement("table");
  table.innerHTML =
    '<thead><tr><th>Label</th><th>Count</th></tr></thead><tbody><tr data-key="one"><td>same</td><td>1</td></tr><tr data-key="two"><td>same</td><td>2</td></tr></tbody>';
  document.body.append(table);
  const tableRef = { ...f.target, kind: "entity" as const };
  const chartRef = { ...tableRef, id: "chart" };
  const pageRef = { ...tableRef, id: "page", kind: "page" as const };
  let current = true;
  const consent = new CollectorConsent(f.ui, () => f.context);
  const scope = await digest([chartRef, source]);
  const tableRead = (
    coverage: "complete" | "viewport",
    _cursor: string | null,
    s: AbortSignal,
  ) =>
    readStaticTable(table, {
      context: source,
      id: "table_data",
      keyAttribute: "data-key",
      sourceRevision: "one",
      staticComplete: coverage === "complete",
      signal: s,
      current: () => current,
    });
  const json = document.createElement("script");
  json.type = "application/json";
  json.textContent = JSON.stringify({
    series: [
      ["A", 1],
      ["B", 2],
    ],
  });
  document.body.append(json);
  const chartRead = (
    channel: "accessible" | "registered" | "visual",
    s: AbortSignal,
  ) =>
    collectChart({
      id: "chart_data",
      context: source,
      channel,
      signal: s,
      budget,
      registered: async () => {
        consent.check("source", scope);
        const node = json.firstChild;
        assert(
          node instanceof Text && node.length <= 262144,
          "inert JSON size",
        );
        const rows = readOwnData(node.data, ["series"]);
        const now = Date.now();
        return evidence({
          schema: "wca.collector/v1",
          id: "registered_chart",
          context: source,
          kind: "chart",
          provenance: "registered",
          fields: ["label", "value"],
          rows,
          rowIds: ["row_a", "row_b"],
          coverage: {
            status: "complete",
            reasons: [],
            total: 2,
            windows: 1,
            restored: null,
          },
          observedAt: now,
          expiresAt: now + 10000,
          executable: false,
        });
      },
    });
  const tools = installAdvancedTools(
    f.registry,
    [
      {
        ref: tableRef,
        context: f.context,
        source,
        current: () => current,
        table: tableRead,
      },
      {
        ref: chartRef,
        context: f.context,
        source,
        current: () => current,
        chart: chartRead,
      },
      {
        ref: pageRef,
        context: f.context,
        source,
        current: () => current,
        network: async (limit) => {
          const now = Date.now();
          const rows = networkRows.slice(0, limit);
          return evidence({
            schema: "wca.collector/v1",
            id: "network_data",
            context: source,
            kind: "network",
            provenance: "network_observed",
            fields: ["endpoint", "method", "status", "mime"],
            rows,
            rowIds: rows.map((_r, i) => `api_${i}`),
            coverage: {
              status: "partial",
              reasons: ["NETWORK_WINDOW"],
              total: null,
              windows: 1,
              restored: null,
            },
            observedAt: now,
            expiresAt: now + 10000,
            executable: false,
          });
        },
      },
    ],
    budget,
  );
  return {
    f,
    source,
    table,
    signal,
    budget,
    tableRef,
    chartRef,
    pageRef,
    consent,
    scope,
    tools,
    invalidate: () => {
      current = false;
    },
  };
}
