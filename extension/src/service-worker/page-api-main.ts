import type { PageApiIntent } from "../contracts/page-api-types.js";
import { digestCanonical } from "../security/canonical.js";

export type MainPageApiResult = "called" | "unavailable" | "invalid" | "failed";

/* Chrome serializes this function into MAIN. Keep it closure-free and never resolve paths. */
export const invokeFixturePageApi = async (
  adapterId: string,
  actionId: string,
  optionId: string,
): Promise<MainPageApiResult> => {
  try {
    if (adapterId !== "fixture_variant" || actionId !== "select_variant")
      return "invalid";
    const page = globalThis as {
      location?: Location;
      demoControls?: { apiVersion?: unknown; selectVariant?: unknown };
    };
    if (
      page.location?.origin !== "https://page-api-fixture.invalid" ||
      page.location.pathname !== "/variant"
    )
      return "invalid";
    const api = page.demoControls;
    if (!api || api.apiVersion !== 1 || typeof api.selectVariant !== "function")
      return "unavailable";
    await api.selectVariant(optionId);
    return "called";
  } catch {
    return "failed";
  }
};

export const mainPageApiResult = (
  value: unknown,
): MainPageApiResult | undefined =>
  value === "called" ||
  value === "unavailable" ||
  value === "invalid" ||
  value === "failed"
    ? value
    : undefined;

export const pageApiCompletionDigest = (completion: {
  control_name: string;
  option_name: string;
}): string => digestCanonical(completion);

export const pageApiApprovalDigest = (
  intent: Omit<
    PageApiIntent,
    | "approval_digest"
    | "document_id"
    | "document_epoch"
    | "page_scope_epoch"
    | "run_id"
    | "tab_id"
  >,
): string => digestCanonical(intent);
