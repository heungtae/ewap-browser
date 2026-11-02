import { createHash } from "node:crypto";
import {
  canonical,
  projectionPacketSchema,
  assertProjectionContent,
  type ProjectionRequest,
} from "@contextpilot/codebase-schema";
export const projectionHash = (value: unknown) =>
  createHash("sha256").update(canonical(value)).digest("hex");
export function validateProjection(
  data: Buffer,
  request: ProjectionRequest,
  now: number,
) {
  if (data.length > request.maxBytes) throw Error("PROJECTION_LIMIT");
  const packet = projectionPacketSchema.parse(
    JSON.parse(data.toString("utf8")),
  );
  const { digest, ...body } = packet;
  if (
    projectionHash(body) !== digest ||
    packet.operationDigest !== projectionHash(request.operation)
  )
    throw Error("PROJECTION_INTEGRITY");
  assertProjectionContent(packet, request, now);
  if (packet.payload.kind === "dataset") {
    const { digest: datasetDigest, ...dataset } = packet.payload.dataset;
    if (projectionHash(dataset) !== datasetDigest)
      throw Error("PROJECTION_INTEGRITY");
  }
  return packet;
}
