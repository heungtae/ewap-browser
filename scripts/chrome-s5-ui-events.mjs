import { waitFor } from "./chrome-cdp-utils.mjs";

export const checkS5UiEvents = async ({ run, emit, event, base }) => {
  await emit(
    event(1, "run_started", { mode: "ask", permission_mode: "standard" }),
  );
  await emit(event(2, "assistant_delta", { text: "A" }));
  const started = event(3, "tool_started", {
    tool_use_id: "tool-abcdefghijklmnop",
    tool: "read_page",
    summary: "reading",
  });
  await emit(started);
  await emit(started);
  await emit(event(4, "assistant_delta", { text: "B" }));
  await emit(
    event(5, "tool_finished", {
      tool_use_id: "tool-abcdefghijklmnop",
      result: { outcome: "VERIFIED", summary: "done" },
    }),
  );
  await emit(event(6, "run_terminal", { outcome: "VERIFIED" }));
  await emit(event(7, "assistant_delta", { text: "LATE" }));
  const ordering = await run(
    "({text:document.querySelector('.message[data-role=assistant]')?.textContent, tools:document.querySelectorAll('.event-card[data-kind=tool]').length, order:[...document.querySelector('#chat-messages').children].map(item=>item.dataset.kind||item.dataset.role)})",
  );
  if (
    ordering.text !== "AB" ||
    ordering.tools !== 1 ||
    ordering.order.join(",") !== "assistant,tool"
  )
    throw new Error(`S5_ORDER_DUPLICATE_TERMINAL_${JSON.stringify(ordering)}`);
  const second = "run-second-abcdefghijk";
  await emit(
    event(
      8,
      "run_started",
      { mode: "ask", permission_mode: "standard" },
      second,
    ),
  );
  const gap = [
    event(9, "assistant_delta", { text: "gap-A" }, second),
    event(10, "assistant_delta", { text: "gap-B" }, second),
  ];
  await run(`window.__s5.gap=${JSON.stringify(gap)}`);
  await emit(gap[1]);
  await waitFor(
    () =>
      run(
        "window.__s5.resync === 1 && document.querySelectorAll('.message[data-role=assistant]')[1]?.textContent === 'gap-Agap-B'",
      ),
    5_000,
    "S5_GAP_RESYNC_FAILED",
  );
  await emit(event(11, "run_terminal", { outcome: "VERIFIED" }, second));
  const third = "run-third-abcdefghijkl";
  const action = {
    session_id: base.session_id,
    proposal_id: "proposal-abcdefghijkl",
    tool: "click_by_ref",
    target_name: "Safe target",
  };
  await emit(
    event(
      12,
      "run_started",
      { mode: "act", permission_mode: "skip_all_permission_checks" },
      third,
    ),
  );
  await emit(
    event(
      13,
      "permission_required",
      {
        request_id: "permission-abcdefghijkl",
        action,
        capability: "click",
        host: "fixture.test",
      },
      third,
    ),
  );
  if (
    !(await run(
      "document.querySelector('#permission-mode-badge')?.textContent === '권한 질문 생략'",
    ))
  )
    throw new Error("S5_PERMISSION_BADGE_MISMATCH");
  await emit(
    event(14, "value_required", { action, value_kind: "text" }, third),
  );
  await run(
    "document.querySelector('.event-card[data-kind=value] input').value='RAW_ACTION_VALUE'",
  );
  await emit(
    event(
      15,
      "confirmation_required",
      {
        action,
        confirmation_id: "confirm-abcdefghijkl",
        confirmation_nonce: "nonce-abcdefghijkl",
      },
      third,
    ),
  );
  if (
    await run(
      "document.querySelector('.event-card[data-kind=value] input').value.includes('RAW_ACTION_VALUE')",
    )
  )
    throw new Error("S5_VALUE_RETAINED_AFTER_DECISION_EXPIRED");
  const stopping = await run(
    "(() => {document.querySelector('#chat-send').click();return {label:document.querySelector('#chat-send')?.getAttribute('aria-label'),disabled:[...document.querySelectorAll('.event-card[data-kind=permission] button,.event-card[data-kind=value] button,.event-card[data-kind=confirmation] button')].every(button=>button.disabled)}})()",
  );
  if (stopping.label !== "중단 중" || !stopping.disabled)
    throw new Error(`S5_STOP_NOT_IMMEDIATE_${JSON.stringify(stopping)}`);
  await emit(event(16, "assistant_delta", { text: "LATE_SECRET" }, third));
  await emit(
    event(
      17,
      "tool_started",
      {
        tool_use_id: "late-tool-abcdefghijkl",
        tool: "click_by_ref",
        summary: "late",
      },
      third,
    ),
  );
  await emit(event(18, "run_terminal", { outcome: "CANCELLED" }, third));
  if (
    await run(
      "document.querySelector('#chat-messages').textContent.includes('LATE_SECRET') || document.querySelectorAll('.event-card[data-kind=tool]').length !== 1 || document.querySelector('.event-card[data-kind=permission] button').disabled === false",
    )
  )
    throw new Error("S5_STOP_LEAKED_LATE_EVENT");
  const fourth = "run-fourth-abcdefghijk";
  await emit(
    event(
      19,
      "run_started",
      { mode: "ask", permission_mode: "standard" },
      fourth,
    ),
  );
  await emit(
    event(
      20,
      "run_terminal",
      { outcome: "UNKNOWN", code: "POSTCONDITION_UNVERIFIED" },
      fourth,
    ),
  );
  const unknown = await run(
    "({status:document.querySelector('#status')?.textContent, error:document.querySelector('.event-card[data-kind=error]')?.textContent})",
  );
  if (
    !unknown.error?.includes("확인") ||
    unknown.status?.includes("완료했습니다")
  )
    throw new Error("S5_UNKNOWN_SHOWN_AS_SUCCESS");
  const fifth = "run-fifth-abcdefghijkl";
  await emit(
    event(
      21,
      "run_started",
      { mode: "act", permission_mode: "standard" },
      fifth,
    ),
  );
  await emit(
    event(
      22,
      "run_terminal",
      { outcome: "FAILED", code: "TARGET_STALE" },
      fifth,
    ),
  );
  if (
    !(await run(
      "[...document.querySelectorAll('.event-card[data-kind=error] button')].some(button=>button.textContent==='현재 페이지 다시 읽기')",
    ))
  )
    throw new Error("S5_STALE_CTA_MISSING");
};
