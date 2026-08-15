# 13. Page Profile 및 Business MCP 계약

## 1. 목적과 결정

이 문서는 production Ask/Act에 필요한 Page Profile resolver와 authoritative field용 Business MCP의 구현 계약을 고정한다. 실제 URL, issuer 이름, MCP binding별 업무 권한은 운영 입력이지만, 이를 제외한 메시지 형식과 실패-폐쇄 동작은 구현자가 바꾸지 않는다.

다음 경계를 사용한다.

```text
Extension service worker -- HTTPS --> Page Profile resolver
        |                                   |
        | Native Messaging                   | profile JWS + opaque subject token
        v                                   v
Company Agent Host -- HTTPS + SSO assertion --> Business MCP gateway
```

- extension은 profile resolver와만 직접 HTTPS 통신한다. Business MCP URL·credential·사용자 assertion을 받거나 보관하지 않는다.
- Company Agent Host는 profile이 선언한 page-level `(server_id, tool_id)`를 관리자 ACL MCP Registry의 고정 gateway route로 해석한다. profile과 모델은 URL, header, 임의 MCP server/tool 이름을 지정할 수 없다.
- Business MCP는 authoritative field와 page-allowlisted `agentic-read`만 읽는다. browser, MCP, 모델의 상태 변경은 이 계약 범위 밖이며 이 문서의 Business MCP tool은 모두 R0이다.
- 실제 운영 입력이 없거나 아래 검증 하나라도 실패하면 Ask는 오류를 표시하고 Act의 해당 tool을 거부한다. DOM 탐색, 과거 Business MCP 값, 모델 추측은 대체 경로가 아니다. 단, 3.1의 조건을 모두 만족하는 verified Page Profile cache는 resolver transport 오류의 대체로만 사용할 수 있다.

## 2. 공통 표기와 한계

- 모든 JSON은 UTF-8이고 JSON Schema 2020-12에서 `additionalProperties: false`로 검증한다. enum 이외의 자유 형식 key는 받지 않는다.
- ID는 ASCII lower kebab-case, 길이 1~64다. opaque token은 base64url, 길이 16~512다. UUID는 RFC 4122 canonical text다.
- URL은 HTTPS만 허용한다. origin은 소문자 scheme/host와 effective port(생략 시 HTTPS의 443)로 canonicalize하고, path는 percent-decoding 없이 leading `/`를 요구한다. query와 fragment는 resolver와 MCP 어느 쪽에도 보내지 않는다.
- 요청 본문은 16 KiB, profile JWS는 64 KiB, Business MCP 응답은 16 KiB를 넘을 수 없다. redirect, cross-origin redirect, content-type 불일치, 압축 해제 후 한계 초과는 거부한다.
- 모든 network request에는 UUID `request_id`가 있고, extension과 Host는 request body·JWS·field value를 로그·audit·persistent store에 기록하지 않는다.
- exact page context는 RFC 8785 canonical JSON `{schema_version:1,deployment_id,origin,path}`의 SHA-256 unpadded base64url인 `page_context_digest`로 표시한다. query/fragment는 입력 전에 제거하며 digest는 모델·audit·persistent store에 넣지 않는다. 이 digest는 page identity 결속값이지 비밀 또는 인증 수단이 아니다.

## 3. Page Profile resolver

### 3.1 요청

production Ask/Act는 projection을 수집한 뒤 resolver를 호출한다. service worker는 요청마다 crypto-random 128-bit 이상의 `resolver_request_nonce`를 만들고 current canonical origin/path에서 `page_context_digest`를 계산한다. extension memory cache는 `(tab_id, sender.documentId, document_epoch, page_context_digest, path matcher hash, fingerprint, profile_id, profile_version, signed_definition_digest, original resolver_request_nonce)`로 키를 만들며 raw path나 profile body를 persistent store에 쓰지 않는다. resolver transport 오류에서는 서명·TTL·original request nonce/page-context·matcher·fingerprint와 Host의 idempotent replay CAS를 다시 통과한 같은 key의 cache만 사용할 수 있다. cache fallback은 새 network request nonce와 cached JWS nonce가 같다고 요구하지 않고, cached JWS의 original nonce가 cache metadata와 같고 exact page-context가 여전히 current인지 검사한다. cache miss, expiry, corruption, version rollback 또는 profile/JWS 검증 실패는 `PROFILE_UNAVAILABLE`이며 Act를 거부한다. `POST {profiles.resolver_url}`의 body는 다음 하나다.

