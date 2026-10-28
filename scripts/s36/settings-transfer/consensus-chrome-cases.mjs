import assert from "node:assert/strict";
import { evaluate } from "../../chrome-cdp-utils.mjs";
import { build } from "esbuild";
export async function qualifyConsensus(panel) {
  const validated = await evaluate(
    panel,
    "S36Settings.consensusClient().validate({...S36Settings.ownerCandidate(),phase:'copying',revision:1}).then(v=>(globalThis.s36Validated=v,v))",
  );
  assert.equal(validated.phase, "validated");
  assert.equal(validated.revision, 2);
  assert.deepEqual(validated.acknowledgments, {});
  const agreed = await evaluate(
    panel,
    "S36Settings.consensusClient().acknowledge(globalThis.s36Validated).then(v=>(globalThis.s36Agreed=v,v))",
  );
  assert.equal(agreed.revision, 3);
  assert.match(agreed.acknowledgments.extension, /^[a-f0-9]{64}$/);
  assert.equal(
    agreed.acknowledgments.extension,
    agreed.acknowledgments.backend,
  );
  assert.equal(
    (
      await evaluate(
        panel,
        "S36Settings.consensusClient().acknowledge(globalThis.s36Validated)",
      )
    ).revision,
    3,
  );
  assert.equal(
    (
      await evaluate(
        panel,
        "S36Settings.consensusClient().validate(globalThis.s36Agreed)",
      )
    ).revision,
    3,
  );
  await evaluate(
    panel,
    "S36Settings.observedConsensus().then(v=>(globalThis.s36Observed=v,true))",
  );
  assert.equal(
    (
      await evaluate(
        panel,
        "globalThis.s36Observed.client.validate(globalThis.s36Agreed)",
      )
    ).revision,
    3,
  );
  const fixture = await build({
    entryPoints: ["extension/tests/fixture/s36/source-watch-chrome.ts"],
    bundle: true,
    write: false,
    platform: "browser",
    format: "iife",
    globalName: "S36SourceWatch",
  });
  await evaluate(panel, fixture.outputFiles[0].text);
  assert.equal(await evaluate(panel, "S36SourceWatch.run()"), true);
  const count = await evaluate(panel, "globalThis.s36Observed.count()");
  assert.equal(
    await evaluate(
      panel,
      "globalThis.s36Observed.client.validate(globalThis.s36Agreed).then(()=> 'ACCEPTED',e=>e.message)",
    ),
    "MIGRATION_SOURCE_CHANGED",
  );
  assert.equal(await evaluate(panel, "globalThis.s36Observed.count()"), count);
  await evaluate(panel, "globalThis.s36Observed.dispose(); true");
}
