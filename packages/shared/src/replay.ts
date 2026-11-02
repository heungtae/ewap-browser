import { z } from "zod";
import { panelEventSchema } from "./panel-events.js";
import { taskHistoryReplaySchema } from "./task-history.js";
const eventPosition = {
  sequence: z.number().int().positive(),
  revision: z.number().int().positive(),
};
export const bridgeEventSchema = z.union([
  z.strictObject({
    ...eventPosition,
    kind: z.literal("presentation"),
    presentation: panelEventSchema,
    text: z.never().optional(),
  }),
  z.strictObject({
    ...eventPosition,
    kind: z
      .string()
      .max(128)
      .regex(/^(?!presentation$)[\s\S]*$/),
    text: z.string().max(65536).optional(),
    presentation: z.never().optional(),
  }),
]);
const connectionReplaySchema = z.strictObject({
  events: z.array(bridgeEventSchema).max(4096),
  cursor: z.number().int().nonnegative(),
  resync: z.boolean(),
  streamId: z.string().uuid().optional(),
  snapshot: z
    .union([
      z.strictObject({
        revision: z.number().int().nonnegative(),
        state: z.literal("waiting"),
      }),
      z.strictObject({
        schema: z.literal("wca.connection-snapshot/v1"),
        streamId: z.string().uuid(),
        revision: z.number().int().nonnegative(),
        state: z.literal("waiting"),
      }),
    ])
    .nullable()
    .optional(),
});
export const replaySchema = z.union([
  connectionReplaySchema,
  taskHistoryReplaySchema,
]);
export type BridgeEvent = z.infer<typeof bridgeEventSchema>;
