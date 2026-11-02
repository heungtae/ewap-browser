import type { ManagedProfile } from "@contextpilot/codebase-schema";
import { createAdvisoryClient } from "./advisory-client.js";
import { renderAdvisoryDetail } from "./advisory-detail.js";
export function initializeAdvisoryManager() {
  const client = createAdvisoryClient();
  const maybeRoot = document.getElementById("learned-profiles"),
    maybeDetail = document.getElementById("learned-profile-detail");
  const enabled = document.getElementById(
    "learned-profile-enabled",
  ) as HTMLInputElement;
  const filter = document.getElementById(
    "learned-profile-filter",
  ) as HTMLInputElement;
  const maybeStatus = document.getElementById("learned-profile-status");
  if (!maybeRoot || !maybeDetail || !enabled || !filter || !maybeStatus) return;
  const root = maybeRoot,
    detail = maybeDetail,
    status = maybeStatus;
  let cursor: string | null = null,
    nextCursor: string | null = null,
    revision = 0,
    sequence = 0,
    selected: ManagedProfile | undefined;
  const previous: (string | null)[] = [];
  const report = (work: Promise<unknown>) => {
    void work.catch((error) => {
      status.textContent =
        error instanceof Error
          ? error.message
          : "프로파일을 불러오지 못했습니다.";
    });
  };
  const show = async (profile: ManagedProfile, after: string | null = null) => {
    selected = profile;
    const current = ++sequence;
    const result = await client.profile(profile.scope, after);
    if (current !== sequence) return;
    renderAdvisoryDetail(
      detail,
      result.profile,
      result.revision,
      client,
      load,
      report,
      (after) => {
        report(show(profile, after));
      },
    );
    for (const row of root.querySelectorAll<HTMLButtonElement>(
      ".learned-profile-row",
    ))
      row.setAttribute(
        "aria-pressed",
        String(row.dataset.profileId === profile.scope.pageKey),
      );
  };
  async function load() {
    status.textContent = "프로파일을 불러오는 중입니다.";
    detail.textContent = "프로파일을 불러오는 중입니다.";
    const current = ++sequence;
    const page = await client.profiles(cursor, filter.value);
    if (current !== sequence) return;
    revision = page.revision;
    enabled.checked = page.enabled;
    enabled.disabled = false;
    nextCursor = page.cursor;
    root.replaceChildren();
    for (const profile of page.items) {
      const row = document.createElement("button");
      row.type = "button";
      row.className = "learned-profile-row";
      row.dataset.profileId = profile.scope.pageKey;
      const name = document.createElement("span"),
        origin = document.createElement("span"),
        info = document.createElement("span"),
        state = document.createElement("span"),
        count = document.createElement("span"),
        updated = document.createElement("span");
      name.className = "profile-row-name";
      name.textContent = profile.name || profile.origin;
      origin.className = "profile-row-origin";
      origin.textContent = profile.origin;
      origin.title = profile.origin;
      info.className = "profile-row-info";
      count.textContent = `${profile.recipeCount}개 참고 레시피 · 실행 명령 없음`;
      state.className = "profile-row-state";
      state.dataset.enabled = String(profile.enabled);
      state.textContent = profile.enabled ? "사용 중" : "중지";
      info.append(count, state);
      updated.className = "profile-row-updated";
      updated.textContent = `최근 학습 ${new Date(profile.updatedAt).toLocaleString()}`;
      row.append(name, origin, info, updated);
      row.onclick = () => report(show(profile));
      root.append(row);
    }
    const count = document.getElementById("learned-profile-count");
    if (count) count.textContent = `${page.items.length}개 표시`;
    const label = document.getElementById("learned-profile-page");
    if (label)
      label.textContent = page.partial
        ? "다음 범위에서 추가 확인할 수 있습니다."
        : "마지막 목록";
    (
      document.getElementById("learned-profile-previous") as HTMLButtonElement
    ).disabled = !previous.length;
    (
      document.getElementById("learned-profile-next") as HTMLButtonElement
    ).disabled = nextCursor === null;
    const chosen =
      page.items.find((p) => p.scope.pageKey === selected?.scope.pageKey) ??
      page.items[0];
    if (chosen) await show(chosen);
    else {
      detail.textContent = "목록에서 프로파일을 선택하세요.";
      root.textContent = page.partial
        ? "이 범위에 일치하는 프로파일이 없습니다. 다음 목록을 확인하세요."
        : "저장된 프로파일이 없습니다.";
    }
    status.textContent =
      "참고 기록을 불러왔습니다. 실행 권한은 포함하지 않습니다.";
  }
  const reset = () => {
    cursor = null;
    previous.length = 0;
    return load();
  };
  filter.oninput = () => report(reset());
  enabled.onchange = () => {
    enabled.disabled = true;
    report(
      client
        .change({
          kind: "advisory.feature",
          revision,
          enabled: enabled.checked,
        })
        .then(load),
    );
  };
  document.getElementById("learned-profile-refresh")!.onclick = () =>
    report(reset());
  document.getElementById("learned-profile-previous")!.onclick = () => {
    cursor = previous.pop() ?? null;
    report(load());
  };
  document.getElementById("learned-profile-next")!.onclick = () => {
    if (nextCursor) {
      previous.push(cursor);
      cursor = nextCursor;
      report(load());
    }
  };
  document.getElementById("learned-profile-clear")!.onclick = () => {
    if (window.confirm("모든 로컬 참고 프로필과 이력을 삭제할까요?"))
      report(client.change({ kind: "advisory.clear", revision }).then(reset));
  };
  report(load());
}
