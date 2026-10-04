import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createUiCompletionObserver } from "../../../src/content/ui-completion.js";

class Element {
  public isConnected = true;
  public textContent = "Before";
  public attributes = new Map<string, string>();
  public sensitive = false;
  public visible = true;
  public getAttribute(key: string) {
    return this.attributes.get(key) ?? null;
  }
  public querySelector() {
    return this.sensitive ? {} : null;
  }
  public getClientRects() {
    return this.visible ? [{}] : [];
  }
  public closest(): Element | null {
    return null;
  }
}
class Button extends Element {
  public type = "button";
  public form: { method: string } | null = null;
  public dialog: Dialog | null = null;
  public override closest() {
    return this.dialog;
  }
}
class Dialog extends Element {
  public open = false;
}

beforeEach(() => {
  vi.stubGlobal("getComputedStyle", () => ({
    display: "block",
    visibility: "visible",
    opacity: "1",
  }));
  vi.stubGlobal("NodeFilter", { SHOW_TEXT: 4 });
  vi.stubGlobal("HTMLElement", Element);
  vi.stubGlobal("HTMLButtonElement", Button);
  vi.stubGlobal("HTMLDialogElement", Dialog);
  vi.stubGlobal("location", { href: "http://127.0.0.1:3002/#controls" });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const fixture = () => {
  const source = new Button();
  const target = new Element();
  source.attributes.set("aria-controls", "result");
  target.attributes.set("role", "status");
  let matches = [target];
  let epoch = "epoch";
  vi.stubGlobal("document", {
    createTreeWalker: (target: Element) => {
      let visited = false;
      return {
        nextNode: () => {
          if (visited) return null;
          visited = true;
          return {
            nodeValue: target.textContent,
            parentElement: { closest: () => null },
          };
        },
      };
    },
    querySelectorAll: () =>
      matches.map((e) => Object.assign(e, { id: "result" })),
  });
  const observer = createUiCompletionObserver({
    epoch: () => epoch,
    resolve: () => source as unknown as HTMLElement,
  });
  const send = (kind: string) =>
    observer.handle({
      kind,
      run_id: "run",
      document_epoch: "epoch",
      ref_id: "ref",
    });
  return {
    source,
    target,
    send,
    setMatches: (next: Element[]) => {
      matches = next;
    },
    setEpoch: (next: string) => {
      epoch = next;
    },
  };
};

describe("browser UI completion observer", () => {
  it("requires a changed, nonempty status without exporting its text", () => {
    const { target, send } = fixture();
    expect(send("CONTENT_PREPARE_UI_COMPLETION")).toEqual({ ok: true });
    expect(send("CONTENT_VERIFY_UI_COMPLETION")).toEqual({
      ok: true,
      matches: false,
    });
    target.textContent = "";
    expect(send("CONTENT_VERIFY_UI_COMPLETION")).toEqual({
      ok: true,
      matches: false,
    });
    target.textContent = "Done";
    expect(send("CONTENT_VERIFY_UI_COMPLETION")).toEqual({
      ok: true,
      matches: true,
    });
    send("CONTENT_RELEASE_UI_COMPLETION");
    expect(send("CONTENT_VERIFY_UI_COMPLETION")).toEqual({ ok: false });
  });

  it("rejects absent, ambiguous, sensitive and invisible status relations", () => {
    for (const change of [
      (f: ReturnType<typeof fixture>) =>
        f.source.attributes.delete("aria-controls"),
      (f: ReturnType<typeof fixture>) =>
        f.setMatches([f.target, new Element()]),
      (f: ReturnType<typeof fixture>) => {
        f.target.sensitive = true;
      },
      (f: ReturnType<typeof fixture>) => {
        f.target.visible = false;
      },
    ]) {
      const f = fixture();
      change(f);
      expect(f.send("CONTENT_PREPARE_UI_COMPLETION")).toEqual({ ok: false });
    }
  });

  it("invalidates observations on scope changes, removal, relation changes and expiry", () => {
    for (const change of [
      (f: ReturnType<typeof fixture>) => f.setEpoch("new-epoch"),
      (f: ReturnType<typeof fixture>) =>
        f.setMatches([f.target, new Element()]),
      (f: ReturnType<typeof fixture>) => {
        f.target.isConnected = false;
      },
      (f: ReturnType<typeof fixture>) =>
        f.source.attributes.set("aria-controls", "other"),
      () => {
        vi.setSystemTime(Date.now() + 20_001);
      },
    ]) {
      vi.useFakeTimers();
      const f = fixture();
      expect(f.send("CONTENT_PREPARE_UI_COMPLETION")).toEqual({ ok: true });
      change(f);
      expect(f.send("CONTENT_VERIFY_UI_COMPLETION")).toEqual({ ok: false });
      vi.useRealTimers();
    }
  });

  it("observes native dialog opening and form-method-dialog closing", () => {
    const f = fixture();
    const dialog = new Dialog();
    f.source.attributes.set("aria-haspopup", "dialog");
    f.setMatches([dialog]);
    expect(f.send("CONTENT_PREPARE_UI_COMPLETION")).toEqual({ ok: true });
    expect(f.send("CONTENT_VERIFY_UI_COMPLETION")).toEqual({
      ok: true,
      matches: false,
    });
    dialog.open = true;
    expect(f.send("CONTENT_VERIFY_UI_COMPLETION")).toEqual({
      ok: true,
      matches: true,
    });
    f.send("CONTENT_RELEASE_UI_COMPLETION");
    f.source.attributes.delete("aria-controls");
    f.source.form = { method: "dialog" };
    f.source.type = "submit";
    f.source.dialog = dialog;
    expect(f.send("CONTENT_PREPARE_UI_COMPLETION")).toEqual({ ok: true });
    dialog.open = false;
    expect(f.send("CONTENT_VERIFY_UI_COMPLETION")).toEqual({
      ok: true,
      matches: true,
    });
  });
});
