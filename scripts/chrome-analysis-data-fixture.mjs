import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { createServer } from "node:https";
import { join } from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);

export const createAnalysisFixture = async (
  certificateDirectory,
  providerRequests,
) => {
  const control = { mode: "normal", release: undefined };
  await run("openssl", [
    "req",
    "-x509",
    "-newkey",
    "rsa:2048",
    "-nodes",
    "-keyout",
    join(certificateDirectory, "key.pem"),
    "-out",
    join(certificateDirectory, "cert.pem"),
    "-days",
    "1",
    "-subj",
    "/CN=analysis.fixture.test",
  ]);
  const fixture = createServer(
    {
      key: await readFile(join(certificateDirectory, "key.pem")),
      cert: await readFile(join(certificateDirectory, "cert.pem")),
    },
    async (request, response) => {
      if (request.url === "/v1/chat/completions" && request.method === "POST") {
        let body = "";
        for await (const chunk of request) body += chunk;
        const parsed = JSON.parse(body);
        providerRequests.push(parsed);
        const isRouteClassifier = parsed.messages?.[0]?.content?.includes(
          "Classify the user's browser request",
        );
        const held = !isRouteClassifier && control.mode === "hold";
        if (held) {
          await new Promise((resolve) => {
            control.release = resolve;
          });
          control.release = undefined;
        }
        const content = isRouteClassifier
          ? JSON.stringify({
              route: parsed.messages?.at(-1)?.content?.includes("분석만")
                ? "ANALYSIS_READ_REQUIRED"
                : "ACTION_REQUIRED",
            })
          : parsed.messages?.[0]?.content?.includes("ContextPilot in Act mode")
            ? "Act analysis fixture answer"
            : "Ask analysis fixture answer";
        response.writeHead(200, { "content-type": "application/json" });
        const proposal =
          !isRouteClassifier &&
          control.mode === "proposal" &&
          parsed.tools?.find((tool) => tool.function.name === "propose_click");
        const message = held
          ? { content: "S13_LATE_ANSWER" }
          : proposal
            ? {
                content: "S13 proposed save",
                tool_calls: [
                  {
                    id: "s13-call-abcdefghijklmnop",
                    type: "function",
                    function: {
                      name: "propose_click",
                      arguments: JSON.stringify({
                        target:
                          proposal.function.parameters.properties.target
                            .enum[0],
                        approval_scope: "single_step",
                        approval_reason: "검토 후 저장합니다.",
                      }),
                    },
                  },
                ],
              }
            : { content };
        response.end(JSON.stringify({ choices: [{ message }] }));
        return;
      }
      response.writeHead(200, { "content-type": "text/html" });
      const url = new URL(request.url, "https://fixture.invalid");
      if (url.pathname === "/variant") {
        response.end(`<!doctype html><main><h1>API summary</h1>${url.searchParams.has("multi") ? "<table><tr><td>DOM_SOURCE</td><td>3</td></tr></table>" : ""}<button onclick="window.saveCount++">Save report</button></main><script>
          window.readCount=0;window.saveCount=0;window.readMode='normal';
          window.appData={apiVersion:1,readSummary:async function(){
            readCount++;
            if(readMode==='hang')return new Promise(()=>{});
            if(readMode==='delay')await new Promise(resolve=>setTimeout(resolve,1000));
            if(readMode==='invalid')return {records:[{category:'S13_PRIVATE_RECORD',count:12,token:'S13_SECRET_TOKEN'}],total:1,eof:true};
            const records=readMode==='cap'?Array.from({length:101},(_,index)=>({category:'S13_PRIVATE_RECORD '+index,count:index})):[{category:'S13_PRIVATE_RECORD',count:12}];
            return {records,total:readMode==='partial'?10:records.length,eof:readMode!=='partial'};
          }};
        </script>`);
        return;
      }
      if (url.pathname === "/unreviewed") {
        response.end(
          `<!doctype html><main>Unreviewed data</main><script>window.readCount=0;window.appData={arbitraryRead:()=>{readCount++;return {token:'S13_SECRET_TOKEN'}}};</script>`,
        );
        return;
      }
      if (url.pathname === "/large") {
        response.end(
          "<!doctype html><main><table>" +
            Array.from(
              { length: 101 },
              (_, index) =>
                "<tr><td>Row " + index + "</td><td>" + index + "</td></tr>",
            ).join("") +
            "</table></main>",
        );
        return;
      }
      if (url.pathname === "/chart") {
        response.end(
          '<!doctype html><main><svg width="300" height="150"><text x="10" y="30">Accessible chart value 12</text></svg></main>',
        );
        return;
      }
      if (url.pathname === "/canvas") {
        response.end(
          '<!doctype html><main><canvas width="300" height="150" aria-label="Opaque chart"></canvas></main>',
        );
        return;
      }
      if (url.pathname === "/paged") {
        response.end(
          '<!doctype html><main><table><tr><td>Page one</td></tr><tfoot><tr><td><nav aria-label="paging"><button>Next</button></nav></td></tr></tfoot></table></main>',
        );
        return;
      }

      response.end(
        request.url === "/multi"
          ? `<!doctype html><main><h1>Multiple data sources</h1>
            <table aria-label="First dataset"><thead><tr><th>Source</th><th>Value</th></tr></thead>
            <tbody><tr><td>UNSELECTED_ALPHA</td><td>11</td></tr><tr><td>Alpha detail</td><td>12</td></tr></tbody></table>
            <table aria-label="Second dataset"><thead><tr><th>Source</th><th>Value</th></tr></thead>
            <tbody><tr><td>SELECTED_BETA</td><td>21</td></tr><tr><td>Beta detail</td><td>22</td></tr></tbody></table>
            <button>Save report</button></main>`
          : `<!doctype html><main><h1>Quarterly data</h1>
            <table aria-label="Quarterly sales"><thead><tr><th>Region</th><th>Sales</th></tr></thead>
            <tbody><tr><td>North</td><td>12</td></tr><tr><td>South</td><td>9</td></tr><tr><td>West</td><td>15</td></tr></tbody></table>
            <button>Save report</button><input type="password" value="not-for-provider"></main>`,
      );
    },
  );
  const fixturePort = await new Promise((resolvePort, reject) => {
    fixture.once("error", reject);
    fixture.listen(0, "127.0.0.1", () => {
      const address = fixture.address();
      if (!address || typeof address === "string") reject(new Error("no port"));
      else resolvePort(address.port);
    });
  });
  return { fixture, fixturePort, control };
};
