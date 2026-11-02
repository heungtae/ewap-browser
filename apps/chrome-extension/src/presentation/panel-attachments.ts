export function mountPanelAttachments(
  document: Document,
  status: (text: string) => void,
) {
  const input = document.getElementById("attachment-input") as HTMLInputElement;
  const trigger = document.getElementById("attachment-trigger");
  const output = document.getElementById("attachment-name");
  let attachment: { name: string; text: string } | undefined,
    generation = 0;
  const clear = () => {
    generation++;
    attachment = undefined;
    input.value = "";
    if (output) {
      output.hidden = true;
      output.textContent = "";
    }
  };
  const open = () => input.click();
  const changed = () => {
    const file = input.files?.[0];
    if (!file) return;
    const sequence = ++generation;
    if (
      !["txt", "md", "csv", "json"].includes(
        file.name.split(".").at(-1)?.toLowerCase() ?? "",
      )
    ) {
      clear();
      status("txt, md, csv, json 파일만 첨부할 수 있습니다.");
      return;
    }
    if (file.size > 128 * 1024) {
      clear();
      status("128KB 이하의 텍스트 파일만 첨부할 수 있습니다.");
      return;
    }
    void file
      .text()
      .then((text) => {
        if (sequence !== generation) return;
        attachment = {
          name: file.name.slice(0, 255),
          text: text.slice(0, 6000),
        };
        if (output) {
          output.textContent = attachment.name;
          output.hidden = false;
        }
        status(
          text.length > 6000
            ? "파일 앞부분 6,000자만 첨부합니다."
            : "파일을 첨부했습니다.",
        );
      })
      .catch(() => {
        if (sequence === generation) {
          clear();
          status("파일을 읽지 못했습니다.");
        }
      });
  };
  trigger?.addEventListener("click", open);
  input.addEventListener("change", changed);
  return {
    clear,
    prompt(question: string) {
      const text = attachment
        ? `${question || "첨부한 파일을 분석해 주세요."}\n\n[USER_ATTACHED_TEXT_FILE name="${attachment.name}"]\n${attachment.text}\n[/USER_ATTACHED_TEXT_FILE]`
        : question;
      return text && text.length <= 8000 ? text : undefined;
    },
    dispose() {
      clear();
      trigger?.removeEventListener("click", open);
      input.removeEventListener("change", changed);
    },
  };
}
