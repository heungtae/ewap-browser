import { isPlainObject } from "../security/validation.js";

type Runtime = { sendMessage(message: unknown): Promise<unknown> };
type Browser = {
  runtime: { getURL(path: string): string };
  tabs: {
    query(query: { url: string }): Promise<{ id?: number; windowId: number }[]>;
    update(id: number, patch: { active: boolean }): Promise<unknown>;
  };
  windows: {
    update(id: number, patch: { focused: boolean }): Promise<unknown>;
    create(options: {
      url: string;
      type: "popup";
      width: number;
      height: number;
    }): Promise<unknown>;
  };
};

export function initializeLearnedProfileOptions(runtime: Runtime) {
  const enabled = document.querySelector<HTMLInputElement>(
    "#learned-profile-enabled",
  );
  const open = document.querySelector<HTMLButtonElement>(
    "#learned-profile-open",
  );
  const status = document.querySelector<HTMLOutputElement>(
    "#learned-profile-status",
  );
  const summary = document.querySelector<HTMLElement>(
    "#learned-profile-summary",
  );
  if (!enabled || !open || !status || !summary) return;
  let revision = 0;
  enabled.disabled = true;
  const send = async (message: Record<string, unknown>) => {
    const result = await runtime.sendMessage({
      kind: "LEARNED_PROFILE_MANAGE",
      ...message,
    });
    if (!isPlainObject(result) || result.ok !== true)
      throw new Error("설정을 적용하지 못했습니다. 다시 시도해 주세요.");
    return result;
  };
  const load = async () => {
    const result = await send({ operation: "list", limit: 1 });
    revision = result.catalog_revision as number;
    enabled.checked = result.enabled === true;
    summary.textContent = `저장된 프로파일 ${result.total}개 · 별도 창에서 목록과 상세 정보를 관리합니다.`;
    enabled.disabled = false;
  };
  const report = (work: Promise<unknown>) => {
    void work.catch((error: unknown) => {
      status.textContent =
        error instanceof Error
          ? error.message
          : "프로파일 관리 창을 열지 못했습니다.";
    });
  };
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
          status.textContent = "자동 저장 및 재사용 설정을 적용했습니다.";
        } finally {
          await load();
        }
      })(),
    );
  });
  open.addEventListener("click", () => {
    open.disabled = true;
    report(
      (async () => {
        try {
          const browser = (
            globalThis as typeof globalThis & { chrome?: Browser }
          ).chrome;
          if (!browser)
            throw new Error("확장 프로그램 런타임에 연결할 수 없습니다.");
          const url = browser.runtime.getURL("settings/learned-profiles.html");
          const existing = (await browser.tabs.query({ url }))[0];
          if (existing?.id !== undefined) {
            await browser.tabs.update(existing.id, { active: true });
            await browser.windows.update(existing.windowId, { focused: true });
          } else {
            await browser.windows.create({
              url,
              type: "popup",
              width: 1180,
              height: 820,
            });
          }
          status.textContent = "프로파일 관리 창을 열었습니다.";
        } finally {
          open.disabled = false;
        }
      })(),
    );
  });
  window.addEventListener("focus", () => {
    if (!enabled.disabled) report(load());
  });
  report(load());
}
