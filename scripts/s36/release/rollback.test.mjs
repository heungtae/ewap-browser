import { test } from "node:test";
import assert from "node:assert/strict";
import { releaseIntegrityPredicate } from "../../../dist/s36/release-set.mjs";
import { fixture } from "../integration/fixture.mjs";
import { releaseFixture } from "./support.mjs";
test("actual six-unit coordinator checks the prior artifact set immediately before rollback", async () => {
  for (const changed of [false, true]) {
    const release = releaseFixture(),
      f = await fixture();
    try {
      f.input.legacyRelease = release.id;
      const wired = f.wire(
        undefined,
        releaseIntegrityPredicate(release.root, release.id),
      );
      await wired.run.prepare(f.input);
      await wired.run.copy();
      await wired.run.acknowledge();
      await wired.run.commit();
      const epoch = f.journal.read().epoch;
      if (changed)
        release.write("agent-server/launcher.cjs", "corrupt prior release");
      if (changed) {
        await assert.rejects(wired.run.rollback(), /INCOMPATIBLE_RELEASE/);
        assert.equal(f.journal.state().namespace, "target");
        assert.equal(f.journal.read().phase, "committed");
        await assert.rejects(wired.run.commit(), /MIGRATION_FENCE/);
      } else {
        await wired.run.rollback();
        assert.equal(f.journal.state().namespace, "legacy");
        assert.equal(f.journal.read().phase, "rolled_back");
      }
      assert.equal(f.journal.state().epoch, epoch + 1);
      assert.equal(f.journal.state().admission, 0);
      assert.equal(f.counts().cancellations, 1);
    } finally {
      release.close();
      await f.close();
    }
  }
});
