import { z } from "zod";
import type {
  ProjectionRequest,
  ProjectionPacket,
} from "@contextpilot/codebase-schema";
import { wireDigest } from "./native-auth.js";
import type { NativeSender } from "./native-types.js";
function base64(bytes: Uint8Array) {
  let text = "";
  for (let i = 0; i < bytes.length; i += 8192)
    text += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(text);
}
function ack(value: unknown, state: string) {
  const parsed = z
    .strictObject({
      state: z.string(),
      bytes: z
        .number()
        .int()
        .min(1)
        .max(8 * 1024 * 1024)
        .optional(),
    })
    .safeParse(value);
  if (!parsed.success || parsed.data.state !== state)
    throw Error("PROJECTION_UNAVAILABLE");
}
export async function sendProjection(
  sender: NativeSender,
  request: ProjectionRequest,
  packet: ProjectionPacket,
  active: () => void,
  validate: () => Promise<unknown>,
) {
  const data = new TextEncoder().encode(JSON.stringify(packet));
  if (data.length > request.maxBytes) throw Error("PROJECTION_LIMIT");
  const count = Math.ceil(data.length / (128 * 1024)),
    id = request.requestId;
  const digest = await wireDigest(packet);
  await validate();
  active();
  let opened = false;
  try {
    ack(
      await sender.request({
        kind: "transfer.open",
        id,
        count,
        bytes: data.length,
        digest,
        deadline: request.deadline,
      } as { kind: string }),
      "opened",
    );
    opened = true;
    for (let index = 0; index < count; index++) {
      active();
      ack(
        await sender.request({
          kind: "transfer.chunk",
          id,
          index,
          base64: base64(
            data.subarray(index * 128 * 1024, (index + 1) * 128 * 1024),
          ),
        } as { kind: string }),
        "received",
      );
      active();
      ack(
        await sender.request({ kind: "transfer.ack", id, index } as {
          kind: string;
        }),
        "acknowledged",
      );
    }
    await validate();
    active();
    const result = await sender.request({ kind: "transfer.complete", id } as {
      kind: string;
    });
    ack(result, "verified");
    opened = false;
    if ((result as { bytes?: number }).bytes !== data.length)
      throw Error("PROJECTION_UNAVAILABLE");
    return { bytes: data.length, chunks: count };
  } catch (error) {
    if (opened)
      await sender
        .request({ kind: "transfer.cancel", id } as { kind: string })
        .catch(() => undefined);
    throw error;
  }
}
