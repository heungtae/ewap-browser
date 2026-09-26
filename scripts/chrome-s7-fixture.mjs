import { createS1Fixture } from "./chrome-s1-fixture.mjs";

const pages = {
  case: `<!doctype html><main><h1>Case desk</h1>
    <button id="target">Archive case</button>
    <button style="display:none">Hidden archive</button>
    <label>Public note <input id="note" value="Open"></label>
    <input type="password" value="S7_SECRET_PASSWORD">
    <p id="result">Open case</p>
    <script>
      document.querySelector('#target').addEventListener('click', event => {
        if (!event.isTrusted) return;
        event.currentTarget.dataset.trusted = 'yes';
        event.currentTarget.disabled = true;
        document.querySelector('#result').textContent = 'Archived case';
      });
      document.querySelector('#note').addEventListener('beforeinput', event => {
        if (event.isTrusted) event.currentTarget.dataset.trusted = 'yes';
        else event.preventDefault();
      });
    </script></main>`,
  invoice: `<!doctype html><main><h1>Invoice desk</h1>
    <button id="target">Submit invoice</button>
    <button style="display:none">Hidden invoice</button>
    <label>Public note <input id="note" value="Draft"></label>
    <input type="password" value="S7_SECRET_PASSWORD">
    <p id="result">Draft invoice</p>
    <script>
      document.querySelector('#target').addEventListener('click', event => {
        if (!event.isTrusted) return;
        event.currentTarget.dataset.trusted = 'yes';
        event.currentTarget.disabled = true;
        document.querySelector('#result').textContent = 'Submitted invoice';
      });
    </script></main>`,
  note: `<!doctype html><main><h1>Note desk</h1>
    <label>Public note <input id="note" value="Draft"></label>
    <input type="password" value="S7_SECRET_PASSWORD">
    <script>
      document.querySelector('#note').addEventListener('beforeinput', event => {
        if (event.isTrusted) event.currentTarget.dataset.trusted = 'yes';
        else event.preventDefault();
      });
    </script></main>`,
};
const actionTool = (kind) => [
  {
    tool: "click_by_ref",
    effect: kind === "invoice" ? "server-side" : "local-ui-only",
    risk: kind === "invoice" ? "R2" : "R1",
    eligible_roles: ["button"],
    verifier: {
      kind: "semantic-state-transition",
      declaration_id: `${kind}-click-v1`,
      pre_state_digest: "",
      required_changes: [
        { ref_id: "$target", field: "disabled", expected: true },
      ],
    },
  },
];
const stream = (response, delta) => {
  response.writeHead(200, {
    "content-type": "text/event-stream",
    "cache-control": "no-cache",
    "access-control-allow-origin": "*",
  });
  response.end(
    `data: ${JSON.stringify({ choices: [{ delta }] })}\n\ndata: [DONE]\n\n`,
  );
};
const projection = (body) => {
  const user = body.messages?.findLast((item) => item.role === "user");
  const match = user?.content?.match(
    /\[UNTRUSTED_PAGE_PROJECTION\]\n([^]*?)\n\[\/UNTRUSTED_PAGE_PROJECTION\]/,
  );
  return match ? JSON.parse(match[1]) : undefined;
};

export const createS7Fixture = (certificateDirectory, kind) => {
  if (!(kind in pages) && !["tampered", "unverifiable"].includes(kind))
    throw new Error("S7_FIXTURE_KIND_UNKNOWN");
  return createS1Fixture(
    certificateDirectory,
    pages[kind] ?? pages.case,
    async (_request, response, body) => {
      if (
        body.messages?.[0]?.content?.includes(
          "Classify the user's browser request",
        )
      ) {
        stream(response, { content: '{"route":"ACTION_REQUIRED"}' });
        return;
      }
      if (body.messages?.some((item) => item.role === "tool")) {
        stream(response, { content: "S7 action complete" });
        return;
      }
      const name =
        kind === "invoice"
          ? "Submit invoice"
          : kind === "note"
            ? "Public note"
            : "Archive case";
      const modelRef = projection(body)?.nodes?.find(
        (node) =>
          node.name === name &&
          node.role === (kind === "note" ? "textbox" : "button"),
      )?.model_ref;
      if (!modelRef) throw new Error("S7_MODEL_REF_MISSING");
      stream(response, {
        tool_calls: [
          {
            id: "s7-proposal-abcdefghijkl",
            type: "function",
            function: {
              name: kind === "note" ? "propose_set_text" : "propose_click",
              arguments: JSON.stringify({
                target: modelRef,
                approval_scope: "single_step",
                approval_reason: "요청한 작업을 현재 페이지에서 실행합니다.",
              }),
            },
          },
        ],
      });
    },
    kind === "note" || kind === "unverifiable"
      ? []
      : actionTool(kind === "tampered" ? "invoice" : kind),
  );
};
