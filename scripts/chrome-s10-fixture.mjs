import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { createServer } from "node:https";
import { join } from "node:path";
import { promisify } from "node:util";

export const createS10Fixture = async (directory, captures) => {
  await promisify(execFile)("openssl", [
    "req",
    "-x509",
    "-newkey",
    "rsa:2048",
    "-nodes",
    "-keyout",
    join(directory, "key.pem"),
    "-out",
    join(directory, "cert.pem"),
    "-days",
    "1",
    "-subj",
    "/CN=page-api-fixture.invalid",
  ]);
  const fixture = createServer(
    {
      key: await readFile(join(directory, "key.pem")),
      cert: await readFile(join(directory, "cert.pem")),
    },
    async (request, response) => {
      if (request.url === "/v1/chat/completions") {
        let body = "";
        for await (const part of request) body += part;
        const parsed = JSON.parse(body);
        captures.push(parsed);
        const tool = parsed.tools?.find(
          (item) => item.function.name === "propose_page_api",
        );
        const message = tool
          ? {
              tool_calls: [
                {
                  id: "s10-call-abcdefghijklmnop",
                  type: "function",
                  function: {
                    name: "propose_page_api",
                    arguments: JSON.stringify({
                      action_ref:
                        tool.function.parameters.properties.action_ref.enum[0],
                      option_id: "high",
                      approval_scope: "single_step",
                      approval_reason: "선택 상태를 확인합니다.",
                    }),
                  },
                },
              ],
            }
          : { content: '{"route":"ACTION_REQUIRED"}' };
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify({ choices: [{ message }] }));
        return;
      }
      response.writeHead(200, { "content-type": "text/html" });
      response.end(`<!doctype html><title>S10 public UI</title><main><h1>Variant</h1><select aria-label="Variant"><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select><p id="status">Ready</p></main><script>
      window.callCount=0;window.readCount=0;window.mode='normal';
      window.demoControls={apiVersion:1,selectVariant:async function(option){
        if(this !== window.demoControls)throw Error('receiver lost');
        window.callCount++;
        if(window.mode==='hang')return new Promise(()=>{});
        if(window.mode==='throw')throw Error('S10_SECRET_ERROR');
        if(window.mode==='fake')return {ok:true,token:'S10_SECRET_RETURN'};
        if(window.mode==='delay')await new Promise(resolve=>setTimeout(resolve,1000));
        document.querySelector('select').value=option;
        document.querySelector('#status').textContent='Selected';
        if(window.mode==='scope')history.pushState({},'',location.pathname+'#changed');
        return {ok:true,token:'S10_SECRET_RETURN'};
      }};
      window.appData={apiVersion:1,readSummary:async function(option){window.readCount++;return {records:[{category:'North',count:12},{category:'South',count:9}],total:2,eof:true};}};
    </script>`);
    },
  );
  await new Promise((resolve, reject) => {
    fixture.once("error", reject);
    fixture.listen(0, "127.0.0.1", resolve);
  });
  return { fixture, fixturePort: fixture.address().port };
};
