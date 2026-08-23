# 19. 탭 범위 Chat Session과 LLM 문맥 설계

상태: **In progress — core session/thread boundary implemented; Chrome multi-window and transfer E2E remain**

## 1. 결정과 범위

`새 대화`는 하나의 새로운 **Chat Session**을 시작한다. 해당 session 안에서는 같은 탭에서 이어지는 Ask/Act 대화가 모델 문맥을 유지한다. 탭을 바꾸면 Side Panel은 그 탭의 별도 대화 thread를 보이며, 다른 탭의 대화·페이지 내용·권한을 자동으로 모델에 섞지 않는다.

이 설계는 Chrome tab group을 만들거나 수정하거나 group membership을 따라가지 않는다. [17번 문서](17-claude-browser-capability-adoption-design.md)의 `tabs_context`와 read-only batch는 실행 run이 소유한 **도구 범위**이며, 여기서 정의하는 Chat Session의 대화 소유권과 독립이다.

Claude 1.0.81의 공개 UI/번들 관찰만으로 정확한 장기 대화 보존 정책을 단정하지 않는다. 이 문서는 provider마다 달라질 수 있는 정책에 의존하지 않고 ContextPilot이 직접 지키는 문맥 계약을 정의한다.

## 2. 용어와 소유 모델

```text
Chat Session (새 대화부터 다음 새 대화까지)
  ├─ Tab Thread (session × Chrome tab)
  │    ├─ Page Scope (탭의 문서/URL 경계)
  │    └─ Run (한 번의 Ask 또는 Act 실행)
  └─ Tab Thread ...
```

| 객체          | 식별과 수명                                                         | 모델에 기본 제공되는 범위             |
| ------------- | ------------------------------------------------------------------- | ------------------------------------- |
| `ChatSession` | 불투명 `session_id`; 새 대화, browser 종료, 또는 명시 삭제까지      | 선택된 `TabThread`만                  |
| `TabThread`   | `session_id + tab_id`; 탭 종료 시 폐기                              | 그 탭의 안전한 대화 요약과 최근 turn  |
| `PageScope`   | `tab_id + document_epoch + page_scope_epoch + redacted origin/path` | 현재 scope의 페이지 projection만      |
| `Run`         | 한 번의 provider 실행; `run_id`                                     | 실행 시작 시 고정된 탭·PageScope·mode |

`tab_id`와 `document_epoch`는 provider로 보내지지 않는다. UI, event routing, stale 검증에만 쓰는 내부 key다. URL은 origin/path까지만 보존하며 query, fragment, userinfo를 버린다.

`PageScope`에는 같은 document 안의 history 경계를 구분하는 불투명 `page_scope_epoch`도 포함한다. `document_epoch`는 full navigation마다 새로 만들고, `page_scope_epoch`는 document 최초 등록과 history URL 변경마다 새로 만든다. 둘 중 하나라도 달라지면 이전 projection, ref, proposal, permission, confirmation과 action token은 재사용할 수 없다.

`PanelBinding`은 Side Panel instance와 browser window를 결속하는 service-worker 소유 record다. key는 `sender.documentId`이며 값은 `{ panel_context_id, window_id }`다. panel이 임의 `tab_id` 또는 `window_id`를 보내 선택하게 하지 않는다.

## 3. 탭·페이지 전환 규칙

