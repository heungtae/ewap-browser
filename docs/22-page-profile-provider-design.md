# 22. Page Profile Provider와 Git 기반 MCP Registry 설계

## 1. 목적과 범위

Page Profile Provider는 현재 페이지의 semantic snapshot만으로 알 수 없는 업무 문맥과
허용된 업무 데이터 읽기 도구를 제공한다. 확장은 현재 페이지의 `origin`, `path`, semantic
fingerprint, page context digest를 Provider에 보내고, Provider가 발급한 서명 Profile을
검증한 뒤 Ask와 Act에 사용한다.

v1은 비민감 공용 업무 데이터만 다룬다. 제품 계정, 사용자별 권한, OAuth/OIDC token,
Business MCP용 API key와 user-specific 결과는 범위 밖이다. TLS는 Chrome이 신뢰하는
HTTPS endpoint를 사용하며, 개발용 self-signed는 Profile JWS 서명키만 뜻한다.

이 설계는 두 인터페이스를 둔다.

| 인터페이스             | 대상              | 책임                                      |
| ---------------------- | ----------------- | ----------------------------------------- |
| HTTPS Profile Resolver | ContextPilot 확장 | 현재 페이지용 서명 Profile 조회           |
| local stdio 관리 MCP   | 개발자·CI         | Git 원본의 작성, 검증, branch/commit 준비 |

`Business MCP`는 Profile Provider와 다르다. Business MCP는 Profile이 허용한 최신
업무 데이터를 read-only로 반환하는 backend이며, Provider는 어느 Business MCP server와
tool을 현재 페이지에서 쓸 수 있는지 결정한다.

## 2. 소유권과 저장소

Page Profile 원본은 확장 저장소와 분리된 전용 Git 저장소를 source of truth로 한다.

```text
page-profile-registry/
  profiles/<profile-id>.json       # page matcher, model context, 허용 도구
  mcp-servers/<server-id>.json     # endpoint와 tool catalogue
  schemas/                         # source JSON Schema와 fixture
```

`main`은 protected branch다. local stdio MCP는 작업 branch와 검증된 commit, PR 본문만
준비한다. push, PR 생성·승인, `main` 병합은 기존 Git hosting 절차가 담당한다. 관리 MCP는
private signing key, Resolver deployment credential 또는 Business MCP credential을 읽거나
변경하지 않는다.

`main` 병합 CI는 모든 source file을 검증하고 불변 release artifact를 만든다. Provider는
완전히 검증된 artifact만 읽기 전용으로 로드하며, 새 artifact는 전체 검증 뒤 원자적으로
교체한다. 부분 Git checkout, branch 작업물, 미승인 PR은 Resolver 결과에 영향을 주지 않는다.

## 3. Source Profile과 MCP Registry 계약

### 3.1 Page Profile source

`PageProfileSourceV1`은 closed JSON object다. 알려지지 않은 field, 중복 ID, 빈 문자열과
제한 초과 문자열·배열을 거부한다.

```json
{
  "schema_version": 1,
  "profile_id": "semiconductor-trend-analysis",
  "profile_version": 3,
  "matcher": {
    "origin": "https://portal.company.example",
    "path_prefix": "/trend-analysis"
  },
  "fingerprint": {
    "alg": "semantic-projection-fp-v1",
    "value": "base64url-sha256"
  },
  "model_context": {
    "title": "수율 추세 분석",
    "summary": "제품군과 공정 노드를 선택해 기간별 수율을 확인하는 화면입니다.",
    "facts": [{ "label": "분석 단위", "value": "제품군·공정 노드·캠퍼스" }],
    "glossary": [
      { "term": "공정 노드", "definition": "제조 공정의 분류 단위" }
    ],
    "limitations": ["확정 수율은 승인된 월말 데이터가 기준입니다."]
  },
  "business_tools": [
    { "server_id": "manufacturing-data", "tool_id": "get_yield_definition" }
  ],
  "tools": [],
  "workflow": null
}
```

