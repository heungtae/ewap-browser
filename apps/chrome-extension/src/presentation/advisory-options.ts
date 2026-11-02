import type { AdvisoryClient } from "./advisory-client.js";
type Browser = {
  runtime: { getURL(path: string): string };
  tabs: {
    query(query: { url: string }): Promise<{ id?: number; windowId: number }[]>;
    update(id: number, value: { active: boolean }): Promise<unknown>;
  };
  windows: {
    update(id: number, value: { focused: boolean }): Promise<unknown>;
    create(value: {
      url: string;
      type: "popup";
      width: number;
      height: number;
    }): Promise<unknown>;
  };
};
export function initializeAdvisoryOptions(client: AdvisoryClient) {
  const enabled = document.getElementById(
    "learned-profile-enabled",
  ) as HTMLInputElement | null;
  const open = document.getElementById(
    "learned-profile-open",
  ) as HTMLButtonElement | null;
  const summary = document.getElementById("learned-profile-summary"),
    status = document.getElementById("learned-profile-status");
  if (!enabled || !open || !summary || !status) return;
  let revision = 0;
  enabled.disabled = true;
  const report = (work: Promise<unknown>) => {
    void work.catch((error) => {
      status.textContent =
        error instanceof Error
          ? error.message
          : "프로필 관리에 연결하지 못했습니다.";
    });
  };
  const load = async () => {
    const page = await client.profiles(null);
    revision = page.revision;
    enabled.checked = page.enabled;
    enabled.disabled = false;
    summary.textContent = page.partial
      ? `현재 ${page.items.length}개 표시 · 관리 창에서 추가 목록을 확인하세요.`
      : `저장된 참고 프로파일 ${page.items.length}개`;
  };
  enabled.onchange = () => {
    enabled.disabled = true;
    report(
      client
        .change({
          kind: "advisory.feature",
          revision,
          enabled: enabled.checked,
        })
        .then(load)
        .finally(() => {
          enabled.disabled = false;
        }),
    );
  };
  open.onclick = () => {
    open.disabled = true;
    report(
      (async () => {
        const browser = (globalThis as typeof globalThis & { chrome?: Browser })
          .chrome;
        if (!browser) throw Error("로컬 관리 창을 열 수 없습니다.");
        const url = browser.runtime.getURL("settings/learned-profiles.html");
        const existing = (await browser.tabs.query({ url }))[0];
        if (existing?.id !== undefined) {
          await browser.tabs.update(existing.id, { active: true });
          await browser.windows.update(existing.windowId, { focused: true });
        } else
          await browser.windows.create({
            url,
            type: "popup",
            width: 1180,
            height: 820,
          });
        status.textContent = "프로파일 관리 창을 열었습니다.";
      })().finally(() => {
        open.disabled = false;
      }),
    );
  };
  window.addEventListener("focus", () => report(load()));
  report(load());
}
