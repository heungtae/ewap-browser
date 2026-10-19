import { isReadStep } from "./mode-capabilities.js";
import {
  decisionFrameSchema,
  framePayloadSchema,
  type DecisionFrame,
} from "./schema.js";
import { bytes, digest } from "./digest.js";
export function validateFrame(value: unknown): DecisionFrame {
  const frame = decisionFrameSchema.parse(value);
  const { digest: frameDigest, ...payload } = frame;
  const { digest: setDigest, id, ...page } = frame.candidateSet;
  if (
    digest(payload) !== frameDigest ||
    digest(page) !== setDigest ||
    id !== `set:${setDigest}` ||
    frame.candidateSet.contextDigest !== digest(frame.context)
  )
    throw new Error("FRAME_DIGEST_MISMATCH");
  if (
    new Set(frame.candidateSet.candidates.map((c) => c.id)).size !==
    frame.candidateSet.candidates.length
  )
    throw new Error("DUPLICATE_CANDIDATES");
  if (
    frame.candidateSet.totalEligible < frame.candidateSet.candidates.length ||
    frame.candidateSet.omitted !==
      frame.candidateSet.totalEligible - frame.candidateSet.candidates.length
  )
    throw new Error("INVALID_COVERAGE");
  if (
    frame.candidateSet.candidates.some(
      (c) =>
        c.scopeId !== frame.context.scopeId ||
        !c.modes.includes(frame.context.mode) ||
        (frame.context.mode === "ask" && c.steps.some((s) => !isReadStep(s))),
    )
  )
    throw new Error("CANDIDATE_SCOPE_MISMATCH");
  const cursor = frame.candidateSet.cursor;
  if (
    cursor &&
    (cursor.contextDigest !== frame.candidateSet.contextDigest ||
      cursor.sourceDigest !== frame.candidateSet.sourceDigest ||
      cursor.offset <= 0 ||
      cursor.offset >= frame.candidateSet.totalEligible ||
      cursor.offset % 28 !== 0)
  )
    throw new Error("STALE_FRAME_CURSOR");
  if (bytes(frame) > 32768) throw new Error("FRAME_BYTE_LIMIT");
  return frame;
}
export function createFrame(value: unknown): DecisionFrame {
  const payload = framePayloadSchema.parse(value);
  return validateFrame({ ...payload, digest: digest(payload) });
}
