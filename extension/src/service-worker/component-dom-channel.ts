import { isPlainObject } from "../security/validation.js";
import type { ComponentDescriptor } from "../page-act-harness/component-descriptor.js";
export const componentDomChannel = (
  response: Record<string, unknown>,
  descriptor: ComponentDescriptor,
  channel: unknown,
): unknown[] => {
  if (channel === "description") {
    descriptor.has_eof = false;
    delete descriptor.total_count;
    return [String(response.description ?? "")];
  }
  if (channel === "subtree")
    return Array.isArray(response.subtree_rows)
      ? response.subtree_rows
      : (response.rows as unknown[]);
  if (channel === "alt_table") {
    if (
      !isPlainObject(response.alternative) ||
      !Array.isArray(response.alternative.rows)
    )
      throw Error("ALTERNATIVE_UNAVAILABLE");
    descriptor.has_eof = response.alternative.has_eof === true;
    descriptor.logical_count = response.alternative.rows.length;
    if (typeof response.alternative.total_count === "number")
      descriptor.total_count = response.alternative.total_count;
    else delete descriptor.total_count;
    return response.alternative.rows;
  }
  return response.rows as unknown[];
};
