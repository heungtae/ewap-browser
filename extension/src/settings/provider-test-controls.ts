import { settingsErrorMessage } from "./settings-errors.js";
import { runtime } from "./settings-browser.js";
import { form, show } from "./provider-form-fields.js";
import type { SaveProvider } from "./provider-form-save.js";
export const initializeProviderTest = (saveProvider: SaveProvider) => {
  const providerTest =
    document.querySelector<HTMLButtonElement>("#provider-test");
  const providerTestMessages = document.querySelector<HTMLInputElement>(
    "#provider-test-messages",
  );
  const providerTestDiagnostics = document.querySelector<HTMLPreElement>(
    "#provider-test-diagnostics",
  );
  const showTestDiagnostics = (value: unknown): void => {
    if (!providerTestDiagnostics) return;
    if (value === undefined) {
      providerTestDiagnostics.hidden = true;
      providerTestDiagnostics.textContent = "";
      return;
    }
    providerTestDiagnostics.textContent = JSON.stringify(value, null, 2);
    providerTestDiagnostics.hidden = false;
  };

  providerTest?.addEventListener("click", () => {
    if (!form?.reportValidity()) return;
    void (async () => {
      if (!runtime) {
        show("확장 프로그램 런타임에 연결할 수 없습니다.");
        return;
      }
      show("LLM 연결을 테스트하는 중입니다.");
      const includeMessages = providerTestMessages?.checked === true;
      showTestDiagnostics(undefined);
      try {
        const provider = await saveProvider();
        const response = await runtime.sendMessage({
          kind: "PROVIDER_TEST",
          payload: {
            id: provider.id,
            request: {
              wire_api: provider.wire_api,
              model: provider.model,
              messages: [{ role: "user", content: "connection test" }],
              stream: false,
            },
            ...(includeMessages ? { include_messages: true } : {}),
          },
        });
        if (
          typeof response === "object" &&
          response !== null &&
          (response as { ok?: unknown }).ok
        ) {
          if (includeMessages)
            showTestDiagnostics(
              (response as { diagnostics?: unknown }).diagnostics,
            );
          show(
            `LLM 연결 테스트 성공 (HTTP ${(response as { status?: number }).status ?? "응답"})`,
          );
          return;
        }
        const code =
          typeof response === "object" &&
          response !== null &&
          typeof (response as { code?: unknown }).code === "string"
            ? (response as { code: string }).code
            : "UNKNOWN";
        const detail =
          typeof response === "object" &&
          response !== null &&
          typeof (response as { detail?: unknown }).detail === "string"
            ? `: ${(response as { detail: string }).detail}`
            : "";
        if (includeMessages)
          showTestDiagnostics(
            (response as { diagnostics?: unknown }).diagnostics,
          );
        show(`LLM 연결 테스트 실패 (${code}${detail})`);
      } catch (error: unknown) {
        show(
          error instanceof Error
            ? `LLM 연결 테스트 실패 (${settingsErrorMessage(error)})`
            : "LLM 연결 테스트에 실패했습니다.",
        );
      }
    })();
  });
};
