import { test } from "node:test";
import assert from "node:assert/strict";
import { migrationEndpoint } from "../../../dist/s36/transport.mjs";
import { preparedConsensus } from "./consensus-support.mjs";
for (const operation of ["validate", "acknowledge"]) {
  for (const race of ["revision", "fence", "expiry", "disconnect", "mirror"]) {
    test(`${operation} rechecks ${race} after asynchronous credential readback before storing validation or ACK`, async () => {
      const p = await preparedConsensus();
      try {
        if (operation === "acknowledge")
          await p.client().validate(p.journal.read());
        const { store } = await p.direct(),
          initial = p.journal.read();
        const abort = new AbortController(),
          context = { deadline: Date.now() + 10000, signal: abort.signal };
        let injected = false;
        const endpoint = await migrationEndpoint(p.db, p.f.config, {
          mode: store.mode,
          async read(identity) {
            const value = await store.read(identity);
            if (!injected) {
              injected = true;
              if (race === "revision")
                p.journal.write(initial.revision, {
                  ...initial,
                  revision: initial.revision + 1,
                });
              if (race === "fence") p.journal.fence();
              if (race === "expiry") context.deadline = Date.now() - 1;
              if (race === "disconnect") abort.abort();
              if (race === "mirror")
                p.db.exec("DELETE FROM mg02_policy_mirror");
            }
            return value;
          },
          async write() {
            throw new Error("UNEXPECTED_SECRET_WRITE");
          },
        });
        await assert.rejects(
          endpoint(p.command(`migration.consensus.${operation}`), context),
        );
        assert.equal(injected, true);
        assert.deepEqual(
          p.journal.read().acknowledgments,
          initial.acknowledgments,
        );
        assert.equal(p.journal.read().phase, initial.phase);
        assert.equal(
          p.journal.read().revision,
          initial.revision + (race === "revision" ? 1 : 0),
        );
        assert.equal(p.journal.state().namespace, "legacy");
        assert.equal(p.journal.state().admission, 0);
      } finally {
        await p.close();
      }
    });
  }
}