1. Side Panel이 활성 탭을 관찰하면 service worker가 그 panel binding의 `window_id`에서 활성 탭을 다시 조회해 `TabThread`를 선택한다. worker의 `tabs.onActivated` push는 지연될 수 있는 최적화일 뿐이며, panel도 같은 activation을 감지해 `CHAT_RECOVER`를 요청하고 반환된 `tab_id`가 바뀌면 먼저 기존 transcript와 scope label을 비운다. Chrome이 Side Panel의 `documentId` binding을 제공하지 못한 경우에는 정확히 하나의 unbound panel에만 transcript 없는 refresh 신호를 보내고, worker가 `lastFocusedWindow`를 다시 조회한다. 이 fallback은 여러 panel/window 사이에 event나 transcript를 broadcast하지 않는다. thread가 없으면 빈 thread를 만든다.
2. 같은 탭으로 돌아오면 그 thread의 대화 화면과 안전한 문맥을 복원한다. 다른 thread의 메시지는 화면에도 모델 요청에도 기본 포함하지 않는다.
3. full navigation, origin/path 변경, `document_epoch` 또는 `page_scope_epoch` 변경은 새 `PageScope`를 연다. 이전 page projection, `model_ref`, action token, permission/confirmation binding은 즉시 무효다.
4. content script는 main frame에서 `pushState`, `replaceState`, `popstate`를 감시한다. 변경을 감지하면 먼저 local ref registry를 비우고 새 `page_scope_epoch`를 만든 뒤 `PAGE_SCOPE_REGISTER`를 보낸다. service worker는 sender의 tab URL을 스스로 canonicalize해 origin/path를 정하며 content message가 보낸 URL을 신뢰하지 않는다. `tabs.onUpdated`의 main-frame URL 변경도 즉시 해당 tab을 stale로 표시한다. 새 register와 현재 tab URL이 일치할 때까지 Act와 추가 tool call은 `PAGE_SCOPE_STALE`로 거부한다.
5. 동일 scope에서 의미 있는 DOM 변화는 기존 대화를 지우지 않지만, 기존 page evidence와 ref를 stale 처리하고 다음 요청에서 새 projection만 제공한다.
6. 탭 종료는 해당 thread의 실행을 취소하고 저장된 thread 문맥을 폐기한다. 사용자가 계속해야 하는 목표는 종료 전에 아래의 명시적 전달을 사용한다.

따라서 같은 사이트의 다음 화면으로 이동한 대화는 사용자 목표와 assistant 요약을 이어갈 수 있지만, 이전 화면에서 읽은 사실·screenshot·tool 결과는 현재 페이지 근거가 아니다. provider 입력에는 항상 현재 PageScope의 새 projection만 넣는다.

## 4. 문맥 조립과 압축

각 provider 요청은 아래 순서로 조립한다. system prompt와 tool schema는 매 요청에 새로 만들며 저장하지 않는다.

1. 현재 보안 정책과 provider/tool schema
2. 해당 TabThread의 고정된 최초 사용자 목표와 안전한 thread summary
3. 현재 PageScope에서의 최근 user/assistant turn
4. 현재 페이지의 redacted semantic projection 또는 허용된 read 결과
5. 현재 사용자 입력

이전 탭의 대화, raw page text/HTML, screenshot, raw tool result, `model_ref`, selector, action 값, confirmation/token/permission은 어느 단계에도 넣지 않는다. 페이지·tool 데이터는 untrusted delimiter와 출처 표시를 유지한다. assistant의 과거 발화도 사실의 증명이 아니며, 현재 페이지와 재검증 가능한 tool 결과가 우선한다.

문맥은 provider의 선언된 context window에서 system/tool/응답 reserve를 뺀 입력 budget을 넘지 않는다. context window를 알 수 없는 provider는 보수적인 8,192-token 입력 budget을 사용한다. 초과 시 다음 순서로 줄인다.

1. 이미지, raw tool output, 과거 페이지 projection을 제외한다.
2. 완료된 turn을 결정론적·redacted summary로 압축한다. summary에는 사용자 목표, 확정된 사용자 결정, 미완료 작업, 결과 code만 넣는다.
3. 현재 PageScope의 최신 turn과 현재 입력은 끝까지 유지한다. 그래도 맞지 않으면 실행하지 않고 `CONTEXT_BUDGET_EXCEEDED`와 새 대화 또는 더 짧은 요청 방법을 안내한다.

v1은 별도 LLM summarizer를 호출하지 않는다. 따라서 압축은 provider 비용·새 egress·prompt injection surface를 늘리지 않는다. summary는 `summary_version`, 최초 redacted 목표, 명시적으로 확인된 사용자 결정의 안전한 kind, 마지막 미완료 redacted 요청, terminal result code만을 정해진 순서로 복사·절단해 만든다. assistant 발화, page/tool data, 추론한 사실은 summary 입력이 아니다. 사용자 유래 문자열은 별도 `UNTRUSTED_USER_CONTEXT` delimiter 안의 user role로만 넣는다. summary는 원문 보관본이 아니며, 그 외 원문을 다시 만들 수 있는 데이터를 저장하지 않는다.

