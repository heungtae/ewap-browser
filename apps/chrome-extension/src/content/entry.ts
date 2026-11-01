import "../../../../extension/src/content/entry.js";
import {
  installContentCollector,
  type CollectorRuntime,
} from "../codebase/content-collector.js";
const runtime = (
  globalThis as typeof globalThis & { chrome?: { runtime: CollectorRuntime } }
).chrome?.runtime;
if (runtime) installContentCollector(runtime, () => document.body);
