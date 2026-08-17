# 06. 데이터, 감사 및 개인정보 경계

## 1. 저장 위치

| 위치                      | 저장 대상                                                                                                  | 저장 금지                                                                             |
| ------------------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `chrome.storage.local`    | plugin manifest, provider 설정, API key, 정적 header, site permission, UI preference, redacted run summary | executable plugin code, raw page value, password/OTP, action value, 모델 tool mapping |
| `chrome.storage.session`  | CDP attach ownership의 tab/run/action과 `attaching`/`attached` phase                                       | target token, ref/node ID, 좌표/box, action value와 page content                      |
| service worker run memory | model_ref mapping, current permission, confirmation, action value digest                                   | terminal 이후 retained value                                                          |
| content script memory     | 현재 document ref registry와 단일 action value                                                             | provider credential, audit, persistent data                                           |
| CDP action memory         | current binding, 일회용 target token, node/box와 ephemeral input                                           | terminal 이후 token/node/좌표/value, screenshot, console/network data                 |
| Local LLM endpoint        | 사용자가 선택한 prompt와 tool schema                                                                       | API key 외의 브라우저 credential, password/OTP, raw secret field                      |

## 2. provider secret

API key와 static header 값은 사용자 기기 `chrome.storage.local`에 저장된다. 이 저장소는 OS 계정 접근과 확장 권한을 가진 주체에 노출될 수 있으므로 비밀 저장소로 간주하지 않는다. export, audit, diagnostics와 모델 대화에는 provider secret을 포함하지 않는다.

plugin manifest는 secret이 아닌 설정으로 저장한다. bundled adapter code는 extension package에만 존재한다. plugin export에는 manifest와 secret 없는 provider binding만 포함하며 API key와 static header 값은 포함하지 않는다. 제품은 Cloud Sync를 제공하지 않는다.

## 3. 페이지와 행동 데이터

semantic projection은 role, redacted accessible name, 제한된 state, 최대 12,000자의 visible text와 run 한정 `model_ref`만 모델에 보낸다. visible text는 rendered page text를 정규화한 것으로 raw HTML, CSS, hidden DOM, password/OTP input value, cookie, Authorization header, API key, raw ref mapping과 사용자가 Act에서 넣는 값은 모델과 provider 요청에 보내지 않는다. CDP method, node/session ID, target token, selector, 좌표, box와 execution path도 모델/provider 입력에 포함하지 않는다.

## 4. 감사

감사 이벤트는 timestamp, plugin ID/version, host, mode, capability, tool, execution path, CDP lifecycle stage, outcome, reason code만 기록한다. prompt, 페이지 원문, selector, ref/model/node/session ID, target token, 좌표/box, action argument, API key/header, 사용자 identity는 기록하지 않는다. 단일 사용자 제품이므로 로컬 Chrome profile 소유자를 별도 계정 ID로 식별하지 않는다. 사용자는 Settings에서 local audit을 삭제할 수 있다.
