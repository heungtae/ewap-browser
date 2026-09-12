# 24. 실행 정지 방지와 개발용 실행 추적 설계

- 작성일: 2026-09-12
- 상태: Proposed / 구현 전
- 소유 저장소: ewap-browser
- 구현 인계 대상: 사용자가 지정한 GPT-5.6 Terra, reasoning high
- 범위: Browser 내부 요청 생명주기, Provider 대기 제어, Side Panel 진행 표시, 로컬 진단
- 이 문서는 구현 완료나 실제 Chrome 재현 성공을 의미하지 않는다.

## 1. 문제와 목표

재현 보고: `https://code.visualstudio.com/docs`에서 질문 모드로 요약을 받은 뒤 실행 모드로 전환하고 “Remote Development using SSH 에 대한 문서 찾아.”를 요청했다. 약 5분 동안 사용자 메시지와 정지 버튼만 보이고 진행 단계나 실패 원인을 확인할 수 없었다.

화면만으로 정책 거절, 페이지 수집 지연, Provider 응답 지연, 이벤트 전달 실패를 구분할 수 없다. 정확한 당시 원인은 런타임 증거가 없어 미확정이다. 권한 완화를 해결책으로 가정하지 않는다.

목표는 모든 요청의 현재 단계·경과 시간·마지막 진척·종료 이유를 확인하고, 개발자가 하나의 요청 ID로 접수부터 결과까지 추적하는 것이다. 성공, 실패, 취소, 결과 불명, 사용자 입력 대기를 명시적으로 구분한다.

## 2. 현재 구현에서 확인한 근거

경로는 이 저장소 기준이다. 아래는 코드 관찰이며 당시 장애 원인의 확정 판정이 아니다.

| 위치 | AS-IS | 개선 요구 |
| --- | --- | --- |
| `extension/src/service-worker/act-chat-start.ts` | `readActive()` 후 첫 activity 생성 | 페이지 수집 전에 요청 접수 상태를 만든다 |
| `extension/src/service-worker/act-step-runner.ts` | 두 번째 `readActive()` 후 run 생성, Provider 호출·파싱 예외의 공통 종료 경계 부재 | 요청 전체와 개별 run을 연결하고 모든 종료 경로를 수렴한다 |
| `extension/src/providers/transport.ts` | 응답 헤더 검증 후 body 반환 시 타이머 해제 | 본문 소비 완료까지 deadline·abort를 유지한다 |
| `extension/src/providers/runtime.ts`, `provider-body.ts` | transport 반환 후 `reader.read()` 반복, 본문 대기 deadline 없음 | 전체 시간 제한과 본문 무진척 시간 제한을 둔다 |
| `extension/src/service-worker/page-context-runtime.ts` | snapshot 메시지 응답에 자체 deadline 없음 | 제한 시간·늦은 응답 무효화 적용. Profile fetch의 기존 5초 제한 유지 |
| `extension/src/service-worker/chat-message-handler.ts` | `CHAT_SEND` 응답이 전체 실행 준비 완료까지 대기 | 신규 요청 API는 빠르게 접수하고 상태 조회로 복구한다 |
| `extension/src/sidepanel/entry.ts` | activity 표시, Panel port, 완료 뒤 `CHAT_RECOVER`는 있으나 port disconnect 재연결이 없음 | 대기 중 재동기화와 연결 상태 표시를 추가한다 |
| `extension/src/service-worker/page-sender-context.ts` | panel `documentId`/`getContexts()`를 얻지 못하면 `lastFocusedWindow`의 active tab으로 fallback | 신규 요청에서는 이 fallback을 금지하고 panel window 결합을 확정하지 못하면 접수를 거절한다 |
| `extension/src/service-worker/runtime-evidence.ts` | managed endpoint가 설정된 감사 이벤트 전송 | 개발용 로컬 trace를 별도로 만든다 |
| `extension/src/service-worker/act-proposal-completion.ts` | navigate 검증 후 session 종료 | 링크 이동 성공과 사용자의 조사 목표 완료를 혼동하지 않는다 |

