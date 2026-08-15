# 02. 보안 및 행동 정책

## 1. 신뢰 경계

| 입력/구성요소 | 신뢰 수준 | 필요한 처리 |
|---|---|---|
| 웹 페이지 DOM, semantic projection text, content-script 메시지 | 비신뢰 | schema 검증, 길이 제한, 출력 인코딩, 권한 없는 명령 거부 |
| LLM tool call 및 텍스트 | 비신뢰 | allowlist, JSON schema, deterministic policy, verifier |
| Side Panel 사용자 요청 | 부분 신뢰 | mode/origin/risk/확인 정책 재검사 |
| Managed Storage | 무결성 신뢰, 비밀성 비신뢰 | 형식·서명/버전 검증; 비밀을 저장하지 않음 |
| Native Host | 높은 신뢰 | 확장 ID allowlist, 최소 IPC schema, Windows ACL |
| AI Hub/SSO | 원격 신뢰 경계 | TLS, assertion 검증, 회수·감사·rate limit |

## 2. 모드와 origin

- **Ask**: 읽기 전용 도구만. 모든 브라우저·MCP 상태 변경을 거부한다. 읽기와 모델 전송도 enterprise allowlist에 정확히 일치할 때만 가능하다.
- **Act**: Managed Storage의 enterprise origin allowlist에 정확히 일치할 때만 가능하다.
- 정확한 origin은 scheme, host, port로 비교한다. wildcard는 최상위 도메인 소유 검토를 거친 명시 규칙만 허용한다.
- 페이지 semantic projection 수집, Profile resolver 호출, LLM egress는 각각 같은 policy bundle의 `page_read_origins`, `profile_resolver_origins`, `llm_egress_origins`로 독립 판정한다. 각 목록은 release artifact의 host permission 집합을 넘을 수 없다.
- localhost, 파일 URL, IP literal, 확장 페이지, 데이터 URL, 알 수 없는 origin은 Ask/Act 모두에서 snapshot 수집과 모델 전송을 기본 거부한다. 개발 fixture는 development extension ID와 별도 development policy에서만 명시 허용하며 production policy로 승격할 수 없다.

## 3. 위험 등급

| 등급 | 예 | 정책 |
|---|---|---|
| R0 | semantic projection 읽기, 페이지 요약 | Ask/Act 허용 |
| R1 | 일반 입력, 선택, 비파괴 토글 | Act + 검증 필요 |
| R2 | 제출, 승인, 생성, 외부 전송, 업무 상태 변경 | Act + 정확한 intent의 명시 확인 + 검증 |
| R3 | 삭제, 되돌릴 수 없는 폐기, 보안·권한 변경, 금전/계약 확정 | 항상 거부 |

위험 분류는 tool 이름만으로 결정하지 않는다. target semantic role/label, action argument의 구조, signed Profile의 effect/risk declaration, 현재 문서 상태를 함께 검사하고 더 높은 위험도를 적용한다. 모든 mutation primitive는 Profile이 `local-ui-only` effect를 증명할 때만 R1이며 autosave, 외부 전송 또는 server-side 업무 상태 변경 가능성이 있으면 R2로 승격한다. effect 선언이 없거나 server-side effect의 authoritative verifier를 만들 수 없으면 `TARGET_NOT_ACTIONABLE`로 거부한다.

## 4. Company Tool 계약

최초 공개 도구는 아래 allowlist로 한정한다. 새 도구는 이 문서의 모든 항목을 충족한 설계·테스트·보안 검토 없이 추가할 수 없다.

| 도구 | 모드 | 최대 위험 | 실행/검증 |
|---|---|---|---|
| `read_semantic_projection` | Ask, Act | R0 | 값 redaction 후 DOM semantic projection 반환 |
| `find_by_ref` | Ask, Act | R0 | 현재 document epoch의 ref만 반환 |
| `read_page_summary` | Ask, Act | R0 | 제한된 semantic 요약 |
| `set_text_by_ref` | Act | R1 또는 R2 | Profile effect 분류, label preflight, 값+업무 상태 전이 검증 |
| `select_option_by_ref` | Act | R1 또는 R2 | Profile effect 분류, option 단일 일치, 선택+업무 상태 전이 검증 |
| `set_checked_by_ref` | Act | R1 또는 R2 | Profile effect 분류, checkbox/radio+업무 상태 전이 검증 |
| `click_by_ref` | Act | R1 또는 R2 | Profile effect 분류, semantic target preflight, exact navigation/상태 전이 검증 |
| `press_key_by_ref` | Act | R1 또는 R2 | Profile effect 분류, 허용 key, exact navigation/상태 전이 검증 |
| `get_authoritative_field` | Ask, Act | R0 | profile의 deterministic Business MCP value source만 호출 |

`execute_js`, arbitrary fetch, research/search, download/upload, scheduler, cloud sync, OAuth provider 추가, CAPTCHA, WebMCP, social automation은 도구·메시지·manifest·설정 어느 층에서도 제공하지 않는다.

