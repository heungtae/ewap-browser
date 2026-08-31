import { findPage, getPageText, readPage } from "./page-read.js";
import { executeReadBatch } from "./read-batch.js";
import type { VisionCapture } from "./vision-capture.js";
import type { ModelSemanticSnapshot } from "../contracts/types.js";
import { fail, isPlainObject } from "../security/validation.js";
import type { BrowserTabs } from "./browser-api.js";
import { createAskVisionToolExecutor } from "./ask-vision-tool-executor.js";

type ToolCall = { name: string; arguments: string };
type Dependencies = {
  snapshot: ModelSemanticSnapshot;
  tabId: number;
  runId: string;
  screenshotEnabled: boolean;
  tabs: BrowserTabs;
  capture(id: string): VisionCapture | undefined;
  remember(capture: VisionCapture): void;
  callBusiness(toolId: string, args: Record<string, string>): Promise<unknown>;
  redactTitle(value: string | undefined): string;
};

const parse = (value: string): unknown => {
  try {
    return JSON.parse(value);
  } catch {
    return fail("INVALID_ARGUMENT");
  }
};

export const createAskToolExecutor = (dependencies: Dependencies) => {
  const { snapshot } = dependencies;
  const vision = createAskVisionToolExecutor({
    enabled: dependencies.screenshotEnabled,
    tabs: dependencies.tabs,
    tabId: dependencies.tabId,
    capture: dependencies.capture,
    remember: dependencies.remember,
  });
  return {
    async execute(call: ToolCall): Promise<unknown> {
      if (call.name === "read_semantic_projection") {
        if (call.arguments !== "{}") return fail("INVALID_ARGUMENT");
        return snapshot;
      }
      const args = parse(call.arguments);
      if (call.name === "read_page") {
        if (
          !isPlainObject(args) ||
          Object.keys(args).some(
            (key) =>
              !["scope", "parent_model_ref", "depth", "max_chars"].includes(
                key,
              ),
          )
        )
          return fail("INVALID_ARGUMENT");
        return readPage(snapshot, args);
      }
      if (call.name === "get_page_text") {
        if (
          !isPlainObject(args) ||
          Object.keys(args).some((key) => key !== "max_chars") ||
          (args.max_chars !== undefined &&
            (typeof args.max_chars !== "number" ||
              !Number.isInteger(args.max_chars) ||
              args.max_chars < 1 ||
              args.max_chars > 50_000))
        )
          return fail("INVALID_ARGUMENT");
        return getPageText(
          snapshot,
          typeof args.max_chars === "number" ? args.max_chars : 50_000,
        );
      }
      if (call.name === "find") {
        if (
          !isPlainObject(args) ||
          Object.keys(args).some(
            (key) => !["query", "scope", "limit"].includes(key),
          ) ||
          typeof args.query !== "string" ||
          (args.scope !== undefined &&
            !["all_dom", "visible_only", "interactive"].includes(
              args.scope as string,
            )) ||
          (args.limit !== undefined &&
            (typeof args.limit !== "number" ||
              !Number.isInteger(args.limit) ||
              args.limit < 1 ||
              args.limit > 20))
        )
          return fail("INVALID_ARGUMENT");
        return findPage(
          snapshot,
          args.query,
          (args.scope as
            | "all_dom"
            | "visible_only"
            | "interactive"
            | undefined) ?? "all_dom",
          typeof args.limit === "number" ? args.limit : 20,
        );
      }
      if (call.name === "read_batch") {
        if (
          !isPlainObject(args) ||
          Object.keys(args).length !== 1 ||
          !Array.isArray(args.items) ||
          args.items.some(
            (item) =>
              !isPlainObject(item) ||
              Object.keys(item).some(
                (key) => !["tool", "arguments"].includes(key),
              ) ||
              typeof item.tool !== "string" ||
              !isPlainObject(item.arguments),
          )
        )
          return fail("INVALID_ARGUMENT");
        return executeReadBatch(
          snapshot,
          args.items as Array<{
            tool: "read_page" | "get_page_text" | "find";
            arguments: Record<string, unknown>;
          }>,
        );
      }
      if (call.name === "screenshot") {
        return vision.screenshot(call.arguments);
      }
      if (call.name === "zoom") {
        return vision.zoom(args);
      }
      if (call.name === "tabs_context") {
        if (call.arguments !== "{}") return fail("INVALID_ARGUMENT");
        const tab = (
          await dependencies.tabs.query({
            active: true,
            lastFocusedWindow: true,
          })
        )[0];
        if (
          !tab ||
          tab.id !== dependencies.tabId ||
          typeof tab.url !== "string"
        )
          return fail("TARGET_STALE");
        const url = new URL(tab.url);
        return {
          tabs: [
            {
              active: true,
              tab_id: tab.id,
              title: dependencies.redactTitle(tab.title),
              url: `${url.origin}${url.pathname}`,
              loading: tab.status === "loading",
            },
          ],
        };
      }
      if (call.name === "call_page_business_tool") {
        if (
          !isPlainObject(args) ||
          typeof args.tool_id !== "string" ||
          !isPlainObject(args.arguments) ||
          Object.values(args.arguments).some(
            (value) => typeof value !== "string",
          )
        )
          return fail("INVALID_ARGUMENT");
        return dependencies.callBusiness(
          args.tool_id,
          args.arguments as Record<string, string>,
        );
      }
      return fail("INVALID_ARGUMENT");
    },
  };
};
