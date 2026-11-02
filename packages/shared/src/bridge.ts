export * from "./replay.js";
import { replaySchema } from "./replay.js";
export * from "./task-history.js";
import { taskHistoryCommandSchema } from "./task-history.js";
export * from "./codebase-rpc.js";
import { codebaseCommandSchema } from "./codebase-rpc.js";
import { z } from "zod";
import { type PanelClient } from "./panel-events.js";
export * from "./panel-events.js";
export * from "./settings-rpc.js";
import { settingsCommandSchema } from "./settings-rpc.js";
import { migrationCommandSchema } from "./migration-rpc.js";
export const MAX_FRAME_BYTES = 256 * 1024;
export const PROTOCOL = { major: 1, minor: 0 } as const;
const id = z.string().min(1).max(128);
export const helloSchema = z.strictObject({
  kind: z.literal("hello"),
  major: z.literal(1),
  minor: z.literal(0),
  installationId: id,
  profileId: id,
  extensionId: z.string().regex(/^[a-p]{32}$/),
  nonce: z.string().regex(/^[a-f0-9]{64}$/),
  proof: z.string().regex(/^[a-f0-9]{64}$/),
  capabilities: z
    .array(z.enum(["codebase.read", "task.history"]))
    .min(1)
    .max(2)
    .refine((values) => new Set(values).size === values.length)
    .optional(),
});
export const transferCommandSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("transfer.open"),
    id,
    count: z.number().int().min(1).max(256),
    bytes: z
      .number()
      .int()
      .min(1)
      .max(8 * 1024 * 1024),
    digest: z.string().regex(/^[a-f0-9]{64}$/),
    deadline: z.number().int().nonnegative(),
  }),
  z.strictObject({
    kind: z.literal("transfer.chunk"),
    id,
    index: z.number().int().nonnegative(),
    base64: z
      .string()
      .min(4)
      .max(174764)
      .regex(
        /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/,
      ),
  }),
  z.strictObject({
    kind: z.literal("transfer.ack"),
    id,
    index: z.number().int().nonnegative(),
  }),
  z.strictObject({ kind: z.literal("transfer.complete"), id }),
  z.strictObject({ kind: z.literal("transfer.cancel"), id }),
]);
export const commandSchema = z.union([
  taskHistoryCommandSchema,
  codebaseCommandSchema,
  settingsCommandSchema,
  migrationCommandSchema,
  transferCommandSchema,
  z.discriminatedUnion("kind", [
    z.strictObject({ kind: z.literal("heartbeat") }),
    z.strictObject({ kind: z.literal("capabilities") }),
    z.strictObject({
      kind: z.literal("resumeEvents"),
      afterSequence: z.number().int().nonnegative(),
      streamId: z.string().uuid().optional(),
    }),
    z.strictObject({
      kind: z.literal("browser.connected"),
      generation: z.number().int().positive(),
    }),
    z.strictObject({ kind: z.literal("browser.disconnected") }),
  ]),
]);
export const envelopeSchema = z.strictObject({
  major: z.literal(1),
  minor: z.literal(0),
  messageId: id,
  connectionId: id,
  connectionEpoch: z.number().int().positive(),
  installationId: id,
  profileId: id,
  sender: z.literal("extension"),
  sentAt: z.number().int().nonnegative(),
  deadline: z.number().int().nonnegative(),
  payloadDigest: z.string().regex(/^[a-f0-9]{64}$/),
  payload: commandSchema,
});
export type Hello = z.infer<typeof helloSchema>;
export type Envelope = z.infer<typeof envelopeSchema>;
export interface TaskClient {
  readonly taskId?: string;
  panel?: PanelClient;
  resume(
    afterSequence: number,
    streamId?: string,
  ): Promise<z.infer<typeof replaySchema>>;
}
export interface PublicSettings {
  controllerReady: boolean;
  analystReady: boolean;
  secretMode: "session-only" | "os-store";
}
export interface SettingsClient {
  read(): Promise<PublicSettings>;
}

export const challengeSchema = z.strictObject({
  kind: z.literal("challenge"),
  nonce: z.string().regex(/^[a-f0-9]{64}$/),
  major: z.literal(1),
  minor: z.literal(0),
});
export const readySchema = z.strictObject({
  kind: z.literal("ready"),
  connectionId: z.string().uuid(),
  connectionEpoch: z.number().int().positive(),
  capabilities: z
    .array(
      z.enum([
        "task.history",
        "codebase.read",
        "settings",
        "heartbeat",
        "resumeEvents",
        "migration.status",
        "migration.policy",
        "migration.settings",
        "migration.resume",
        "migration.resumeSnapshot",
        "migration.checkpoints",
        "migration.consensus",
      ]),
    )
    .max(12),
  taskReady: z.literal(false),
});
export const responseSchema = z.strictObject({
  messageId: id,
  result: z.unknown(),
});
