import type {
  DispatchJournal,
  IntentJournal,
  Receipt,
} from "@contextpilot/tool-registry";
// Browser receipt commits first. A lost backend ACK must never repeat the effect.
export class ReceiptSyncJournal implements DispatchJournal {
  constructor(
    private browser: DispatchJournal,
    private acknowledge: (receipt: Receipt) => Promise<void>,
  ) {}
  reserve: DispatchJournal["reserve"] = (id, step) =>
    this.browser.reserve(id, step);
  async settle(id: string, receipt: Receipt): Promise<void> {
    await this.browser.settle(id, receipt);
    await this.acknowledge(receipt);
  }
}
export function durableIntent(
  send: (step: Parameters<IntentJournal["record"]>[0]) => Promise<void>,
): IntentJournal {
  return { record: send };
}