입력은 수신 직후 `redactForChat`을 통과한다. redacted 값만 UI transcript, event, summary, storage, Console diagnostic과 provider request에 사용할 수 있다. redaction이 적용되면 UI는 이를 표시하고 원문은 provider에 최초 전송하거나 재전송하지 않는다. redacted 요청으로도 실행할 수 없으면 provider 호출 없이 `INPUT_REDACTED`를 반환한다. 현재 페이지 projection과 허용 read 결과도 provider 조립 직전에 같은 redactor를 다시 통과한다.

## 5. 저장과 개인정보 경계

session을 browser 종료 뒤에도 복원하지 않는다. 대화 상태는 `chrome.storage.session`에만 저장하고 `chrome.storage.local`, export, audit, cloud sync에는 넣지 않는다. 기본 상한은 session당 1 MiB, thread당 128 KiB, 최대 8개 live thread다. 크기는 canonical JSON을 UTF-8로 encode한 byte 수로 계산한다.

tab 종료 통지가 늦어 남은 record는 먼저 제거한다. 그 뒤에도 8개 열린 tab thread가 있으면 새 thread를 만들거나 provider 요청을 시작하지 않고 `THREAD_LIMIT_REACHED`를 반환한다. UI는 `새 대화` 또는 불필요한 탭을 닫은 뒤 재시도를 안내한다. thread/session byte 상한을 넘으면 해당 thread의 완료 turn을 위 summary 규칙으로 먼저 압축한다. 그래도 넘으면 기존 thread를 임의로 삭제하지 않고 `CHAT_STORAGE_QUOTA_EXCEEDED`로 실패한다.

저장은 copy-on-write다. service worker는 후보 session snapshot을 clone하고 redaction, schema validation, quota 검사를 모두 통과시킨 뒤 한 번의 `storage.session.set` 성공 후에만 in-memory index와 UI 성공 상태를 갱신한다. write 실패 시 기존 snapshot을 유지하고 새 provider run을 시작하지 않거나 진행 중 run을 `STORAGE_BOUNDARY_UNAVAILABLE` terminal로 끝낸다.

저장 가능한 `ChatThreadRecord`는 불투명 ID, redacted origin/path, 순서가 있는 redacted user/assistant message, summary, PageScope transition, terminal run 상태와 안전한 결과 code다. credential/API key/token/password/OTP와 알려진 secret 형식은 어떤 persistence 또는 egress 전에도 redaction한다.

다음은 저장·audit·export·diagnostics에 금지한다.

- raw page content, HTML, screenshot/image, attachment, browser credential와 input current value
- raw tool response, ref/node/selector/CDP ID, target token, 좌표, action value와 confirmation payload
- provider API key/static header, cookie, Authorization header와 query/fragment

진단은 `session_id`가 아닌 run 수준의 redacted correlation ID와 크기·압축·오류 code만 남긴다. 개발 중 provider outbound payload를 확인해야 할 때도 동일 redactor를 통과한 휘발성 Service Worker Console 출력으로 한정하며, audit이나 storage에 복사하지 않는다.

## 6. 실행·권한 안전성

