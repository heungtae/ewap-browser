# ADR-006: Keep enterprise policy outside the LLM

## Status

Accepted — 2026-08-14.

## Decision

`CompanyMutationPolicy` classifies risk and evaluates confirmation/duplicate state deterministically. The model may propose a tool call but cannot create approval state, alter a risk level or decide an origin.
