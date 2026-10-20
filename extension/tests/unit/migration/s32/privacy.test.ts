import { expect, it } from "vitest";
import {
  readOwnData,
  sourceEndpoints,
  responseRows,
  networkMetadata,
  accessibilityRows,
} from "../../../../../packages/collector/src/advanced/index.js";
import { CollectorConsent } from "../../../../../packages/browser-runtime/src/index.js";
import { setup } from "../../../fixture/s30/setup.js";
it("S32 rejects live MAIN getters/proxies/functions and permits bounded inert registered JSON", () => {
  let reads = 0;
  const malicious = {
    get rows() {
      reads++;
      throw new Error("getter");
    },
  };
  expect(() => readOwnData(malicious as unknown as string, ["rows"])).toThrow(
    "MAIN_INPUT_DENIED",
  );
  expect(reads).toBe(0);
  expect(
    readOwnData('{"rows":[["same",1],["same",2]]}', ["rows"]),
  ).toHaveLength(2);
  expect(() => readOwnData('{"rows":[]}', ["__proto__"])).toThrow(
    "MAIN_PATH_DENIED",
  );
  expect(sourceEndpoints('fetch("/api/secret");window.leak()')).toMatchObject({
    observed: false,
    executable: false,
  });
});
it("S32 network metadata hashes paths and strips query/header/body authority", async () => {
  const data = await networkMetadata(
    {
      requestId: "id-secret",
      url: "https://fixture.test/users/alice?token=SECRET",
      method: "POST",
      status: 200,
      mime: "application/json",
    },
    "https://fixture.test",
  );
  expect(JSON.stringify(data)).not.toMatch(/alice|SECRET|id-secret/);
  expect(data.executable).toBe(false);
  expect(
    responseRows('[{"value":4,"token":"SECRET","email":"a@b.test"}]', [
      "value",
    ]),
  ).toEqual([[4]]);
  expect(() => responseRows("[]", ["token"])).toThrow("RESPONSE_SCOPE");
  expect(() => responseRows("x".repeat(262145), ["value"])).toThrow(
    "RESPONSE_SCOPE",
  );
});
it("S32 AX returns role metadata with private names and input values withheld", () => {
  const data = accessibilityRows({
    nodes: [
      { role: { value: "button" }, name: { value: "SECRET_NAME" } },
      { role: { value: "textbox" }, name: { value: "PASSWORD" } },
    ],
  });
  expect(data).toEqual({
    rows: [["button", "[NAME_WITHHELD]"]],
    partial: true,
  });
});
it("S32 disclosure requires current trusted UI identity and exact scope", async () => {
  const f = await setup();
  const consent = new CollectorConsent(f.ui, () => f.context);
  const scope = "a".repeat(64);
  expect(() => consent.check("network_body", scope)).toThrow(
    "DISCLOSURE_DENIED",
  );
  expect(() =>
    consent.grant({} as typeof f.principal, "network_body", scope),
  ).toThrow();
  consent.grant(f.principal, "network_body", scope);
  consent.check("network_body", scope);
  expect(() => consent.check("visual", scope)).toThrow("DISCLOSURE_DENIED");
  f.context.routeEpoch++;
  expect(() => consent.check("network_body", scope)).toThrow(
    "DISCLOSURE_DENIED",
  );
});