- 전송과 `CHAT_RECOVER`/`CHAT_CLEAR` 시 service worker는 `sender.id`, extension side-panel URL 및 `sender.documentId`를 확인하고 `runtime.getContexts({ contextTypes: ["SIDE_PANEL"], documentIds: [sender.documentId] })` 결과가 정확히 하나인지 검증한다. 그 context의 `windowId`에 대해 `tabs.query({ active: true, windowId })`가 반환한 tab만 선택한다. Chrome이 context binding을 반환하지 않는 호환성 경우에는 하나의 unbound panel에 한해 worker가 `lastFocusedWindow`를 직접 다시 조회할 수 있다. 이때 panel은 tab/window/thread key를 보내지 않고, worker는 transcript event를 broadcast하지 않는다. panel이 보낸 `tab_id`, `window_id`, `thread_id`는 권한 판단에 사용하지 않는다. 이 binding은 panel 종료, context 불일치 또는 window 종료 때 폐기한다.
- Ask run은 시작 tab/PageScope에 고정된다. 사용자가 다른 탭을 보더라도 완료 event는 원래 thread에만 기록된다.
- Act run은 시작 탭이 비활성이 되거나 PageScope가 바뀌면 자동으로 행동을 계속하지 않는다. pending proposal은 `TARGET_STALE` 또는 `PAUSED`, resume은 새 projection·새 proposal·필요한 새 확인을 요구한다. 단, 이미 dispatch한 closed `exact-navigation-transition`은 예외적으로 `VERIFYING_NAVIGATION` 상태에서 정확한 origin/path만 확인한다. 이 상태에서도 이전 ref·권한·confirmation·action token은 즉시 무효이며 추가 입력은 허용하지 않는다. 정확한 목적지가 확인되면 `VERIFIED`, 다른 URL·timeout·중단이면 재시도 없이 `UNKNOWN` 또는 `CANCELLED`로 한 번만 끝낸다.
- permission, `skip_all_permission_checks` mode, plan host approval, R2 confirmation과 action token은 run·tab·PageScope에 결속된다. 탭/페이지/thread 간 상속은 없다. “권한 질문 생략”도 hard policy, stale 검증, R2/R3 제한을 생략하지 않는다.
- provider stream은 session 전체에서 한 번에 하나만 실행한다. 다른 탭으로 전환해도 기존 run을 몰래 취소하지 않으며, 새 send는 Stop 또는 terminal state 뒤에만 가능하다.

session lock 획득은 storage commit과 같은 service-worker critical section에서 원자적으로 수행한다. 이미 다른 thread가 실행 중이면 새 send는 `SESSION_STREAM_BUSY`를 반환하고 source thread/origin을 노출하지 않는다. 모든 terminal, tab close, PageScope stale, provider 실패와 worker restart recovery는 lock을 해제한다.

이 규칙은 background tab screenshot, 탭 전환 직후의 mutation, 오래된 ref 재사용과 교차 탭 prompt injection을 막는다.

## 7. 명시적 thread 전달

탭을 넘는 맥락은 자동 전달하지 않는다. 사용자가 `이 작업을 현재 탭으로 이어가기`를 누르고 preview를 확인한 경우에만 source thread에서 destination thread로 다음 항목을 한 번 복사할 수 있다.

- 최초 목표의 redacted form
- 결정론적 thread summary의 사용자 목표·확정 결정·미완료 작업

전달 UI는 source/destination의 redacted origin/path와 복사될 요약을 보여주고 사용자의 최종 확인을 요구한다. 이전 페이지 내용, tool 결과, action/permission/confirmation state, screenshot, attachment와 raw message는 전달 대상이 아니다. `http`/`https` 이외 scheme, credential, payment, account-recovery 또는 policy가 restricted로 분류한 PageScope는 deny-by-default이며 전달을 제공하지 않는다. 분류를 결정할 수 없을 때도 거부한다.

preview는 source/destination의 `{ tab_id, document_epoch, page_scope_epoch, summary_digest }`를 server-side transfer record에 결속하고 짧은 one-time `transfer_id`만 UI에 준다. 최종 확인 때 worker가 panel binding으로 destination active tab을 다시 유도하고 양쪽 scope, 분류 및 digest를 모두 재검증한다. 하나라도 달라지면 record를 폐기하고 `TRANSFER_STALE`로 끝낸다.

## 8. UI와 runtime 계약

Side Panel은 활성 탭 제목/origin과 “이 탭의 문맥” 표시를 header에 둔다. 새 탭의 빈 thread에는 같은 session 안에서도 다른 탭의 대화가 자동 공유되지 않는다는 안내를 보인다. 페이지 경계에는 `페이지가 변경되어 이전 페이지 근거가 만료됨` divider를 렌더링한다.

`새 대화`는 확인 후 현재 session의 모든 thread와 transcript·summary·recoverable event를 삭제하고 active run을 취소한다. 현재 구현처럼 전역 event store만 비우는 동작은 충분하지 않다.

closed `ChatEvent` envelope에는 `session_id`, `thread_id`, `tab_id`, `run_id`, `sequence`를 넣는다. event는 다음 두 종류로 나눈다.

- `PersistentTimelineEvent`: redacted user/assistant text, safe tool summary/result code, page divider, `run_terminal`처럼 재시작 뒤에도 읽기 전용으로 보여도 되는 항목이다.
- `EphemeralCapabilityEvent`: permission/value/confirmation/action-review처럼 nonce, request ID, proposal 또는 실행 가능한 UI를 수반하는 항목이다. 이 event와 그 capability는 storage/session recovery snapshot에 저장하지 않는다.