```json
{
  "schema_version": 1,
  "request_id": "7d7e3d38-2b9a-4c92-9921-1ff835b0c653",
  "resolver_request_nonce": "opaque-base64url-nonce",
  "deployment_id": "company-prod",
  "page": {
    "origin": "https://app.company.example",
    "path": "/cases/123",
    "page_context_digest": "base64url-sha256",
    "fingerprint_alg": "semantic-projection-fp-v1",
    "fingerprint": "base64url-sha256"
  }
}
```

`origin`과 `path`는 profile resolver가 matcher와 `page_context_digest`를 재계산하기 위한 전송 중 데이터일 뿐 모델, audit, extension storage, Native Host durable store에 보내거나 기록하지 않는다. resolver는 body의 digest가 재계산 값과 다르면 JWS를 발급하지 않는다. resolver endpoint는 `profile_resolver_origins` 및 manifest `permission_origins`에 모두 있어야 한다. 요청에는 cookie, `Authorization`, browser page header, raw DOM/label/value/ref/model-ref를 붙이지 않는다.

응답은 `Content-Type: application/jose`인 compact JWS 문자열 하나다. payload의 `resolution`은 `MATCHED` 또는 `UNKNOWN`이다. HTTP 성공이더라도 JWS 검증에 실패하면 `PROFILE_UNAVAILABLE`이다. HTTP 오류, timeout(5초), cancellation, body size 초과, TLS 오류도 같은 결과로 정규화하며 자동 재시도하지 않는다. 유효하게 서명된 `UNKNOWN`은 통신 실패가 아니라 `UNKNOWN_PROFILE`이며 Ask basic-read-only/Act deny 규칙을 적용한다.

### 3.2 서명과 profile claim

JWS protected header는 정확히 `alg: ES256`, `typ: company-page-profile+jws`, release artifact key ring에 있는 `kid`만 허용한다. `MATCHED` payload는 아래 최상위 claim을 모두 포함한다.

```json
{
  "schema_version": 1,
  "resolution": "MATCHED",
  "iss": "company-profile-resolver",
  "aud": "company-prod",
  "resolver_request_nonce": "opaque-base64url-nonce",
  "page_context_digest": "base64url-sha256",
  "profile_id": "eda-equipment-edit",
  "profile_version": 17,
  "issued_at": "2026-08-15T00:00:00Z",
  "expires_at": "2026-08-15T01:00:00Z",
  "matcher": {
    "origin": "https://app.company.example",
    "path_prefix": "/cases/"
  },
  "fingerprint": {
    "alg": "semantic-projection-fp-v1",
    "value": "base64url-sha256"
  },
  "tools": [],
  "business_mcp": [],
  "authoritative_fields": []
}
```

`UNKNOWN` payload는 `schema_version`, `resolution: UNKNOWN`, `iss`, `aud`, `resolver_request_nonce`, `page_context_digest`, `issued_at`, `expires_at`, 요청 fingerprint의 `alg`/`value`만 포함하며 profile ID, tool, MCP server, matcher를 포함할 수 없다. TTL은 5분 이하이고 cache하지 않는다.

`aud`는 deployment ID와 정확히 같아야 한다. live response의 `resolver_request_nonce`와 `page_context_digest`는 current outstanding resolver request와 byte-for-byte 같아야 하며 응답 채택 시 outstanding nonce를 consume한다. cache fallback은 3.1의 original nonce/cache metadata 규칙을 적용한다. `issued_at`은 최대 5분의 미래 clock skew만 허용하고, `expires_at`은 `issued_at` 뒤이며 `MATCHED` TTL은 24시간 이하이다. `profile_version`은 양의 정수다. matcher는 요청 origin과 exact match하고 요청 path의 prefix여야 한다. 후보가 둘 이상이거나 동일 specificity이면 resolver가 아니라 extension이 거부한다.

