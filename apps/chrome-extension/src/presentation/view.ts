export interface PresentationView {
  status(text: string): void;
  message(text: string): void;
}
export function createView(document: Document): PresentationView {
  return {
    status(text) {
      const output = document.querySelector(
        "#status, #settings-status, #learned-profile-status",
      );
      if (output && output.textContent !== text) output.textContent = text;
      const activity = document.getElementById("activity-status");
      if (activity) {
        if (activity.textContent !== text) activity.textContent = text;
        activity.hidden = false;
        // The existing #status live region announces changes once.
        if (activity.getAttribute("aria-live") !== "off")
          activity.setAttribute("aria-live", "off");
      }
    },
    message(text) {
      const container = document.getElementById("chat-messages");
      if (!container) return;
      const message = document.createElement("article");
      message.className = "message";
      message.dataset.role = "assistant";
      message.textContent = text;
      container.append(message);
    },
  };
}
