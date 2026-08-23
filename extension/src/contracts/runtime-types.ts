export type RuntimeKind =
  | "START_PREVIEW"
  | "START_ASK"
  | "RESOLVE_PROFILE"
  | "START_ACT"
  | "SUBMIT_ACTION_VALUE"
  | "CONTENT_SNAPSHOT"
  | "EXECUTE_ACTION"
  | "VERIFY_RESULT"
  | "CONFIRM"
  | "CANCEL"
  | "PERMISSION_DECISION"
  | "PROVIDER_LIST"
  | "PLUGIN_INSTALL"
  | "PLUGIN_SET_ENABLED"
  | "PROVIDER_SAVE"
  | "PROVIDER_TEST"
  | "PROVIDER_EXPORT"
  | "CHAT_SEND"
  | "ACT_APPROVE"
  | "ACT_REJECT"
  | "PANEL_STATE"
  | "NATIVE_LLM_REQUEST";
export type RuntimeEnvelope<T = unknown> = {
  schema_version: 1;
  kind: RuntimeKind;
  message_id: string;
  run_id: string;
  tab_id: number;
  frame_id: number;
  document_epoch: string;
  payload: T;
};
export type DocumentRegister = {
  schema_version: 1;
  kind: "DOCUMENT_REGISTER";
  document_epoch: string;
};
export type Sender = {
  id?: string;
  tabId?: number;
  frameId?: number;
  documentId?: string;
  documentLifecycle?: "active" | "prerender" | "cached" | "pending_deletion";
};
