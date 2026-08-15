import { describe, expect, it } from "vitest";
import {
  DocumentAuthority,
  validateEnvelope,
} from "../../../src/contracts/runtime-message.js";
describe("runtime authority", () => {
  it("given_prerender_registration_when_registering_then_denied", () => {
    const authority = new DocumentAuthority();
    expect(() =>
      authority.register(
        {
          id: "ext",
          tabId: 1,
          frameId: 0,
          documentId: "doc",
          documentLifecycle: "prerender",
        },
        {
          schema_version: 1,
          kind: "DOCUMENT_REGISTER",
          document_epoch: "abcdefghijklmnop",
        },
        "ext",
      ),
    ).toThrow("INVALID_ARGUMENT");
  });
  it("given_unknown_envelope_key_when_validating_then_denied", () =>
    expect(() =>
      validateEnvelope({
        schema_version: 1,
        kind: "START_PREVIEW",
        message_id: "abcdefghijklmnop",
        run_id: "r",
        tab_id: 1,
        frame_id: 0,
        document_epoch: "abcdefghijklmnop",
        payload: {},
        extra: true,
      }),
    ).toThrow("INVALID_ARGUMENT"));
});
