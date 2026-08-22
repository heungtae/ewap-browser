# 06. 데이터, 감사 및 개인정보 경계

## 1. 저장 위치

| 위치                      | 저장 대상                                                                                                                                                              | 저장 금지                                                                             |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `chrome.storage.local`    | plugin manifest, provider 설정, API key, 정적 header, site permission, UI preference, redacted run summary                                                             | executable plugin code, raw page value, password/OTP, action value, 모델 tool mapping |
| `chrome.storage.session`  | CDP attach ownership의 tab/run/action과 `attaching`/`attached` phase, [19번 문서](19-tab-scoped-chat-session-design.md)의 redacted·bounded Chat Session/thread context | target token, ref/node ID, 좌표/box, action value, raw page content와 image           |
| service worker run memory | model_ref mapping, current permission, confirmation, action value digest                                                                                               | terminal 이후 retained value                                                          |
| content script memory     | 현재 document ref registry와 단일 action value                                                                                                                         | provider credential, audit, persistent data                                           |
| CDP action memory         | current binding, 일회용 target token, node/box와 ephemeral input                                                                                                       | terminal 이후 token/node/좌표/value, screenshot, console/network data                 |
| Vision run memory         | current viewport screenshot/zoom과 capture metadata                                                                                                                    | terminal 이후 image, persistent cache와 audit copy                                    |
| Local LLM endpoint        | 사용자가 선택한 prompt와 tool schema                                                                                                                                   | API key 외의 브라우저 credential, password/OTP, raw secret field                      |

## 2. provider secret

API key와 static header 값은 사용자 기기 `chrome.storage.local`에 저장된다. 이 저장소는 OS 계정 접근과 확장 권한을 가진 주체에 노출될 수 있으므로 비밀 저장소로 간주하지 않는다. export, audit, diagnostics와 모델 대화에는 provider secret을 포함하지 않는다.

plugin manifest는 secret이 아닌 설정으로 저장한다. bundled adapter code는 extension package에만 존재한다. plugin export에는 manifest와 secret 없는 provider binding만 포함하며 API key와 static header 값은 포함하지 않는다. 제품은 Cloud Sync를 제공하지 않는다.

## 3. 페이지와 행동 데이터

semantic projection은 role, redacted accessible name, 제한된 state, visibility/hidden reason, 최대 12,000자의 visible text와 run 한정 `model_ref`를 모델에 보낸다. 기본 `all_dom` scope이므로 hidden semantic node도 전송한다. raw HTML/CSS/script, input current value, password/OTP/token value, cookie, Authorization header, API key, raw ref mapping과 사용자가 Act에서 넣는 값은 scope와 무관하게 모델/provider 요청에 보내지 않는다. CDP method, node/session ID, target token, selector, 좌표, box와 execution path도 모델/provider 입력에 포함하지 않는다.

사용자가 허용한 screenshot/zoom은 해당 tool turn의 provider 요청과 terminal 전 run memory에만 존재한다. image/base64, crop region과 page content는 storage, audit, diagnostics와 export에 넣지 않는다. hidden DOM 기본 제공과 screenshot policy는 Settings와 onboarding에 공개한다.

## 4. 감사

감사 이벤트는 timestamp, plugin ID/version, host, Ask/Act와 permission mode, capability, tool, execution path, CDP lifecycle stage, outcome, reason code만 기록한다. prompt, 페이지 원문, selector, ref/model/node/session ID, target token, 좌표/box, action argument, API key/header, 사용자 identity는 기록하지 않는다. 단일 사용자 제품이므로 로컬 Chrome profile 소유자를 별도 계정 ID로 식별하지 않는다. 사용자는 Settings에서 local audit을 삭제할 수 있다.

## 5. Chat Session 문맥

`새 대화`부터 다음 새 대화까지의 탭별 대화 문맥은 browser-lifetime `chrome.storage.session`에만 저장한다. 저장 전 credential/API key/token/password/OTP와 알려진 secret 형식을 redaction하며, session당 1 MiB·thread당 128 KiB·최대 8개 live thread의 상한을 적용한다. browser 종료, 탭 종료, 새 대화 또는 명시 삭제 시 [19번 문서](19-tab-scoped-chat-session-design.md)의 수명 규칙에 따라 폐기한다.

대화 문맥은 사용자가 입력한 redacted message, assistant의 redacted message, 안전한 요약, redacted origin/path와 결과 code로 제한한다. raw page projection/text, screenshot, attachment, raw tool result, ref/node/selector/CDP ID, action/confirmation 값, provider secret과 HTTP credential은 대화 문맥·audit·export·persistent diagnostics에 넣지 않는다. provider request를 점검하는 개발용 Console 출력도 redactor를 거친 휘발성 출력이며 audit 또는 storage가 아니다.
