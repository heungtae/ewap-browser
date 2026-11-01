import type { ExtensionContext } from "./api.js";
export interface PanelTab {
  id?: number;
  windowId: number;
}
interface Sender {
  id?: string;
  url?: string;
  origin?: string;
  tab?: unknown;
  documentId?: string;
}
interface Owner {
  tabId: number;
  windowId: number;
  url: string;
}
// Fresh Worker-owned panel addresses bind Chrome action events to tab/window scope.
// Addresses are not approval, task admission, or dispatch grants.
export class PanelOwners {
  private owners = new Map<number, Owner>();
  constructor(private extensionId: string) {}
  issue(tab: PanelTab) {
    if (
      !Number.isSafeInteger(tab.id) ||
      tab.id! < 0 ||
      !Number.isSafeInteger(tab.windowId) ||
      tab.windowId < 0
    )
      throw new Error("PANEL_TAB");
    if (!this.owners.has(tab.id!) && this.owners.size >= 256)
      throw new Error("PANEL_OWNER_LIMIT");
    const path = `sidepanel/index.html?owner=${crypto.randomUUID()}`;
    const owner = {
      tabId: tab.id!,
      windowId: tab.windowId,
      url: `chrome-extension://${this.extensionId}/${path}`,
    };
    this.owners.set(owner.tabId, owner);
    return { ...owner, path };
  }
  revoke(tabId: number) {
    this.owners.delete(tabId);
  }
  async resolve(
    sender: Sender,
    contexts: () => Promise<ExtensionContext[]>,
    tab: (id: number) => Promise<PanelTab>,
  ) {
    if (
      sender.id !== this.extensionId ||
      sender.tab !== undefined ||
      sender.origin !== `chrome-extension://${this.extensionId}`
    )
      return null;
    const owner = [...this.owners.values()].find((o) => o.url === sender.url);
    if (!owner) return null;
    try {
      const current = await tab(owner.tabId);
      const matches = (await contexts()).filter(
        (c) =>
          c.contextType === "SIDE_PANEL" &&
          c.documentUrl === owner.url &&
          !!c.documentId &&
          (c.windowId === -1 || c.windowId === owner.windowId),
      );
      if (
        this.owners.get(owner.tabId) !== owner ||
        current.id !== owner.tabId ||
        current.windowId !== owner.windowId ||
        matches.length !== 1 ||
        (sender.documentId !== undefined &&
          sender.documentId !== matches[0]!.documentId)
      )
        return null;
      return { ...owner, documentId: matches[0]!.documentId! };
    } catch {
      return null;
    }
  }
}
