import { expect, it } from "vitest";
import { brokerFixture } from "./support.js";
function emit(
  f: Awaited<ReturnType<typeof brokerFixture>>,
  id: string,
  url = "https://fixture.test/data",
) {
  f.emit("Network.requestWillBeSent", {
    requestId: id,
    request: {
      method: "GET",
      headers: { authorization: "SECRET" },
      postData: "SECRET",
    },
  });
  f.emit("Network.responseReceived", {
    requestId: id,
    type: "Fetch",
    response: {
      url,
      status: 200,
      mimeType: "application/json",
      headers: { "set-cookie": "SECRET" },
    },
  });
  f.emit("Network.loadingFinished", { requestId: id, encodedDataLength: 100 });
}
it("S32 only observed same-origin responses have body access, with current consent", async () => {
  const f = await brokerFixture();
  f.transport.send = async (_tab, method) => {
    f.calls.push(method);
    return { body: '[{"value":1}]', base64Encoded: false };
  };
  let saved: (() => Promise<string>) | undefined;
  await f.broker.network(
    f.context,
    f.signal,
    "https://fixture.test",
    async (access) => {
      emit(f, "allowed");
      emit(f, "foreign", "https://other.test/data");
      expect(access.snapshot()).toHaveLength(1);
      expect(JSON.stringify(access.snapshot())).not.toContain("SECRET");
      await expect(access.body("foreign", () => {})).rejects.toThrow(
        "RESPONSE_UNAVAILABLE",
      );
      await expect(
        access.body("allowed", () => {
          throw new Error("CONSENT_DENIED");
        }),
      ).rejects.toThrow("CONSENT_DENIED");
      expect(f.calls).not.toContain("Network.getResponseBody");
      expect(await access.body("allowed", () => {})).toContain('"value":1');
      saved = () => access.body("allowed", () => {});
    },
  );
  await expect(saved!()).rejects.toThrow("NETWORK_CLOSED");
  expect(f.calls.at(-1)).toBe("detach");
});
it("S32 oversized/unloaded bodies stay unavailable and record caps are explicit", async () => {
  const f = await brokerFixture();
  await f.broker.network(
    f.context,
    f.signal,
    "https://fixture.test",
    async (access) => {
      for (let i = 0; i < 101; i++) emit(f, String(i));
      expect(access.snapshot()).toHaveLength(100);
      expect(access.coverage().reasons).toContain("RECORD_LIMIT");
      f.emit("Network.loadingFinished", {
        requestId: "0",
        encodedDataLength: 262145,
      });
      await expect(access.body("0", () => {})).rejects.toThrow(
        "RESPONSE_UNAVAILABLE",
      );
    },
  );
});
it("S32 body bytes are bounded before JSON parsing even when encoded transfer is small", async () => {
  const f = await brokerFixture();
  f.transport.send = async () => ({
    body: "x".repeat(262145),
    base64Encoded: false,
  });
  await f.broker.network(
    f.context,
    f.signal,
    "https://fixture.test",
    async (access) => {
      emit(f, "gzip");
      await expect(access.body("gzip", () => {})).rejects.toThrow(
        "RESPONSE_BYTE_LIMIT",
      );
    },
  );
});
