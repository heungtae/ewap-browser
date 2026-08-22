import type {
  DocumentRegister,
  RuntimeEnvelope,
  RuntimeKind,
  Sender,
} from "./types.js";
import {
  opaque,
  closedObject,
  fail,
  requireKeys,
} from "../security/validation.js";
const kinds: readonly RuntimeKind[] = [
  "START_PREVIEW",
  "START_ASK",
  "START_ACT",
  "SUBMIT_ACTION_VALUE",
  "CONTENT_SNAPSHOT",
  "EXECUTE_ACTION",
  "VERIFY_RESULT",
  "CONFIRM",
  "CANCEL",
  "ACT_APPROVE",
  "ACT_REJECT",
  "PANEL_STATE",
  "NATIVE_LLM_REQUEST",
];
export const validateDocumentRegister = (value: unknown): DocumentRegister => {
  const record = closedObject(value, [
    "schema_version",
    "kind",
    "document_epoch",
  ]);
  requireKeys(record, ["schema_version", "kind", "document_epoch"]);
  if (record.schema_version !== 1 || record.kind !== "DOCUMENT_REGISTER")
    return fail("INVALID_ARGUMENT");
  return {
    schema_version: 1,
    kind: "DOCUMENT_REGISTER",
    document_epoch: opaque(record.document_epoch),
  };
};
export const validateEnvelope = (value: unknown): RuntimeEnvelope => {
  const record = closedObject(value, [
    "schema_version",
    "kind",
    "message_id",
    "run_id",
    "tab_id",
    "frame_id",
    "document_epoch",
    "payload",
  ]);
  requireKeys(record, [
    "schema_version",
    "kind",
    "message_id",
    "run_id",
    "tab_id",
    "frame_id",
    "document_epoch",
    "payload",
  ]);
  if (
    record.schema_version !== 1 ||
    typeof record.kind !== "string" ||
    !kinds.includes(record.kind as RuntimeKind) ||
    typeof record.tab_id !== "number" ||
    typeof record.frame_id !== "number"
  )
    return fail("INVALID_ARGUMENT");
  return {
    schema_version: 1,
    kind: record.kind as RuntimeKind,
    message_id: opaque(record.message_id),
    run_id:
      typeof record.run_id === "string"
        ? record.run_id
        : fail("INVALID_ARGUMENT"),
    tab_id: record.tab_id,
    frame_id: record.frame_id,
    document_epoch: opaque(record.document_epoch),
    payload: record.payload,
  };
};
export class DocumentAuthority {
  private readonly documents = new Map<string, string>();
  public register(
    sender: Sender,
    message: unknown,
    extensionId: string,
  ): string {
    const register = validateDocumentRegister(message);
    if (
      sender.id !== extensionId ||
      sender.tabId === undefined ||
      sender.frameId === undefined ||
      !sender.documentId ||
      sender.documentLifecycle !== "active"
    )
      return fail("INVALID_ARGUMENT");
    const key = `${sender.tabId}:${sender.frameId}:${sender.documentId}`;
    const existing = this.documents.get(key);
    if (existing && existing !== register.document_epoch)
      return fail("INVALID_ARGUMENT");
    this.documents.set(key, register.document_epoch);
    return register.document_epoch;
  }
  public validateContent(
    sender: Sender,
    envelope: RuntimeEnvelope,
    extensionId: string,
  ): void {
    const key = `${sender.tabId}:${sender.frameId}:${sender.documentId}`;
    if (
      sender.id !== extensionId ||
      sender.tabId !== envelope.tab_id ||
      sender.frameId !== envelope.frame_id ||
      sender.documentLifecycle !== "active" ||
      this.documents.get(key) !== envelope.document_epoch
    )
      fail("INVALID_ARGUMENT");
  }
  public clear(): void {
    this.documents.clear();
  }
}
