import { createS1Fixture } from "./chrome-s1-fixture.mjs";

export const createS3Fixture = async (certificateDirectory) => {
  const captures = [];
  let hold = false;
  let aborted = false;
  const fixture = await createS1Fixture(
    certificateDirectory,
    "<!doctype html><main><h1>S3 Provider fixture</h1><button>Inspect</button></main>",
    async (request, response, body) => {
      const number = captures.length + 1;
      captures.push({
        path: request.url,
        headers: { ...request.headers },
        body,
      });
      response.writeHead(200, {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
        "access-control-allow-origin": "*",
      });
      const text = hold ? "S3 partial stop" : `S3 fixture answer ${number}`;
      const event =
        request.url === "/v1/responses"
          ? { type: "response.output_text.delta", delta: text }
          : { choices: [{ delta: { content: text } }] };
      response.write(`data: ${JSON.stringify(event)}\n\n`);
      if (hold) {
        response.on("close", () => {
          aborted = true;
        });
      } else {
        response.end("data: [DONE]\n\n");
      }
    },
  );
  return {
    ...fixture,
    captures,
    setHold(value) {
      hold = value;
      aborted = false;
    },
    wasAborted: () => aborted,
  };
};
