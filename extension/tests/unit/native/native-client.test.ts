import { describe, expect, it } from "vitest";
import {
  NativeClient,
  type NativePort,
} from "../../../src/native/native-client.js";

class FakeNativePort implements NativePort {
  public readonly sent: unknown[] = [];
  private messageListener: ((message: unknown) => void) | undefined;
  private disconnectListener: (() => void) | undefined;
  postMessage(message: unknown): void {
    this.sent.push(message);
  }
  disconnect(): void {
    this.disconnectListener?.();
  }
  onMessage(listener: (message: unknown) => void): void {
    this.messageListener = listener;
  }
  onDisconnect(listener: () => void): void {
    this.disconnectListener = listener;
  }
  reply(value: unknown): void {
    this.messageListener?.(value);
  }
}

describe("native client", () => {
  it("given_correlated_no_config_response_when_receiving_then_resolves_once", async () => {
    const port = new FakeNativePort();
    const client = new NativeClient(port, "deployment");
    const pending = client.request("ASK_INTERPRETATION", "run", ["read"]);
    const request = port.sent[0] as { request_id: string; kind: string };
    port.reply({
      request_id: request.request_id,
      kind: request.kind,
      error_code: "AI_HUB_NOT_CONFIGURED",
    });
    await expect(pending).resolves.toMatchObject({
      error_code: "AI_HUB_NOT_CONFIGURED",
    });
    port.reply({
      request_id: request.request_id,
      kind: request.kind,
      error_code: "AI_HUB_NOT_CONFIGURED",
    });
  });

  it("given_pending_request_when_cancelled_then_rejects_and_emits_one_cancel_frame", async () => {
    const port = new FakeNativePort();
    const client = new NativeClient(port, "deployment");
    const pending = client.request("BIND_SESSION", "run", []);
    const request = port.sent[0] as { request_id: string };
    client.cancel(request.request_id);
    await expect(pending).rejects.toThrow("TRANSPORT_FAILED");
    expect(port.sent[1]).toMatchObject({
      kind: "CANCEL_REQUEST",
      request_id: request.request_id,
    });
  });

  it("given_raw_ref_in_model_snapshot_when_requesting_then_denied", () => {
    const port = new FakeNativePort();
    const client = new NativeClient(port, "deployment");
    expect(() =>
      client.request("ACTION_PROPOSAL", "run", [], {
        document_epoch: "epoch",
        frame_id: 0,
        nodes: [
          {
            model_ref: "model",
            role: "textbox",
            name: "Field",
            state: {},
            visible: true,
            enabled: true,
            ref_id: "forbidden",
          },
        ],
      } as never),
    ).toThrow("INVALID_ARGUMENT");
  });
});