기준선: 2026-09-12에 providers/runtime, chat-run-lifecycle, chat-message-handler unit test 3파일·15개 통과. 실제 Chrome 정지 재현, 패키지 일치, 전체 회귀 검증은 미실시다.

## 3. 범위와 호환성 결정

Browser 구현과 Browser 내부 메시지만 변경한다. Workspace `ewap/v1` 및 Platform API, 중앙 audit 계약은 변경하지 않는다. 외부 계약 변경이 필요해지면 workspace specs → 양 제품 영향 분석 → 계약 검증 순서로 별도 설계한다.

기존 `CHAT_SEND`, `CHAT_RECOVER`, `CHAT_RESYNC`, ChatEvent 저장 포맷을 유지한다. 신규 v1 내부 API와 별도 request 상태 저장소를 추가하여 새 패널에서 사용한다. 기존 호출자는 기존 응답 의미를 유지하면서 같은 공통 lifecycle을 사용한다. 신규 API 부재 시 새 패널은 업데이트 안내를 표시하며 이미 전송한 요청을 구 API로 자동 재전송하지 않는다.

`20-stability-refactoring-design.md`의 무계약변경 제한은 당시 리팩터링 범위의 조건이다. 본 기능은 아래 명시적 추가 계약을 사용한다. 기존 파일의 무관한 전면 리팩터링은 하지 않고 신규 책임을 작은 모듈로 추출한다.

## 4. 요청 생명주기

`request_id`는 패널이 `crypto.randomUUID()`로 한 번 생성하는 표준 UUID 문자열이고 Worker가 형식·발신자·패널 인스턴스·탭 결합을 검증한다. `CHAT_REQUEST_START` 전에 panel port handshake로 `sender.documentId → 정확히 하나의 SIDE_PANEL windowId`를 확인하고, 그 window의 active tab과 document epoch를 request에 고정한다. `getContexts()` 미지원, documentId 부재, 0개/복수 매치, port와 message sender 불일치는 `PANEL_CONTEXT_UNAVAILABLE`로 거절한다. 기존 `lastFocusedWindow` fallback은 신규 API에서 사용하지 않는다. 클라이언트가 전달한 임의 tab ID로 권한을 결정하지 않으며, 이후 창 활성화 변화도 고정 대상을 바꾸지 않는다.

하나의 request 아래 0..N개의 기존 `run_id`, 하나의 Act session, 여러 span을 연결한다. snapshot 실패처럼 run 생성 전 실패도 request 단위로 기록한다. 기존 thread sequence와 trace sequence는 다른 공간이다.

요청 상태는 `ACCEPTED → RUNNING ↔ WAITING_USER → TERMINAL`이다. 진행 stage는 다음 closed enum이다.

`ACCEPTED`, `PAGE_SNAPSHOT`, `PROFILE_RESOLVE`, `WORKFLOW_DISCOVERY`, `PROVIDER_CONNECT`, `PROVIDER_BODY`, `PROPOSAL_VALIDATE`, `AWAITING_REVIEW`, `AWAITING_PERMISSION`, `AWAITING_VALUE`, `AWAITING_CONFIRMATION`, `PREFLIGHT`, `DISPATCH`, `VERIFY`, `TERMINAL`.

종료 결과는 `VERIFIED`, `FAILED`, `CANCELLED`, `UNKNOWN`이다. 연결 상태 `CONNECTED/RECONNECTING/DISCONNECTED`는 별도 UI 상태이며 작업 결과를 대신하지 않는다. 승인 대기는 멈춤으로 판정하지 않는다.

공통 finalizer는 terminal 전이를 멱등 처리하고 관련 run 종료, timer/reader/AbortController 정리, session/권한/입력 임시 데이터 해제, 상태 저장과 이벤트 발행을 담당한다. finalizer와 각 비동기 continuation은 request generation을 확인한다. 같은 요청의 terminal은 한 번만 확정되며 늦게 도착한 Provider 응답, snapshot 응답, port 이벤트로 승인 카드나 다음 실행을 만들지 않는다.