worker restart, restore 또는 sequence-gap recovery에서 unfinished run은 capability를 모두 폐기하고 `run_terminal(CANCELLED, WORKER_RESTART)` 하나로 정규화한다. Side Panel 복구 API는 panel binding으로 유도한 현재 활성 tab의 현재 session/thread의 `PersistentTimelineEvent`와 redacted snapshot만 반환한다. event push도 전체 extension context에 broadcast하지 않고 같은 `PanelBinding`의 panel port에만 보낸다. provider wire message, raw action value/ref는 계속 Side Panel에 전달하지 않는다.

구현 전에는 manifest에 `tabs` permission을 추가하고 snapshot review를 수행한다. `tabs.onActivated`, `tabs.onRemoved`, `tabs.onUpdated`와 sender/tab 검증에 사용한다. `runtime.getContexts`를 사용하는 v1은 `minimum_chrome_version`을 116으로 올린다. v1의 PageScope 감지는 `DOCUMENT_REGISTER`, `PAGE_SCOPE_REGISTER`, URL 변화로 충분하므로 `webNavigation` permission은 추가하지 않는다.

## 9. 구현 영향과 마이그레이션

| 영역             | 필요한 변경                                                                                                                                                                 |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| service worker   | global `ChatEventStore`를 `session → tab thread → run` key store로 교체하고 PanelBinding, activation/navigation/tab-close lifecycle, atomic storage/stream lock을 소유한다. |
| Side Panel       | panel port와 binding을 등록하고, 활성 탭에 맞는 transcript만 렌더링하며 thread transfer/페이지 경계/새 대화 삭제 확인을 추가한다.                                           |
| provider runtime | 현재 page projection + 동일 thread의 bounded context만 조립하고 final request에 thread correlation을 붙인다.                                                                |
| content contract | `DOCUMENT_REGISTER`와 `PAGE_SCOPE_REGISTER`가 document/page scope 경계를 안정적으로 보고하고 history URL 변화 전에 old ref를 무효화한다.                                    |
| privacy/audit    | [06번 문서](06-data-audit-and-privacy.md)의 session 저장 허용 범위와 redaction·quota를 적용한다.                                                                            |
| manifest/release | `tabs` 추가의 manifest diff, 권한 설명, clean-profile upgrade/rollback을 검토한다.                                                                                          |

기존 `chat_event_streams`는 session/thread 식별자가 없으므로 migration하지 않고 extension upgrade 시 폐기한다. 기존 사용자의 대화가 다른 탭에 잘못 귀속되는 것보다 안전한 빈 session이 우선이다.

## 10. 필수 검증

