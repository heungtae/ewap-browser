# ADR-003: Use one managed Company vLLM provider

## Status

Accepted — 2026-08-14.

## Decision

The extension exposes only `company-vllm`, an OpenAI-compatible Qwen3.5 provider whose URL, model and credentials come from `chrome.storage.managed`. Local storage, provider switching and provider editing do not override this configuration.

## Consequences

- Third-party, OAuth, router, cloud and local provider selection is unavailable.
- Provider configuration is not copied into user-editable storage or audit logs.
- A missing/invalid managed configuration leaves no alternative provider path.
