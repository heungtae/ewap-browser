import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { cdp, evaluate } from "./chrome-cdp-utils.mjs";

export const verifyWorkflowCandidateEvidence = async (panel) => {
  const evidence = await evaluate(
    panel,
    `(() => {
      const cards = [...document.querySelectorAll('[data-workflow-selection-id]')];
      const current = cards.findLast(card => card.dataset.decision !== 'locked');
      const rows = [...(current?.querySelectorAll('.workflow-candidate-evidence') ?? [])];
      if (!rows.length) return null;
      return rows.map(row => ({
        text: row.textContent,
        choice: row.nextElementSibling?.textContent,
      }));
    })()`,
  );
  if (!evidence) return false;
  for (const row of evidence) {
    assert.match(row.text, /카탈로그 상태:/);
    assert.match(row.text, /근거:/);
    assert.match(row.text, /적용 범위:/);
    assert.match(row.text, /요청 적합성: 미검토/);
    assert.match(row.text, /실행 가능성: 미확인/);
    assert.match(row.choice, /검토할 후보 선택|페이지 변경됨|페이지 비교 불가/);
    assert.doesNotMatch(row.choice, /단계 실행/);
  }
  if (process.env.WORKFLOW_CANDIDATE_SCREENSHOT) {
    await evaluate(
      panel,
      `document.querySelector('[data-workflow-selection-id]:not([data-decision="locked"]) .workflow-candidate-evidence')?.scrollIntoView({block:'start'})`,
    );
    const shot = await cdp(
      panel.webSocketDebuggerUrl,
      "Page.captureScreenshot",
      {
        format: "png",
      },
    );
    await writeFile(
      process.env.WORKFLOW_CANDIDATE_SCREENSHOT,
      Buffer.from(shot.data, "base64"),
    );
  }
  return true;
};
