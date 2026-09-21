// This file deliberately contains an endpoint-shaped string. The fixed scanner
// must skip it because it is an external script, and this function is never run.
function externalOnlyFixture() {
  return fetch("/external-fixture/must-not-be-classified");
}

window.externalFixtureLoaded = true;
