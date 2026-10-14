import { createLearnedProfileDetail } from "./learned-profile-detail.js";
import { renderLearnedProfileList } from "./learned-profile-list.js";
import { isPlainObject } from "../security/validation.js";
import type { LearnedPageProfile } from "../learned-profile/types.js";
type Runtime = { sendMessage(message: unknown): Promise<unknown> };
export function initializeLearnedProfileManagement(runtime: Runtime) {
  const root = document.querySelector<HTMLElement>("#learned-profiles");
  const status = document.querySelector<HTMLOutputElement>(
    "#learned-profile-status",
  );
  const enabled = document.querySelector<HTMLInputElement>(
    "#learned-profile-enabled",
  );
  const filter = document.querySelector<HTMLInputElement>(
    "#learned-profile-filter",
  );
  const detail = document.querySelector<HTMLElement>("#learned-profile-detail");
  if (!root || !status || !enabled || !filter || !detail) return;
  let revision = 0,
    offset = 0,
    total = 0,
    loadSequence = 0;
  let selected: string | undefined;
  const send = async (message: Record<string, unknown>) => {
    const result = await runtime.sendMessage({
      kind: "LEARNED_PROFILE_MANAGE",
      ...message,
    });
    if (!isPlainObject(result) || result.ok !== true)
      throw new Error("요청을 적용하지 못했습니다. 목록을 새로 고침해 주세요.");
    return result;
  };
  const report = (work: Promise<unknown>) => {
    void work.catch((error: unknown) => {
      status.textContent =
        error instanceof Error ? error.message : "프로필 관리에 실패했습니다.";
    });
  };
  const button = (label: string, action: () => Promise<unknown>) => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = label;
    b.addEventListener("click", () => report(action()));
    return b;
  };
  const update = async (
    p: LearnedPageProfile,
    operation: string,
    patch: Record<string, unknown>,
    expected: number,
  ) => {
    await send({
      operation,
      revision: expected,
      profile_id: p.profile_id,
      ...(patch ? { patch } : {}),
    });
    status.textContent =
      "프로필 설정을 적용했습니다. 다음 요청부터 사용합니다.";
    await load();
  };
  const renderDetail = createLearnedProfileDetail({
    detail,
    send,
    update,
    button,
    load,
    report,
  });
  const show = async (id: string) => {
    selected = id;
    for (const row of root.querySelectorAll<HTMLButtonElement>(
      ".learned-profile-row",
    ))
      row.setAttribute("aria-pressed", String(row.dataset.profileId === id));
    await renderDetail(id);
  };
  async function load() {
    const sequence = ++loadSequence;
    const result = await send({
      operation: "list",
      offset,
      limit: 10,
      filter: filter!.value,
    });
    if (sequence !== loadSequence) return;
    revision = result.catalog_revision as number;
    enabled!.checked = result.enabled === true;
    enabled!.disabled = false;
    total = result.total as number;
    if (offset >= total && offset > 0) {
      offset = Math.max(0, Math.floor((total - 1) / 10) * 10);
      return load();
    }
    const records = result.records as LearnedPageProfile[];
    if (!records.some((p) => p.profile_id === selected))
      selected = records[0]?.profile_id;
    renderLearnedProfileList(root!, records, selected, !!filter!.value, (id) =>
      report(show(id)),
    );
    const count = document.querySelector("#learned-profile-count");
    if (count) count.textContent = `${total}개`;
    const page = document.querySelector("#learned-profile-page");
    if (page)
      page.textContent = total
        ? `${offset + 1}–${Math.min(offset + 10, total)} / ${total}`
        : "0 / 0";
    const previous = document.querySelector<HTMLButtonElement>(
        "#learned-profile-previous",
      ),
      next = document.querySelector<HTMLButtonElement>("#learned-profile-next");
    if (previous) previous.disabled = offset === 0;
    if (next) next.disabled = offset + 10 >= total;
    if (selected) await show(selected);
    else await renderDetail();
  }
  enabled.addEventListener("change", () => {
    enabled.disabled = true;
    report(
      (async () => {
        try {
          await send({
            operation: "feature",
            revision,
            patch: { enabled: enabled.checked },
          });
        } finally {
          await load();
        }
      })(),
    );
  });
  filter.addEventListener("input", () => {
    offset = 0;
    report(load());
  });
  document
    .querySelector("#learned-profile-refresh")
    ?.addEventListener("click", () => report(load()));
  document
    .querySelector("#learned-profile-previous")
    ?.addEventListener("click", () => {
      offset = Math.max(0, offset - 10);
      report(load());
    });
  document
    .querySelector("#learned-profile-next")
    ?.addEventListener("click", () => {
      offset += 10;
      report(load());
    });
  document
    .querySelector("#learned-profile-clear")
    ?.addEventListener("click", () =>
      report(
        (async () => {
          if (
            !window.confirm("모든 로컬 학습 프로필과 페이지 명령을 삭제할까요?")
          )
            return;
          await send({ operation: "clear", revision });
          detail.replaceChildren();
          offset = 0;
          await load();
        })(),
      ),
    );
  report(load());
}
