import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  discoverPageMethodsMain,
  invokePageMethodMain,
} from "../../../src/service-worker/page-method-main.js";

import { installPageMethodRegistryMain } from "../../../src/service-worker/page-method-registry-main.js";
beforeEach(() =>
  installPageMethodRegistryMain("__contextPilotMethodTestRegistry"),
);

const root = "__contextPilotS23Fixture";
afterEach(() => Reflect.deleteProperty(globalThis, root));

describe("page method identity and return kinds", () => {
  it("rejects same-source closure and receiver replacements", async () => {
    const factory = (secret: string) => ({
      read: function read() {
        return secret;
      },
    });
    const api = factory("original");
    Object.defineProperty(globalThis, root, {
      configurable: true,
      enumerable: true,
      value: api,
    });
    const method = discoverPageMethodsMain().find(
      (item) => item.object_path.join(".") === `${root}.read`,
    )!;
    api.read = factory("replacement").read;
    await expect(
      invokePageMethodMain(
        method.object_path,
        method.locator_revision,
        method.method_name,
        method.arity,
        [],
      ),
    ).resolves.toEqual({ status: "stale" });
    const sameFunction = api.read;
    const current = discoverPageMethodsMain().find(
      (item) => item.object_path.join(".") === `${root}.read`,
    )!;
    Object.defineProperty(globalThis, root, {
      configurable: true,
      enumerable: true,
      value: { read: sameFunction },
    });
    await expect(
      invokePageMethodMain(
        current.object_path,
        current.locator_revision,
        current.method_name,
        current.arity,
        [],
      ),
    ).resolves.toEqual({ status: "stale" });
  });
  it.each([undefined, null, () => {}, 1n])(
    "separates return kinds for %s",
    async (value) => {
      Object.defineProperty(globalThis, root, {
        configurable: true,
        enumerable: true,
        value: { read: () => value },
      });
      const method = discoverPageMethodsMain().find(
        (item) => item.object_path.join(".") === `${root}.read`,
      )!;
      const result = await invokePageMethodMain(
        method.object_path,
        method.locator_revision,
        method.method_name,
        method.arity,
        [],
      );
      expect(result).toMatchObject({
        status: "returned",
        kind:
          value === undefined
            ? "undefined"
            : value === null
              ? "null"
              : "unsupported",
      });
    },
  );
});
