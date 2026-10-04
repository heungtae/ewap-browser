import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

export async function exampleRequests() {
  const text = await readFile("examples/example-request-messages.md", "utf8");
  const accessible = [...text.matchAll(/^\| (Ask|Act) \| (.*?) \|/gm)].map(
    (m, i) => ({ id: `1.${i + 1}`, mode: m[1].toLowerCase(), prompt: m[2] }),
  );
  const sections = text.split("## 3.")[0].split(/^### /m).slice(1);
  const reading = [];
  for (const section of sections) {
    const heading = section.split("\n")[0];
    const address = section.match(/주소: (http:\/\/127\.0\.0\.1:\d+\/\S*)/);
    const requests = [...section.matchAll(/```text\n([^]*?)\n```/g)];
    if (!requests.length) continue;
    assert.ok(address, `Missing address: ${heading}`);
    const path = new URL(address[1]).pathname;
    for (const [index, match] of requests.entries())
      reading.push({
        id: `${heading.split(" ")[0]}.${index + 1}`,
        mode: "ask",
        prompt: match[1],
        path,
        file: `examples/${heading.startsWith("3.") ? "page-api-discovery-demo" : "collection-reading-demo"}${path === "/" ? "/index.html" : path}`,
        selection:
          path === "/collection-fixture.html"
            ? "grid data"
            : path === "/list.html"
              ? "Task list"
              : path.includes("mixed")
                ? index === 2
                  ? "Feature requests"
                  : "Recent orders"
                : undefined,
        boundary: /차트 데이터 전체|차트에서 전체/.test(match[1]),
      });
  }
  // Section 3 has an H2 heading rather than an H3 heading.
  if (!reading.some((item) => item.file.includes("page-api"))) {
    const discovery = text.split("## 3.")[1];
    for (const [i, m] of [
      ...discovery.matchAll(/```text\n([^]*?)\n```/g),
    ].entries())
      reading.push({
        id: `3.${i + 1}`,
        mode: "ask",
        prompt: m[1],
        path: "/",
        file: "examples/page-api-discovery-demo/index.html",
      });
  }
  assert.equal(
    accessible.length,
    20,
    "Update accessible case mappings for document changes",
  );
  assert.equal(
    reading.length,
    16,
    "Update reading assertions for document changes",
  );
  return { accessible, reading };
}

export function checkReading(item, calls, before, after) {
  assert.deepEqual(after, before, `${item.id}: Ask changed page controls`);
  if (item.boundary && item.boundarySelectionObserved) {
    assert.equal(
      calls.length,
      0,
      "Selection boundary called provider before choosing",
    );
    return;
  }
  assert.ok(calls.length, `${item.id}: provider was not called`);
  assert.ok(
    calls.some((c) => c.promptMatches),
    `${item.id}: exact documented prompt missing`,
  );
  assert.ok(
    calls.every(
      (c) =>
        !c.tools.some((t) =>
          /propose_|click|navigate|set_text|set_checked/.test(t),
        ),
    ),
    "Ask offered action tools",
  );
  const contexts = calls.map((c) => c.analysis).filter(Boolean);
  if (item.file.includes("page-api")) {
    assert.ok(
      contexts.every((data) => data.source.kind === "collection"),
      "Page description unexpectedly invoked a Page API read",
    );
    assert.ok(
      calls.some((c) => c.nodes.length),
      "Page description projection missing",
    );
    return;
  }
  if (item.boundary && contexts.length === 0) {
    assert.ok(
      calls.some((c) => c.nodes.length),
      "Unsupported chart projection missing",
    );
    return;
  }
  assert.ok(contexts.length, `${item.id}: bounded analysis context missing`);
  const data = contexts.at(-1);
  assert.ok(
    ["complete", "partial", "viewport_only", "unavailable"].includes(
      data.coverage,
    ),
  );
  assert.ok(data.collected_count >= data.records.length);
  if (item.boundary) {
    assert.equal(data.coverage, "unavailable");
    assert.equal(
      data.records.length,
      0,
      "Unsupported chart silently read table",
    );
  } else if (item.path.includes("chart")) {
    assert.equal(data.records.length, 13);
    assert.deepEqual(data.records[0].cells.slice(0, 2), ["Month", "Revenue"]);
    const cells = data.records.flatMap((r) => r.cells).join(" ");
    assert.match(cells, /45,?000/);
    assert.match(cells, /90,?000/);
  } else if (item.path === "/static-table.html")
    assert.equal(data.collected_count, 26);
  else if (item.path === "/list.html") assert.equal(data.collected_count, 15);
  else if (item.path === "/mixed-collections.html") {
    assert.equal(
      data.collected_count,
      item.selection === "Feature requests" ? 5 : 6,
    );
    assert.notEqual(data.coverage, "complete");
    assert.equal(
      item.selectionHandled,
      true,
      "Explicit collection choice was not handled",
    );
  } else if (item.path === "/pagination.html") {
    assert.ok(data.collected_count < 100);
    assert.notEqual(data.coverage, "complete");
  } else if (item.path === "/virtual-scroll-grid.html") {
    assert.ok(data.collected_count > 0 && data.collected_count <= 1000);
    if (data.coverage === "complete") assert.equal(data.collected_count, 1000);
  } else if (item.path === "/collection-fixture.html")
    assert.ok(data.collected_count > 0);
}