fingerprint는 [14-semantic-projection-fingerprint.md](14-semantic-projection-fingerprint.md)의 `semantic-projection-fp-v1` canonicalization·golden vector 결과와 byte-for-byte 일치해야 한다. `MATCHED`일 때 extension은 검증된 JWS payload에서 안정적인 Profile 정의만 allowlist projection한다. projection은 `schema_version`, `profile_id`, `profile_version`, `matcher`, `fingerprint`, `tools`, `authoritative_fields`, 그리고 `business_mcp`의 server/tool/argument/result declaration을 포함하고 `iss/aud/issued_at/expires_at`, resolver nonce, page-context digest와 record별 `subject_token`은 제외한다. 이 projection의 RFC 8785 bytes를 SHA-256한 `signed_definition_digest`, `(deployment_id, profile_id, profile_version)`과 `profile_jws`를 Host durable CAS에 전송한다. Host도 JWS를 다시 검증한 뒤 같은 projection/digest를 독립 계산하고 claimed tuple/digest mismatch를 거부한다. Host key는 `(deployment_id, profile_id)` 하나이며 `higher version → ADVANCED`, `same version + same definition digest → IDEMPOTENT_ACCEPTED`, `same version + different definition digest` 또는 lower version은 `PROFILE_UNAVAILABLE`다. matcher/fingerprint/tool 정의 변경은 version 상승 없이는 수락하지 않되, 같은 정의/version의 record별 signed binding과 subject token은 별도의 R-18 검증을 통과해 사용할 수 있다. `UNKNOWN`은 fingerprint와 page-context 결속만 확인하고 Host CAS나 cache를 사용하지 않는다. Host durable store에는 version과 definition digest만 쓴다.

### 3.3 도구 및 verifier 선언

`tools`의 각 item은 기존 Company Tool 이름 하나만 선언한다. 임의 tool 추가, CSS/XPath, JavaScript, URL은 없다.

```json
{
  "name": "click_by_ref",
  "effect": "server-side",
  "risk_floor": "R2",
  "eligible_roles": ["button", "link"],
  "label_categories": ["submit", "continue"],
  "activation": "programmatic-click",
  "verifier": {
    "declaration_id": "case-submit-v1",
    "kind": "business-state-transition",
    "authoritative_field_id": "case-status",
    "expected_transition": "draft-to-submitted"
  }
}
```

- `effect`는 `local-ui-only` 또는 `server-side`이며 생략할 수 없다. `server-side`와 autosave 가능 target의 `risk_floor`는 최소 R2다. `risk_floor`는 policy가 계산한 위험도를 올릴 수만 있고 낮출 수 없다. R3는 어떤 profile도 노출할 수 없다.
- `eligible_roles`, `allowed_keys`, semantic state predicate와 business transition은 각각 profile schema의 closed enum이다. `label_categories`는 [14의 enum](14-semantic-projection-fingerprint.md)을 따르되 mutation capability에는 `other`와 `none`을 허용하지 않는다. raw label, selector, page text를 넣을 수 없다.
- verifier `kind`는 `semantic-state-transition`, `exact-navigation-transition`, `business-state-transition` 중 하나다. `semantic-state-transition`은 `required_changes` closed enum을, navigation은 exact `origin`, release compatibility matrix의 `path_template_id`, `required_post_states`를, business transition은 같은 profile의 `authoritative_field_id`와 Registry가 승인한 `expected_transition` enum을 요구한다. 임의 regex, 단순 `same-origin`, 모델 제공 predicate는 허용하지 않는다.
- service worker는 모델 proposal에서 verifier 관련 field를 거부하고, current tool declaration과 실행 직전 pre-state로 [12의 `VerifierPredicate`](12-low-cost-agent-implementation-spec.md)를 만든다. predicate가 실행 전에 이미 참이면 no-op으로 거부한다. `server-side` effect는 authoritative business transition 또는 exact navigation 뒤 authoritative post-state 없이는 `TARGET_NOT_ACTIONABLE`이다.
- `activation`은 `programmatic-click`, `programmatic-key`, `none` 중 하나다. tool/role/key 조합이 명시되지 않았거나 trusted input이 필요한 target이면 `TARGET_NOT_ACTIONABLE`이다.
- profile 변경, 만료, matcher/fingerprint mismatch, cache 없이 발생한 resolver 오류 또는 cache corruption은 profile의 모든 tool, pending confirmation, ref registry를 즉시 폐기하고 run을 취소한다.

### 3.4 MCP Registry와 Page별 MCP 확장

MCP Registry는 서버가 어디에 있고 어떤 credential/audience를 쓰는지 소유한다. Page Profile은 이 페이지에서 Registry의 어느 server와 어느 read-only tool을 허용하는지만 선언한다. Registry의 URL이나 header가 profile·모델·extension에 들어가지 않는다.

