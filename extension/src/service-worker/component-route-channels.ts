import type { ComponentDescriptor } from "../page-act-harness/component-descriptor.js";
export const componentRouteChannels = (
  descriptor: ComponentDescriptor,
  route: string | undefined,
  allowed: boolean,
) =>
  descriptor.channels.map((entry) =>
    entry.channel === "reviewed_data"
      ? {
          ...entry,
          available: route === "reviewed_adapter" && allowed,
          reason: "REGISTERED_ADAPTER_AND_COLLECTION_APPROVAL_REQUIRED",
        }
      : entry.channel === "bounded_scroll"
        ? {
            ...entry,
            available: entry.available && route === "content_virtual",
          }
        : entry,
  );
