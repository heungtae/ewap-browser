import {
  replaySchema,
  type TaskClient,
  type SettingsClient,
} from "@contextpilot/shared/bridge";
import type { PresentationView } from "./view.js";
export interface PresentationState {
  cursor: number;
  snapshotRequired: boolean;
  connectionOnly?: boolean;
  streamId?: string;
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
  const report = (text: string, available: boolean) =>
    view.connection ? view.connection(text, available) : view.status(text);
  const update = async () => {
    const [events, config] = await Promise.allSettled([
      state.streamId
        ? tasks.resume(cursor, state.streamId)
        : tasks.resume(cursor),
      settings.read(),
    ]);
    if (stopped) return;
    if (events.status !== "fulfilled" || config.status !== "fulfilled") {
      report("Backend disconnected — waiting for reconnection", false);
      return;
    }
    const parsed = replaySchema.safeParse(events.value);
    if (!parsed.success) {
      snapshotRequired = true;
    }
    if (parsed.success) {
      const batch = parsed.data;
      if (
        batch.events.some(
          (event) =>
            !["browser.connected", "browser.waiting"].includes(event.kind) ||
            event.text !== undefined,
        )
      )
        state.connectionOnly = false;
      const snapshot = batch.snapshot;
      const reset =
        state.connectionOnly === true &&
        batch.resync &&
        batch.events.length === 0 &&
        snapshot &&
        "schema" in snapshot &&
        snapshot.schema === "wca.connection-snapshot/v1" &&
        snapshot.revision === batch.cursor &&
        snapshot.streamId === batch.streamId;
      if (reset) {
        cursor = batch.cursor;
        state.cursor = cursor;
        state.streamId = snapshot.streamId;
        snapshotRequired = false;
      }
      let next = cursor;
      for (const event of batch.events) {
        if (event.sequence <= cursor) continue;
        if (event.sequence !== next + 1) snapshotRequired = true;
        next = event.sequence;
      }
      if (
        !reset &&
        (batch.resync ||
          batch.cursor !== next ||
          (state.streamId !== undefined && batch.streamId !== state.streamId))
      )
        snapshotRequired = true;
      if (!snapshotRequired) {
        if (batch.events.some((event) => event.presentation && !view.event))
          snapshotRequired = true;
      }
      if (!snapshotRequired) {
        report("Backend connected", true);
        for (const event of batch.events)
          if (event.sequence > cursor) {
            if (event.presentation) view.event?.(event.presentation);
            else if (event.kind === "message" && event.text !== undefined)
              view.message(event.text);
          }
        cursor = next;
        state.cursor = cursor;
      }
    }
    state.snapshotRequired = snapshotRequired;
    report(
      snapshotRequired
        ? "Backend snapshot required — waiting"
        : config.value.controllerReady
          ? "Backend connected"
          : "Backend connected — controller setup required",
      !snapshotRequired,
    );
  };
  const run = async () => {
    try {
      await update();
    } catch {
      if (!stopped)
        report("Backend unavailable — waiting for reconnection", false);
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