```json
{
  "server_id": "equipment-master",
  "subject_token": "opaque-base64url-token",
  "tools": [
    {
      "tool_id": "get-equipment-line",
      "mcp_tool": "getEquipmentLine",
      "exposure": "deterministic-only",
      "arguments": [
        {"name": "subject_token", "source": "server_subject_token"}
      ],
      "result": {
        "value_kind": "text",
        "result_key": "line",
        "model_visibility": "denied",
        "user_visibility": "allowed"
      }
    },
    {
      "tool_id": "get-equipment-status",
      "mcp_tool": "getEquipmentStatus",
      "exposure": "agentic-read",
      "arguments": [
        {"name": "subject_token", "source": "server_subject_token"},
        {"name": "scope", "source": "model_enum", "allowed_values": ["current"]}
      ],
      "result": {
        "value_kind": "text",
        "result_key": "status",
        "model_visibility": "allowed",
        "user_visibility": "denied"
      }
    }
  ]
}
```

`business_mcp`는 `server_id`가 중복되지 않는 array다. `server_id`는 Host release configuration의 MCP Registry allowlist와 정확히 일치한다. server별 `subject_token`은 resolver가 현재 `page_context_digest`, `resolver_request_nonce`와 profile version에 대해 발급한 opaque token이며 profile 만료보다 늦게 만료될 수 없다. JWS claim과 함께 다른 exact page record로 옮길 수 없다. 하나의 page profile은 여러 server를 허용할 수 있지만, 선언하지 않은 server와 tool은 후보가 아니다.

`tool_id`는 모델·extension에서 쓰는 stable lower-kebab-case 이름이고 `mcp_tool`은 Host가 gateway에 전달하는 해당 server의 등록 tool 이름이다. Host Registry는 `(server_id, tool_id, mcp_tool)` 조합을 다시 allowlist한다. `exposure`은 `deterministic-only` 또는 `agentic-read`다. `deterministic-only`는 모델 tool snapshot에 절대 넣지 않고 Context Router만 호출한다. `agentic-read`는 profile이 허용한 read-only schema만 동적으로 모델에 노출한다.

각 argument source는 `server_subject_token`, profile의 non-secret `constant`, closed enum의 `model_enum` 중 하나다. `model_enum` item은 `{name, source:"model_enum", allowed_values:[...]}` closed schema로 profile과 Host Registry 양쪽에 같은 이름·enum set을 선언해야 한다. raw DOM value, URL query, ref/model-ref, header, user identity는 argument source가 될 수 없다. 기존 WebBrain profile의 `$page.fields.*` binding은 이 신규 설계에서 raw 값으로 이식하지 않고 resolver가 발급한 `subject_token`으로 대체한다. `result_key`는 ASCII lower camel-case top-level key 하나만 허용하며 JSONPath·template·script는 허용하지 않는다. `model_visibility`와 `user_visibility`의 기본값은 모두 `denied`이며 `allowed`는 server/tool별 data owner 승인과 Host allowlist가 동시에 있어야 한다.

profile 변경·만료·navigation·fingerprint mismatch는 모든 page-selected MCP tool, pending request, 기존 result를 즉시 철회한다. 다른 profile, global default, DOM, 모델 제안으로 server/tool을 선택·대체할 수 없다.

### 3.5 authoritative field 선언

`authoritative_fields`는 모델이 선택할 수 있는 유일한 Business MCP 읽기 목록이다.

```json
{
  "field_id": "production-line",
  "value_source": {
    "server_id": "equipment-master",
    "tool_id": "get-equipment-line"
  },
  "value_kind": "text",
  "max_age_seconds": 60,
  "user_visibility": "allowed",
  "model_visibility": "denied"
}
```

`value_source`는 같은 profile의 `business_mcp` 안에 있는 `deterministic-only` tool을 정확히 가리켜야 한다. `field_id`와 source `(server_id, tool_id)` 조합은 Host Registry allowlist와 모두 일치해야 한다. field는 MCP endpoint, argument, subject token을 재정의할 수 없다. DOM, URL query, model argument로 업무 record ID를 만들거나 보강하지 않는다.

`value_kind`는 `text`, `number`, `boolean`, `date`, `enum`만 허용한다. `max_age_seconds`는 0~300이다. `model_visibility`의 기본값은 `denied`이며 `allowed`는 field/server/tool별 data owner 승인과 Host allowlist가 동시에 있을 때만 가능하다. `user_visibility`가 `denied`이면 value를 Side Panel에도 보내지 않는다.

