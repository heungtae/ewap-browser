import type { LearnedRecipe } from "../learned-profile/types.js";
export function learnedProfileHistory(recipe: LearnedRecipe): HTMLElement {
  const detail = document.createElement("details"),
    title = document.createElement("summary");
  title.textContent = "레시피 변경 이력과 단계 비교";
  detail.append(title);
  let previous: string[] = [];
  for (const h of recipe.history) {
    const operations = h.steps?.map((s) => `${s.channel}/${s.operation}`);
    const row = document.createElement("p");
    row.textContent = `${new Date(h.at).toLocaleString()} · revision ${h.revision} · ${{ success: "성공", failure: "실패 경로 격리", repair: "성공한 대안으로 갱신" }[h.kind]}`;
    detail.append(row);
    if (operations) {
      const before = document.createElement("pre"),
        after = document.createElement("pre");
      before.textContent = `이전: ${previous.join(" → ") || "최초 기록"}`;
      after.textContent = `현재: ${operations.join(" → ")}`;
      detail.append(before, after);
      previous = operations;
    }
  }
  return detail;
}
