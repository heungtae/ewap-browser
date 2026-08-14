# ADR-001: Fork WebBrain at a pinned upstream commit

## Status

Accepted — 2026-08-14.

## Context

Company Web Agent requires a Chrome MV3 browser automation foundation with an accessibility-tree/ref_id model. Building a browser automation engine from scratch would duplicate the mature WebBrain interaction and CDP layers while delaying security hardening.

## Decision

Fork `webbrain-one/webbrain` at `ec76e498ee38a827d6bafc4838cc44f40ea08cd9`. Retain the upstream MIT license and record all company changes in this repository. Treat upstream capabilities as unapproved until admitted through the company policy and Sprint gates.

## Consequences

- The initial source surface is intentionally broad and S1 must reduce it.
- Security fixes are reviewed and selectively integrated under ADR-012.
- The exact source provenance and test baseline are recorded in `BASELINE.md`.
