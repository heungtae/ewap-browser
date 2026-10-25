import {
  replaySchema,
  type TaskClient,
  type SettingsClient,
} from "@contextpilot/shared/bridge";
import type { PresentationView } from "./view.js";
export interface PresentationState {
  cursor: number;
  snapshotRequired: boolean;
}
export interface PresentationClock {
  later(callback: () => void): unknown;
  cancel(handle: unknown): void;
}
const clock: PresentationClock = {
  later: (callback) => setTimeout(callback, 1000),
  cancel: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};
export function connectPresentation(
  view: PresentationView,
  tasks: TaskClient,
  settings: SettingsClient,
  timer = clock,
  state: PresentationState = { cursor: 0, snapshotRequired: false },
) {
  let stopped = false;
  let { cursor, snapshotRequired } = state;
  let handle: unknown;
  const update = async () => {
    const [events, config] = await Promise.allSettled([
      tasks.resume(cursor),
      settings.read(),
    ]);
    if (stopped) return;
    if (events.status !== "fulfilled" || config.status !== "fulfilled") {
      view.status("Backend disconnected — waiting for reconnection");
      return;
    }
    const parsed = replaySchema.safeParse(events.value);
    if (!parsed.success) {
      snapshotRequired = true;
    }
    if (parsed.success) {
      const batch = parsed.data;
      let next = cursor;
      for (const event of batch.events) {
        if (event.sequence <= cursor) continue;
        if (event.sequence !== next + 1) snapshotRequired = true;
        next = event.sequence;
      }
      if (batch.resync || batch.cursor !== next) snapshotRequired = true;
      if (!snapshotRequired) {
        for (const event of batch.events)
          if (
            event.sequence > cursor &&
            event.kind === "message" &&
            event.text !== undefined
          )
            view.message(event.text);
        cursor = next;
        state.cursor = cursor;
      }
    }
    state.snapshotRequired = snapshotRequired;
    view.status(
      snapshotRequired
        ? "Backend snapshot required — waiting"
        : config.value.controllerReady
          ? "Backend connected"
          : "Backend connected — controller setup required",
    );
  };
  const run = async () => {
    try {
      await update();
    } catch {
      if (!stopped)
        view.status("Backend unavailable — waiting for reconnection");
    } finally {
      if (!stopped)
        handle = timer.later(() => {
          void run();
        });
    }
  };
  void run();
  return () => {
    stopped = true;
    timer.cancel(handle);
  };
}
