import { digest, type Context } from "@contextpilot/codebase-schema";
import { denied, privateAncestor } from "../dom/privacy.js";
import { cellText } from "./cell-text.js";
import { WindowAccumulator } from "./windows.js";
export async function readStaticTable(
  element: HTMLTableElement,
  options: {
    context: Context;
    id: string;
    keyAttribute: string | null;
    sourceRevision: string;
    staticComplete: boolean;
    signal: AbortSignal;
    current(): boolean;
  },
) {
  const deadline = Date.now() + 10000;
  if (!element.isConnected || privateAncestor(element))
    throw new Error("TABLE_DENIED");
  const headers = [...(element.tHead?.rows[0]?.cells ?? [])].map((c) =>
    cellText(c, 200, deadline),
  );
  if (!headers.length || headers.length > 50 || element.rows.length > 201)
    throw new Error("TABLE_LIMIT");
  const rows = [];
  let index = 0;
  for (const body of element.tBodies)
    for (const row of body.rows) {
      if (Date.now() >= deadline) throw new Error("UNIT_TIMEOUT");
      if (options.signal.aborted || !options.current())
        throw new Error("DOCUMENT_CHANGED");
      if (
        row.cells.length !== headers.length ||
        denied(row) ||
        [...row.cells].some(
          (c) =>
            privateAncestor(c) ||
            c.querySelector(
              "[data-private],[data-sensitive],input,textarea,select,script",
            ),
        )
      )
        throw new Error("TABLE_DENIED");
      const cells = [...row.cells].map((c) => cellText(c, 4096, deadline));
      const key = options.keyAttribute
        ? row.getAttribute(options.keyAttribute)
        : null;
      rows.push({ key, index: index++, cells });
    }
  const accumulator = new WindowAccumulator(
    options.context,
    options.id,
    headers,
    Date.now(),
  );
  await accumulator.add({
    cursor: "static",
    revision: options.sourceRevision,
    filterDigest: await digest(options.context.source),
    fields: headers,
    total: options.staticComplete ? rows.length : null,
    eof: options.staticComplete,
    rows,
  });
  const data = await accumulator.finish();
  if (!options.staticComplete) data.coverage.status = "viewport_only";
  // Recompute after viewport projection; returned data is immutable evidence.
  const { digest: _digest, ...body } = data;
  const { evidence } = await import("./evidence.js");
  return evidence(body);
}
