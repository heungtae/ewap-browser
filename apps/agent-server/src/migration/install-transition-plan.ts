import { z } from "zod";
import { canonicalJson } from "../../../../extension/src/security/canonical.js";
import {
  installationPlan,
  installReceiptSchema,
  type InstallationInput,
  type InstallationReceipt,
} from "./install-plan.js";
export const transitionSchema = z
  .strictObject({
    schema: z.literal("wca.install-transition/v1"),
    from: installReceiptSchema,
    to: installReceiptSchema,
  })
  .refine(
    ({ from, to }) =>
      from.state === "installed" &&
      to.state === "installed" &&
      from.releaseId !== to.releaseId &&
      from.releaseDirectory !== to.releaseDirectory &&
      [
        "directory",
        "registry",
        "extensionId",
        "executable",
        "configDigest",
      ].every(
        (key) =>
          from[key as keyof InstallationReceipt] ===
          to[key as keyof InstallationReceipt],
      ),
  );
export function transitionPlan(
  from: InstallationInput,
  to: InstallationInput,
  configDigest: string,
) {
  const old = installationPlan(from, configDigest),
    next = installationPlan(to, configDigest);
  return {
    journal: transitionSchema.parse({
      schema: "wca.install-transition/v1",
      from: { ...old.receipt, state: "installed" },
      to: { ...next.receipt, state: "installed" },
    }),
    launcher: next.launcher,
    registration: next.registration,
  };
}
export function readTransition(
  body: string,
  expected: ReturnType<typeof transitionPlan>["journal"],
) {
  let actual;
  try {
    actual = transitionSchema.parse(JSON.parse(body));
  } catch {
    throw new Error("INSTALL_TRANSITION_INVALID");
  }
  if (canonicalJson(actual) !== canonicalJson(expected))
    throw new Error("INSTALL_TRANSITION_CONFLICT");
  return actual;
}
