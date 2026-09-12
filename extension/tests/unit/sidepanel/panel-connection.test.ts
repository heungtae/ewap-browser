import { afterEach, expect, it, vi } from "vitest";
import { connectPanel } from "../../../src/sidepanel/panel-connection.js";

afterEach(() => vi.useRealTimers());

it("receives the second request's events after the first connection disconnects", () => {
  vi.useFakeTimers();
  const ports: Array<{
    receive?: (message: unknown) => void;
    close?: () => void;
  }> = [];
  const recover = vi.fn();
  const receive = vi.fn();
  const stop = connectPanel({
    connect: () => {
      const listeners: (typeof ports)[number] = {};
      ports.push(listeners);
      return {
        onMessage: {
          addListener: (fn: (message: unknown) => void) => {
            listeners.receive = fn;
          },
        },
        onDisconnect: {
          addListener: (fn: () => void) => {
            listeners.close = fn;
          },
        },
        disconnect: () => listeners.close?.(),
      };
    },
    recover,
    receive,
  });
  ports[0]?.close?.();
  vi.advanceTimersByTime(250);
  expect(ports).toHaveLength(2);
  ports[1]?.receive?.({ kind: "CHAT_EVENT", request: 2 });
  expect(receive).toHaveBeenCalledWith({ kind: "CHAT_EVENT", request: 2 });
  expect(recover).toHaveBeenCalledTimes(2);
  stop();
  vi.advanceTimersByTime(1000);
  expect(ports).toHaveLength(2);
});
