import assert from "node:assert/strict";
import { verifyNavigationDiagnostics } from "./chrome-navigation-diagnostics.mjs";
import { mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { navigationFixturePage } from "./chrome-navigation-confirmation-fixture.mjs";
import { createS1Fixture } from "./chrome-s1-fixture.mjs";
import { openS19Chrome } from "./chrome-s19-harness.mjs";
import { evaluate, sleep, cdp } from "./chrome-cdp-utils.mjs";
import { s21Completion, verifyS21Ui, s21BuildHash } from "./chrome-s21-ui.mjs";

const wrongDestination = process.env.NAVIGATION_CASE === "wrong-destination";
const urlTransition = process.env.NAVIGATION_CASE === "url-transition";
const calls = [];
let sequence = 0;
const cert = await mkdtemp(
  join(tmpdir(), "contextpilot-navigation-confirmation-"),
);
const fixture = await createS1Fixture(
  cert,
  (url) => navigationFixturePage(url, wrongDestination, urlTransition),
  async (_req, res, body) => {
    const tool = (name) =>
      body.tools?.find((candidate) => candidate.function.name === name);
    let message;
    if (body.messages[0]?.content?.includes("Classify the user")) {
      message = { content: JSON.stringify({ route: "ACTION_REQUIRED" }) };
    } else {
      const navigation = tool("propose_navigate"),
        goal = tool("report_goal_status");
      let name, args;
      if (goal) {
        const schema = goal.function.parameters;
        name = "report_goal_status";
        args = {
          status: "completed",
          summary: wrongDestination
            ? "The observed destination satisfies the requested goal."
            : "The approved destination is reached.",
          observation_id: schema.properties.observation_id.enum[0],
          ...(schema.properties.evidence_refs
            ? {
                evidence_refs: schema.properties.evidence_refs.items.enum.slice(
                  0,
                  1,
                ),
              }
            : {}),
        };
        await sleep(1800);
      } else {
        assert.ok(navigation, "Expected one approved navigation proposal");
        name = "propose_navigate";
        args = {
          target: navigation.function.parameters.properties.target.enum[0],
          approval_scope: "session",
          approval_reason: "Open the requested destination",
        };
      }
      const inventory = body.messages.findLast((m) =>
        m.content.startsWith("[UNTRUSTED_EXECUTION_INVENTORY]"),
      );
      calls.push({
        name,
        evidence: inventory
          ? JSON.parse(inventory.content.split("\n")[1]).execution_evidence
          : [],
        args,
      });
      message = {
        content: "",
        tool_calls: [
          {
            id: `navigation-${++sequence}-abcdefghijklmnop`,
            type: "function",
            function: { name, arguments: JSON.stringify(args) },
          },
        ],
      };
    }
    res.writeHead(200, {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
    });
    res.end(JSON.stringify({ choices: [{ message }] }));
  },
);
const harness = await openS19Chrome({
  executable: process.env.CHROME_FOR_TESTING_BIN,
  fixture,
});
try {
  await evaluate(
    harness.panel,
    `(()=>{document.querySelector('#mode-act').click();document.querySelector('#chat-input').value='Open Approved destination and confirm arrival.';document.querySelector('#chat-form').requestSubmit();return true})()`,
  );
  const deadline = Date.now() + 60000;
  let settled = false;
  while (Date.now() < deadline) {
    await sleep(200);
    await evaluate(
      harness.panel,
      `(()=>{for(const card of [...document.querySelectorAll('.event-card')].filter(c=>c.dataset.testSeen!=='1')){const button=[...card.querySelectorAll('button')].find(b=>!b.disabled&&['이번 요청에 허용','일반 한 단계 실행','이번 단계 실행','확인하고 실행','이번만 허용','계획 승인','한 번 승인하고 계속 실행'].some(label=>b.textContent.includes(label)));if(button){card.dataset.testSeen='1';button.click()}}return true})()`,
    );
    if (
      calls.some((call) => call.name === "report_goal_status") &&
      (await evaluate(
        harness.panel,
        "document.querySelector('#chat-send').dataset.state==='send'",
      ))
    ) {
      settled = true;
      break;
    }
  }
  assert.ok(settled, "Navigation completion did not settle");
  const accepted = await s21Completion(harness);
  assert.equal(
    calls.filter((call) => call.name === "propose_navigate").length,
    1,
  );
  assert.ok(
    calls.some((call) =>
      call.evidence.some(
        (e) =>
          e.raw_outcome === "UNKNOWN" &&
          e.dispatch === "dispatched" &&
          e.navigation_binding,
      ),
    ),
    "Must reproduce dispatched UNKNOWN navigation",
  );
  assert.equal(
    accepted?.completion?.goal_status,
    "completed",
    JSON.stringify(accepted),
  );
  const visible = await verifyS21Ui(harness, "completed");
  if (process.env.NAVIGATION_SCREENSHOT) {
    const screenshot = await cdp(
      harness.panel.webSocketDebuggerUrl,
      "Page.captureScreenshot",
      { format: "png" },
    );
    await writeFile(
      process.env.NAVIGATION_SCREENSHOT,
      Buffer.from(screenshot.data, "base64"),
    );
  }
  const diagnostics = await verifyNavigationDiagnostics(
    harness,
    wrongDestination,
    urlTransition,
  );
  const result = {
    diagnostics,
    issue: "ISS-20261011-004",
    case: urlTransition
      ? "url-transition"
      : wrongDestination
        ? "wrong-destination"
        : "late-destination",
    scope: "controlled Chrome/provider fixture",
    build: await s21BuildHash(),
    proposal_calls: 1,
    goal_calls: calls.filter((call) => call.name === "report_goal_status")
      .length,
    raw_unknown_observed: true,
    accepted,
    visible_completion: !!visible,
    version: JSON.parse(await readFile("extension/manifest.json", "utf8"))
      .version,
  };
  if (process.env.NAVIGATION_EVIDENCE_PATH)
    await writeFile(
      process.env.NAVIGATION_EVIDENCE_PATH,
      JSON.stringify(result, null, 2) + "\n",
    );
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.error(
    error,
    JSON.stringify({ calls, terminal: await s21Completion(harness) }),
  );
  throw error;
} finally {
  await harness.close();
  await new Promise((resolve) => fixture.fixture.close(resolve));
  await rm(cert, { recursive: true, force: true });
}
