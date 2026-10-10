import type { WorkflowCandidate } from "../contracts/workflow-catalog.js";

/** Catalog integrity is neither a suitability verdict nor execution approval. */
export const appendWorkflowCandidateEvidence = (
  parent: HTMLElement,
  candidate: WorkflowCandidate,
): void => {
  const evidence = document.createElement("div");
  evidence.className = "workflow-candidate-evidence";
  evidence.dataset.candidateId = candidate.id;
  const integrity = {
    verified: "출처/페이지 결속 확인됨",
    draft: "초안 · 출처/페이지 결속 검증 미완료",
    stale: "페이지 변경됨 · 선택 불가",
    incomparable: "페이지 비교 불가 · 선택 불가",
  }[candidate.status];
  for (const text of [
    `카탈로그 상태: ${integrity}`,
    `근거: ${candidate.detail}`,
    `적용 범위: ${candidate.origin}${candidate.path_prefix}`,
    "요청 적합성: 미검토 · 현재 요청에 대한 LLM 검토 근거 없음",
    "실행 가능성: 미확인 · 선택 후 최신 자료 검토와 별도 계획 승인이 필요합니다.",
  ]) {
    const line = document.createElement("p");
    line.textContent = text;
    evidence.append(line);
  }
  parent.append(evidence);
};
