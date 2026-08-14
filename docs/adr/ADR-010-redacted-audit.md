# ADR-010: Store minimal redacted audit events

## Status

Accepted — 2026-08-14.

## Decision

Record only timestamp, tool, mode, origin, risk, outcome, success, dispatch state and policy code. Never serialize tool arguments, typed values, page content, cookies, authorization headers or credentials.

## Consequences

- Audit aids outcome correlation but does not replace browser verifier evidence.
- Event retention is bounded locally until an approved enterprise forwarding/retention policy is configured.
