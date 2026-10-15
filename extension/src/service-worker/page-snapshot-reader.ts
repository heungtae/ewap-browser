import {
  pageSnapshotParts,
  type PageSnapshotPart,
} from "../contracts/page-snapshot-parts.js";
import { withDeadline } from "../security/deadline.js";
import { ContractError, isPlainObject } from "../security/validation.js";
import type { BrowserTabs } from "./browser-api.js";
import type { PageReadScope } from "../contracts/types.js";

export const readPageSnapshotParts = async (
  tabs: BrowserTabs,
  tabId: number,
  scope: PageReadScope,
  progress?: (tabId: number, part: PageSnapshotPart) => void,
): Promise<unknown> => {
  let binding: Record<string, unknown> | undefined;
  let origin: unknown;
  const snapshot: Record<string, unknown> = {};
  let workflow: unknown;
  for (const part of pageSnapshotParts) {
    progress?.(tabId, part);
    const result = await withDeadline(
      tabs.sendMessage(tabId, {
        kind: "CONTENT_SNAPSHOT_PART",
        part,
        scope,
        ...(binding ? { binding } : {}),
      }),
      10_000,
      "PAGE_SNAPSHOT_TIMEOUT",
    ).catch((error: unknown) => {
      if (
        error instanceof ContractError &&
        error.code === "PAGE_SNAPSHOT_TIMEOUT"
      )
        throw new ContractError(
          "PAGE_SNAPSHOT_TIMEOUT",
          `snapshot_part:${part}`,
        );
      throw error;
    });
    if (!isPlainObject(result) || result.ok !== true) {
      throw new ContractError(
        isPlainObject(result) && result.code === "PAGE_SCOPE_STALE"
          ? "PAGE_SCOPE_STALE"
          : "DOCUMENT_NOT_REGISTERED",
      );
    }
    if (
      !isPlainObject(result.binding) ||
      typeof result.binding.document_epoch !== "string" ||
      typeof result.binding.page_scope_epoch !== "string"
    )
      throw new ContractError("DOCUMENT_NOT_REGISTERED");
    if (
      binding &&
      (binding.document_epoch !== result.binding.document_epoch ||
        binding.page_scope_epoch !== result.binding.page_scope_epoch ||
        binding.url !== result.binding.url)
    )
      throw new ContractError("PAGE_SCOPE_STALE");
    binding = result.binding;
    if (part === "document") {
      origin = result.origin;
      Object.assign(snapshot, {
        schema_version: 2,
        document_epoch: binding.document_epoch,
        frame_id: 0,
        scope,
      });
    } else if (part === "nodes") {
      snapshot.nodes = result.nodes;
      snapshot.truncated = result.truncated;
    } else if (part === "workflow") workflow = result.workflow;
    else snapshot[part] = result.text;
  }
  return {
    ok: true,
    snapshot: {
      origin,
      snapshot,
      ...(workflow === undefined ? {} : { workflow }),
    },
  };
};
