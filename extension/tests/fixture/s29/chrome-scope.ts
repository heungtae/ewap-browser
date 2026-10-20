import { collect } from "../../../../packages/collector/src/index.js";
import type { Context } from "../../../../packages/codebase-schema/src/index.js";
const assert = (ok: unknown, message: string) => {
  if (!ok) throw new Error(message);
};
export async function runScope(context: Context) {
  document.body.innerHTML =
    '<label for="query">Search value</label><input id="query" form="external" value="PRIVATE_INPUT_VALUE"/><form id="external"><h2>Associated heading</h2></form><table><caption>Observed caption</caption></table><div id="shadow-host"></div><iframe srcdoc="<button>Denied frame</button>"></iframe>';
  const shadow = document
    .querySelector("#shadow-host")!
    .attachShadow({ mode: "open" });
  shadow.innerHTML =
    '<button aria-label="Shadow Save"></button><div data-private>PRIVATE_SHADOW_VALUE</div>';
  const base = {
    batchId: "batch_scope",
    context,
    expectedRevision: 0,
    scope: "all_dom" as const,
    current: () => true,
  };
  const result = await collect(document.body, base);
  const input = result.records.find((r) => r.name === "Search value");
  const form = result.records.find((r) => r.kind === "form");
  assert(
    input?.parentEvidenceId === form?.evidenceId,
    "explicit form ownership",
  );
  assert(
    result.records.some((r) => r.name === "Observed caption"),
    "caption name",
  );
  assert(
    result.records.some((r) => r.name === "Shadow Save"),
    "open shadow traversal",
  );
  assert(result.coverage.reasons.includes("FRAME_UNAVAILABLE"), "frame gap");
  assert(!JSON.stringify(result).includes("PRIVATE_"), "sensitive values");
  let clock = 0;
  const timed = await collect(document.body, {
    ...base,
    batchId: "batch_timeout",
    now: () => (clock += 5000),
  });
  assert(timed.coverage.reasons.includes("UNIT_TIMEOUT"), "unit deadline");
  return {
    openShadow: true,
    explicitFormOwner: true,
    caption: true,
    deniedFrame: true,
    unitDeadline: true,
  };
}
