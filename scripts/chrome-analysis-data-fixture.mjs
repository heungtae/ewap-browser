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
        const content = isRouteClassifier
          ? '{"route":"ACTION_REQUIRED"}'
          : parsed.messages?.[0]?.content?.includes("ContextPilot in Act mode")
            ? "Act analysis fixture answer"
            : "Ask analysis fixture answer";
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify({ choices: [{ message: { content } }] }));
        return;
      }
      response.writeHead(200, { "content-type": "text/html" });
      response.end(`<!doctype html><main><h1>Quarterly data</h1>
        <table aria-label="Quarterly sales"><thead><tr><th>Region</th><th>Sales</th></tr></thead>
        <tbody><tr><td>North</td><td>12</td></tr><tr><td>South</td><td>9</td></tr><tr><td>West</td><td>15</td></tr></tbody></table>
        <button>Save report</button><input type="password" value="not-for-provider"></main>`);
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
  return { fixture, fixturePort };
};
