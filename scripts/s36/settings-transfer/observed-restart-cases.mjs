import assert from "node:assert/strict";
import { evaluate } from "../../chrome-cdp-utils.mjs";
export async function prepareObservedRestart(panel) {
  const published = await evaluate(
    panel,
    "S36Settings.checkpointsClient().publish(S36Settings.ownerCandidate(),0)",
  );
  assert.equal(published.revision, 1);
  const view = await evaluate(
    panel,
    "S36Settings.consensusClient().validate({...S36Settings.ownerCandidate(),phase:'copying',revision:1})",
  );
  assert.equal(view.phase, "validated");
  assert.equal(view.revision, 2);
  assert.deepEqual(view.acknowledgments, {});
  return view;
}
export async function qualifyObservedRestart(panel, view) {
  const candidate = JSON.stringify(view);
  const expression = `S36Settings.rebindCurrentOwner(${candidate}).then(()=> 'ACCEPTED',e=>e.message)`;
  const first = await evaluate(panel, expression);
  const result =
    first === "RPC_UNAVAILABLE" ? await evaluate(panel, expression) : first;
  assert.equal(result, "MIGRATION_CHECKPOINT_READBACK");
  // Fixture-only explicit reimport; wait for its storage event before arming a new observer.
  const restored = await evaluate(
    panel,
    `new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(new Error('REIMPORT_EVENT_TIMEOUT')),3000);
    const listener=(changes,area)=>{if(area==='session' && Object.hasOwn(changes,'chat_session_v1')){
      clearTimeout(timer); chrome.storage.onChanged.removeListener(listener); resolve(true);
    }};
    chrome.storage.onChanged.addListener(listener);
    S36Settings.reimportControlledSession().catch(reject);
  })`,
  );
  assert.equal(restored, true);
  const rebound = await evaluate(
    panel,
    `S36Settings.rebindCurrentOwner(${candidate}).then(()=>true,e=>e.message)`,
  );
  if (rebound !== true) {
    const diagnostic = await evaluate(
      panel,
      `(async()=>{const view=${candidate}, observed=await S36Settings.observedConsensus(), output={};
      try {for(const unit of ['MG01','MG02','MG03','MG04','MG05','MG06']){
        try {output[unit]={source:(await observed.owner.sourceDigest(unit,view.epoch))===view.manifest.sourceDigests[unit],target:unit==='MG01'?null:await observed.owner.validate(unit,view.manifest.migrationId,view.epoch,view.stores[unit])};}
        catch(e){output[unit]={error:e.message};}}
      }finally{observed.dispose()} return output;})()`,
    );
    throw new Error(`REBIND_FAILED:${rebound}:${JSON.stringify(diagnostic)}`);
  }
  return { firstRebindFailure: first === "RPC_UNAVAILABLE" ? first : null };
}
export async function validateCredentialReadback(panel) {
  const expression = "S36Settings.validatePersisted().then(v=>v,e=>e.message)";
  const first = await evaluate(panel, expression);
  const result =
    first === "RPC_UNAVAILABLE" ? await evaluate(panel, expression) : first;
  return { first, result };
}
