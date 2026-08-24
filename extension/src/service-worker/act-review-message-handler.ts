import { ContractError } from "../security/validation.js";
import { exactKeys } from "./runtime-message-router.js";
import type { BrowserSender } from "./browser-api.js";

type Respond = (response: unknown) => void;
type Session = { proposal?: { id: string } };
type Result = { ok?: boolean };
type Dependencies = {
  isPanelSender(sender: BrowserSender): boolean;
  session(id: string): Session | undefined;
  reject(session: Session): void;
  submitValue(session: Session, value: string): Promise<Result>;
  confirm(
    session: Session,
    confirmationId: string,
    confirmationNonce: string,
  ): Promise<Result>;
  approve(session: Session): Promise<Result>;
  safeFailure(code: string): unknown;
};

const failureCode = (error: unknown): string =>
  error instanceof ContractError ? error.code : "INTERNAL_FAILURE";

export const createActReviewMessageHandler = (dependencies: Dependencies) => {
  const sessionFor = (message: object): Session | undefined => {
    const id = (message as { session_id?: unknown }).session_id;
    return typeof id === "string" ? dependencies.session(id) : undefined;
  };
  const validProposal = (
    message: object,
    session: Session | undefined,
  ): boolean =>
    typeof (message as { proposal_id?: unknown }).proposal_id === "string" &&
    session?.proposal?.id === (message as { proposal_id: string }).proposal_id;
  const respondResult = (promise: Promise<Result>, respond: Respond): void => {
    void promise
      .then((result) => respond(result.ok ? { ok: true } : result))
      .catch((error) => respond(dependencies.safeFailure(failureCode(error))));
  };
  return {
    handle(
      message: object,
      sender: BrowserSender,
      respond: Respond,
    ): { handled: boolean; keepAlive?: boolean } {
      const kind = (message as { kind?: unknown }).kind;
      if (
        kind !== "ACT_REJECT" &&
        kind !== "ACT_VALUE_SUBMIT" &&
        kind !== "ACT_CONFIRM" &&
        kind !== "ACT_APPROVE"
      )
        return { handled: false };
      const session = sessionFor(message);
      const commonValid =
        dependencies.isPanelSender(sender) && validProposal(message, session);
      if (kind === "ACT_REJECT") {
        if (
          !commonValid ||
          !exactKeys(message, ["kind", "session_id", "proposal_id"])
        ) {
          respond(dependencies.safeFailure("INVALID_ARGUMENT"));
          return { handled: true };
        }
        dependencies.reject(session!);
        respond({ ok: true, outcome: "CANCELLED" });
        return { handled: true };
      }
      if (kind === "ACT_VALUE_SUBMIT") {
        const value = (message as { value?: unknown }).value;
        if (
          !commonValid ||
          !exactKeys(message, ["kind", "session_id", "proposal_id", "value"]) ||
          typeof value !== "string"
        ) {
          respond(dependencies.safeFailure("INVALID_ARGUMENT"));
          return { handled: true };
        }
        respondResult(dependencies.submitValue(session!, value), respond);
        return { handled: true, keepAlive: true };
      }
      if (kind === "ACT_CONFIRM") {
        const confirmationId = (message as { confirmation_id?: unknown })
          .confirmation_id;
        const confirmationNonce = (message as { confirmation_nonce?: unknown })
          .confirmation_nonce;
        if (
          !commonValid ||
          !exactKeys(message, [
            "kind",
            "session_id",
            "proposal_id",
            "confirmation_id",
            "confirmation_nonce",
          ]) ||
          typeof confirmationId !== "string" ||
          typeof confirmationNonce !== "string"
        ) {
          respond(dependencies.safeFailure("CONFIRMATION_INVALID"));
          return { handled: true };
        }
        respondResult(
          dependencies.confirm(session!, confirmationId, confirmationNonce),
          respond,
        );
        return { handled: true, keepAlive: true };
      }
      if (
        !commonValid ||
        !exactKeys(message, ["kind", "session_id", "proposal_id"])
      ) {
        respond(dependencies.safeFailure("INVALID_ARGUMENT"));
        return { handled: true };
      }
      respondResult(dependencies.approve(session!), respond);
      return { handled: true, keepAlive: true };
    },
  };
};