mutation dispatch 전 실패는 FAILED, 사용자 취소는 CANCELLED로 종료한다. content/CDP 실행 메시지를 보내기 **직전** `dispatch_started` 표식을 session storage에 flush한 뒤에만 dispatch한다. 그 flush가 실패하면 dispatch하지 않고 FAILED로 끝낸다. dispatch 시작 후 성공 여부를 증명하지 못하면 UNKNOWN이며 자동 재시도하지 않는다. 취소 요청 역시 이미 수행된 효과를 되돌렸다는 의미가 아니다. 검증으로 확정된 기존 결과를 보존한다.

예상 navigate에 따른 페이지 변경도 기존 document binding 규칙을 유지한다. 이번 범위는 탐색 후 새 페이지에서 자동 연구를 이어가는 기능을 추가하지 않는다. 검증된 이동에는 “문서 링크로 이동했습니다”처럼 수행 범위를 표시한다.

## 5. 제한 시간과 취소

다음은 구현 기본값이다. 테스트에서는 clock/timer를 주입한다.

| 경계 | 기본값 | 만료 시 처리 |
| --- | --- | --- |
| 패널 요청 접수 응답 | 5초 | 같은 request ID로 상태 조회; 자동 중복 실행 금지 |
| snapshot 1회 | 10초 | PAGE_SNAPSHOT_TIMEOUT; 기존 recovery를 포함한 준비 단계 전체 한도 20초 |
| Profile resolve | 기존 5초 | 기존 정책·오류 의미 보존 |
| workflow discovery | 10초 | WORKFLOW_DISCOVERY_TIMEOUT |
| Provider 전체 | 기존 config.timeout_ms | 헤더와 본문 완료까지 같은 deadline 유지 |
| Provider body 무진척 | min(30초, 남은 전체 시간) | PROVIDER_BODY_IDLE_TIMEOUT |
| 자동 실행 구간 전체 | 180초 | dispatch 전 FAILED, 이후 확정 불가 시 UNKNOWN |
| 사용자 입력 대기 | 기존 승인/선택 만료 규칙 | 자동 실행 budget은 정지; 기존 토큰 TTL 연장 금지 |
| 상태 확인 | 실행 중 3초 간격 | 응답 없음은 연결 지연으로 표시 |

전체 자동 실행 budget은 사용자 입력 대기를 제외한 누적 시간이다. 개별 deadline은 남은 전체 budget보다 클 수 없다. 새 stage 진입으로 전체 budget을 초기화하지 않는다. DISPATCH/VERIFY의 기존 더 짧은 제한을 유지한다.

Provider transport가 body와 cleanup 소유권을 명시적으로 넘기거나, transport 범위 안에서 body 소비 callback을 실행하도록 리팩터링한다. 정상 완료·파싱 오류·HTTP 오류·취소 모두 cleanup을 보장한다. 단순 Promise.race만 추가하고 네트워크나 reader를 방치하지 않는다. 중단 불가능한 Chrome 메시지는 deadline 후 결과를 폐기하고 실행 generation을 검증한다.

연결 전에 취소된 signal도 즉시 처리한다. HTTP 헤더 수신, 최초 body chunk, 이후 chunk 수신은 trace milestone이다. chunk 본문은 기록하지 않는다. Ask에도 동일한 Provider 제한을 적용하되 기존 streaming 출력은 유지한다.

## 6. 신규 Browser 내부 API

모든 메시지는 schema_version: 1, closed-key validation, 기존 panel sender 검사를 적용한다. 새 kind는 `runtime-types.ts`와 전용 validator에 함께 등록한다. 소유 tab/document epoch/panel instance가 일치하는 request만 조회·취소·trace 열람·삭제할 수 있고, 일치하지 않거나 terminal TTL로 제거된 ID에는 동일한 `REQUEST_NOT_FOUND`만 반환한다. 권한과 응답 크기는 handler에서 강제한다.

