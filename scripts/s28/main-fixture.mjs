import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { createServer } from "node:https";
import { promisify } from "node:util";
export async function createMainFixture(directory) {
  await promisify(execFile)("openssl", [
    "req",
    "-x509",
    "-newkey",
    "rsa:2048",
    "-nodes",
    "-keyout",
    `${directory}/key.pem`,
    "-out",
    `${directory}/cert.pem`,
    "-days",
    "1",
    "-subj",
    "/CN=page-api-fixture.invalid",
  ]);
  const fixture = createServer(
    {
      key: await readFile(`${directory}/key.pem`),
      cert: await readFile(`${directory}/cert.pem`),
    },
    (request, response) => {
      response.writeHead(200, { "content-type": "text/html" });
      response.end(
        request.url === "/variant"
          ? `<!doctype html><title>S28 MAIN fixture</title>
      <main>Controlled MAIN fixture</main><script>
      window.fixtureCalls=0;window.fixtureGetters=0;window.variant='low';
      window.demoControls={apiVersion:1,selectVariant:async function(value){fixtureCalls++;variant=value}};
      window.appData={apiVersion:1,readSummary:async function(){return {records:[{category:'Fixture',count:3}],total:1,eof:true}}};
      window.fixtureApp={add:function add(amount){fixtureCalls++;return amount+1},
        descriptor:function descriptor(){return Object.defineProperty({safe:'ok'},'hidden',{enumerable:true,get(){fixtureGetters++;return 'hidden'}})}};
      Object.defineProperty(window,'fixtureAccessor',{enumerable:true,get(){fixtureGetters++;return {bad:true}}});
      </script>`
          : "<!doctype html><title>New MAIN document</title><main>New document</main>",
      );
    },
  );
  await new Promise((resolve, reject) => {
    fixture.once("error", reject);
    fixture.listen(0, "127.0.0.1", resolve);
  });
  return { fixture, port: fixture.address().port };
}
