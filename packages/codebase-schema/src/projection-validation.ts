import { canonical } from "./digest.js";
import type { ProjectionPacket, ProjectionRequest } from "./projection.js";
export function assertProjectionContent(
  packet: ProjectionPacket,
  request: ProjectionRequest,
  now: number,
) {
  const fail = () => {
    throw Error("PROJECTION_INTEGRITY");
  };
  if (
    packet.requestId !== request.requestId ||
    packet.leaseId !== request.leaseId ||
    canonical(packet.scope) !== canonical(request.scope) ||
    packet.payload.kind !== request.operation.kind ||
    packet.expiresAt <= now ||
    packet.expiresAt > request.deadline ||
    packet.observedAt > now + 1000 ||
    packet.observedAt < request.deadline - 10000 ||
    packet.expiresAt <= packet.observedAt
  )
    fail();
  const p = packet.payload,
    op = request.operation,
    s = request.scope;
  if (p.kind === "search" || p.kind === "inspect") {
    const entities = p.kind === "search" ? p.entities : [p.entity];
    for (const e of entities)
      if (
        e.partitionId !== s.partitionId ||
        e.pageKey !== s.pageKey ||
        e.status !== "observed"
      )
        fail();
    const required = new Set(entities.flatMap((e) => e.evidenceIds));
    if (
      new Set(p.evidence.map((e) => e.id)).size !== p.evidence.length ||
      p.evidence.length !== required.size
    )
      fail();
    for (const e of p.evidence)
      if (
        !required.has(e.id) ||
        e.partitionId !== s.partitionId ||
        (e.status === "verified") !== (e.predicate !== null)
      )
        fail();
    if (p.kind === "search" && op.kind === "search") {
      if (
        p.entities.length > op.limit ||
        p.matched < p.entities.length ||
        (p.cursor !== null && p.cursor !== p.entities.at(-1)?.id)
      )
        fail();
      let previous = op.after;
      for (const e of p.entities) {
        if (
          (previous !== null && e.id <= previous) ||
          (op.entityKind !== undefined && e.kind !== op.entityKind) ||
          !e.name
            .normalize("NFC")
            .toLowerCase()
            .includes(op.name.normalize("NFC").toLowerCase())
        )
          fail();
        previous = e.id;
      }
    } else if (p.kind === "inspect" && op.kind === "inspect") {
      if (
        p.entity.id !== op.id ||
        (op.includeSample ? p.sample === null : p.sample !== null)
      )
        fail();
    }
    return;
  }
  if (
    (p.kind === "dataset" || p.kind === "query") &&
    (op.kind === "dataset" || op.kind === "query")
  ) {
    const data = p.kind === "dataset" ? p.dataset : p.result;
    const id = p.kind === "dataset" ? p.dataset.id : p.result.datasetId;
    if (
      data.partitionId !== s.partitionId ||
      data.pageKey !== s.pageKey ||
      data.graphRevision !== s.revision ||
      data.digest !== op.digest ||
      id !== op.id ||
      data.observedAt > now + 1000 ||
      data.expiresAt <= now ||
      packet.expiresAt > data.expiresAt
    )
      fail();
    if (p.kind === "query" && op.kind === "query") {
      const r = p.result,
        q = op.query;
      if (q.op === "project") {
        if (
          !("rows" in r) ||
          !("fields" in r) ||
          canonical(r.fields) !== canonical(q.fields) ||
          r.rows.length > q.limit ||
          r.rows.some((row) => row.length !== q.fields.length) ||
          r.rows.length > r.matchedRows ||
          r.truncated !== r.matchedRows > r.rows.length
        )
          fail();
      } else if (q.op === "count") {
        if (
          !("value" in r) ||
          r.precision !== "exact_count" ||
          r.value !== r.matchedRows
        )
          fail();
      } else if (q.op === "group") {
        if (!("groups" in r)) return fail();
        if (
          q.fields.length !== 1 ||
          r.field !== q.fields[0] ||
          r.groups.length > q.limit ||
          r.totalGroups < r.groups.length ||
          r.totalGroups > r.matchedRows ||
          r.truncated !== r.totalGroups > r.groups.length ||
          (!r.truncated &&
            r.groups.reduce((sum, g) => sum + g.count, 0) !== r.matchedRows)
        )
          fail();
        if (q.aggregate) {
          if (
            !("aggregate" in r) ||
            canonical(r.aggregate) !== canonical(q.aggregate) ||
            r.precision !==
              (["min", "max"].includes(q.aggregate.op)
                ? "ieee754_comparison"
                : "ieee754_compensated_sum")
          )
            fail();
        } else if ("aggregate" in r || r.precision !== "exact_count") fail();
      } else if (
        !("value" in r) ||
        !("nullsExcluded" in r) ||
        r.precision !== "ieee754_compensated_sum" ||
        r.nullsExcluded > r.matchedRows ||
        (r.matchedRows === r.nullsExcluded) !== (r.value === null)
      )
        fail();
    }
  }
}
