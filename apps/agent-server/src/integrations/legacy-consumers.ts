import {
  businessMcpArguments,
  businessMcpBindings,
} from "../../../../extension/src/profile/mcp-binding.js";
import {
  assertFreshBusinessMcpCall,
  type BusinessMcpPageProof,
} from "../../../../extension/src/profile/business-mcp-call-guard.js";
import {
  BusinessMcpClient,
  type BusinessMcpBinding,
} from "../../../../extension/src/profile/business-mcp-client.js";
import {
  serializeAudit,
  type AuditEvent,
} from "../../../../extension/src/security/audit.js";
import {
  validateStudio,
  type StudioValidationInput,
} from "../../../../extension/src/studio/validation.js";
import {
  EnterprisePolicyClient,
  validateEnterprisePolicyConfig,
  type EnterpriseIdentity,
  type EnterprisePolicyRequest,
} from "../../../../extension/src/policy/enterprise-policy.js";
export async function legacyBusinessCall(
  binding: BusinessMcpBinding,
  original: Record<string, unknown>,
  expected: { requestId: string; runId: string; nonce: string; digest: string },
  freshness: {
    expected: BusinessMcpPageProof;
    current(): BusinessMcpPageProof | undefined;
    expiresAt: string;
  },
  fetcher: typeof fetch = fetch,
) {
  businessMcpBindings([binding]);
  if (original.kind !== "CALL_PAGE_BUSINESS_TOOL")
    throw new Error("BUSINESS_MCP_PROTOCOL_ERROR");
  businessMcpArguments(binding, original.arguments);
  assertFreshBusinessMcpCall(
    freshness.expected,
    freshness.current(),
    freshness.expiresAt,
  );
  return {
    protocol: "browser-business-mcp-legacy/v1" as const,
    original: await new BusinessMcpClient(fetcher).call(
      binding,
      original,
      expected,
    ),
  };
}
export async function legacyEnterpriseDecision(
  config: unknown,
  identity: () => Promise<EnterpriseIdentity | undefined>,
  original: EnterprisePolicyRequest,
  fetcher: typeof fetch = fetch,
) {
  return {
    protocol: "browser-enterprise-policy/v1" as const,
    original: await new EnterprisePolicyClient(
      validateEnterprisePolicyConfig(config),
      identity,
      fetcher,
    ).authorize(original),
  };
}
export function legacyAudit(original: AuditEvent) {
  return {
    protocol: "browser-audit/v1" as const,
    original: serializeAudit(original),
  };
}
export function legacyStudioPreview(original: StudioValidationInput) {
  return {
    protocol: "browser-studio-validation/v1" as const,
    checks: validateStudio(original),
    executable: false as const,
  };
}
