# ADR-007: Require explicit confirmation for R2 business mutations

## Status

Accepted — 2026-08-14.

## Decision

R2 actions return a short-lived confirmation ID before browser dispatch. Only a trusted UI/background confirmation path can approve that ID; tool arguments cannot forge approval.
