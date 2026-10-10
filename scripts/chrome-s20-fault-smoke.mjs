import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import assert from "node:assert/strict";
import { createS1Fixture } from "./chrome-s1-fixture.mjs";
import { openS19Chrome } from "./chrome-s19-harness.mjs";
import { evaluate, sleep, waitFor } from "./chrome-cdp-utils.mjs";
import { parseTool } from "./chrome-s19-fixture.mjs";
const cert = await mkdtemp(join(tmpdir(), "contextpilot-s20-fault-"));
const results = [];
let current;
const fixture = await createS1Fixture(
  cert,
  () =>
    "<title>Fault holdout</title><button onclick='window.mutations++'>Change state</button><script>window.mutations=0</script>",
  async (_req, res, body) => {
    let message;
    if (body.messages[0]?.content?.includes("Classify the user"))
      message = { content: JSON.stringify({ route: "ACTION_REQUIRED" }) };
    else {
      current.calls++;
      current.returned = body.messages
        .filter((m) => m.role === "tool")
        .map((m) => parseTool(m.content));
      if (current.id === "contract" && current.calls > 1)
        message = {
          content:
            "The invalid read contract was rejected. No action was executed.",
        };
      else
        message = {
          tool_calls: [
            {
              id: `s20-fault-${current.id}-${current.calls}-abcdefghijkl`,
              type: "function",
              function: {
                name:
                  current.id === "budget"
                    ? "read_semantic_projection"
                    : "read_page_resource",
                arguments:
                  current.id === "budget" ? "{}" : '{"resource_id":17}',
              },
            },
          ],
        };
    }
    res.writeHead(200, {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
    });
    res.end(JSON.stringify({ choices: [{ message }] }));
  },
);
const harness = await openS19Chrome({
  executable: process.env.CHROME_FOR_TESTING_BIN,
  fixture,
});
try {
  for (const id of ["contract", "budget"]) {
    current = { id, calls: 0, returned: [] };
    await harness.send({ kind: "CANCEL" });
    await harness.send({ kind: "CHAT_CLEAR" });
    await evaluate(
      harness.panel,
      "(()=>{document.querySelector('#mode-act').click();document.querySelector('#chat-input').value='Inspect the page safely; never change it.';document.querySelector('#chat-form').requestSubmit();return true})()",
    );
    await waitFor(
      async () => {
        await sleep(150);
        await evaluate(
          harness.panel,
          "(()=>{[...document.querySelectorAll('.event-card button')].find(b=>!b.disabled&&b.textContent.includes('일반 한 단계 실행'))?.click();return true})()",
        );
        return (
          current.calls >= (id === "budget" ? 12 : 2) &&
          (await evaluate(
            harness.panel,
            "document.querySelector('#chat-send').dataset.state==='send'",
          ))
        );
      },
      45000,
      `S20_${id}_TERMINAL_MISSING`,
    );
    assert.equal(await evaluate(harness.page, "window.mutations"), 0);
    const text = await evaluate(
      harness.panel,
      "document.querySelector('#chat-messages').textContent",
    );
    assert.equal(text.includes("모델이 목표 완료"), false);
    if (id === "budget") {
      assert.match(text, /budget을 소진/);
      assert.match(text, /목표는 아직 확인되지/);
    } else
      assert.ok(
        current.returned.some(
          (r) => r.status === "FAILED" && r.code === "INVALID_ARGUMENT",
        ),
      );
    const result = {
      id,
      pass: true,
      calls: current.calls,
      results: current.returned.map(({ status, code, reason }) => ({
        status,
        code,
        reason,
      })),
      mutations: 0,
    };
    results.push(result);
    console.log(`S20 ${id}: PASS`);
  }
  if (process.env.S20_FAULT_REPORT)
    await writeFile(
      process.env.S20_FAULT_REPORT,
      JSON.stringify(results, null, 2),
    );
} finally {
  await harness.close();
  await new Promise((resolve) => fixture.fixture.close(resolve));
  await rm(cert, { recursive: true, force: true, maxRetries: 3 });
}
