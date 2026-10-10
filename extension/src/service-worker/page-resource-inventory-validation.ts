import { isPlainObject } from "../security/validation.js";
import { isOpaqueId } from "../page-act-harness/contracts.js";
import type { PageResourceInventory } from "../contracts/page-resource-types.js";
export const isPageResourceInventory = (
  value: unknown,
  epoch: string,
): value is PageResourceInventory =>
  isPlainObject(value) &&
  value.document_epoch === epoch &&
  typeof value.revision === "string" &&
  Array.isArray(value.items) &&
  value.items.length <= 385 &&
  typeof value.total_count === "number" &&
  Number.isSafeInteger(value.total_count) &&
  value.total_count >= value.items.length &&
  typeof value.truncated === "boolean" &&
  (value.source_truncated === undefined ||
    typeof value.source_truncated === "boolean") &&
  (value.source_total_count === undefined ||
    (typeof value.source_total_count === "number" &&
      Number.isSafeInteger(value.source_total_count) &&
      value.source_total_count >= 1)) &&
  value.items.every(
    (item) =>
      isPlainObject(item) &&
      typeof item.resource_id === "string" &&
      isOpaqueId(item.resource_id) &&
      typeof item.revision === "string" &&
      typeof item.readable === "boolean" &&
      (item.byte_length === null ||
        (typeof item.byte_length === "number" &&
          Number.isInteger(item.byte_length) &&
          item.byte_length >= 0 &&
          item.byte_length <= 1024 * 1024)) &&
      [
        "page_description",
        "inline_script",
        "external_script",
        "component",
      ].includes(String(item.kind)),
  );