`model_context`는 정보 전달용 데이터다. `title`은 최대 160자, `summary`는 최대
2,000자이며 `facts`, `glossary`, `limitations`를 포함한 전체 직렬화 크기는 8 KiB 이하다.
모델 실행 지시, raw URL, selector, `ref_id`, input value, credential, token, HTML,
JavaScript와 action 권한은 이 문맥에 넣을 수 없다.

`tools`와 `workflow`는 기존 signed Profile의 action definition 및 workflow 계약을 따른다.
현재 semantic snapshot은 항상 Act discovery의 source of truth이며, Profile은 관찰되지
않은 target을 만들거나 기존 policy·confirmation·verifier를 완화할 수 없다.

### 3.2 MCP Registry source

Registry는 server location과 tool contract를 소유한다. Page Profile에는 endpoint를 쓰지
않고, 허용 관계만 `server_id`와 `tool_id`로 선언한다.

```json
{
  "schema_version": 1,
  "server_id": "manufacturing-data",
  "endpoint": "https://business-mcp.company.example/page-tools",
  "tools": [
    {
      "tool_id": "get_yield_definition",
      "title": "수율 정의 조회",
      "description": "현재 화면에서 사용하는 수율 지표의 정의를 반환합니다.",
      "arguments": {
        "type": "object",
        "additionalProperties": false,
        "properties": { "metric": { "type": "string", "maxLength": 80 } },
        "required": ["metric"]
      },
      "result_key": "definition",
      "value_kind": "text",
      "max_result_chars": 4000
    }
  ]
}
```

Registry endpoint는 HTTPS여야 하며 userinfo, query, fragment와 임의 header/auth 설정을
가질 수 없다. v1 tool은 `agentic-read`만 허용한다. source validator는 Profile의 모든
`server_id/tool_id` 참조가 Registry에 존재하고, tool ID가 전역적으로 모호하지 않으며,
argument/result schema가 닫혀 있는지 확인한다.

## 4. Resolver 발급 계약

확장은 기존 Resolver 요청을 유지한다.

```text
POST /v1/resolve
Content-Type: application/json

{ schema_version, request_id, resolver_request_nonce, deployment_id,
  page: { origin, path, page_context_digest, fingerprint_alg, fingerprint } }
```

Provider는 exact origin, 가장 긴 `path_prefix`, exact fingerprint 순서로 Profile을 찾는다.
동일 우선순위의 Profile이 둘 이상이면 release artifact 검증에서 거부한다. 매칭하지 못하면
유효한 `UNKNOWN` Profile JWS를 반환하고, artifact·서명·검증 오류는 HTTP 오류로 반환해
확장이 `PROFILE_UNAVAILABLE`로 fail closed하게 한다.

매칭되면 Provider는 source Profile과 Registry를 전개해 `company-page-profile+jws` ES256
compact JWS를 발급한다. JWS에는 다음을 넣는다.

- 기존 binding claim: `aud`, `resolver_request_nonce`, `page_context_digest`, `matcher`,
  fingerprint, `issued_at`, `expires_at`, `profile_id`, `profile_version`
- 검증된 `model_context`, action `tools`, `workflow`
- Registry에서 전개한 `business_mcp` binding: `server_id`, `endpoint`, `tool_id`,
  `result_key`, `value_kind` 및 model-visible tool metadata

JWS 수명은 24시간 이하이고 전체 크기는 64 KiB 이하다. private key는 Provider의 배포
secret에만 두며 `kid`와 공개 PEM은 확장 Settings의 key ring으로 배포한다. Provider는
release ID와 source commit만 audit metadata로 남기고 Profile 원문이나 요청 page payload를
장기 저장하지 않는다.

## 5. Ask·Act와 Business MCP 흐름

```text
Content script snapshot
  → Service Worker: digest + fingerprint
  → HTTPS Resolver: signed Profile JWS
  → Service Worker: JWS/binding 검증
      ├─ Ask/Act model message: safe model_context
      └─ Ask tool call: Profile-bound Business MCP read
           → current page binding 재확인 → Registry-expanded endpoint
           → bounded result 검증 → 다음 모델 turn의 untrusted data
```

