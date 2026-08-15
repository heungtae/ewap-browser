# 02. 보안 및 행동 정책

## 1. 신뢰 경계

| 입력/구성요소 | 신뢰 수준 | 필요한 처리 |
|---|---|---|
| 웹 페이지 DOM, AX text, content-script 메시지 | 비신뢰 | schema 검증, 길이 제한, 출력 인코딩, 권한 없는 명령 거부 |
| LLM tool call 및 텍스트 | 비신뢰 | allowlist, JSON schema, deterministic policy, verifier |
| Side Panel 사용자 요청 | 부분 신뢰 | mode/origin/risk/확인 정책 재검사 |
| Managed Storage | 무결성 신뢰, 비밀성 비신뢰 | 형식·서명/버전 검증; 비밀을 저장하지 않음 |
| Native Host | 높은 신뢰 | 확장 ID allowlist, 최소 IPC schema, Windows ACL |
| AI Hub/SSO | 원격 신뢰 경계 | TLS, assertion 검증, 회수·감사·rate limit |

## 2. 모드와 origin

- **Ask**: 읽기 전용 도구만. 모든 브라우저·MCP 상태 변경을 거부한다.
- **Act**: Managed Storage의 enterprise origin allowlist에 정확히 일치할 때만 가능하다.
- 정확한 origin은 scheme, host, port로 비교한다. wildcard는 최상위 도메인 소유 검토를 거친 명시 규칙만 허용한다.
- localhost, 파일 URL, IP literal, 확장 페이지, 데이터 URL, 알 수 없는 origin은 Act 거부가 기본이다.

## 3. 위험 등급

| 등급 | 예 | 정책 |
|---|---|---|
| R0 | AX tree 읽기, 페이지 요약 | Ask/Act 허용 |
| R1 | 일반 입력, 선택, 비파괴 토글 | Act + 검증 필요 |
| R2 | 제출, 승인, 생성, 외부 전송, 업무 상태 변경 | Act + 정확한 intent의 명시 확인 + 검증 |
| R3 | 삭제, 되돌릴 수 없는 폐기, 보안·권한 변경, 금전/계약 확정 | 항상 거부 |

위험 분류는 tool 이름만으로 결정하지 않는다. target semantic role/label, action argument의 구조, profile metadata, 현재 문서 상태를 함께 검사하고 더 높은 위험도를 적용한다.

## 4. Company Tool 계약

최초 공개 도구는 아래 allowlist로 한정한다. 새 도구는 이 문서의 모든 항목을 충족한 설계·테스트·보안 검토 없이 추가할 수 없다.

| 도구 | 모드 | 최대 위험 | 실행/검증 |
|---|---|---|---|
| `read_accessibility_tree` | Ask, Act | R0 | 값 redaction 후 snapshot 반환 |
| `find_by_ref` | Ask, Act | R0 | 현재 document epoch의 ref만 반환 |
| `read_page_summary` | Ask, Act | R0 | 제한된 semantic 요약 |
| `set_text_by_ref` | Act | R1 | label preflight, 이벤트 후 value/ARIA 검증 |
| `select_option_by_ref` | Act | R1 | 허용 option 발견 후 selected state 검증 |
| `set_checked_by_ref` | Act | R1 | checkbox/radio ARIA state 검증 |
| `click_by_ref` | Act | R2 | semantic target preflight, navigation/상태 검증 |
| `press_key_by_ref` | Act | R2 | 허용 key allowlist, 결과 검증 |
| `get_authoritative_field` | Ask, Act | R0 | profile-bound Business MCP만 호출 |

`execute_js`, arbitrary fetch, research/search, download/upload, scheduler, cloud sync, OAuth provider 추가, CAPTCHA, WebMCP, social automation은 도구·메시지·manifest·설정 어느 층에서도 제공하지 않는다.

## 5. 변경 실행 규칙

1. `ref_id`는 current document epoch와 frame scope에 존재해야 한다.
2. CSS/XPath는 내부 verifier의 제한된 fallback일 뿐, LLM API에 노출하지 않는다.
3. tool argument는 JSON schema, 길이, Unicode control character, 허용 key/value 목록을 검증한다.
4. 민감 필드(role=password, OTP/MFA 추정 label, secret profile field)는 읽기·기록·입력 모두 거부한다.
5. 동일 intent digest는 terminal outcome 전에는 한 번만 예약된다.
6. stale ref, navigation, target 가림, 실행 예외는 `FAILED` 또는 `UNKNOWN`으로 종료한다.
7. `UNKNOWN`은 자동·모델 유도·백그라운드 재시도를 금지한다.

## 6. 확인과 중지

R2 확인 화면은 target label, 예정 행동, 위험 이유, profile 이름을 보이며 raw field value를 표시하지 않는다. 승인 시 intent digest가 바뀌었거나 문서 epoch가 달라지면 승인 토큰은 무효다. Stop은 실행 큐, model stream, native port를 취소하고 가능한 경우 debugger/attached resource를 해제한다.

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