| kind | 추가 요청 필드 | 응답 의미 |
| --- | --- | --- |
| CHAT_REQUEST_START | request_id, payload: 기존 prompt/mode | accepted, request_id, 상태 revision; 접수 상태 저장 후 응답 |
| CHAT_REQUEST_STATUS | request_id | 상태, stage, outcome/code, revision, 시작·stage·마지막 진척 시각, 연결된 run ID |
| CHAT_REQUEST_CANCEL | request_id | 취소 접수 여부와 최신 상태; 안전 종료 후 terminal 확인 |
| DIAGNOSTICS_LIST | request_id, after_sequence, limit | 안전한 trace 최대 100건, next cursor, dropped_count |
| DIAGNOSTICS_SETTINGS_SET | level: off/basic/debug | 로컬 수집 수준 변경 결과 |
| DIAGNOSTICS_CLEAR | request_id | 해당 요청 trace 삭제; 실행 상태와 대화는 유지 |

`CHAT_REQUEST_START`의 exact key는 `schema_version`, `kind`, `request_id`, `payload`이고 payload는 기존 validator가 정규화한 `prompt`, `mode`만 허용한다. STATUS/CANCEL/CLEAR의 exact key는 `schema_version`, `kind`, `request_id`이며 LIST에는 정수 `after_sequence`, `limit`만 추가한다. `limit`은 1..100으로 제한한다. 설정 변경은 request ID를 받지 않고 panel instance의 소유자만 바꿀 수 있다. `CHAT_REQUEST_UPDATED`는 `{schema_version, kind, request_id, revision, snapshot}`의 closed envelope이며 snapshot도 API 응답과 같은 allowlist만 사용한다.

공통 응답은 `{ok:true,...}` 또는 `{ok:false,code}`이며 raw exception은 반환하지 않는다. ChatEvent validator에 신규 payload를 섞지 않는다. revision은 요청별 1부터 단조 증가하고, port 재연결 뒤 STATUS 응답의 revision보다 작거나 같은 통지는 무시한다. trace sequence와 ChatEvent thread sequence는 서로 비교하지 않는다.

동일 request ID 재전송은 같은 소유 결합과 동일하게 정규화된 payload일 때 저장된 접수/상태만 반환한다. 다른 payload 또는 다른 결합이면 `REQUEST_ID_CONFLICT`다. payload 비교 자료는 실행 중 메모리에만 유지하고 prompt/hash를 trace나 영속 상태에 저장하지 않는다. Worker 재시작 후 기존 ID는 상태만 반환하고 재실행하지 않는다.

## 7. 개발용 structured logging

### 데이터 모델

로컬 진단은 기존 기업 감사 전송과 분리한다. 아래 필드만 허용하고 `details: any`나 임의 문자열 message를 두지 않는다.

| 필드 | 의미 |
| --- | --- |
| schema_version, sequence, timestamp_ms | v1, trace 순번, wall clock 표시 |
| worker_instance_id, request_id, span_id, parent_span_id | 임의 생성 correlation ID |
| run_id | run 생성 후 선택 필드 |
| component | panel/router/page/profile/workflow/provider/act/transport/storage 중 하나 |
| event | request.accepted, stage.started, stage.finished, provider.headers, provider.first_byte, request.terminal, port.disconnected, port.reconnected, recovery.completed, storage.failed 중 하나 |
| level | info/warn/error/debug |
| stage, outcome, code | 위 stage/outcome 및 등록된 오류 enum |
| duration_ms, elapsed_ms, bytes_received, chunk_count, http_status | 범위 검증된 숫자, 필요한 event에만 허용 |

event별 필수·허용 필드를 validator로 고정한다. duration은 같은 Worker 내 monotonic clock으로 계산하고 재시작을 가로질러 빼지 않는다. 새 오류 enum은 Browser 타입·validator·UI 번역과 함께 추가한다.

기록 금지: prompt/응답 원문, 페이지 URL·query·제목, DOM/HTML/JS, selector/ref, 입력값, 인증정보·쿠키·헤더·토큰, Provider endpoint, raw stack/error.message. 외부 오류는 등록된 code와 component로 변환한다. 임의 tool/model/plugin 이름도 그대로 로그에 넣지 않는다. 알 수 없는 오류는 INTERNAL_ERROR와 고정된 발생 지점 코드로 기록한다.

### 보관과 부하

