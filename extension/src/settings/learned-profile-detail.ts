import { learnedProfileHistory } from "./learned-profile-history.js";
import type {
  LearnedPageProfile,
  LearnedRecipe,
} from "../learned-profile/types.js";
export function createLearnedProfileDetail({
  detail,
  send,
  update,
  button,
  load,
  report,
}: {
  detail: HTMLElement;
  send(message: Record<string, unknown>): Promise<Record<string, unknown>>;
  update(
    p: LearnedPageProfile,
    operation: string,
    patch: Record<string, unknown>,
    expected: number,
  ): Promise<void>;
  button(label: string, action: () => Promise<unknown>): HTMLButtonElement;
  load(): Promise<void>;
  report(work: Promise<unknown>): void;
}) {
  let sequence = 0;
  const controls = (
    p: LearnedPageProfile,
    expected: number,
    recipe?: LearnedRecipe,
  ) => {
    const target = recipe ?? p,
      wrap = document.createElement("div");
    wrap.className = "learned-profile-controls";
    const name = document.createElement("input");
    name.value = target.name;
    name.maxLength = 80;
    name.placeholder = "표시 이름";
    name.setAttribute(
      "aria-label",
      recipe ? "레시피 표시 이름" : "프로필 표시 이름",
    );
    const patch = (fields: Record<string, unknown>) => ({
      ...fields,
      ...(recipe ? { recipe_id: recipe.recipe_id } : {}),
    });
    wrap.append(
      name,
      button("이름 저장", () =>
        update(p, "update", patch({ name: name.value }), expected),
      ),
    );
    for (const [key, label] of [
      ["enabled", "사용"],
      ["auto_update", "자동 갱신"],
    ] as const) {
      const row = document.createElement("label"),
        input = document.createElement("input");
      input.type = "checkbox";
      input.checked = target[key];
      row.className = "checkbox-row";
      row.append(input, document.createTextNode(label));
      input.addEventListener("change", () =>
        report(update(p, "update", patch({ [key]: input.checked }), expected)),
      );
      wrap.append(row);
    }
    const actions = document.createElement("div");
    actions.className = "button-row";
    actions.append(
      button("다음 요청에서 다시 탐색", () =>
        update(p, "rediscover", patch({}), expected),
      ),
      button("삭제", async () => {
        if (
          !window.confirm(
            recipe
              ? "이 레시피와 연결된 페이지 명령을 삭제할까요?"
              : "이 페이지의 프로필과 모든 명령을 삭제할까요?",
          )
        )
          return;
        await send({
          operation: "delete",
          revision: expected,
          profile_id: p.profile_id,
          patch: patch({}),
        });
        await load();
      }),
    );
    wrap.append(actions);
    return wrap;
  };
  return async (id?: string) => {
    const current = ++sequence;
    if (!id) {
      detail.textContent = "목록에서 프로파일을 선택하세요.";
      return;
    }
    detail.textContent = "프로파일을 불러오는 중입니다.";
    const result = await send({ operation: "get", profile_id: id });
    if (current !== sequence) return;
    detail.replaceChildren();
    if (!result.profile) {
      detail.textContent =
        "프로파일이 삭제되었습니다. 목록을 새로 고침해 주세요.";
      return;
    }
    const expected = result.catalog_revision as number;
    const p = result.profile as LearnedPageProfile;
    const title = document.createElement("h3");
    title.textContent = p.name || p.page_match.origin;
    const explanation = document.createElement("p");
    explanation.textContent =
      "로컬 성공 기록 · 참고용. 레시피 사용 설정은 연결된 명령에도 적용됩니다. 명령을 실행하거나 권한을 부여하지 않습니다.";
    const origin = document.createElement("p");
    origin.textContent = p.page_match.origin;
    detail.append(title, origin, explanation, controls(p, expected));
    const notes = document.createElement("textarea");
    notes.value = p.notes;
    notes.maxLength = 500;
    notes.setAttribute("aria-label", "관리 메모 (Provider에 보내지 않음)");
    detail.append(
      notes,
      button("메모 저장", () =>
        update(p, "update", { notes: notes.value }, expected),
      ),
    );
    for (const r of p.recipes) {
      const h = document.createElement("h4");
      h.textContent = `${r.name || r.task.kind} · ${r.task.mode} · ${r.lifecycle}`;
      detail.append(h, controls(p, expected, r), learnedProfileHistory(r));
    }
    const disclosure = document.createElement("details"),
      summary = document.createElement("summary"),
      json = document.createElement("pre");
    summary.textContent = "읽기 전용 프로필 · 명령 · 갱신 이력";
    json.id = "learned-profile-json";
    json.textContent = JSON.stringify(p, null, 2);
    disclosure.append(summary, json);
    detail.append(disclosure);
  };
}
