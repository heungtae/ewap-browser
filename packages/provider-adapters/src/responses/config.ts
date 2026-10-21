import { z } from "zod";
export const analystConfigSchema = z.strictObject({
  endpoint: z.string().url().max(2048),
  model: z
    .string()
    .regex(/^(?:openai\/)?gpt-[A-Za-z0-9._-]+$/)
    .max(128),
  revision: z.number().int().nonnegative(),
  enabled: z.boolean(),
  stream: z.boolean(),
});
export type AnalystConfig = z.infer<typeof analystConfigSchema>;
export function validateAnalystConfig(input: AnalystConfig): AnalystConfig {
  const config = analystConfigSchema.parse(input);
  const url = new URL(config.endpoint);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !url.pathname.endsWith("/responses")
  )
    throw new Error("ANALYSIS_CONFIG_INVALID");
  return Object.freeze(config);
}
