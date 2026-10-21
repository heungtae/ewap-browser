import { DatabaseSync } from "node:sqlite";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import {
  TaskStore,
  McpTaskApi,
  McpStepStore,
  ExternalTools,
  McpBackend,
  listenMcp,
  runtimeFixture,
  IDBFactory,
  digest,
} from "../../dist/s35/fixtures.mjs";
export async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), "s35-")),
    path = join(directory, "agent.sock");
  const db = new DatabaseSync(join(directory, "tasks.sqlite")),
    tasks = new TaskStore(db);
  const grant = {
    clientId: "fixture-client",
    revision: 1,
    profileId: "profile",
    origins: ["https://fixture.test"],
    tabIds: [1],
    modes: ["ask", "act"],
    tools: ["web.fill"],
    externalController: true,
    expiresAt: Date.now() + 180000,
  };
  const pairings = new Map([
    [grant.clientId, { grant, secret: randomBytes(32).toString("hex") }],
  ]);
  const api = new McpTaskApi(tasks, () => ({
    controller: true,
    runtime: true,
  }));
  const runtimes = new Map(),
    ports = new Map();
  const counters = { dispatches: 0, approvals: 0 };
  const bindings = new Map();
  const resolveBinding = async (bound, callId) => {
    const key = `${bound.task.id}:${callId}`;
    if (bindings.has(key)) return bindings.get(key);

    const f = await runtimeFixture(new IDBFactory());
    let task = tasks.load(bound.task.id, api.owner(grant));
    if (!task.leaseId)
      task = tasks.claim(task.id, api.owner(grant), task.revision, 30000);
    Object.assign(f.context, {
      taskId: task.id,
      stepId: callId,
      profileId: bound.scope.profileId,
      tabId: bound.scope.tabId,
      mode: bound.scope.mode,
      runtimeEpoch: task.epoch,
      leaseId: task.leaseId,
      leaseExpiresAt: task.leaseUntil,
      cancellationGeneration: task.generation,
      deadline: task.admission.deadline,
    });
    f.policy.mode = "custom";
    f.policy.autoUnsubmitted = false;
    f.context.policyDigest = await digest(f.policy);
    f.context.capabilityDigest = (
      await f.registry.snapshot(f.context, f.capabilities)
    ).digest;
    f.adapter.context = structuredClone(f.context);
    f.bindings.revoke();
    f.bindings.install(f.adapter);
    const argument = f.sources.admit(f.principal, "requested");
    const intent = { action: f.target, argument };
    const original = f.adapter.dispatch;
    f.adapter.dispatch = async (value, before) => {
      const previous = f.state.dispatches;
      try {
        return await original(value, before);
      } finally {
        counters.dispatches += f.state.dispatches - previous;
      }
    };
    // Install the updated callback snapshot in the fixture browser port.
    f.bindings.revoke();
    f.bindings.install(f.adapter);
    let pending = null,
      approved = null;
    const request = f.approvals.request.bind(f.approvals);
    f.approvals.request = async (...args) => {
      const result = await request(...args);
      if (result.kind === "prompt") pending = result.prompt;
      return result;
    };
    ports.set(callId, intent);
    runtimes.set(callId, {
      f,
      approve: async () => {
        if (!pending) throw Error("NO_PENDING_PROMPT");
        approved = await f.approvals.respond(f.principal, {
          promptId: pending.id,
          promptRevision: pending.revision,
          preparedDigest: pending.preparedDigest,
          contextDigest: pending.contextDigest,
          planRevision: pending.planRevision,
          choice: "approve",
          disclosureScope: pending.disclosureScope,
        });
        counters.approvals++;
      },
    });
    const binding = {
      ports: f.ports,
      origin: () => bound.scope.origin,
      approval: async () => approved?.id ?? null,
    };
    bindings.set(key, binding);
    return binding;
  };
  const external = new ExternalTools(
    api,
    new McpStepStore(db),
    resolveBinding,
    (id) => pairings.get(id)?.grant ?? { ...grant, revision: -1 },
  );
  const template = await runtimeFixture(new IDBFactory());
  const backend = new McpBackend(api, external, template.registry);
  const events = [];
  const invoke = backend.request.bind(backend);
  backend.request = async (principal, command) => {
    const result = await invoke(principal, command);
    events.push({
      kind: command.kind,
      name: command.name ?? null,
      phase: result?.phase ?? null,
      status: result?.status ?? null,
    });
    return result;
  };
  const server = await listenMcp(path, (id) => pairings.get(id), backend);
  const configPath = join(directory, "pairing.json");
  await writeFile(
    configPath,
    JSON.stringify({
      version: "wca.mcp-ipc/v1",
      socketPath: path,
      clientId: grant.clientId,
      secret: pairings.get(grant.clientId).secret,
    }),
    { mode: 0o600 },
  );
  return {
    directory,
    path,
    configPath,
    grant,
    pairings,
    api,
    tasks,
    external,
    backend,
    db,
    runtimes,
    ports,
    counters,
    events,
    prepare: async (taskHandle, callId) => {
      await resolveBinding(api.bind(grant, { taskHandle }), callId);
      return ports.get(callId);
    },
    close: async () => {
      await server.close();
      template.db.close();
      for (const r of runtimes.values()) r.f.db.close();
      db.close();
      await rm(directory, { recursive: true, force: true });
    },
  };
}
