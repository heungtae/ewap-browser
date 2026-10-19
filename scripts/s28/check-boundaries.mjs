import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { build } from "esbuild";
import { files, read, digest } from "../s26-inventory.mjs";
const list = files();
for (const file of list.filter((p) =>
  /^(apps\/.*\/src\/|packages\/shared\/src\/|extension\/tests\/unit\/migration\/s28\/).*\.ts$/.test(
    p,
  ),
)) {
  const text = await readFile(file, "utf8");
  assert.ok(text.trimEnd().split("\n").length <= 199, `source-size: ${file}`);
  if (file.startsWith("apps/agent-server/"))
    assert.ok(!/\bchrome\s*[.[]/.test(text), `Chrome in backend ${file}`);
}
for (const [file, expected] of Object.entries(
  read("docs/baselines/s27/entry.json").preservedSourceHashes,
))
  assert.equal(
    digest(await readFile(file)),
    expected,
    `preserved production/design ${file}`,
  );
for (const dir of ["sidepanel", "settings"])
  for (const file of await readdir(`apps/chrome-extension/ui/${dir}`)) {
    const target = await readFile(
      `apps/chrome-extension/ui/${dir}/${file}`,
      "utf8",
    );
    const legacy = await readFile(`extension/src/${dir}/${file}`, "utf8");
    if (file.endsWith(".html")) {
      assert.deepEqual(
        target.match(/<[^>]+>/g),
        legacy.match(/<[^>]+>/g),
        `UI structure ${dir}/${file}`,
      );
      assert.deepEqual(
        target.match(/<style>[\s\S]*?<\/style>/g),
        legacy.match(/<style>[\s\S]*?<\/style>/g),
        `inline styles ${file}`,
      );
    } else assert.equal(target, legacy, `UI style ${dir}/${file}`);
  }
for (const file of list.filter((p) =>
  p.startsWith("apps/chrome-extension/assets/"),
))
  assert.equal(
    digest(await readFile(file)),
    digest(
      await readFile(file.replace("apps/chrome-extension/", "extension/")),
    ),
    `asset ${file}`,
  );
const browser = await build({
  entryPoints: [
    "apps/chrome-extension/src/presentation/entry.ts",
    "apps/chrome-extension/src/bridge/worker.ts",
  ],
  platform: "browser",
  bundle: true,
  write: false,
  outdir: "/tmp/s28-boundary",
  metafile: true,
});
assert.ok(
  Object.keys(browser.metafile.inputs).every(
    (p) =>
      !/extension\/src\/(providers|policy|service-worker)|apps\/agent-server|packages\/task-engine/.test(
        p,
      ),
  ),
  "authority implementation in presentation",
);
assert.ok(
  Object.values(browser.metafile.outputs)
    .flatMap((v) => v.imports)
    .every((v) => !v.path.startsWith("node:")),
  "Node external in browser",
);
const backend = await build({
  entryPoints: ["apps/agent-server/src/native/launcher.ts"],
  platform: "node",
  bundle: true,
  write: false,
  metafile: true,
});
assert.ok(
  Object.keys(backend.metafile.inputs).every(
    (p) =>
      !p.startsWith("extension/") && !p.startsWith("apps/chrome-extension/"),
  ),
  "browser code in backend",
);
const manifest = JSON.parse(
  await readFile("dist/s28/chrome-extension/manifest.json", "utf8"),
);
assert.ok(manifest.permissions.includes("nativeMessaging"));
assert.equal(
  manifest.version,
  JSON.parse(await readFile("extension/manifest.json", "utf8")).version,
);
assert.ok(
  manifest.content_security_policy.extension_pages.includes(
    "script-src 'self'",
  ),
);
console.log(
  JSON.stringify({
    result: "PASS",
    preservedUI: true,
    productionAndDesign: "unchanged",
    browserModules: Object.keys(browser.metafile.inputs).length,
    backendModules: Object.keys(backend.metafile.inputs).length,
    protocolDigest: createHash("sha256")
      .update(await readFile("packages/shared/src/bridge.ts"))
      .digest("hex"),
  }),
);
