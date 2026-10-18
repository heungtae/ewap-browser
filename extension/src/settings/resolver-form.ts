import { storage, runtime } from "./settings-browser.js";
import { markFormSaved } from "./form-feedback.js";
import { validateProfileResolverSettings } from "./profile-settings.js";
export const initializeResolverForm = () => {
  const profileForm = document.querySelector<HTMLFormElement>("#profile-form");
  const profileStatus =
    document.querySelector<HTMLOutputElement>("#profile-status");
  const profileTest =
    document.querySelector<HTMLButtonElement>("#profile-test");
  const profileField = (
    name: string,
  ): HTMLInputElement | HTMLTextAreaElement => {
    const element = profileForm?.elements.namedItem(name);
    if (
      !(
        element instanceof HTMLInputElement ||
        element instanceof HTMLTextAreaElement
      )
    )
      throw new Error("profile settings field missing");
    return element;
  };
  void storage?.get("profile_resolver").then((stored) => {
    const current = stored.profile_resolver as
      | Record<string, unknown>
      | undefined;
    if (!current) return;
    profileField("resolver_url").value = String(current.url ?? "");
    profileField("deployment_id").value = String(current.deployment_id ?? "");
    profileField("allowed_origins").value = Array.isArray(
      current.allowed_origins,
    )
      ? current.allowed_origins.join("\n")
      : "";
    profileField("key_ring").value = JSON.stringify(
      current.key_ring ?? {},
      null,
      2,
    );
  });
  const readProfileSettings = () =>
    validateProfileResolverSettings({
      schema_version: 1,
      url: profileField("resolver_url").value.trim(),
      deployment_id: profileField("deployment_id").value.trim(),
      allowed_origins: profileField("allowed_origins")
        .value.split(/\r?\n/)
        .map((item) => item.trim())
        .filter(Boolean),
      key_ring: JSON.parse(profileField("key_ring").value),
    });
  const saveProfileSettings = async () => {
    const value = readProfileSettings();
    if (!storage) throw new Error("설정 저장소를 사용할 수 없습니다.");
    await storage.set({ profile_resolver: value });
    markFormSaved(profileForm);
  };

  profileForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    void saveProfileSettings()
      .then(() => {
        if (profileStatus)
          profileStatus.value = "업무 프로필 서버 설정을 저장했습니다.";
      })
      .catch(() => {
        if (profileStatus)
          profileStatus.value =
            "Resolver URL, origin, public key 형식을 확인해 주세요.";
      });
  });

  profileTest?.addEventListener("click", () => {
    void (async () => {
      if (!runtime) {
        if (profileStatus)
          profileStatus.value = "확장 프로그램 런타임에 연결할 수 없습니다.";
        return;
      }
      if (profileStatus)
        profileStatus.value = "업무 프로필 서버 연결을 테스트하는 중입니다.";
      try {
        await saveProfileSettings();
        const response = await runtime.sendMessage({ kind: "RESOLVE_PROFILE" });
        if (
          typeof response === "object" &&
          response !== null &&
          (response as { ok?: unknown }).ok
        ) {
          const value = response as {
            resolution?: string;
            profile_id?: string;
            profile_version?: number;
          };
          if (profileStatus)
            profileStatus.value = `업무 프로필 서버 연결 테스트 성공 (${value.resolution ?? "응답 검증 완료"}${value.profile_id ? `, ${value.profile_id} v${value.profile_version ?? "-"}` : ""})`;
          return;
        }
        const code =
          typeof response === "object" &&
          response !== null &&
          typeof (response as { code?: unknown }).code === "string"
            ? (response as { code: string }).code
            : "UNKNOWN";
        if (profileStatus)
          profileStatus.value = `업무 프로필 서버 연결 테스트 실패 (${code})`;
      } catch {
        if (profileStatus)
          profileStatus.value =
            "Resolver URL, origin, public key 형식 또는 현재 페이지를 확인해 주세요.";
      }
    })();
  });
};
