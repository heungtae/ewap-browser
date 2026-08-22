import { createServer } from "node:http";
import { stat } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../examples/semiconductor-demo",
);
const port = Number(process.env.CONTEXTPILOT_DEMO_PORT ?? "8443");
const contentType = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
};
createServer(async (request, response) => {
  const requested = new URL(request.url ?? "/", "http://127.0.0.1").pathname;
  const relative = requested === "/" ? "index.html" : requested.slice(1);
  const target = resolve(root, relative);
  if (!target.startsWith(`${root}/`)) {
    response.writeHead(403);
    response.end();
    return;
  }
  try {
    if (!(await stat(target)).isFile()) throw new Error("not-file");
    response.writeHead(200, {
      "content-type":
        contentType[extname(target)] ?? "application/octet-stream",
      "cache-control": "no-store",
    });
    createReadStream(target).pipe(response);
  } catch {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("Not found");
  }
}).listen(port, "127.0.0.1", () =>
  console.log(`Asteron demo: http://127.0.0.1:${port}/`),
);
