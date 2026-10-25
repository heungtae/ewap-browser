import {
  appendFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { resolve } from "node:path";
import {
  captureReleaseSet,
  releaseSetId,
  verifyReleaseSet,
} from "../../../dist/s36/release-set.mjs";
import { git } from "../../s26-inventory.mjs";
const [sourceDirectory, sourceId, destination, evidence] =
  process.argv.slice(2);
if (!sourceDirectory || !sourceId || !destination || !evidence)
  throw new Error(
    "SOURCE_DIRECTORY PINNED_SOURCE_ID TARGET_DIRECTORY EVIDENCE_DIRECTORY required",
  );
const source = resolve(sourceDirectory),
  target = resolve(destination);
const previous = verifyReleaseSet(source, sourceId);
if (existsSync(target)) throw new Error("OUTPUT_EXISTS");
cpSync(source, target, { recursive: true });
// Deliberately distinguish bytes while retaining the same actual S28 code/protocol.
// This is a controlled fixture variant, never a claim of a separately built product version.
appendFileSync(
  `${target}/agent-server/launcher.cjs`,
  "\n// S36 controlled transition fixture variant; same S28 bridge implementation.\n",
);
const manifest = captureReleaseSet(target, previous.source);
writeFileSync(
  `${target}/release-set.json`,
  JSON.stringify(manifest, null, 2) + "\n",
);
const targetId = releaseSetId(manifest);
verifyReleaseSet(target, targetId);
mkdirSync(evidence, { recursive: true });
for (const [name, directory] of [
  ["source", source],
  ["target", target],
])
  writeFileSync(
    `${evidence}/${name}-release-set.json`,
    readFileSync(`${directory}/release-set.json`),
  );
const report = {
  result: "PASS",
  revision: git("rev-parse", "HEAD").trim(),
  worktreeDirty: Boolean(git("status", "--porcelain").trim()),
  sourceDirectory: source,
  sourceId,
  targetDirectory: target,
  targetId,
  versions: manifest.versions,
  variant:
    "appended fixture-only backend comment; same S28 executable implementation and protocol",
  scope:
    "controlled artifact-set transition, not cross-version product qualification",
  delivered: false,
};
writeFileSync(
  `${evidence}/report.json`,
  JSON.stringify(report, null, 2) + "\n",
);
console.log(JSON.stringify(report));
