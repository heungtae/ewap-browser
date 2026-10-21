import { verifyProfileJws } from "../../../../extension/src/profile/jws.js";
import {
  verifyProfileClaims,
  definitionDigest,
  type ProfileContext,
} from "../../../../extension/src/profile/profile.js";
import { validateWorkflowDeclaration } from "../../../../extension/src/contracts/workflow.js";
export async function importSignedProfile(
  compact: string,
  keyRing: Readonly<Record<string, string>>,
  context: ProfileContext,
  replay: {
    accept(
      deploymentId: string,
      profileId: string,
      version: number,
      digest: string,
    ): unknown | Promise<unknown>;
  },
) {
  const profile = verifyProfileClaims(
    await verifyProfileJws(compact, keyRing),
    context,
  );
  if (profile.resolution === "MATCHED")
    await replay.accept(
      context.deploymentId,
      profile.profile_id!,
      profile.profile_version!,
      definitionDigest(profile),
    );
  return {
    protocol: "company-page-profile+jws" as const,
    profile,
    profile_jws: compact,
    executable: false as const,
  };
}
export function importWorkflow(original: unknown) {
  return {
    protocol: "browser-workflow/v1" as const,
    workflow: validateWorkflowDeclaration(original),
    executable: false as const,
  };
}
