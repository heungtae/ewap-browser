import { composeFixture } from "./compose.js";
import {
  surveyFrames,
  readStaticTable,
  NavigationTracker,
} from "../../../../packages/collector/src/advanced/index.js";
function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}
export async function runCases(
  networkRows: (string | number | boolean | null)[][],
) {
  const outcomes: string[] = [];
  const {
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
    invalidate,
  } = await composeFixture(networkRows);
  const capabilities = new Set(tools);
  const advertised = await f.registry.snapshot(f.context, capabilities);
  assert(advertised.tools.length === 3, "registered capabilities");
  outcomes.push("three_qualified_read_tools_in_ask");
  const tableInput = { target: tableRef, coverage: "complete", cursor: null };
  const handler = f.registry.get("web.get_table_data")!;
  const result = await handler.execute(tableInput, f.context);
  assert(
    await handler.verify(tableInput, f.context, result),
    "independent same-call verification",
  );
  const data = result.data as {
    rows: unknown[][];
    rowIds: string[];
    coverage: { status: string };
  };
  assert(
    data.rows.length === 2 &&
      data.rowIds[0] !== data.rowIds[1] &&
      data.coverage.status === "complete",
    "static source identity",
  );
  outcomes.push("registry_static_table_repeated_text");
  const viewport = await handler.execute(
    { ...tableInput, coverage: "viewport" },
    f.context,
  );
  assert(
    (viewport.data as typeof data).coverage.status === "viewport_only",
    "viewport scope",
  );
  outcomes.push("viewport_not_complete");
  const chart = f.registry.get("web.get_chart_data")!;
  let denied = false;
  try {
    await chart.execute({ target: chartRef, channel: "registered" }, f.context);
  } catch {
    denied = true;
  }
  assert(denied, "source consent denial");
  consent.grant(f.principal, "source", scope);
  const chartResult = await chart.execute(
    { target: chartRef, channel: "registered" },
    f.context,
  );
  assert(
    await chart.verify(
      { target: chartRef, channel: "registered" },
      f.context,
      chartResult,
    ),
    "registered chart",
  );
  outcomes.push("consented_inert_json_chart");
  const sourceFirst = await chart.execute(
    { target: chartRef, channel: "visual" },
    f.context,
  );
  assert(
    (sourceFirst.data as { provenance: string }).provenance === "registered",
    "source before pixels",
  );
  outcomes.push("source_first_visual_request");
  const api = f.registry.get("web.get_observed_api")!;
  const apiResult = await api.execute({ page: pageRef, limit: 100 }, f.context);
  assert(
    await api.verify({ page: pageRef, limit: 100 }, f.context, apiResult),
    "observed network receipt",
  );
  assert((apiResult.data as typeof data).rows.length > 0, "real network data");
  outcomes.push("registry_real_network_metadata");
  const privateSpan = document.createElement("span");
  privateSpan.dataset.private = "true";
  privateSpan.textContent = "PRIVATE_CELL";
  table.tBodies[0]!.rows[0]!.cells[0]!.append(privateSpan);
  let privateDenied = false;
  try {
    await readStaticTable(table, {
      context: source,
      id: "private_table",
      keyAttribute: "data-key",
      sourceRevision: "one",
      staticComplete: true,
      signal,
      current: () => true,
    });
  } catch (error) {
    privateDenied = (error as Error).message === "TABLE_DENIED";
  }
  assert(privateDenied, "private table cell denied");
  privateSpan.remove();
  outcomes.push("private_descendant_denied");
  const open = document.createElement("x-open");
  open.attachShadow({ mode: "open" }).innerHTML = "<button>Open</button>";
  document.body.append(open);
  const closed = document.createElement("x-closed");
  closed.attachShadow({ mode: "closed" }).innerHTML = "<button>Closed</button>";
  document.body.append(closed);
  const frame = document.createElement("iframe");
  frame.srcdoc = "<button>Frame</button>";
  document.body.append(frame);
  await new Promise<void>((resolve) => (frame.onload = () => resolve()));
  const foreign = document.createElement("iframe");
  foreign.src = location.origin.replace("127.0.0.1", "localhost") + "/frame";
  document.body.append(foreign);
  const survey = await surveyFrames(document, {
    signal,
    current: () => true,
    allow: (origin) => origin === location.origin,
    frameId: (element) => (element === frame ? "frame_one" : null),
  });
  assert(
    survey.frames.length === 2 &&
      survey.gaps.includes("FRAME_DENIED") &&
      survey.gaps.includes("CLOSED_SHADOW_UNOBSERVABLE"),
    "frame/shadow limits",
  );
  outcomes.push("same_origin_frame_open_shadow_and_explicit_gaps");
  const binding = {
    tabId: 1,
    frameId: 0,
    documentId: "doc",
    documentEpoch: 1,
    routeEpoch: 1,
    profileId: "profile",
    partitionId: "partition",
  };
  const tracker = new NavigationTracker(binding, () => {
    invalidate();
  });
  history.pushState({}, "", "/changed");
  tracker.observe({ tabId: 1, frameId: 0, documentId: "doc", kind: "route" });
  assert(!tracker.current(binding), "SPA invalidation");
  assert(
    !(await handler.verify(tableInput, f.context, result)),
    "stale result not current",
  );
  outcomes.push("spa_invalidates_registry_binding");
  document.body.textContent = `S32 controlled read tools PASS: ${outcomes.join(", ")}`;
  return {
    outcomes,
    toolInvocations: 6,
    completedReads: 5,
    deniedReads: 1,
    readTools: 3,
    domMutationDispatches: 0,
    providerCalls: 0,
    budget: budget.snapshot(),
    scope:
      "Controlled DOM frames/JSON and shared registry with fixture UI principal. Network rows originate from real owned remote CDP connection; not production extension sender, Chrome debugger permission UI or live provider qualification.",
  };
}
