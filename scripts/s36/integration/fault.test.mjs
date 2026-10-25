import { test } from "node:test";
import assert from "node:assert/strict";
import { fixture, validated } from "./fixture.mjs";
test("expiry or source drift after both acknowledgments blocks commit", async () => {
  for (const fault of ["expiry", "source"]) {
    const f = await fixture();
    try {
      const wired = await validated(f);
      await wired.run.acknowledge();
      if (fault === "expiry") f.expire();
      else f.localData.provider_settings = {};
      await assert.rejects(wired.run.commit());
      assert.equal(f.journal.read().phase, "validated");
      assert.equal(f.journal.state().namespace, "legacy");
      assert.equal(f.journal.state().admission, 0);
    } finally {
      await f.close();
    }
  }
});
test("lost extension acknowledgment response is safely retried from durable browser state", async () => {
  const f = await fixture();
  let lose = true;
  try {
    const wired = await validated(
      f,
      f.wire(
        (owner) =>
          new Proxy(owner, {
            get(target, key) {
              if (key === "acknowledge")
                return async (view) => {
                  const ack = await target.acknowledge(view);
                  if (lose) {
                    lose = false;
                    throw new Error("ACK_RESPONSE_LOST");
                  }
                  return ack;
                };
              const value = Reflect.get(target, key);
              return typeof value === "function" ? value.bind(target) : value;
            },
          }),
      ),
    );
    await assert.rejects(wired.run.acknowledge(), /ACK_RESPONSE_LOST/);
    assert.deepEqual(f.journal.read().acknowledgments, {});
    assert.equal(
      await wired.browser.verifyAcknowledgment(f.journal.read()),
      true,
    );
    await wired.run.acknowledge();
    await wired.run.commit();
    assert.equal(f.journal.read().phase, "committed");
    assert.equal(f.counts().cancellations, 1);
  } finally {
    await f.close();
  }
});
test("final journal failure after qualification pointer selection resumes without replay", async () => {
  const f = await fixture();
  try {
    const wired = await validated(f);
    await wired.run.acknowledge();
    const write = wired.port.write.bind(wired.port);
    wired.port.write = async (revision, next) => {
      if (next.phase === "committed") throw new Error("FINAL_WRITE_FAILED");
      return write(revision, next);
    };
    await assert.rejects(wired.run.commit(), /FINAL_WRITE_FAILED/);
    assert.equal(f.journal.read().phase, "validated");
    assert.equal(f.journal.state().namespace, "target");
    assert.equal(f.journal.state().admission, 0);
    f.restartBackend();
    await f.restartBrowser();
    const resumed = f.wire();
    await resumed.run.prepare(f.input);
    await resumed.run.commit();
    assert.equal(f.journal.read().phase, "committed");
    assert.equal(f.counts().cancellations, 1);
  } finally {
    await f.close();
  }
});
test("missing policy mirror after acknowledgment blocks activation", async () => {
  const f = await fixture();
  try {
    const wired = await validated(f);
    await wired.run.acknowledge();
    f.db.exec("DELETE FROM mg02_policy_mirror");
    await assert.rejects(wired.run.commit(), /STAGING_INVALID/);
    assert.equal(f.journal.state().namespace, "legacy");
    assert.equal(f.journal.state().admission, 0);
  } finally {
    await f.close();
  }
});
