# ADR-012: Preserve upstream structure and selectively synchronize security fixes

## Status

Accepted — 2026-08-14.

## Context

The company fork needs timely browser compatibility and security fixes without reintroducing generic provider, tool or network capabilities.

## Decision

Keep the imported upstream source layout where practical. Review each upstream change independently; only accept it after license/security analysis and the company regression suite. Do not automatically merge feature, provider, cloud or permission expansions.

## Consequences

- `docs/upstream-sync.md` records provenance and future decisions.
- The company architecture/security documents use `company-` filenames, leaving upstream docs at their original paths for baseline tests.
- Each accepted sync links a commit, evidence and relevant ADR/release record.
