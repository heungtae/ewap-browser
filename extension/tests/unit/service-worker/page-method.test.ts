import { afterEach, describe, expect, it } from "vitest";
import {
  discoverPageMethodsMain,
  invokePageMethodMain,
} from "../../../src/service-worker/page-method-main.js";

const root = "__contextPilotS23Fixture";
afterEach(() => Reflect.deleteProperty(globalThis, root));

describe("page method MAIN-world helpers", () => {
  it("discovers own methods and invokes the current receiver without evaluating model code", async () => {
    const api = {
      async read(this: { prefix: string }, suffix: string) {
        return { value: `${this.prefix}:${suffix}` };
      },
      prefix: "page",
    };
    Object.defineProperty(globalThis, root, {
      configurable: true,
      enumerable: true,
      value: api,
    });
    expect(
      discoverPageMethodsMain().some(
        (item) => item.object_path.join(".") === `${root}.read`,
      ),
    ).toBe(true);
    const method = api.read;
    const source = Function.prototype.toString.call(method);
    let hash = 2166136261;
    for (let index = 0; index < source.length; index++)
      hash = Math.imul(hash ^ source.charCodeAt(index), 16777619);
    const result = await invokePageMethodMain(
      [root, "read"],
      `read:1:${source.length}:${(hash >>> 0).toString(16)}`,
      "read",
      1,
      ["data"],
    );
    expect(result).toEqual({
      status: "returned",
      value: { value: "page:data" },
      truncated: false,
    });
  });

  it("rejects a stale function revision and never invokes accessors", async () => {
    let getterCalls = 0;
    const api = Object.defineProperty({}, "read", {
      configurable: true,
      get() {
        getterCalls++;
        return () => "not callable by discovery";
      },
    });
    Object.defineProperty(globalThis, root, {
      configurable: true,
      enumerable: true,
      value: api,
    });
    expect(
      discoverPageMethodsMain().some(
        (item) => item.object_path.join(".") === `${root}.read`,
      ),
    ).toBe(false);
    expect(getterCalls).toBe(0);
    const replaced = { read: () => "replacement" };
    Object.defineProperty(globalThis, root, {
      configurable: true,
      enumerable: true,
      value: replaced,
    });
    await expect(
      invokePageMethodMain([root, "read"], "read:0:0:stale", "read", 0, []),
    ).resolves.toEqual({ status: "stale" });
  });
  it("excludes native methods and preserves sparse array positions without invoking getters", async () => {
    let getterCalls = 0;
    const values = new Array(3);
    values[2] = "third";
    Object.defineProperty(values, "1", {
      get() {
        getterCalls++;
        return "secret";
      },
    });
    const api = { native: Math.max, read: () => values };
    Object.defineProperty(globalThis, root, {
      configurable: true,
      enumerable: true,
      value: api,
    });
    const methods = discoverPageMethodsMain().filter(
      (item) => item.object_path[0] === root,
    );
    expect(methods.some((item) => item.object_path.at(-1) === "native")).toBe(
      false,
    );
    const read = methods.find((item) => item.object_path.at(-1) === "read")!;
    const result = await invokePageMethodMain(
      read.object_path,
      read.locator_revision,
      read.method_name,
      read.arity,
      [],
    );
    expect(result).toEqual({
      status: "returned",
      value: [null, null, "third"],
      truncated: true,
    });
    expect(getterCalls).toBe(0);
  });

  it("marks unsupported object returns as incomplete", async () => {
    const api = { read: () => new Date(0) };
    Object.defineProperty(globalThis, root, {
      configurable: true,
      enumerable: true,
      value: api,
    });
    const read = discoverPageMethodsMain().find(
      (item) => item.object_path.join(".") === `${root}.read`,
    )!;
    await expect(
      invokePageMethodMain(
        read.object_path,
        read.locator_revision,
        read.method_name,
        read.arity,
        [],
      ),
    ).resolves.toEqual({
      status: "returned",
      value: "[UNSUPPORTED_OBJECT]",
      truncated: true,
    });
  });
});