### 3.6 SPA 변화와 profile 재해결

content script는 navigation/document epoch 외에도 `history.pushState`, `history.replaceState`, `popstate`, exact canonical path 또는 `page_context_digest` 변화, visible fingerprint membership, main heading·form landmark·dialog의 major semantic 변화, fingerprint hash 변화를 page-context refresh signal로 처리한다. signal이 오면 service worker는 이전 profile의 business tool snapshot, pending MCP request, unconsumed business result를 먼저 폐기하고 새 context digest/projection fingerprint로 resolver를 다시 호출한다. 새 profile이 확정되기 전에는 basic read-only tool만 사용할 수 있으며 이전 page의 JWS/subject token/cache/server/tool은 재사용하지 않는다.

## 4. Business MCP 실행

### 4.1 MCP 확장 및 tool 선택 알고리즘

1. service worker는 current document의 verified Page Profile 하나를 확정한다. resolver가 signed `resolution: UNKNOWN`을 반환한 unknown page에서는 모든 business tool과 `get_authoritative_field`를 모델 tool snapshot에서 제거하고 Ask의 basic read-only tool만 남긴다. Act는 deny한다.
2. Context Router는 profile의 `business_mcp[].tools`를 검증하고 전체 profile/JWS 대신 page name, field semantic, risk와 허용 tool schema만 담은 compact profile summary를 만든다. `deterministic-only` tool은 field `value_source`를 위해 보관하지만 모델에 보이지 않는다. `agentic-read` tool만 page-specific model tool schema로 추가한다.
3. 모델이 `get_authoritative_field(field_id)`를 요청하면 worker는 field의 `value_source`를 선택한다. 모델은 server ID, MCP tool, endpoint, subject token을 보거나 선택하지 못한다.
4. 모델이 `agentic-read` tool을 요청하면 worker는 현재 profile에 같은 `(server_id, tool_id)`가 있고 request argument가 closed schema와 mode/risk policy를 통과하는지 확인한다.
5. Host는 JWS에서 선택된 source의 `(server_id, tool_id, mcp_tool)`를 읽어 Registry가 가진 해당 고정 route만 호출한다. 이전 profile, 다른 page의 server/tool, global default는 후보가 아니다.
6. navigation, major SPA fingerprint change 또는 profile 재해결 후에는 이전 MCP result와 pending request를 폐기하고 새 profile의 tool snapshot을 다시 만든다.

### 4.2 확장과 Host 경계

공통 모델 tool schema는 `get_authoritative_field({"field_id": "..."})`이며, 여기에 4.1에서 확정한 page-specific `agentic-read` schema만 추가된다. service worker는 현재 verified profile의 `field_id` enum에 없는 값, profile 없는 run, Ask/Act 외 모드, raw subject/value argument를 즉시 거부한다.

검증 후 extension은 Host에 다음 typed Native Messaging request를 보낸다. Host는 허용 extension ID, current run, profile JWS, profile tuple, size와 schema를 다시 검사한다.

```json
{
  "kind": "GET_AUTHORITATIVE_FIELD",
  "schema_version": 1,
  "request_id": "7d7e3d38-2b9a-4c92-9921-1ff835b0c653",
  "run_id": "opaque-run-id",
  "resolver_request_nonce": "opaque-base64url-nonce",
  "page_context_digest": "base64url-sha256",
  "profile_jws": "compact-jws",
  "field_id": "production-line"
}
```

Host는 JWS의 `resolver_request_nonce`/`page_context_digest`와 request 값을 byte-for-byte 비교하고 current `run_id`에 처음 결속한 tuple과도 같아야 한다. 그 뒤 profile의 selected `(server_id, tool_id, mcp_tool)`과 server `subject_token`을 JWS에서만 읽는다. extension이 별도 server ID, MCP tool, endpoint, subject token, user identity 또는 header를 보낸 경우 request 전체를 거부한다.

profile의 `agentic-read` business tool은 아래처럼 별도 request로 호출한다. `tool_id`는 현재 profile tool schema에 있던 모델 tool 이름과 정확히 같아야 하며 `arguments`는 해당 tool의 closed schema에서 `model_enum`으로 선언된 key만 포함할 수 있다.

