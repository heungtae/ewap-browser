import { z } from "zod";
const hex = z.string().regex(/^[a-f0-9]{64}$/);
export const releaseRoots = [
  "chrome-extension",
  "agent-server",
  "dependencies",
] as const;
export const releaseFileSchema = z.strictObject({
  path: z
    .string()
    .max(512)
    .regex(/^(chrome-extension|agent-server|dependencies)\/[A-Za-z0-9_.@/-]+$/)
    .refine((path) =>
      path
        .split("/")
        .every((part) => part !== ".." && part !== "." && part.length > 0),
    ),
  bytes: z
    .number()
    .int()
    .nonnegative()
    .max(64 * 1024 * 1024),
  sha256: hex,
});
export const releaseSetSchema = z
  .strictObject({
    schema: z.literal("wca.release-set/v1"),
    scope: z.literal("qualification-only"),
    source: z.strictObject({
      revision: z.string().regex(/^[a-f0-9]{40}$/),
      dirty: z.boolean(),
    }),
    platform: z.literal("linux"),
    architecture: z.enum(["x64", "arm64"]),
    nodeVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
    nodeMajor: z.number().int().min(22).max(99),
    credentials: z.literal("session-only"),
    versions: z.strictObject({
      extension: z.string().regex(/^\d+\.\d+\.\d+$/),
      backend: z.string().regex(/^\d+\.\d+\.\d+$/),
      browserApp: z.string().regex(/^\d+\.\d+\.\d+$/),
    }),
    protocol: z.strictObject({
      major: z.number().int().nonnegative(),
      minor: z.number().int().nonnegative(),
    }),
    files: z.array(releaseFileSchema).min(3).max(4096),
  })
  .superRefine((value, context) => {
    const names = value.files.map((file) => file.path);
    if (
      new Set(names).size !== names.length ||
      value.files.reduce((sum, file) => sum + file.bytes, 0) >
        256 * 1024 * 1024 ||
      releaseRoots.some(
        (root) => !names.some((name) => name.startsWith(`${root}/`)),
      )
    )
      context.addIssue({ code: "custom", message: "RELEASE_INVENTORY" });
  });
export type ReleaseSet = z.infer<typeof releaseSetSchema>;
