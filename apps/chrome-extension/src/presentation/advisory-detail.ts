import type {
  ManagedProfile,
  AdvisoryItem,
} from "@contextpilot/codebase-schema";
import type { AdvisoryClient } from "./advisory-client.js";
export function renderAdvisoryDetail(
  root: HTMLElement,
  profile: ManagedProfile,
  revision: number,
  client: AdvisoryClient,
  reload: () => Promise<void>,
  report: (promise: Promise<unknown>) => void,
  next: (cursor: string) => void,
) {
  root.replaceChildren();
  const node = (tag: string, text: string) => {
    const element = document.createElement(tag);
    element.textContent = text;
    return element;
  };
  const button = (text: string, action: () => Promise<unknown>) => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = text;
    b.onclick = () => {
      b.disabled = true;
      report(
        action().finally(() => {
          b.disabled = false;
        }),
      );
    };
    return b;
  };
  const controls = (recipe?: AdvisoryItem) => {
    const wrap = document.createElement("div");
    wrap.className = "learned-profile-controls";
    const name = document.createElement("input");
    name.value = recipe?.name ?? profile.name;
    name.maxLength = 80;
    name.placeholder = "표시 이름";
    name.setAttribute(
      "aria-label",
      recipe ? "레시피 표시 이름" : "프로필 표시 이름",
    );
    const change = (patch: {
      name?: string;
      enabled?: boolean;
      autoUpdate?: boolean;
    }) =>
      client
        .change({
          kind: "advisory.update",
          revision,
          scope: profile.scope,
          id: recipe?.id ?? null,
          patch,
        })
        .then(reload);
    wrap.append(
      name,
      button("이름 저장", () => change({ name: name.value })),
    );
    for (const [field, label] of [
      ["enabled", "사용"],
      ["autoUpdate", "자동 갱신"],
    ] as const) {
      const row = document.createElement("label"),
        checkbox = document.createElement("input");
      row.className = "checkbox-row";
      checkbox.type = "checkbox";
      checkbox.checked = (recipe ?? profile)[field];
      row.append(checkbox, document.createTextNode(label));
      checkbox.onchange = () => {
        checkbox.disabled = true;
        report(change({ [field]: checkbox.checked }));
      };
      wrap.append(row);
    }
    const actions = document.createElement("div");
    actions.className = "button-row";
    actions.append(
      button("다음 요청에서 다시 탐색", () =>
        client
          .change({
            kind: "advisory.rediscover",
            revision,
            scope: profile.scope,
            id: recipe?.id ?? null,
          })
          .then(reload),
      ),
      button("삭제", async () => {
        if (
          !window.confirm(
            recipe
              ? "이 참고 레시피와 원본 이력을 삭제할까요?"
              : "이 페이지의 참고 프로필과 레시피를 삭제할까요?",
          )
        )
          return;
        await client.change({
          kind: "advisory.delete",
          revision,
          scope: profile.scope,
          id: recipe?.id ?? null,
        });
        await reload();
      }),
    );
    wrap.append(actions);
    return wrap;
  };
  root.append(
    node("h3", profile.name || profile.origin),
    node("p", profile.origin),
    node(
      "p",
      "로컬 성공 기록 · 참고용. 사용 설정은 참고 후보에만 적용되며 실행하거나 권한을 부여하지 않습니다.",
    ),
    controls(),
  );
  const notes = document.createElement("textarea");
  notes.value = profile.notes;
  notes.maxLength = 500;
  notes.setAttribute("aria-label", "관리 메모 (Provider에 보내지 않음)");
  root.append(
    notes,
    button("메모 저장", () =>
      client
        .change({
          kind: "advisory.update",
          revision,
          scope: profile.scope,
          id: null,
          patch: { notes: notes.value },
        })
        .then(reload),
    ),
  );
  for (const recipe of profile.recipes) {
    root.append(node("h4", `${recipe.name} · 참고 레시피`), controls(recipe));
    const history = document.createElement("details"),
      summary = node("summary", "레시피 변경 이력과 단계 비교");
    history.append(summary);
    let loaded = false;
    const load = async (cursor = 0) => {
      const page = await client.history(profile.scope, recipe.id, cursor);
      if (!history.isConnected) return;
      for (const item of page.items)
        history.append(
          node(
            "p",
            `${new Date(item.successfulAt).toLocaleString()} · 원본 revision ${item.sourceRevision}`,
          ),
          node("pre", item.stepLabels.join(" → ")),
        );
      if (page.cursor !== null) {
        const more = button("다음 이력", async () => {
          await load(page.cursor!);
          more.remove();
        });
        history.append(more);
      }
    };
    history.ontoggle = () => {
      if (history.open && !loaded) {
        loaded = true;
        report(load());
      }
    };
    root.append(history);
  }
  if (profile.cursor)
    root.append(button("다음 레시피", async () => next(profile.cursor!)));
  const disclosure = document.createElement("details"),
    json = node("pre", JSON.stringify(profile, null, 2));
  json.id = "learned-profile-json";
  disclosure.append(node("summary", "읽기 전용 참고 프로필 · 원본 정보"), json);
  root.append(disclosure);
}
