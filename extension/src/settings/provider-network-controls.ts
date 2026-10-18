import { field, show } from "./provider-form-fields.js";
import { browserPermissions } from "./settings-browser.js";
import {
  validateProviderBaseUrl,
  providerHttpHostPattern,
} from "../providers/provider-network-url.js";
export const initializeProviderNetwork = () => {
  document
    .querySelector<HTMLButtonElement>("#provider-host-access")
    ?.addEventListener("click", () => {
      try {
        const optIn = field("private_network_opt_in");
        const url = validateProviderBaseUrl(
          field("base_url").value.trim(),
          optIn instanceof HTMLInputElement && optIn.checked,
        );
        if (url.protocol !== "http:")
          throw new Error("HTTP endpoint를 입력하세요.");
        const pattern = providerHttpHostPattern(url);
        if (!browserPermissions)
          throw new Error("Chrome 권한 API를 사용할 수 없습니다.");
        void browserPermissions
          .request({ origins: [pattern] })
          .then((granted) => {
            show(
              granted
                ? "HTTP host 권한을 허용했습니다."
                : "HTTP host 권한이 거부되었습니다.",
            );
          })
          .catch(() => show("HTTP host 권한 요청에 실패했습니다."));
      } catch (error: unknown) {
        show(
          error instanceof Error ? error.message : "Endpoint를 확인해 주세요.",
        );
      }
    });
};
