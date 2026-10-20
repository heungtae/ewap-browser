export interface ChromeUiSender {
  extensionId: string;
  url: string;
  documentId: string;
  windowId: number;
  profileId: string;
}
export interface UiPrincipal {
  readonly kind: "trusted-ui";
}
export class UiAuthority {
  private proofs = new WeakMap<UiPrincipal, ChromeUiSender>();
  constructor(private extensionId: string) {}
  authenticate(sender: ChromeUiSender): UiPrincipal {
    const url = new URL(sender.url);
    if (
      sender.extensionId !== this.extensionId ||
      url.protocol !== "chrome-extension:" ||
      url.hostname !== this.extensionId ||
      url.pathname !== "/sidepanel/index.html" ||
      url.search ||
      !sender.documentId ||
      !Number.isInteger(sender.windowId)
    )
      throw new Error("UI_SENDER_DENIED");
    const proof: UiPrincipal = Object.freeze({ kind: "trusted-ui" });
    this.proofs.set(proof, { ...sender });
    return proof;
  }
  assert(proof: UiPrincipal, profileId: string, windowId: number): void {
    const sender = this.proofs.get(proof);
    if (
      !sender ||
      sender.profileId !== profileId ||
      sender.windowId !== windowId
    )
      throw new Error("UI_AUTHORITY_DENIED");
  }
}
