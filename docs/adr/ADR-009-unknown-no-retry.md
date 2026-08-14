# ADR-009: Never automatically retry an unknown mutation

## Status

Accepted — 2026-08-14.

## Decision

Mutation dispatch is reserved by a redacted duplicate fingerprint before execution. An equivalent mutation is not automatically retried after any inconclusive browser result.