```json
{
  "kind": "CALL_PAGE_BUSINESS_TOOL",
  "schema_version": 1,
  "request_id": "7d7e3d38-2b9a-4c92-9921-1ff835b0c653",
  "run_id": "opaque-run-id",
  "resolver_request_nonce": "opaque-base64url-nonce",
  "page_context_digest": "base64url-sha256",
  "profile_jws": "compact-jws",
  "tool_id": "get-equipment-status",
  "arguments": {"scope": "current"}
}
```

### 4.3 Host와 Business MCP gateway 경계

Host MCP Registry는 `server_id`를 고정 HTTPS gateway route와 assertion audience로, `(server_id, tool_id, mcp_tool)`를 허용 field ID·argument schema·data classification으로 매핑한다. 매핑이 없거나 profile source가 Registry와 다르면 `BUSINESS_MCP_NOT_CONFIGURED`이며 network를 열지 않는다. Host는 현재 Windows session으로 Business MCP용 짧은 TTL assertion을 별도로 발급받는다. AI Hub assertion과 audience가 같다고 가정하거나 재사용하지 않는다.

Host는 redirect 없이 MCP Registry의 `POST /v1/tools:call` 고정 HTTPS gateway route로 `Content-Type: application/json` 요청을 한 번만 보낸다. 이 route는 authoritative value와 `agentic-read` 양쪽의 Host adapter endpoint이며 external MCP transport 세부사항은 Host 뒤에 숨긴다. cancellation은 connection을 중단한다. connect와 전체 timeout은 각각 2초와 5초이며 자동 재시도는 없다. 두 call kind는 서로 다른 `additionalProperties: false` JSON Schema를 사용하며 union처럼 임의 field를 섞을 수 없다.

authoritative field request는 다음 closed schema다. `page_context_digest`와 `resolver_request_nonce`는 extension request 및 JWS claim과 정확히 같아야 한다.

```json
{
  "schema_version": 1,
  "kind": "GET_AUTHORITATIVE_FIELD",
  "request_id": "7d7e3d38-2b9a-4c92-9921-1ff835b0c653",
  "deployment_id": "company-prod",
  "profile_id": "eda-equipment-edit",
  "profile_version": 17,
  "resolver_request_nonce": "opaque-base64url-nonce",
  "page_context_digest": "base64url-sha256",
  "server_id": "equipment-master",
  "tool_id": "get-equipment-line",
  "mcp_tool": "getEquipmentLine",
  "field_id": "production-line",
  "subject_token": "opaque-base64url-token"
}
```

`agentic-read` request는 별도 closed schema다. Host는 `arguments`를 Profile과 Registry의 교집합인 exact key/enum set으로 다시 만들며 extension object를 그대로 forward하지 않는다. `subject_token`과 constant는 JWS에서만 주입한다.

```json
{
  "schema_version": 1,
  "kind": "CALL_PAGE_BUSINESS_TOOL",
  "request_id": "7d7e3d38-2b9a-4c92-9921-1ff835b0c653",
  "deployment_id": "company-prod",
  "profile_id": "eda-equipment-edit",
  "profile_version": 17,
  "resolver_request_nonce": "opaque-base64url-nonce",
  "page_context_digest": "base64url-sha256",
  "server_id": "equipment-master",
  "tool_id": "get-equipment-status",
  "mcp_tool": "getEquipmentStatus",
  "subject_token": "opaque-base64url-token",
  "arguments": {"scope": "current"}
}
```

assertion은 관리자 구성으로 정한 단일 header에만 넣고 gateway 외부로 forwarding하지 않는다. Host는 browser header, cookie, `Authorization`, page URL, DOM/ref/model-ref, user name/UPN/group을 gateway 요청에 보내지 않는다.

authoritative field 성공 응답은 아래 closed schema이며 `kind`, `request_id`, `field_id`, `value_kind`가 request/profile과 정확히 같아야 한다.

```json
{
  "schema_version": 1,
  "kind": "GET_AUTHORITATIVE_FIELD_RESULT",
  "request_id": "7d7e3d38-2b9a-4c92-9921-1ff835b0c653",
  "status": "OK",
  "field_id": "production-line",
  "value_kind": "text",
  "display_value": "Example Owner",
  "observed_at": "2026-08-15T00:00:00Z",
  "expires_at": "2026-08-15T00:01:00Z",
  "provenance": {"source_version": "opaque-version"}
}
```

