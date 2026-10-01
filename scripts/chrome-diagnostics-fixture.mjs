import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { createServer } from "node:https";
import { join } from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);

export const createDiagnosticsFixture = async (
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
  let failure = false;
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
        if (failure) {
          response.writeHead(503);
          response.end("DIAGNOSTICS_SECRET_ERROR_BODY");
          return;
        }
        const content = "DIAGNOSTICS_SECRET_RESPONSE";
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify({ choices: [{ message: { content } }] }));
        return;
      }
      response.writeHead(200, { "content-type": "text/html" });
      response.end(`<!doctype html><title>DIAGNOSTICS_SECRET_TITLE</title>
        <main><table>${Array.from({ length: 25 }, (_, row) => `<tr>${Array.from({ length: 6 }, (_, column) => `<td>DIAGNOSTICS_SECRET_CELL_${row}_${column}</td>`).join("")}</tr>`).join("")}</table>
        <input type="password" value="DIAGNOSTICS_SECRET_PASSWORD"><script>window.fixtureSecret="DIAGNOSTICS_SECRET_SCRIPT";</script></main>`);
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
  return {
    fixture,
    fixturePort,
    setFailure: (value) => {
      failure = value;
    },
  };
};
