# Company Web Agent — Coding Agent 실행 계획

**Baseline**: WebBrain `ec76e498ee38a827d6bafc4838cc44f40ea08cd9`  
**목표**: Qwen3.5/vLLM 기반 사내 Chrome Side Panel Web UI Agent

# 1. 작업 방법

각 Phase는 별도 branch/PR로 수행한다.

```text
phase/00-baseline
phase/01-enterprise-lockdown
phase/02-form-automation
phase/03-policy-confirmation
phase/04-verification
phase/05-audit
phase/06-ui
phase/07-hardening
```

한 Phase가 acceptance criteria를 통과하기 전 다음 Phase로 넘어가지 않는다.

# 2. Phase 0

해야 할 일:

```text
checkout baseline commit
build
test
Chrome extension load check
runtime module inventory
tool catalog inventory
provider inventory
manifest permission inventory
```

산출물:

```text
BASELINE.md
docs/runtime-inventory.md
docs/tool-inventory.md
```

금지:

```text
feature implementation
large refactor
dependency upgrade
```

# 3. Phase 1

목표:

```text
Company-only provider
Company-only tool catalog
managed configuration
origin allowlist
ASK/ACT only
permission reduction
```

주요 파일:

```text
src/chrome/manifest.json
src/chrome/src/providers/manager.js
src/chrome/src/providers/openai.js
src/chrome/src/agent/tools.js
src/chrome/src/agent/permission-gate.js
src/chrome/src/background.js
src/chrome/src/ui/settings.*
```

신규:

```text
src/chrome/src/company/config/*
src/chrome/src/company/policy/*
src/chrome/src/company/tools/tool-registry.js
```

테스트:

```text
manifest snapshot
provider fixed endpoint
tool allowlist snapshot
Ask mode no mutation
Act origin policy
```

# 4. Phase 2

목표:

```text
textbox
textarea
checkbox
radio
native select
ARIA combobox
portal popup
```

신규 tool:

```text
get_select_options
select_option
```

모든 tool에 verifier 포함.

# 5. Phase 3

목표:

```text
R0/R1/R2/R3 classification
R2 confirmation
R3 deny
duplicate mutation
```

confirmation은 Side Panel blocking UI.

# 6. Phase 4

Mutation verification 강화.

```text
field value
checkbox state
select state
URL
modal
aria state
live region
```

UNKNOWN은 자동 retry 금지.

# 7. Phase 5

Audit.

절대 기록 금지:

```text
password
OTP
token
full field value
cookie
Authorization
raw page text
```

# 8. Phase 6

Side Panel 단순화.

필수:

```text
ASK/ACT selector
current origin status
LLM connection status
action timeline
confirmation
Stop
```

# 9. Phase 7

Security regression suite.

```text
prompt injection
external navigation
hidden overlays
stale refs
duplicate submit
malformed tool call
secret leak
CDP detach leak
```

# 10. Coding Agent Definition of Done

각 PR은 다음을 모두 만족해야 한다.

```text
build pass
lint pass
unit pass
browser E2E pass
no new high-risk permission
tool registry updated
policy classification updated
audit classification updated
docs updated
```

# 11. 리뷰 질문

Coding Agent는 PR 설명에 다음 답을 포함한다.

```text
1. 어떤 모델 노출 tool이 추가/삭제되었나?
2. 어떤 Chrome permission이 추가/삭제되었나?
3. 어떤 origin으로 network가 나갈 수 있나?
4. mutation 성공을 어떻게 검증하나?
5. 실패/unknown 시 retry 하는가?
6. secret이 어디에 저장/로그되는가?
7. 이 변경이 prompt injection surface를 증가시키는가?
8. rollback 방법은?
```

# 12. 권장 Git Commit 크기

한 commit은 한 논리 변경.

예:

```text
security: add managed origin policy
test: cover origin policy
feat: add native select action
test: verify native select action
```

대규모 `refactor everything` commit 금지.

# 13. Phase 8 — Page Profile MCP

목표:

```text
Accessibility fingerprint
Page Profile MCP
profile cache
dynamic MCP tool exposure
deterministic business binding
unknown-page fail closed
```

주요 신규 모듈:

```text
src/chrome/src/company/context/
├── page-fingerprint.js
├── page-profile-client.js
├── page-profile-cache.js
├── page-context-resolver.js
├── business-tool-resolver.js
└── context-router.js
```

구현 순서:

```text
1. fingerprint
2. MCP client
3. schema validation
4. cache
5. profile resolver
6. dynamic business tools
7. deterministic value binding
8. SPA profile re-resolution
```

Definition of Done:

```text
profile resolution uses no LLM
unknown ACT fails closed
only page-allowed MCP tools reach model
authoritative MCP failure never falls back to guessing
```