`get_authoritative_field`는 current verified Page Profile에 선언된 `field_id` 하나만 argument로 받는다. service worker는 field의 deterministic `value_source`를 profile에서 결정하며, model은 server ID, MCP tool, record ID, value, header를 고를 수 없다. profile의 `agentic-read` tool은 해당 page의 allowlist와 closed read-only schema를 통과할 때만 별도 model tool로 노출한다. Host는 서명된 profile의 `(server_id, tool_id)`를 MCP Registry의 고정 route로 해석한다. 값의 model/Side Panel 노출과 실패·fallback 규칙은 [13-page-profile-and-business-mcp-contract.md](13-page-profile-and-business-mcp-contract.md)를 따른다.

## 5. 변경 실행 규칙

1. 내부 `ref_id`는 current document epoch와 frame scope에 존재해야 한다. 모델에는 run 한정·crypto-random `model_ref`만 전달하고 service worker만 `model_ref → ref_id`를 한 번 해석한다. Host, bridge, LLM, audit에는 raw `ref_id`나 이 매핑을 보내지 않는다.
2. CSS/XPath는 내부 verifier의 제한된 fallback일 뿐, LLM API에 노출하지 않는다.
3. tool argument는 JSON schema, 길이, Unicode control character, 허용 key/value 목록을 검증한다.
4. 민감 필드(role=password, OTP/MFA 추정 label, secret profile field)는 읽기·기록·입력 모두 거부한다.
5. 동일 intent digest는 terminal outcome 전에는 한 번만 예약된다.
6. stale ref, navigation, target 가림, 실행 예외는 `FAILED` 또는 `UNKNOWN`으로 종료한다.
7. `UNKNOWN`은 자동·모델 유도·백그라운드 재시도를 금지한다.
8. 모델 proposal에는 verifier/`expected` field를 허용하지 않는다. verifier predicate는 service worker가 signed Profile의 closed declaration, 실행 직전 pre-state와 tool rule에서 생성하며 ActionIntent에 내부 값으로 결속한다.
9. mutation 성공은 실행 전에는 거짓이던 predicate가 실행 뒤 참이 된 상태 전이 또는 Profile의 exact origin/path-template navigation과 post-navigation state를 모두 증명해야 한다. 이미 참인 상태, no-op, 단순 same-origin 이동은 `VERIFIED`가 아니다.

## 6. ActionIntent, 값, 확인과 중지

`ActionIntent`는 `tool`, target `ref_id`/frame/document epoch, profile ID/version, 위험도, verifier 기대값, non-secret argument와 `ValueBinding(value_slot_id, value_kind, value_digest)`을 canonical serialization하여 digest를 만든다. raw value는 intent·intent digest·audit·LLM·Native Host에 넣지 않는다. value digest를 계산하는 일시적 hash input에만 raw value가 들어가며 계산 직후 폐기한다.

- `set_text_by_ref`와 `select_option_by_ref`의 값은 모델이 target을 제안하고 preflight가 통과한 뒤 열린 Side Panel protected value control에서 사용자가 직접 입력한 `user_supplied` 값만 받을 수 있다. 모델은 값, slot ID, digest, 길이·문자 class·미리보기를 볼 수 없으며 값을 생성·변환·대체할 수 없다. `START_ACT`와 model tool schema에는 raw value field가 없다.
- service worker가 생성한 crypto-random `value_slot_id`는 current run/tab/frame/document epoch/profile/tool/ref/value kind/TTL에 묶인다. Side Panel의 `SUBMIT_ACTION_VALUE`와 service worker의 단 한 번의 `EXECUTE_ACTION` 외 경로로 raw value를 전달하지 않는다. mismatch·duplicate·expiry는 `VALUE_BINDING_INVALID`이며 fail closed 한다.
- 값 buffer는 Side Panel → service worker → content script의 현재 run transient memory/Chrome 내부 IPC에만 존재한다. action의 terminal outcome, Stop, navigation, profile 변경, worker 재시작, 5분 inactivity 중 먼저 발생한 때 참조를 즉시 제거한다. 어떤 persistent store, audit, Host, bridge, model에도 전달하지 않으며 disconnect 뒤 복구·재전송하지 않는다.
- R2 확인 화면은 target label, 예정 행동, 위험 이유, profile 이름을 보이며 raw field value를 표시하지 않는다. 승인 시 Host가 검증한 opaque session binding, opaque tab context, intent digest 또는 document epoch가 달라지면 승인 토큰은 무효다. Host의 `BIND_SESSION`·`ISSUE_CONFIRMATION`·`VERIFY_CONFIRMATION` 재검증이 모두 성공하지 않으면 R2는 fail closed 한다.
- Stop은 실행 큐, pending/consumed value slot과 retained value reference, model stream, native port 및 attached resource를 취소·해제한다.

## 7. 필수 변경 절차

브라우저 도구를 추가하거나 변경할 때는 다음을 한 변경 세트로 제출한다.

1. schema와 Company Tool registry
2. Ask/Act allowance와 capability/risk 분류
3. 확인 행동 및 policy test
4. preflight와 verifier
5. audit redaction 분류
6. unit, negative security, Chrome fixture/E2E test
7. model-exposed tool 및 Manifest permission snapshot
8. 위협 모델·운영 문서 갱신
