import { cdp, evaluate, waitFor } from "./chrome-cdp-utils.mjs";

export const checkS1Lifecycle = async ({
  panel,
  fixtureTarget,
  fixturePort,
  first,
  inspect,
  checkedPreview,
  version,
  worker,
  cdpPort,
}) => {
  await evaluate(
    fixtureTarget,
    "document.querySelector('#inspect').outerHTML = '<button id=\"inspect\">Inspect</button>'",
  );
  const replaced = await checkedPreview(panel);
  const replacement = replaced.nodes?.find(
    (node) => node.role === "button" && node.name === "Inspect",
  );
  if (
    !replacement ||
    replacement.ref_id === inspect.ref_id ||
    replaced.nodes.some((node) => node.ref_id === inspect.ref_id)
  )
    throw new Error("REPLACED_REF_REUSED");

  await cdp(fixtureTarget.webSocketDebuggerUrl, "Page.navigate", {
    url: `https://s1.fixture.test:${fixturePort}/next`,
  });
  const navigated = await waitFor(
    async () => {
      const next = await checkedPreview(panel).catch(() => undefined);
      return next?.document_epoch !== first.document_epoch ? next : undefined;
    },
    10_000,
    "NAVIGATION_IDENTITY_REUSED",
  );
  if (navigated.nodes?.some((node) => node.ref_id === inspect.ref_id))
    throw new Error("NAVIGATION_REF_REUSED");

  await cdp(version.webSocketDebuggerUrl, "Target.closeTarget", {
    targetId: worker.id,
  });
  await waitFor(
    () =>
      checkedPreview(panel)
        .then(() => true)
        .catch(() => false),
    10_000,
    "WORKER_RECOVERY_FAILED",
  );
  await waitFor(
    async () => {
      const targets = await fetch(`http://127.0.0.1:${cdpPort}/json/list`).then(
        (response) => response.json(),
      );
      return targets.find(
        (target) =>
          target.type === "service_worker" &&
          target.url.endsWith("/js/service-worker.js") &&
          target.id !== worker.id,
      );
    },
    10_000,
    "WORKER_NOT_RESTARTED",
  );
};
