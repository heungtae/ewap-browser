import type { LearnedPageProfile } from "../learned-profile/types.js";

export function renderLearnedProfileList(
  root: HTMLElement,
  records: LearnedPageProfile[],
  selected: string | undefined,
  filtered: boolean,
  select: (id: string) => void,
) {
  root.replaceChildren();
  for (const p of records) {
    const row = document.createElement("button");
    row.type = "button";
    row.className = "learned-profile-row";
    row.dataset.profileId = p.profile_id;
    row.setAttribute("aria-pressed", String(p.profile_id === selected));
    row.addEventListener("click", () => select(p.profile_id));
    const name = document.createElement("span");
    name.className = "profile-row-name";
    name.textContent = p.name || p.page_match.origin;
    const origin = document.createElement("span");
    origin.className = "profile-row-origin";
    origin.textContent = p.page_match.origin;
    origin.title = p.page_match.origin;
    const info = document.createElement("span");
    info.className = "profile-row-info";
    const counts = document.createElement("span");
    counts.textContent = `${p.recipes.length}개 레시피 · ${p.commands.length}개 명령`;
    const state = document.createElement("span");
    state.className = "profile-row-state";
    state.dataset.enabled = String(p.enabled);
    state.textContent = p.enabled ? "사용 중" : "중지";
    info.append(counts, state);
    const updated = document.createElement("span");
    updated.className = "profile-row-updated";
    updated.textContent = `최근 학습 ${new Date(p.updated_at).toLocaleString()}`;
    row.append(name, origin, info, updated);
    root.append(row);
  }
  if (!records.length) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = filtered
      ? "검색 조건에 맞는 프로파일이 없습니다."
      : "저장된 프로파일이 없습니다. 성공한 요청의 재사용 가능한 정보가 여기에 표시됩니다.";
    root.append(empty);
  }
}
