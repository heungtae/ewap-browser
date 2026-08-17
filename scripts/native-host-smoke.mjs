import { spawn } from "node:child_process";

const frame = (request) => {
  const body = Buffer.from(JSON.stringify(request));
  const result = Buffer.alloc(body.length + 4);
  result.writeUInt32LE(body.length);
  body.copy(result, 4);
  return result;
};
const runFrames = async (requests) => {
  const child = spawn("dotnet", [
    "native-host/bin/Debug/net8.0/ContextPilot.Host.dll",
  ]);
  const chunks = [];
  child.stdout.on("data", (chunk) => chunks.push(chunk));
  child.stdin.end(Buffer.concat(requests.map(frame)));
  const exitCode = await new Promise((resolve) => child.on("close", resolve));
  if (exitCode !== 0) throw new Error(`native host exited ${exitCode}`);
  const output = Buffer.concat(chunks);
  let offset = 0;
  const responses = [];
  while (offset < output.length) {
    const responseSize = output.readUInt32LE(offset);
    const next = offset + 4 + responseSize;
    if (next > output.length)
      throw new Error("native host emitted a truncated frame");
    responses.push(JSON.parse(output.subarray(offset + 4, next)));
    offset = next;
  }
  return responses;
};
const responses = await runFrames([
  { request_id: "native-smoke-request-1", kind: "ASK_INTERPRETATION" },
  { request_id: "native-smoke-request-2", kind: "BIND_SESSION" },
]);
if (
  responses.length !== 2 ||
  responses.some((response) => response.error_code !== "AI_HUB_NOT_CONFIGURED")
) {
  throw new Error("native host did not fail closed for every framed request");
}
const duplicateResponses = await runFrames([
  { request_id: "native-smoke-duplicate", kind: "ASK_INTERPRETATION" },
  { request_id: "native-smoke-duplicate", kind: "ASK_INTERPRETATION" },
]);
if (duplicateResponses.length !== 1)
  throw new Error("native host accepted a duplicate request ID");
const rawReferenceResponses = await runFrames([
  {
    request_id: "native-smoke-raw-reference",
    kind: "ASK_INTERPRETATION",
    ref_id: "must-not-cross-native-boundary",
  },
]);
if (rawReferenceResponses.length !== 0)
  throw new Error("native host accepted a raw DOM reference");
console.log("native persistent framing no-config smoke passed");
