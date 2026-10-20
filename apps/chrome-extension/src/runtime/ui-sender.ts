import { UiAuthority, type UiPrincipal } from "@contextpilot/policy-engine";
export interface RuntimeSender {
  id?: string;
  url?: string;
  documentId?: string;
}
export interface UiContext {
  contextType: string;
  documentId?: string;
  documentUrl?: string;
  windowId: number;
}
export interface UiContextPort {
  extensionId: string;
  profileId: string;
  getContexts(): Promise<UiContext[]>;
}
// Called only with Chrome runtime event metadata, never message-body sender fields.
export async function authenticateUiSender(
  authority: UiAuthority,
  chrome: UiContextPort,
  sender: RuntimeSender,
): Promise<UiPrincipal> {
  const contexts = await chrome.getContexts();
  const matches = contexts.filter(
    (context) =>
      context.contextType === "SIDE_PANEL" &&
      context.documentId === sender.documentId &&
      context.documentUrl === sender.url,
  );
  if (matches.length !== 1 || !sender.documentId || !sender.url || !sender.id)
    throw new Error("UI_SENDER_DENIED");
  return authority.authenticate({
    extensionId: sender.id,
    url: sender.url,
    documentId: sender.documentId,
    windowId: matches[0]!.windowId,
    profileId: chrome.profileId,
  });
}
