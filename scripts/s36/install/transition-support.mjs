import { readFileSync } from "node:fs";
import { installationFixture } from "./support.mjs";
import { releaseFixture } from "../release/support.mjs";
import {
  captureReleaseSet,
  releaseSetId,
} from "../../../dist/s36/release-set.mjs";
export function switchFixture() {
  const f = installationFixture(),
    target = releaseFixture();
  const manifest = JSON.parse(
    readFileSync(`${target.root}/chrome-extension/manifest.json`, "utf8"),
  );
  target.write("chrome-extension/manifest.json", {
    ...manifest,
    version: "0.1.118",
  });
  target.write("dependencies/package.json", { version: "0.1.118" });
  target.write(
    "agent-server/launcher.cjs",
    "// synthetic alternate-release backend\n",
  );
  const next = captureReleaseSet(target.root, target.manifest.source);
  target.write("release-set.json", next);
  const to = {
    ...f.input,
    releaseDirectory: target.root,
    releaseId: releaseSetId(next),
  };
  return {
    ...f,
    from: f.input,
    to,
    target,
    close() {
      target.close();
      f.close();
    },
  };
}