- 기본 basic: 단계 시작/종료, 실패, 취소, 연결 복구를 수집한다. debug는 크기·청크 수와 추가 milestone을 수집하고 30분 후 basic으로 돌아간다. off에서도 필수 request 상태는 유지한다.
- `chrome.storage.session`의 별도 `execution_diagnostics_v1`에 보관한다. local/sync나 중앙 endpoint에 자동 복제하지 않는다. 기존 trusted-context storage 정책을 재사용한다.
- 전체 2,000건 또는 직렬화 UTF-8 1MiB 중 먼저 도달한 한도, 요청당 300건, TTL 30분. 오래된 항목을 버리고 dropped_count를 표시한다. 실행 request 상태는 trace 축출과 독립적으로 유지한다.
- 청크마다 이벤트를 쓰지 않는다. 최초 chunk와 1초당 최대 한 번의 debug 집계만 기록한다. 일반 쓰기는 500ms batch, terminal은 즉시 flush를 시도한다.
- 저장 실패가 실행을 중단시키지 않도록 메모리 버퍼와 진단 저장 실패 표시를 사용한다. 실패 로그가 다시 storage 실패를 무한 기록하지 않도록 억제한다.
- terminal request 상태는 최대 50건/TTL 30분 보관한다. 활성 상태는 축출하지 않는다. terminal 축출은 request와 trace를 함께 제거하고 후속 조회에는 `REQUEST_NOT_FOUND`를 반환한다. 한 tab의 새 요청은 이전 요청의 안전 종료 규칙을 거친다.
- console 출력은 debug일 때만 같은 검증된 레코드를 사용한다. Console을 유일한 증거 저장소로 삼지 않는다.

### 사용자·개발자 화면

일반 실행 카드에는 단계의 자연어 설명, 총 경과 시간, 현재 단계 경과 시간, 마지막 진척 이후 시간, 취소 버튼을 표시한다. 15초 무진척이면 “AI 응답을 기다리는 중 · 마지막 수신 15초 전”처럼 표시한다. heartbeat 수신은 실제 작업 진척 시간을 갱신하지 않는다.

“실행 상세”를 펼치면 단계 timeline, 결과와 복구 안내, 요청 ID, 확장 버전, 진단 수집 수준을 표시한다. 개발 정보는 기본 접힌 영역에 둔다. 오류가 나도 마지막 단계와 기록은 남긴다. 진단 모드가 off였다면 과거 상세 기록을 복원한 것처럼 표시하지 않는다.

“진단 JSON 다운로드”는 선택한 요청의 검증된 레코드와 export schema version, extension version, build ID(빌드에서 제공한 경우), dropped_count만 포함한다. 현재 로그를 페이지 단위로 읽고 패널에서 최대 1MiB Blob으로 생성한다. 파일명은 `contextpilot-trace-<request_id>.json`이다. 계정·페이지 정보는 포함하지 않는다. 다운로드 후 object URL을 해제한다. 이 기능을 위해 광범위한 Chrome 권한을 추가하지 않는다.

## 8. 연결과 Worker 재시작 복구

패널은 시작 시 port를 열고 worker가 발급한 panel instance ID와 마지막 request revision을 보낸다. port disconnect 시 연결 복구 중을 표시하고 0.5/1/2/4/8초 상한 backoff와 jitter로 재연결한다. handshake가 panel window를 유일하게 확인하지 못하면 통지를 구독하거나 START하지 않고 오류를 표시한다. panel dispose/숨김 시 polling을 멈추고 재표시 때 즉시 상태를 조회한다. 재연결하면 기존 CHAT_RECOVER/RESYNC와 신규 request 상태를 함께 복구한다. 탭 변경 시 구독 대상과 타이머를 갱신하여 다른 탭의 결과를 섞지 않는다.

