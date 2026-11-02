import {
  panelEventSchema,
  type PanelEvent,
  type PanelResponse,
  type BridgeEvent,
  type TaskClient,
} from "../../../../packages/shared/src/bridge.js";
import { createView } from "../../../../apps/chrome-extension/src/presentation/view.js";
import { mountPresentation } from "../../../../apps/chrome-extension/src/presentation/controller.js";
import type { PresentationClock } from "../../../../apps/chrome-extension/src/presentation/connection-loop.js";
const events: BridgeEvent[] = [],
  responses: PanelResponse[] = [];
const starts: unknown[] = [];
let sequence = 0,
  online = true,
  rejectNext = false,
  afterSequence = 0;
let holdNext = false;
let rejectHeld: (() => void) | undefined;
let callback: (() => void) | undefined;
const timer: PresentationClock = {
  later(next) {
    callback = next;
    return next;
  },
  cancel() {
    callback = undefined;
  },
};
const state = { cursor: 0, snapshotRequired: false };
const tasks: TaskClient = {
  async resume(after) {
    if (!online) throw Error("FIXTURE_PRIVATE_ERROR");
    afterSequence = after;
    return {
      events: events.filter((e) => e.sequence > after),
      cursor: sequence,
      resync: false,
    };
  },
  panel: {
    async start(value) {
      starts.push(value);
    },
    async respond(value) {
      if (rejectNext) {
        rejectNext = false;
        throw Error("FIXTURE_PRIVATE_ERROR");
      }
      if (holdNext) {
        holdNext = false;
        await new Promise<void>((_resolve, reject) => {
          rejectHeld = () => {
            rejectHeld = undefined;
            reject(Error("FIXTURE_PRIVATE_ERROR"));
          };
        });
      }
      responses.push(value);
    },
    cancel: () => new Promise(() => undefined),
    async clear() {},
  },
};
const settings = {
  read: async () => ({
    controllerReady: true,
    analystReady: true,
    secretMode: "session-only" as const,
  }),
};
const view = createView(document);
const mount = () =>
  mountPresentation(document, view, tasks, settings, state, timer);
let dispose = mount();
const fixture = {
  emit(raw: unknown) {
    const event = panelEventSchema.parse(raw);
    events.push({
      sequence: ++sequence,
      revision: sequence,
      kind: "presentation",
      presentation: event,
    });
    return sequence;
  },
  tick() {
    const next = callback;
    callback = undefined;
    next?.();
  },
  online(value: boolean) {
    online = value;
  },
  rejectNext() {
    rejectNext = true;
  },
  holdNext() {
    holdNext = true;
  },
  rejectHeld() {
    rejectHeld?.();
  },
  held: () => rejectHeld !== undefined,
  responses: () => responses,
  starts: () => starts,
  state: () => ({ ...state, afterSequence }),
  remount() {
    dispose();
    dispose = mount();
  },
  currentEvent: () => events.at(-1)?.presentation as PanelEvent | undefined,
};
(
  globalThis as typeof globalThis & { __s28PanelFixture?: typeof fixture }
).__s28PanelFixture = fixture;
