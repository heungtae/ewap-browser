import assert from "node:assert/strict";
import { cdp, evaluate, waitFor, sleep } from "./chrome-cdp-utils.mjs";
import { checkS13Privacy } from "./chrome-s13-privacy-check.mjs";
export const checkS13Coverage = async ({
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
  for (const [path, expected] of [
    [
      "/large",
      {
        coverage: "partial",
        reason: "CONTEXT_TRUNCATED",
        collected_count: 101,
        truncated: true,
      },
    ],
    ["/chart", { coverage: "viewport_only" }],
    ["/canvas", { coverage: "viewport_only", records: [] }],
    [
      "/paged",
      { coverage: "unavailable", reason: "UNSUPPORTED_OBJECT", records: [] },
    ],
  ]) {
    await navigate(path);
    await submit(
      "ask",
      path === "/paged"
        ? "표 데이터를 분석 요약해"
        : "이 페이지 데이터를 분석 요약해",
    );
    // The S6-R fixture left only one-request grants, so approve this source.
    await approve().catch(async (error) => {
      throw new Error(
        error.message +
          JSON.stringify({
            path,
            status: await status(),
            text: await evaluate(
              panel,
              "document.querySelector('#chat-messages').textContent",
            ),
          }),
      );
    });
    assert.equal((await terminal()).outcome, "VERIFIED");
    checkContext(contexts().at(-1), expected);
  }
  console.log(
    "S13 collection coverage passed: context cap, SVG/canvas viewport, unsupported pagination",
  );

  await navigate("/unreviewed", true);
  const beforeReview = providerRequests.length;
  await submit("ask");
  assert.equal((await terminal()).outcome, "VERIFIED");
  await waitFor(
    () =>
      evaluate(
        panel,
        "document.querySelector('#chat-messages').textContent.includes('REQUIRES_ADAPTER_REVIEW')",
      ),
    10000,
    "S13 adapter review card absent",
  );
  assert.equal(providerRequests.length, beforeReview);
  assert.equal(await evaluate(page, "readCount"), 0);
  const beforeActReview = contexts().length;
  await submit("act", "데이터를 분석하고 저장해");
  assert.equal((await terminal()).outcome, "VERIFIED");
  assert.equal(contexts().length, beforeActReview);
  assert.equal(await evaluate(page, "readCount"), 0);
  await checkS13Privacy({ send, panel });
  console.log(
    "S13 unreviewed candidates + persistent storage/diagnostics non-disclosure passed",
  );
};