Worker instance ID를 생성하고 접수 상태, 고정 tab/document epoch, 현재 generation, 마지막 revision, dispatch 여부를 session storage에 저장한다. dispatch 표식은 부작용을 시작하기 전에 저장 완료해야 하며 저장 실패 시 dispatch하지 않는다. 재시작 시 이전 instance의 미완료 요청을 검사한다. dispatch 전은 FAILED/WORKER_RESTARTED, dispatch 이후 결과 증거가 없으면 UNKNOWN으로 종료한다. 승인 대기는 메모리 nonce/session이 사라졌으면 복원 실행하지 않고 만료로 종료한다.

접수 상태 저장에 실패하면 accepted를 반환하지 않는다. 패널은 ACK 유실 시 같은 ID 상태를 먼저 조회한다. request ID가 없다는 응답도 자동 재실행의 근거로 쓰지 않고 사용자에게 접수 확인 실패를 표시한다.

타이머는 MV3 Worker의 생존을 보장하지 않는다. 재연결 또는 다음 기동 시 저장된 deadline/instance를 검사해야 한다. 계속 살아 있는 것처럼 보이게 하기 위한 무한 heartbeat를 만들지 않는다.

## 9. 구현 단위와 파일 책임

| 순서 | 작업 | 주요 파일/신규 모듈 | 완료 기준 |
| --- | --- | --- | --- |
| S1 | request 상태·오류·진단 계약과 제한된 저장소 | contracts, request-lifecycle, diagnostics-store, diagnostics-validator | exact schema, panel/tab 소유권, 축출·민감정보 차단 테스트 |
| S2 | Provider 본문 timeout·abort와 snapshot deadline | providers/transport, runtime, provider-body, page-context-runtime | 헤더 후 본문 정지 테스트 통과 |
| S3 | 접수 API·공통 finalizer·재시작 처리 | chat-message-handler, page-sender-context, runtime-chat, act-chat-start, act-step-runner, proposal executor/followup/completion | 모든 실패·취소 경로 종료, 불명확한 panel context 거절, dispatch 재실행 없음 |
| S4 | 패널 진행 카드·연결 복구·진단 내보내기 | sidepanel request-client, progress-view, diagnostics-view, entry wiring | 중단·복구·탭 전환 UI 검증 |
| S5 | 실제 Chrome 재현·배포 일치 확인 | tests, smoke scripts, 검증 기록 | 아래 시나리오와 사용자가 확인 가능한 trace 확보 |

각 단위는 독립 커밋 가능한 크기로 구현하되 S1~S5 완료 전 전체 해결로 보고하지 않는다. 신규 authored 모듈은 기존 199라인 기준을 따른다. 기존 대형 entry에 기능을 계속 누적하지 않는다. 구현에 필요 없는 플랫폼 작업이나 모델 선택 기능을 추가하지 않는다.

## 10. 필수 검증 시나리오

