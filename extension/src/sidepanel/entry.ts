type BrowserRuntime = { sendMessage(message: unknown): Promise<unknown> };
const runtime = (
  globalThis as typeof globalThis & { chrome?: { runtime: BrowserRuntime } }
).chrome?.runtime;
const button = document.querySelector<HTMLButtonElement>("#preview");
const fixtureSet = document.querySelector<HTMLButtonElement>("#fixture-set");
const fixtureValue = document.querySelector<HTMLInputElement>("#fixture-value");
const cancel = document.querySelector<HTMLButtonElement>("#cancel");
const status = document.querySelector<HTMLOutputElement>("#status");
const projection = document.querySelector<HTMLElement>("#projection");
let latestSnapshot:
  | {
      nodes?: Array<{ ref_id: string; role: string; name: string }>;
    }
  | undefined;
button?.addEventListener("click", async () => {
  if (!runtime || !status || !projection) return;
  status.value = "페이지 정보를 확인하는 중입니다.";
  const result = await runtime.sendMessage({ kind: "START_PREVIEW" });
  if (
    typeof result !== "object" ||
    result === null ||
    !(result as { ok?: unknown }).ok
  ) {
    status.value = "이 사이트에서는 사용할 수 없습니다.";
    projection.textContent = "";
    return;
  }
  status.value = "미리보기 준비됨";
  latestSnapshot = (result as { snapshot: typeof latestSnapshot }).snapshot;
  projection.textContent = JSON.stringify(latestSnapshot, null, 2);
});
fixtureSet?.addEventListener("click", async () => {
  if (!runtime || !status || !fixtureValue) return;
  const target = latestSnapshot?.nodes?.find(
    (node) => node.role === "textbox" && node.name === "Case name",
  );
  if (!target) {
    status.value = "먼저 Fixture 페이지 미리보기를 확인해 주세요.";
    return;
  }
  status.value = "입력 대상 확인 중입니다.";
  const started = await runtime.sendMessage({
    kind: "START_ACT",
    tool: "set_text_by_ref",
    ref_id: target.ref_id,
  });
  if (
    typeof started !== "object" ||
    started === null ||
    !(started as { ok?: unknown }).ok
  ) {
    status.value = "Fixture 작업을 시작할 수 없습니다.";
    return;
  }
  const response = started as {
    run_id: string;
    value_slot_id: string;
    value_kind: "text";
  };
  status.value = "입력값을 한 번만 전달하는 중입니다.";
  const submitted = await runtime.sendMessage({
    kind: "SUBMIT_ACTION_VALUE",
    run_id: response.run_id,
    value_slot_id: response.value_slot_id,
    value_kind: response.value_kind,
    value: fixtureValue.value,
  });
  fixtureValue.value = "";
  status.value =
    typeof submitted === "object" &&
    submitted !== null &&
    (submitted as { ok?: unknown }).ok
      ? "Fixture 작업 완료"
      : "Fixture 작업이 안전하게 종료되었습니다.";
});
cancel?.addEventListener("click", async () => {
  if (!runtime || !status) return;
  const result = await runtime.sendMessage({ kind: "CANCEL" });
  status.value =
    typeof result === "object" &&
    result !== null &&
    (result as { ok?: unknown }).ok
      ? "작업을 중단했습니다."
      : "중단 요청을 완료할 수 없습니다.";
});