`expires_at - observed_at`은 profile의 `max_age_seconds`를 넘을 수 없다. Host, service worker, Side Panel은 `display_value`를 현재 run memory에서만 처리하며 cache, audit, telemetry, error text, persistent store에 기록하지 않는다. `user_visibility: allowed`일 때만 Side Panel에 값을 표시한다. `model_visibility: allowed`일 때만 typed tool result에 값을 넣는다. 그렇지 않으면 모델에는 `{"status":"OK","field_id":"production-line","value_withheld":true}`만 보낸다.

`agentic-read` 성공 응답은 아래 별도 closed schema다. gateway별 JSON Schema는 `result`에 Profile/Registry가 합의한 exact `result_key` 하나만 허용하고 그 값은 declared `value_kind`의 4 KiB 이하 scalar여야 한다. 예시의 `status` 외 key, nested object/array 또는 `result_key`/`value_kind` mismatch는 response 전체를 거부한다.

```json
{
  "schema_version": 1,
  "kind": "CALL_PAGE_BUSINESS_TOOL_RESULT",
  "request_id": "7d7e3d38-2b9a-4c92-9921-1ff835b0c653",
  "status": "OK",
  "tool_id": "get-equipment-status",
  "result_key": "status",
  "value_kind": "text",
  "result": {"status": "operational"},
  "observed_at": "2026-08-15T00:00:00Z",
  "expires_at": "2026-08-15T00:01:00Z"
}
```

Host는 exact scalar만 최대 4 KiB typed tool result로 정규화한다. server가 정의하지 않은 field, nested object, raw response body는 모델·Side Panel·log에 전달하지 않는다. `agentic-read`는 R0 read-only이므로 `result.model_visibility: allowed`인 profile/Host data-owner allowlist가 없으면 tool 자체를 모델에 노출하지 않는다.

### 4.4 결과와 실패

Business MCP gateway의 정상 비성공 응답은 `NOT_FOUND`, `ACCESS_DENIED`, `STALE_CONTEXT`만 허용한다. Host가 정규화하는 인프라 실패는 `BUSINESS_MCP_NOT_CONFIGURED`, `BUSINESS_MCP_UNAVAILABLE`, `BUSINESS_MCP_TIMEOUT`, `BUSINESS_MCP_PROTOCOL_ERROR`다. user-facing 메시지는 reason code만 사용하며 gateway response body와 assertion 세부사항을 노출하지 않는다.

gateway non-success schema도 request call kind에 대응하는 result `kind`, exact `request_id`, `status`만 허용하고 field/tool/result/value는 포함하지 않는다. call-kind가 다르거나 unknown key가 있으면 정상 실패가 아니라 `BUSINESS_MCP_PROTOCOL_ERROR`다.

- `NOT_FOUND`, `ACCESS_DENIED`, `STALE_CONTEXT`은 값 없는 typed 결과로 끝난다. 모델은 다른 MCP, field, DOM, 추정값을 같은 authoritative field의 대체값으로 사용하지 못한다.
- timeout, TLS, cancellation, malformed/oversize response, assertion 문제, response/profile 불일치는 `BUSINESS_MCP_UNAVAILABLE` 또는 `BUSINESS_MCP_PROTOCOL_ERROR`로 fail closed 한다.
- profile 변경·만료·navigation·Stop·worker 재시작은 진행 중 Host request를 취소하고 뒤늦은 response를 폐기한다. successful response도 profile/run/request nonce/page-context/call-kind/field-or-tool tuple이 더 이상 current가 아니면 표시하거나 모델에 전달하지 않는다.

## 5. 구성, 감사 및 운영

- Managed Storage에는 resolver URL과 origin allowlist만 둔다. MCP Registry의 `server_id → gateway route/audience/assertion header`와 `(server_id, tool_id, mcp_tool) → argument schema/data classification/field allowlist` 매핑은 Host의 관리자 ACL 구성에만 둔다.
- profile key ring, Host MCP Registry, gateway assertion issuer/audience, supported schema version은 같은 compatibility matrix entry로 package한다. profile/Registry key 또는 schema version이 맞지 않으면 deployment를 중단한다. Profile Registry의 publish는 corporate auth 또는 mTLS, publisher RBAC, version history와 rollback audit을 요구한다.
- audit에는 `tool: get_authoritative_field|page_business_tool`, profile ID/version, `server_id`, `tool_id`, field ID(해당 시), outcome, reason code만 허용한다. `subject_token`, JWS, `display_value`, provenance의 원문, assertion, path는 금지한다.
- 운영 사전 조건은 profile resolver issuer/key rotation, server/tool별 data owner, Business MCP assertion issuer/audience/revocation, Registry route/certificate, field classification 및 model visibility 승인이다. 하나라도 없으면 해당 server/tool은 Registry에 배포하지 않는다.