| ID | 자극 | 기대 결과 |
| --- | --- | --- |
| A01 | Ask 요약 후 Act 문서 찾기 | 접수부터 단계 표시, 승인 필요 여부·결과·trace 확인 |
| A02 | snapshot 응답을 완료하지 않는 mock | 제한 시간 종료, 마지막 단계 PAGE_SNAPSHOT, 다음 요청 가능 |
| A03 | Provider 헤더 후 body를 끝내지 않는 stream | body idle 또는 전체 timeout, reader/network 정리 |
| A04 | body가 조금씩 계속 도착 | idle 재설정, 전체 deadline은 유지 |
| A05 | malformed JSON/다중 tool call/빈 응답/HTTP 실패 | terminal 한 번, 안전한 오류 코드, 세션 정리 |
| A06 | Provider 응답 대기 중 취소 후 늦은 tool 응답 | 승인 카드·실행 발생 없음 |
| A07 | dispatch 후 응답 유실·취소·Worker 종료 | 증거 없으면 UNKNOWN, 자동 재실행 없음 |
| A08 | 준비/Provider 대기 중 Worker 재시작 | 복구 시 FAILED/WORKER_RESTARTED, 무한 spinner 없음 |
| A09 | port 단절·이벤트 누락·중복·순서 역전 | 재동기화로 최신 상태 복구, 중복 메시지 없음 |
| A10 | ACK 유실 후 동일 ID 조회/재전송 | 실제 실행 최대 1회, 다른 payload 거절 |
| A11 | 다중 창·탭 전환·패널 재열기 | 원래 탭 결합 유지, 타 탭 데이터 노출 없음 |
| A12 | 승인/입력 대기 1분 및 기존 TTL 만료 | 대기 상태 표시, 자동 실행 없음, 만료 시 안내 |
| A13 | 비밀값·URL·raw exception을 오류 경로에 주입 | 저장·console·내보내기에 해당 값 없음 |
| A14 | 저장 quota 실패·버퍼 한도·TTL 경과 | 진단 누락 표시, 실행 경로의 무한 대기 없음 |
| A15 | Ask streaming 및 기존 CHAT_SEND caller | 기존 동작 유지, 본문 timeout 보호 적용 |
| A16 | 초기 snapshot 실패로 run ID 미생성 | request ID만으로 상태·trace 조회 가능 |
| A17 | 실제 로드된 확장과 소스 빌드가 다름 | 버전/build ID로 식별, 성공 증거에 사용 빌드 기록 |
| A18 | documentId 없는 panel, `getContexts()` 실패, 다중 panel/window | START/STATUS/trace가 다른 탭으로 fallback하거나 노출하지 않고 안전한 오류 반환 |
| A19 | dispatch 표식 storage write 실패 또는 Worker가 표식 뒤 종료 | write 실패 시 dispatch 없음, 재기동 시 표식만 있으면 UNKNOWN, 자동 재실행 없음 |
| A20 | 취소된 Provider body reader가 더 이상 chunk를 주지 않음 | abort와 `reader.cancel()`이 완료되고 terminal이 한 번만 발행 |

fake timer/제어 가능한 ReadableStream으로 시간·취소 경계를 검증한다. UI에서는 완료되지 않는 START 응답과 STATUS 실패를 각각 주입한다. 실제 Chrome에서는 사용자 보고 URL·문구를 재현하고 Service Worker Network와 패널 진단의 시각을 대조한다. 실제 모델의 링크 선택은 fixture 단위 테스트 성공과 구분한다.

typecheck, 관련 unit/fixture/E2E, lint, module boundaries, source size를 실행한다. 최종 build/package 및 Chrome smoke도 실행한다. `npm run build`는 patch 버전을 올리므로 결과 변경을 의도적으로 검토한다. Chrome은 `dist-extension`을 로드하므로 재로드 후 표시 버전과 로드 경로를 확인한다. 제약으로 실행하지 못한 검증은 명시적으로 미검증으로 기록한다.

Workspace 계약 검증·Platform 테스트·cross-repository integration은 Browser 내부 변경만 유지되면 영향 없음으로 사유를 기록한다. Browser fixture/E2E와 실제 Chrome 검증을 중앙 서비스 통합 검증으로 표현하지 않는다.

## 11. 구현 에이전트 인계 지시문

> 이 문서를 기준으로 EWAP Browser의 실행 정지 방지와 로컬 진단 기능을 S1~S5 순서로 구현하라. 먼저 Git 상태와 실제 호출 경로를 재확인하고 사용자 변경을 보존하라. AS-IS 결함을 실제 장애 원인으로 확정하지 말고 제어 가능한 재현 테스트와 trace로 검증하라. 모든 새 메시지와 로그는 closed schema로 검증하라. Provider 본문 수신 완료까지 timeout/abort를 유지하고 dispatch 이후 UNKNOWN 재실행 금지를 지켜라. 일반 사용자에게 단계·경과 시간·복구 안내를, 개발자에게 요청별 안전한 trace와 JSON 내보내기를 제공하라. 기존 Ask/Act 권한·document binding·기업 감사 경계를 유지하라. 실제 Chrome 검증과 로드된 빌드 확인까지 수행하고 미검증 항목을 정확히 보고하라. 저장소별로 변경을 구분하고 요청받지 않은 push는 하지 마라.

완료 보고에는 구현 단위, 실제 검증 결과, 실제 Chrome에서 사용한 버전, 재현 결과, 남은 제한을 포함한다. 모델명이 기능 품질이나 런타임 결과를 보장한다고 가정하지 않는다.
