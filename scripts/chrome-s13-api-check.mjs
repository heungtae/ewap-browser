import assert from "node:assert/strict";
import { cdp, evaluate, waitFor, sleep } from "./chrome-cdp-utils.mjs";
import { checkS13Privacy } from "./chrome-s13-privacy-check.mjs";
export const checkS13Api = async ({
  send,
  status,
  terminal,
  hasButton,
  click,
  navigate,
  submit,
  contexts,
  approve,
  checkContext,
  panel,
  page,
  worker,
  version,
  cdpPort,
  providerRequests,
  control,
}) => {
  await navigate("/variant?multi", true);
  const baseline = contexts().length;
  await submit("ask");
  await waitFor(
    () => hasButton("reviewed page summary"),
    10000,
    "S13 API source selection absent",
  );
  assert.equal(contexts().length, baseline);
  assert.equal(await evaluate(page, "readCount"), 0);
  assert.equal(await click("reviewed page summary"), true);
  await approve();
  assert.equal((await terminal()).outcome, "VERIFIED");
  checkContext(contexts().at(-1), {
    source: { kind: "page_api_read", label: "reviewed page summary" },
    coverage: "complete",
    collected_count: 1,
  });
  assert.equal(JSON.stringify(contexts().at(-1)).includes("DOM_SOURCE"), false);
  assert.equal(await evaluate(page, "readCount"), 1);
  console.log(
    "S13 API source selection + independent R0 permission + Ask reinjection passed",
  );
  await checkS13Privacy({ send, panel });

  for (const mode of ["ask", "act"]) {
    for (const readMode of ["normal", "partial", "cap", "invalid", "hang"]) {
      await navigate("/variant", true);
      await evaluate(page, `window.readMode=${JSON.stringify(readMode)};true`);
      await submit(
        mode,
        mode === "act" ? "데이터를 분석하고 저장해" : "데이터를 분석 요약해",
      );
      await approve();
      assert.equal((await terminal()).outcome, "VERIFIED");
      const expected =
        readMode === "normal"
          ? { coverage: "complete", collected_count: 1, truncated: false }
          : readMode === "partial"
            ? {
                coverage: "partial",
                reason: "NO_EOF_EVIDENCE",
                collected_count: 1,
                truncated: false,
              }
            : readMode === "cap"
              ? {
                  coverage: "partial",
                  reason: "CONTEXT_TRUNCATED",
                  collected_count: 101,
                  truncated: true,
                }
              : {
                  coverage: "unavailable",
                  reason: readMode === "invalid" ? "INVALID_SCHEMA" : "TIMEOUT",
                  records: [],
                  collected_count: 0,
                };
      checkContext(contexts().at(-1), expected);
      assert.equal(await evaluate(page, "readCount"), 1, "read retried");
      assert.equal(
        await evaluate(page, "saveCount"),
        0,
        "analysis granted mutation",
      );
    }
  }
  console.log(
    "S13 Ask/Act API matrix passed: complete, partial, cap, invalid schema, timeout, no retry/mutation",
  );

  // A provider proposal still stops for action review after the R0 read.
  await navigate("/variant", true);
  control.mode = "proposal";
  await submit("act", "데이터를 분석하고 저장해");
  await approve();
  await waitFor(
    () => hasButton("이번 단계 실행"),
    10000,
    "S13 analysis did not require action review",
  );
  assert.equal(await evaluate(page, "saveCount"), 0);
  await send({
    schema_version: 1,
    kind: "CHAT_REQUEST_CANCEL",
    request_id: await evaluate(panel, "s13RequestId"),
  });
  await terminal();
  control.mode = "normal";
  console.log(
    "S13 analysis success still requires separate mutation review passed",
  );
};
