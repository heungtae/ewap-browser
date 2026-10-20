import { z } from "zod";
import { hash, id, revision } from "./common.js";
import { entitySchema } from "./graph.js";
export const advisoryInputSchema = z.strictObject({
  source: z.enum(["learned", "recorded"]),
  sourceId: z.string().min(1).max(128),
  title: z.string().max(200),
  sourceRevision: revision,
  successfulAt: revision,
  steps: z
    .array(
      z.strictObject({
        tool: z.enum([
          "web.click",
          "web.fill",
          "web.select",
          "web.navigate",
          "click_by_ref",
          "fill_by_ref",
          "select_option",
        ]),
        label: z.string().max(200),
      }),
    )
    .max(64),
});
export const advisoryHistorySchema = z.strictObject({
  id,
  source: z.enum(["learned", "recorded"]),
  sourceDigest: hash,
  sourceRevision: revision,
  successfulAt: revision,
  stepLabels: z.array(z.string().max(200)).max(64),
});
export const advisoryRecordSchema = z
  .strictObject({ entity: entitySchema, history: advisoryHistorySchema })
  .superRefine((r, c) => {
    if (
      r.entity.kind !== "workflow" ||
      r.entity.status !== "advisory" ||
      r.entity.capability !== null ||
      r.entity.sample.length ||
      r.entity.fields.length ||
      r.history.id !== r.entity.id
    )
      c.addIssue({ code: "custom", message: "IMPORT_AUTHORITY" });
  });
