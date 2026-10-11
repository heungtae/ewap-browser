import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { cdp, evaluate, sleep } from "./chrome-cdp-utils.mjs";

export const verifyS21Ui = async (harness, goal) => {
  await cdp(harness.version.webSocketDebuggerUrl, "Target.activateTarget", {
    targetId: harness.panel.id,
  });
  let visible = "";
  for (let i = 0; i < 40; i++) {
    await sleep(250);
    visible = await evaluate(
      harness.panel,
      `(()=>{const messages=[...document.querySelector('#chat-messages').children];const index=messages.findLastIndex(node=>node.dataset.role==='user');return messages.slice(index+1).filter(node=>node.dataset.role==='assistant').map(node=>node.textContent).join('\\n')})()`,
    );
    if (
      (goal !== "completed" && visible.trim()) ||
      visible.includes("목표의 완료를 확인")
    )
      break;
  }
  assert.ok(
    visible.trim(),
    "Current request must have a visible terminal message",
  );
  if (goal === "completed")
    assert.ok(
      visible.includes("목표의 완료를 확인"),
      `Visible completion: ${visible}`,
    );
  else assert.ok(!visible.includes("목표의 완료를 확인"));
  await evaluate(
    harness.panel,
    "(()=>{const scroll=document.querySelector('#chat-scroll');if(scroll)scroll.scrollTop=scroll.scrollHeight;return true})()",
  );
  return visible;
};

export const s21BuildHash = async () =>
  createHash("sha256")
    .update(await readFile("dist-extension/js/service-worker.js"))
    .digest("hex");

export const s21Completion = async (harness) => {
  const recovered = await harness.send({ kind: "CHAT_RECOVER" });
  const terminal = recovered.events?.findLast(
    (event) => event.type === "run_terminal",
  );
  return terminal
    ? {
        run_id: terminal.run_id,
        outcome: terminal.outcome,
        code: terminal.code,
        completion: terminal.completion,
      }
    : undefined;
};

export const verifyS21Result = ({
  id,
  model,
  elementCalls,
  mutationCount,
  assessmentCalls,
  finalGoal,
  checked,
  accepted,
}) => {
  if (id === "element" && !model) assert.equal(elementCalls, 1);
  assert.equal(mutationCount, ["already", "blocked"].includes(id) ? 0 : 1);
  assert.ok(assessmentCalls <= 2);
  if (["normal", "already", "blocked"].includes(id))
    assert.equal(assessmentCalls, 0);
  if (["delayed", "replacement"].includes(id)) assert.ok(assessmentCalls > 0);
  if (id.startsWith("generic-")) {
    assert.ok(assessmentCalls > 0);
    assert.equal(finalGoal, id === "generic-click" ? "completed" : "unknown");
    assert.equal(accepted?.completion?.goal_status, finalGoal);
  }
  if (id === "not-completed") {
    assert.notEqual(finalGoal, "completed");
    assert.ok(
      ["unknown", "incomplete"].includes(accepted?.completion?.goal_status),
      "Worker must retain unresolved completion",
    );
  }
  if (["normal", "already", "element", "delayed", "replacement"].includes(id)) {
    assert.equal(
      finalGoal,
      "completed",
      "Structured goal confirmation missing",
    );
    assert.equal(
      accepted?.completion?.goal_status,
      "completed",
      "Worker must accept the structured goal",
    );
    assert.equal(checked, "true");
  }
};
