import { setup } from "../../../fixture/s30/setup.js";
import type { Context } from "../../../../../packages/codebase-schema/src/index.js";
import {
  BoundedCdpBroker,
  type BrokerOptions,
  type CdpOwnership,
  type CdpTransport,
} from "../../../../../packages/browser-runtime/src/index.js";
export function source(): Context {
  return {
    taskId: "task",
    partitionId: "partition",
    pageKey: "page",
    profileGuard: "a".repeat(64),
    origin: "https://fixture.test",
    accountKnown: true,
    source: {
      tabId: 1,
      frameId: 0,
      documentEpoch: 1,
      routeEpoch: 1,
      sourceRevision: 1,
      sequence: 1,
      cancellationGeneration: 0,
    },
  };
}
export async function brokerFixture() {
  const f = await setup();
  const calls: string[] = [];
  const markers = new Map<number, string>();
  let listener: ((method: string, params: unknown) => void) | undefined;
  let detachListener: (() => void) | undefined;
  const transport: CdpTransport = {
    async attach() {
      calls.push("attach");
    },
    async detach() {
      calls.push("detach");
    },
    async send(_tab, method) {
      calls.push(method);
      return { nodes: [] };
    },
    listen(_tab, fn) {
      listener = fn;
      return () => {
        listener = undefined;
      };
    },
    onDetach(_tab, fn) {
      detachListener = fn;
      return () => {
        detachListener = undefined;
      };
    },
  };
  const ownership: CdpOwnership = {
    async available(tab) {
      return !markers.has(tab);
    },
    async mark(tab, owner) {
      const old = markers.get(tab);
      if (old && old !== owner) throw new Error("CDP_OWNERSHIP_CONFLICT");
      markers.set(tab, owner);
    },
    async clear(tab, owner) {
      if (markers.get(tab) !== owner) throw new Error("CDP_OWNERSHIP_CONFLICT");
      markers.delete(tab);
    },
  };
  const options: BrokerOptions = {
    transport,
    ownership,
    current: () => f.context,
    allowed: () => true,
  };
  return {
    ...f,
    calls,
    markers,
    transport,
    ownership,
    options,
    broker: new BoundedCdpBroker(options),
    emit: (method: string, params: unknown) => listener?.(method, params),
    detach: () => detachListener?.(),
    signal: new AbortController().signal,
  };
}
