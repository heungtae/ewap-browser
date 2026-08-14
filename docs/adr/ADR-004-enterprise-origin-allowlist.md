# ADR-004: Enforce an enterprise origin allowlist

## Status

Accepted — 2026-08-14.

## Decision

Act-capable company tools require an exact HTTPS origin from managed configuration. The manifest excludes `<all_urls>` and permits only the enterprise host pattern. Ask remains read-only and can inspect an external page without permitting a mutation.

## Consequences

- Origin is evaluated deterministically from the active tab URL before dispatch.
- A URL, prompt, page instruction or model tool call cannot add an origin.
- Deployment must replace the example enterprise configuration with approved company origins.
