import assert from "node:assert/strict";
import { build } from "esbuild";
import { instrumentMethodSource } from "./method-trace-instrumentation.mjs";
import { resolve } from "node:path";

const source = `
import { methodTraceSnapshot } from "../diagnostics/method-trace.js";
export class Base { constructor(public value = 2) {} get amount() { return this.value; } }
export class Child extends Base {
 constructor(value: number) { super(value); this.value++; }
 async run(prompt: string, requestId: string) { await Promise.resolve(); return this.sync(prompt); }
 sync(prompt: string) { try { if (!prompt) throw new Error("empty"); return { result: this.amount, prompt }; } catch (error) { return { reason: "EMPTY_PROMPT" }; } }
}
export const callback = (value: number) => [value].map((item) => item + 1);
export const defaults = (callback = () => 3) => callback();
export const optional = (item?: { value(): { top: number } }) => item?.value().top;
export const snapshot = () => methodTraceSnapshot("panel");
`;
const result = instrumentMethodSource(
  source,
  resolve("extension/src/service-worker/trace-fixture.ts"),
);
assert.equal(result.inventory.length, 11);
const bundle = await build({
  stdin: {
    contents: result.text,
    loader: "ts",
    resolveDir: resolve("extension/src/service-worker"),
  },
  bundle: true,
  platform: "node",
  format: "cjs",
  write: false,
});
const module = { exports: {} };
new Function("module", "exports", bundle.outputFiles[0].text)(
  module,
  module.exports,
);
const { Child, callback, defaults, optional, snapshot } = module.exports;
const instance = new Child(4);
assert.deepEqual(
  await instance.run(
    "click save password=masked-private",
    "33333333-3333-3333-3333-333333333333",
  ),
  { result: 5, prompt: "click save password=masked-private" },
);
assert.deepEqual(instance.sync(""), { reason: "EMPTY_PROMPT" });
assert.deepEqual(callback(3), [4]);
assert.equal(defaults(), 3);
assert.equal(optional(), undefined);
const trace = snapshot();
assert.equal(JSON.stringify(trace).includes("masked-private"), false);
assert.ok(
  trace.records.some(
    (entry) =>
      entry.event === "method.branch" &&
      entry.detail.data.branch === "caught_error",
  ),
);
for (const method of result.inventory)
  assert.ok(
    trace.methods.some((entry) => entry.method === method.method),
    `Missing trace: ${method.method}`,
  );
console.log(
  `Method instrumentation PASS: ${result.inventory.length} methods, async/constructor/getter/callback/branch/caught error/masking`,
);
