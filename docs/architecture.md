# 아키텍처 경계와 책임 모델

상세 설계의 구현 방향을 다음 책임 경계로 고정한다. 이 문서는 구현 상태를 주장하지 않는 설계 기준이다.

```text
User -> Side Panel -> Agent Runtime -> Policy/Tool Broker -> Browser UI
                         |                 |
                         v                 v
                    Company vLLM      Audit + Verifier

Browser UI -> AX tree/ref_id -> Page Profile Resolver -> allowed Business MCP tools
```

| 경계 | 들어오는 정보 | 결정권자 | 필수 통제 |
|---|---|---|---|
| Browser page → agent | AX tree, current origin, runtime state | deterministic extractor | page text는 untrusted; values/secrets 최소화 |
| Agent runtime → model | compact, sanitized context와 현재 허용 tool schema | model은 proposal만 생성 | provider는 company vLLM만; page-specific tool은 profile resolution 후 노출 |
| Model → tool broker | tool name/arguments | deterministic policy | COMPANY_TOOLS, mode, origin, capability, risk, confirmation, duplicate guard |
| Tool broker → browser | authorized ref_id action | tool implementation + verifier | mutation 후 AX/DOM state로 검증; UNKNOWN no retry |
| Browser → Page Profile MCP | secret-free semantic fingerprint | deterministic resolver | schema validation, cache, unknown ACT deny |
| Runtime → audit | normalized action result | audit recorder | secret/raw page text/full typed value redaction |

## 불변 조건

1. `ref_id`가 primary target이며 CSS/XPath는 explicit fallback이다.
2. ASK에서는 mutation-capable tool을 모델에 노출하지 않는다.
3. ACT는 configured enterprise origin에서만 가능하다.
4. R2는 human confirmation, R3는 hard deny다.
5. Page Profile은 policy나 user authority를 대체하지 않는다.
6. verifier가 `UNKNOWN`이면 automation은 retry하지 않고 사용자에게 결과를 명시한다.

구현 책임과 검증은 [스프린트 계획](sprints.md), 요구사항 연결은 [추적성](requirements-traceability.md)에서 관리한다.
