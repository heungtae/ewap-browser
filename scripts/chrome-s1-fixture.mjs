import { execFile } from "node:child_process";
import { generateKeyPairSync, sign } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createServer } from "node:https";
import { join } from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);
const encoded = (value) =>
  Buffer.from(JSON.stringify(value)).toString("base64url");
const readBody = async (request) => {
  let body = "";
  for await (const chunk of request) body += chunk;
  return JSON.parse(body);
};
const page = `<!doctype html><main><h1>Case S1</h1>
  <label for="case-name">Case name</label><input id="case-name" value="Public case">
  <button id="inspect">Inspect</button><a href="/next">Next case</a>
  <label for="password">Password</label><input id="password" type="password" value="S1_SECRET_PASSWORD">
  <label for="otp">OTP</label><input id="otp" autocomplete="one-time-code" value="S1_SECRET_OTP">
  <label for="token">Token</label><input id="token" name="token" value="S1_SECRET_TOKEN">
  <label for="recovery">Recovery code</label><input id="recovery" name="recovery_code" value="S1_SECRET_RECOVERY">
  </main>`;

export const createS1Fixture = async (
  certificateDirectory,
  pageHtml = page,
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
    "/CN=s1.fixture.test",
  ]);
  const keys = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const privateKey = keys.privateKey.export({ type: "pkcs8", format: "pem" });
  const publicKey = keys.publicKey.export({ type: "spki", format: "pem" });
  const providerRequests = [];
  let invalidSignature = false;
  let resolveCount = 0;
  let credentialHeaderCount = 0;
  const signed = (payload) => {
    const header = encoded({
      alg: "ES256",
      typ: "company-page-profile+jws",
      kid: "s1",
    });
    const body = encoded(payload);
    const signature = sign("sha256", Buffer.from(`${header}.${body}`), {
      key: privateKey,
      dsaEncoding: "ieee-p1363",
    }).toString("base64url");
    const broken = `${signature[0] === "A" ? "B" : "A"}${signature.slice(1)}`;
    return `${header}.${body}.${invalidSignature ? broken : signature}`;
  };
  const fixture = createServer(
    {
      key: await readFile(join(certificateDirectory, "key.pem")),
      cert: await readFile(join(certificateDirectory, "cert.pem")),
    },
    async (request, response) => {
      if (request.method === "OPTIONS") {
        response.writeHead(204, {
          "access-control-allow-origin": "*",
          "access-control-allow-methods": "POST, GET, OPTIONS",
          "access-control-allow-headers": "content-type",
        });
        response.end();
        return;
      }
      if (request.url === "/v1/resolve" && request.method === "POST") {
        resolveCount += 1;
        if (request.headers.cookie || request.headers.authorization)
          credentialHeaderCount += 1;
        const input = await readBody(request);
        const now = Date.now();
        response.writeHead(200, {
          "content-type": "application/jose",
          "access-control-allow-origin": "*",
        });
        response.end(
          signed({
            schema_version: 1,
            resolution: "MATCHED",
            iss: "s1-fixture",
            aud: input.deployment_id,
            resolver_request_nonce: input.resolver_request_nonce,
            page_context_digest: input.page.page_context_digest,
            issued_at: new Date(now).toISOString(),
            expires_at: new Date(now + 60_000).toISOString(),
            profile_id: "s1-profile",
            profile_version: 1,
            matcher: { origin: input.page.origin, path_prefix: "/" },
            fingerprint: {
              alg: "semantic-projection-fp-v1",
              value: input.page.fingerprint,
            },
            tools: [],
            business_mcp: [],
            authoritative_fields: [],
          }),
        );
        return;
      }
      if (request.url === "/v1/chat/completions" && request.method === "POST") {
        if (request.headers.cookie || request.headers.authorization)
          credentialHeaderCount += 1;
        providerRequests.push(await readBody(request));
        response.writeHead(200, {
          "content-type": "application/json",
          "access-control-allow-origin": "*",
        });
        response.end(
          JSON.stringify({
            choices: [{ message: { content: "S1 fixture answer" } }],
          }),
        );
        return;
      }
      response.writeHead(200, {
        "content-type": "text/html",
        "set-cookie":
          "session=S1_SECRET_COOKIE; Secure; HttpOnly; SameSite=Lax",
      });
      response.end(pageHtml);
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
    publicKey: publicKey.toString(),
    providerRequests,
    setInvalidSignature: (value) => {
      invalidSignature = value;
    },
    resolveCount: () => resolveCount,
    credentialHeaderCount: () => credentialHeaderCount,
  };
};