| ID    | 검증                                                                                                                                                                                    |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TS-01 | 같은 탭의 후속 Ask에서 provider 요청에는 같은 thread의 요약·최근 turn이 들어가고, 새 대화의 이전 turn은 없다.                                                                           |
| TS-02 | 탭 A의 message/page content/permission이 탭 B의 outbound request, transcript, recovery에 나타나지 않는다.                                                                               |
| TS-03 | 탭 전환 중 Ask 완료 event가 source thread에만 순서대로 기록되고, source tab이 아닌 Act는 실행되지 않는다.                                                                               |
| TS-04 | full navigation, history URL 변경, document/page scope epoch 변경 뒤 old ref/action/confirmation이 거부되고 새 projection만 모델에 제공된다.                                            |
| TS-05 | 탭 종료·browser 종료·새 대화·upgrade가 각각 정해진 session/thread/event 삭제를 수행한다.                                                                                                |
| TS-06 | quota 초과, worker suspend/restart, sequence gap과 storage write 실패가 교차 탭 노출 없이 안전하게 복구 또는 실패한다.                                                                  |
| TS-07 | 압축 후에도 최초 목표·확정 사용자 결정·미완료 작업은 유지되고 raw page/tool/secret은 summary·storage·diagnostics에 없다.                                                                |
| TS-08 | thread 전달은 preview/최종 확인 없이는 발생하지 않고, 금지 origin과 action/permission/page data는 전달되지 않는다.                                                                      |
| TS-09 | `tabs` manifest 변경, clean-profile 권한 문구, accessibility keyboard flow, multi-window sender 검증을 실제 Chrome에서 확인한다.                                                        |
| TS-10 | 두 browser window에서 각 Side Panel send/recover/event가 그 panel context의 active tab에만 결속되고 global broadcast 또는 last-focused-window 혼입이 없다.                              |
| TS-11 | `pushState`/`replaceState`/`popstate`와 `tabs.onUpdated` 경합에서 먼저 ref registry가 비워지고 pending Act/confirmation과 후속 tool call이 `PAGE_SCOPE_STALE`로 거부된다.               |
| TS-12 | worker restart 또는 sequence gap 뒤 persistent timeline만 복구되고 nonce/request/proposal/action-review는 다시 렌더링되거나 승인될 수 없으며 `WORKER_RESTART` terminal이 하나만 생긴다. |
| TS-13 | 8개 열린 thread, byte quota, storage write 실패에서 기존 context는 보존되고 새 provider egress나 교차-thread recovery 없이 정의된 safe code가 반환된다.                                 |
| TS-14 | secret 포함 prompt/page data가 redacted 이전에 UI event, storage, Service Worker Console, provider payload에 나타나지 않고 deterministic summary에는 허용 field만 들어간다.             |
| TS-15 | transfer preview 뒤 source/destination URL, page scope, sensitivity 또는 summary digest가 바뀌면 최종 확인이 `TRANSFER_STALE`로 실패하고 아무 context도 복사되지 않는다.                |

## 11. 설계 리뷰 결과

| 항목         | 결론                                                          | 구현 전 증적                            |
| ------------ | ------------------------------------------------------------- | --------------------------------------- |
| session 의미 | 새 대화 하나가 하나의 browser-lifetime session                | 새 대화·browser restart E2E             |
| 탭 격리      | tab group 없이 session 내 tab thread로 분리                   | outbound payload 및 recovery 격리 test  |
| 페이지 경계  | document/page scope epoch와 origin/path 변경은 hard boundary  | content contract 및 SPA/history fixture |
| 문맥 길이    | declared window, 없으면 8,192-token fallback과 결정론적 압축  | provider matrix 및 overflow test        |
| 개인정보     | redacted·bounded thread context만 session storage 허용        | storage/audit/console secret scan       |
| 동시성       | session당 provider stream 하나, Act는 active source tab에서만 | tab-switch/Stop race Chrome E2E         |
| sender 결속  | PanelBinding이 sender document와 browser window를 검증        | multi-window Chrome E2E                 |
| 권한 확대    | `tabs`만 추가하고 Chrome 116+을 요구; `webNavigation`은 보류  | manifest snapshot과 upgrade review      |

아직 의도적으로 결정하지 않은 항목은 없다. 다만 구현은 위 검증 항목과 [11번 Sprint 진행 상태](11-sprint-progress.md)의 실제 Chrome 증적을 대체하지 않으며, 이 문서를 추가했다고 어떤 Sprint도 완료되지 않는다.

## 12. 구현 현황 (2026-08-23)

이번 구현은 `TabChatSessionStore`를 `chrome.storage.session`의 `chat_session_v1`에 연결해 전역 `chat_event_streams`를 안전하게 폐기한다. session/thread/tab/run/sequence envelope, persistent timeline과 capability event의 분리, tab close 정리, `tabs` permission과 Chrome 116 minimum, history API 기반 `PAGE_SCOPE_REGISTER`, URL navigation stale 처리, 같은 tab thread의 bounded recent context 및 deterministic secret redaction을 포함한다. Side Panel은 현재 활성 tab의 persistent timeline만 복구하고 page boundary를 표시한다.

이 상태는 TS-01, TS-02의 저장소/문맥 단위, TS-04의 history ref invalidation, TS-05의 tab-close/upgrade 경로, TS-07 및 TS-14의 저장 대상과 redaction에 대한 unit test로 확인했다. PanelBinding 기반 multi-window send authority, atomic storage failure simulation, summary compression/byte quota recovery, 그리고 explicit thread transfer는 후속 Chrome E2E와 함께 남아 있다. 따라서 TS-03, TS-06, TS-08~TS-13, TS-15를 완료로 주장하지 않는다.
