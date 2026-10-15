import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createS1Fixture } from "./chrome-s1-fixture.mjs";
import { openS19Chrome } from "./chrome-s19-harness.mjs";
import { cdp, evaluate, waitFor } from "./chrome-cdp-utils.mjs";
const directory = await mkdtemp(join(tmpdir(), "page-collection-smoke-"));
const fixture = await createS1Fixture(directory);
let harness;
try {
  harness = await openS19Chrome({
    executable: process.env.CHROME_FOR_TESTING_BIN,
    fixture,
  });
  await evaluate(
    harness.panel,
    `(() => {
    window.__collectionLabels = [];
    new MutationObserver(() => {
      const text = document.querySelector('#activity-status')?.textContent;
      if (text?.includes('수집하는 중')) window.__collectionLabels.push(text);
    }).observe(document.querySelector('#activity-status'), { subtree: true, childList: true, characterData: true });
    document.querySelector('#mode-ask').click();
    document.querySelector('#chat-input').value = 'Describe this page';
    document.querySelector('#chat-send').click();
    return true;
  })()`,
  );
  await waitFor(
    () =>
      evaluate(
        harness.panel,
        "document.querySelector('#execution-trace').textContent.includes('ai S1 fixture answer')",
      ),
    20000,
    "AI_RESPONSE_LABEL",
  );
  const answer = await evaluate(
    harness.panel,
    "document.querySelector('#chat-messages').textContent",
  );
  assert.ok(answer.includes("S1 fixture answer"));
  assert.ok(
    !answer.includes("ai S1 fixture answer"),
    "AI label must stay in execution details",
  );
  await evaluate(
    harness.panel,
    "document.querySelector('#execution-details').open = true",
  );
  const labels = await evaluate(harness.panel, "window.__collectionLabels");
  for (const name of [
    "문서 정보",
    "요소와 상태",
    "Workflow 선언",
    "본문 텍스트",
    "기사 텍스트",
  ])
    assert.ok(
      labels.some((text) => text.includes(name)),
      `Missing collection progress: ${name}; ${JSON.stringify(labels)}`,
    );
  const recovered = await harness.send({ kind: "CHAT_RECOVER" });
  assert.ok(
    recovered.events.some(
      (event) =>
        event.type === "assistant_delta" && event.source === "provider",
    ),
  );
  const screenshot = await cdp(
    harness.panel.webSocketDebuggerUrl,
    "Page.captureScreenshot",
    { format: "png" },
  );
  await writeFile(
    "docs/evidence/page-collection-ai-label-2026-10-12.png",
    Buffer.from(screenshot.data, "base64"),
  );
  console.log(
    "Chrome PASS: five collection labels, execution-details ai prefix, persisted provider provenance, screenshot.",
  );
} finally {
  await harness?.close();
  await new Promise((resolve) => fixture.fixture.close(resolve));
  await rm(directory, { recursive: true, force: true });
}