### 5.1 Host MCP Registry schema

다음은 Host 관리자 ACL 구성의 공개 가능한 shape다. `gateway_url`, assertion audience/header reference는 Host만 읽으며 Managed Storage, profile JWS, extension, model에는 복사하지 않는다. secret value는 어느 필드에도 들어가지 않는다.

```json
{
  "schema_version": 1,
  "servers": [
    {
      "server_id": "equipment-master",
      "transport": "streamable-http",
      "gateway_url": "https://mcp.company.example/equipment",
      "assertion_audience": "business-mcp-equipment",
      "assertion_header_ref": "business-mcp-user-assertion-v1",
      "tools": [
        {
          "tool_id": "get-equipment-line",
          "mcp_tool": "getEquipmentLine",
          "allowed_field_ids": ["production-line"],
          "argument_sources": ["server_subject_token"],
          "result_contracts": [{"field_id": "production-line", "result_key": "line", "value_kind": "text"}],
          "data_classification": "internal"
        },
        {
          "tool_id": "get-equipment-status",
          "mcp_tool": "getEquipmentStatus",
          "allowed_field_ids": [],
          "argument_sources": ["server_subject_token", "model_enum"],
          "model_arguments": [{"name": "scope", "allowed_values": ["current"]}],
          "result_contract": {"result_key": "status", "value_kind": "text"},
          "data_classification": "internal"
        }
      ]
    }
  ]
}
```

`server_id`와 `tool_id`는 전 deployment에서 immutable ID다. server ID를 다른 URL로 바꾸거나 tool schema/classification을 넓히는 변경은 Profile Registry publish와 별개로 compatibility matrix, data owner, IAM 승인을 요구한다. Profile은 Registry에 없는 server/tool을 참조할 수 없고, Registry만으로도 어떤 페이지에 tool을 노출할 수 없다.

## 6. 필수 contract 검증

1. resolver request에서 query/fragment, cookie, raw DOM/ref/value가 나가지 않는다.
2. unsigned/wrong-kid/wrong-audience/expired/future/oversize/tied matcher/fingerprint/request-nonce/page-context mismatch profile을 거부한다. extension/Host definition projection digest가 일치해야 하며 첫 수락 뒤 같은 version/same definition digest의 새 run/tab/cache fallback과 record별 binding은 성공하고 same version/different definition과 lower version은 matcher/fingerprint 변화와 무관하게 거부한다.
3. profile에 없는 tool/field, unknown `server_id`/`tool_id`, raw subject argument, arbitrary endpoint/header와 같은 fingerprint를 가진 다른 page record의 JWS/subject/cache를 거부한다.
4. Host가 현재 page profile의 `(server_id, tool_id)` Registry route와 별도 Business MCP assertion audience만 사용하고 AI Hub assertion을 재사용하지 않음을 검증한다.
5. stale/foreign/oversize/malformed response, timeout, cancellation과 profile change 중 late response는 value를 표시·모델 전달·cache하지 않는다.
6. `model_visibility: denied` value가 model request, completion, audit, log에 없고 `user_visibility: denied` value가 Side Panel에도 없음을 검사한다.
7. MCP 실패 또는 `NOT_FOUND`/`ACCESS_DENIED` 뒤 다른 server/tool, DOM/LLM fallback, 자동 재시도, 다른 field probing이 없음을 검증한다.
8. `GET_AUTHORITATIVE_FIELD`와 `CALL_PAGE_BUSINESS_TOOL`의 valid/invalid fixture를 별도로 실행하고 call-kind field 혼합, model enum 밖 argument, argument 누락/변조, result-key/value-kind mismatch, nested/raw result를 거부한다.
9. 같은 profile/fingerprint를 가진 두 exact page record 사이에서 resolver nonce, page-context digest, JWS, subject token, cache와 late response를 교차 사용하면 extension과 Host 양쪽이 거부한다.