Ask와 Act는 검증된 `model_context`를
`[UNTRUSTED_PAGE_PROFILE_CONTEXT]` delimiter 안에 넣는다. 이는 업무 정보를 보완하지만
system instruction이 아니며 browser tool 권한을 부여하지 않는다. `model_context`는
transcript, persistent chat storage, export와 diagnostics에 저장하지 않고, 노출되는
metadata는 `profile_id`, version, source commit, digest뿐이다.

Ask에서는 Profile이 허용한 Business MCP tool만 제공한다. tool description과 tool별 닫힌
argument schema는 Registry에서 오며, endpoint, JWS, nonce, digest, credential은 모델에
보이지 않는다. Service Worker는 호출 직전에 active tab, document epoch, origin, path,
digest와 Profile binding을 다시 확인한다. 페이지가 변했으면 결과를 재사용하지 않고
Profile을 다시 resolve한다.

Business MCP 응답은 Registry의 결과 schema와 `max_result_chars`를 통과해야 하며,
`[UNTRUSTED_TOOL_RESULT]`로만 다음 모델 turn에 전달한다. Business MCP 오류에는 DOM
추측이나 다른 endpoint fallback을 하지 않는다.

Act에서는 page-derived visible/enabled candidate가 우선이다. Profile의 action definition은
기존처럼 후보가 부족할 때 위험도, 허용 role, option enum과 semantic verifier를 보완한다.
모든 proposal은 현재의 permission, value binding, confirmation, preflight, executor와
postcondition verifier를 계속 거친다.

## 6. local stdio 관리 MCP

관리 MCP는 Git checkout에서 실행하며 다음의 closed tool만 제공한다.

| Tool                                                             | 동작                                             |
| ---------------------------------------------------------------- | ------------------------------------------------ |
| `profile_list`, `profile_get`                                    | release source와 matcher 조회                    |
| `profile_create_draft`, `profile_update_draft`, `profile_retire` | working branch의 source 변경                     |
| `profile_validate`                                               | schema, fingerprint, matcher, Registry 참조 검증 |
| `mcp_server_list`, `mcp_server_get`, `mcp_server_validate`       | Registry 조회·검증                               |
| `change_create_branch`, `change_commit`, `change_prepare_pr`     | PR용 branch, 검증된 commit, PR 설명 생성         |

모든 write tool은 현재 branch와 clean/dirty 상태를 먼저 보고하고, 대상 파일을 명시한다.
`main` 직접 변경, force push, signing, Resolver deploy와 production secret 접근은 제공하지
않는다. MCP 응답과 commit message에는 endpoint credential, Profile JWS, raw page data를
넣지 않는다.

## 7. 구현·검증 순서

1. 전용 Git 저장소의 source/Registry JSON Schema, fixtures, validator와 merge CI artifact를
   만든다.
2. HTTPS Provider에 artifact loader, matcher, ES256 dev signer와 `/v1/resolve`를 구현한다.
3. local stdio MCP에 읽기·검증·branch/commit/PR-preparation 도구를 구현한다.
4. 확장 Profile claim validator에 `model_context`와 Registry tool metadata를 추가하고,
   Ask/Act projection 및 tool별 argument/result 검증을 연결한다.
5. Profile replay high-water를 실제 resolve path에 연결해 같은
   `(deployment_id, profile_id, profile_version)`의 정의 digest 충돌을 거부한다.

단위 테스트는 source/Registry schema, 참조 오류, matcher 모호성, version 역행, endpoint
제한, JWS binding·만료·UNKNOWN을 다룬다. MCP 테스트는 임시 Git checkout에서 branch/commit
생성과 signing key 비접근을 검증한다. 확장 테스트는 Ask/Act에 model context가 포함되고
endpoint/JWS/nonce/credential은 제외됨, stale page Business MCP 호출 거부, page-derived Act
우선, Business MCP 결과 schema·크기 제한을 확인한다. 마지막으로 local HTTPS Provider와
Business MCP fixture를 사용해 Chrome E2E의 resolve → Ask context → business read → Act
proposal 흐름을 검증한다.

v1 검증은 서버 구현과 local Chrome 증적까지의 범위이며, 사용자별 업무 데이터, OIDC,
KMS/HSM, key rotation, 운영 배포/rollback 승인과 production qualification은 후속 slice다.
