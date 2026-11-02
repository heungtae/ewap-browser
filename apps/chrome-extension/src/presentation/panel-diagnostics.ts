export function openPanelDiagnostics(document: Document) {
  const dialog = document.getElementById(
    "diagnostics-dialog",
  ) as HTMLDialogElement;
  const target = document.getElementById("diagnostics-dialog-trace");
  if (target)
    target.textContent =
      document.getElementById("execution-trace")?.textContent ||
      "아직 기록된 실행이 없습니다.";
  if (!dialog.open) dialog.showModal();
}
// This artifact describes visible status only. It contains no pending values,
// prompt bindings, credentials or claimed backend/provider trace completeness.
export function downloadPanelDiagnostics(document: Document) {
  const body = JSON.stringify(
    {
      schema: "wca.presentation-diagnostics/v1",
      scope: "presentation-status-only",
      backendTrace: "unavailable",
      status: document.getElementById("status")?.textContent ?? "",
      activity: document.getElementById("execution-trace")?.textContent ?? "",
    },
    null,
    2,
  );
  const blob = new Blob([body], { type: "application/json" });
  const url = URL.createObjectURL(blob),
    link = document.createElement("a");
  link.href = url;
  link.download = "contextpilot-presentation-diagnostics.json";
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
