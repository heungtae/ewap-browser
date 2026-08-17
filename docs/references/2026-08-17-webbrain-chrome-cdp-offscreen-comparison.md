# WebBrain Chrome CDP·offscreen 아키텍처 비교

## 문서 성격

| 항목      | 값                                                                              |
| --------- | ------------------------------------------------------------------------------- |
| 상태      | Informative, non-normative                                                      |
| 작성일    | 2026-08-17                                                                      |
| 목적      | WebBrain과 현재 제품의 Chrome CDP·offscreen 사용 수준과 권한 경계를 비교해 보존 |
| 사용 범위 | 배경 이해, 기술 조사와 향후 설계 검토의 참고                                    |
| 사용 금지 | 요구사항, 설계 결정, 구현 범위, 테스트, Sprint 또는 release 판단의 근거         |

이 문서는 개발 입력이나 backlog가 아니다. 여기서 언급한 기능을 도입하려면 번호가 붙은 규범 설계 문서에서 필요성, 권한, lifecycle, 실패 계약과 검증 기준을 별도로 결정해야 한다. 이 문서와 규범 문서가 충돌하면 규범 문서가 우선한다.

## 비교 기준

- 현재 제품 설계: 2026-08-17 작업 트리의 `docs/01-architecture.md`, `docs/03-extension-design.md`, `docs/11-sprint-progress.md`, `docs/15-bounded-cdp-adapter.md`
- 현재 제품 구현: `extension/manifest.json`, `extension/src/content/`, `extension/src/service-worker/`
- WebBrain 구현: 로컬 `webbrain` 링크가 가리키는 checkout의 commit `70271912921afa4c208a62b1408f99a0b9e7d7f1`
- WebBrain 근거: `src/chrome/manifest.json`, `src/chrome/src/cdp/`, `src/chrome/src/offscreen/`, `src/chrome/src/agent/agent.js`, `src/chrome/ARCHITECTURE.md`
- 비교에서 제외: `scripts/chrome-*-e2e.mjs`가 테스트 Chrome을 외부 원격 디버깅하는 동작

현재 제품의 Sprint 상태는 모두 `Planned`다. 따라서 아래에서는 규범 설계, 작업 트리의 scaffold 구현과 WebBrain의 실제 구현을 같은 수준의 완성도로 간주하지 않는다.

`references/company-web-agent-detailed-design(1).md`는 과거 원본 참고자료다. 현재 번호가 붙은 규범 설계는 별도 검토를 거쳐 더 좁은 action-scoped Level 2 bounded CDP를 채택했다. 과거 문서의 전체 command 범위나 run-scoped lifecycle은 현재 계약으로 해석하지 않는다. 작업 트리의 manifest와 구현은 아직 이 설계를 반영하지 않았으며 S2 상태는 `Planned`다.

## 수준 정의

### CDP 수준

| 수준    | 의미                                                                                               |
| ------- | -------------------------------------------------------------------------------------------------- |
| Level 0 | 페이지 자동화 없음                                                                                 |
| Level 1 | content script의 일반 DOM 읽기·synthetic mutation만 사용                                           |
| Level 2 | 제한된 CDP command allowlist를 특정 도구에서만 사용                                                |
| Level 3 | screenshot, trusted input, Runtime·DOM 등 여러 CDP domain을 공용 계층으로 사용                     |
| Level 4 | CDP를 핵심 실행 플랫폼으로 사용하고 child target, cross-origin frame, 진단과 lifecycle을 함께 관리 |

### Offscreen 수준

| 수준    | 의미                                                                                                      |
| ------- | --------------------------------------------------------------------------------------------------------- |
| Level 0 | offscreen 권한과 document가 없음                                                                          |
| Level 1 | 단일 제한 기능을 위해 필요할 때 생성                                                                      |
| Level 2 | 둘 이상의 기능이 lifecycle helper와 메시지 계약을 공유                                                    |
| Level 3 | network, worker, media 같은 서로 다른 브라우저 기능을 공용 host에서 제공                                  |
| Level 4 | offscreen document가 장기 실행, 계산, media, storage staging과 연결 유지의 다목적 실행 플랫폼 역할을 수행 |

수준은 기능 범위만 표현한다. 높은 수준이 더 안전하거나 현재 제품에 더 적합하다는 뜻은 아니다.

## 요약

| 영역             | 현재 제품                                                               | WebBrain                                                            | 해석                                                                                     |
| ---------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| CDP              | 설계 Level 2, 구현 Level 1                                              | Level 4                                                             | 현재 제품은 trusted input만 bounded CDP로 보강하고 WebBrain은 CDP를 핵심 플랫폼으로 사용 |
| Offscreen        | Level 0                                                                 | Level 4                                                             | 현재 제품에는 없고 WebBrain은 다목적 실행 host로 사용                                    |
| Extension 권한   | `debugger`, `<all_urls>`와 제한된 content-script 경로                     | `debugger`, `offscreen`, `scripting`, `tabCapture`, `<all_urls>` 등 | host 범위는 넓혔지만 CDP command·page script·offscreen 범위는 계속 제한                 |
| Trusted input    | 설계는 allowlisted mouse·keyboard·text, 구현 없음                       | 광범위한 CDP mouse·keyboard·text dispatch                           | 현재 제품은 승인된 primitive만 계획                                                      |
| Shadow DOM·frame | 일반 content-script 접근 범위                                           | CDP DOM과 child target session                                      | closed shadow DOM과 OOPIF 처리 범위 차이                                                 |
| Screenshot·진단  | 제품 runtime 기능 없음                                                  | screenshot, console, network, listener 진단                         | 관찰성과 Dev 기능 차이                                                                   |
| Lifecycle        | 설계는 action-scoped attach/detach와 cleanup-failed tab 격리, 구현 없음 | CDP session map과 detach handler, 단 session은 run을 넘어 유지      | 현재 제품은 더 짧은 authority lifetime을 계획                                            |
| 구현 성숙도      | scaffold가 있으나 Sprint는 `Planned`                                    | production source와 architecture 문서가 존재                        | 직접적인 완료도 비교는 부적절                                                            |

## 현재 제품의 Chrome 제어 수준

규범 설계는 Level 2 bounded CDP를 채택했지만 아래 manifest와 source 설명은 아직 Level 1인 현재 scaffold 구현 상태다.

### Manifest authority

`extension/manifest.json`은 일반 웹 UI 지원을 위해 다음 권한과 host 범위를 선언한다.

```json
"permissions": ["storage", "sidePanel", "activeTab"]
```

`debugger`, `offscreen`, `scripting`, `tabs`, `webNavigation`, `tabCapture`는 현재 manifest에 없다. content script와 host permission은 `<all_urls>`이며, service worker가 현재 탭의 `http(s)` origin과 capability를 다시 검증한다. 브라우저 제한 페이지는 지원하지 않는다.

### 페이지 읽기와 행동

현재 구조는 content script가 다음 책임을 갖는다.

- 보이는 일반 DOM 요소에서 제한된 semantic projection 생성
- document-scoped `ref_id` 등록과 DOM 변경 시 stale 처리
- textbox, native select와 checkbox 같은 제한된 primitive 실행
- password, OTP와 민감 필드 제외
- service worker가 전달한 단일 행동의 실행 결과 반환

현재 scaffold는 일반 DOM과 synthetic mutation 범위에서는 권한이 작고 추론하기 쉽다. 규범 설계는 아래 항목 중 trusted mouse·keyboard·text와 제한된 box/hit test만 S2에서 추가하며 나머지는 계속 제외한다.

- `event.isTrusted === true`인 mouse·keyboard 입력 — S2 bounded allowlist에 채택, 미구현
- CDP 기반 viewport 또는 full-page screenshot
- closed shadow root 탐색
- cross-origin iframe과 OOPIF child target 관리
- console, exception, network와 event-listener 진단
- page context `Runtime.evaluate`

### 테스트 CDP와 제품 CDP의 구분

`scripts/chrome-preview-e2e.mjs`와 `scripts/chrome-extension-smoke.mjs`는 `--remote-debugging-port`로 시작한 테스트 Chrome의 WebSocket endpoint에 연결한다. 이것은 테스트 harness가 브라우저를 관찰·구동하는 경로다.

확장 package가 `chrome.debugger` 권한으로 사용자 탭에 attach하는 제품 capability가 아니므로 현재 제품의 CDP 수준을 높이는 근거로 사용하지 않는다.

## WebBrain의 CDP 수준

### 권한과 공용 client

WebBrain manifest는 `debugger`와 `<all_urls>`를 선언한다. `src/chrome/src/cdp/cdp-client.js`는 `chrome.debugger`의 attach, command, event와 detach를 공용 abstraction으로 관리한다.

주요 CDP 사용은 다음과 같다.

| 기능                        | 대표 domain·command                                                                 |
| --------------------------- | ----------------------------------------------------------------------------------- |
| Trusted mouse·keyboard·text | `Input.dispatchMouseEvent`, `Input.dispatchKeyEvent`, `Input.insertText`            |
| Screenshot                  | `Page.captureScreenshot`, `Page.getLayoutMetrics`                                   |
| Page context 실행           | `Runtime.evaluate`, `Runtime.callFunctionOn`                                        |
| DOM과 shadow tree           | `DOM.getDocument`, `DOM.getFlattenedDocument`, `DOM.resolveNode`, `DOM.getBoxModel` |
| File input                  | `Page.setInterceptFileChooserDialog`, `DOM.setFileInputFiles`                       |
| Console·exception           | `Runtime.consoleAPICalled`, `Runtime.exceptionThrown`, `Log.entryAdded`             |
| Network 진단                | `Network.*` event, `Network.getResponseBody`, `Network.getRequestPostData`          |
| Event listener              | `DOMDebugger.getEventListeners`                                                     |
| Background capture focus    | `Emulation.setFocusEmulationEnabled`                                                |
| Cross-process iframe        | `Target.setAutoAttach`, child session과 `Target.detachFromTarget`                   |
| WebMCP                      | `WebMCP.enable`, tool discovery, invocation과 cancellation                          |

WebBrain에서 CDP는 일부 예외 도구의 보조 경로가 아니다. Chrome/Edge의 trusted click, screenshot, shadow DOM, 진단과 cross-frame WebMCP를 지탱하는 핵심 실행 계층이다. content script 경로도 함께 존재하지만 CDP가 브라우저 호환 범위를 확장한다.

### Lifecycle 관찰

`CDPClient.detach(tabId)`와 `chrome.debugger.onDetach` cleanup은 구현돼 있다. 그러나 비교 commit의 production source에서 `cdpClient.detach(...)` 호출은 확인되지 않았다. `agent.js`도 debugger session이 개별 run보다 오래 지속한다고 명시하고, run 종료 시에는 focus emulation 같은 run-scoped 상태만 해제한다.

따라서 WebBrain의 현재 구현은 다음 특성을 갖는다.

- attach 중복은 tab별 session map으로 억제
- 브라우저가 detach하면 handler, diagnostics, runtime context와 WebMCP 상태 cleanup
- CDP session 자체는 일반 run 종료와 함께 detach되지 않음
- session 지속으로 반복 attach 비용은 줄지만 debugger authority 유지 시간은 길어짐

과거 원본 참고설계의 “Agent 실행 동안에만 attach” 목표와는 다른 lifecycle이다.

## 현재 제품의 offscreen 수준

현재 manifest에는 `offscreen` 권한이 없고 `extension/src/offscreen/`도 없다. 규범 아키텍처는 provider HTTP를 service worker의 core transport 책임으로 둔다.

따라서 현재 제품에는 다음 offscreen 기반 기능이 없다.

- localhost/PNA fetch fallback
- offscreen WebGPU worker host
- tab/display/microphone recording
- Web Audio mixing 또는 background alert
- OPFS와 blob URL을 이용한 대용량 staging
- offscreen document가 유지하는 장기 WebSocket

과거 원본 참고설계에서도 offscreen과 `privateNetworkAccess`는 실제 필요성이 검증된 후 추가할 권한으로 분류했다. 이는 현재 규범 계약이나 구현 완료를 뜻하지 않는다.

## WebBrain의 offscreen 수준

### 단일 공유 host

WebBrain은 Chrome MV3의 확장당 offscreen document 한 개 제한을 전제로 `src/offscreen/offscreen.html`을 공유 host로 사용한다. `ensureOffscreen()`은 `hasDocument()`를 확인한 후 모든 consumer가 필요로 할 reason을 한 번에 선언해 document를 생성한다.

선언 reason은 다음과 같다.

- `LOCAL_STORAGE`: localhost fetch proxy
- `BLOBS`: 검증된 대용량 download staging
- `WORKERS`: WebGPU·ONNX inference worker
- `DISPLAY_MEDIA`: tab/display capture
- `USER_MEDIA`: microphone
- `AUDIO_PLAYBACK`: background watch alert

공유 host에는 다음 script가 함께 로드된다.

| Script                     | 책임                                                     |
| -------------------------- | -------------------------------------------------------- |
| `offscreen.js`             | localhost/PNA fetch proxy와 streaming body 전달          |
| `vision-inference-host.js` | local WebGPU vision worker bridge                        |
| `skill-download.js`        | OPFS·blob 기반 download staging                          |
| `recorder.js`              | tab/display/mic capture, Web Audio mixing, MediaRecorder |
| `cloud-bridge.js`          | outbound localhost WebSocket 유지                        |
| `watch-audio.js`           | 조건부 background alert 재생                             |

각 script는 구분된 runtime message type을 수신하지만 document, origin과 lifecycle은 공유한다.

### 구조적 장점과 부담

장점:

- MV3 service worker에 없는 DOM, media, worker와 장기 연결 기능 제공
- 단일 생성 helper로 consumer 간 create race 방지
- localhost direct fetch 실패 시에만 lazy fallback 가능
- side panel이 닫혀도 recording과 worker 작업을 유지할 수 있음

부담:

- 먼저 필요한 기능 하나 때문에 전체 reason 집합을 선언해야 함
- network, model inference, media, staging과 WebSocket이 한 document lifecycle에 결합됨
- 공유 host 장애나 침해의 영향 반경이 여러 기능으로 확장됨
- 비교 commit의 source에서 `chrome.offscreen.closeDocument()` 정책은 확인되지 않음
- message type, payload, caller와 egress 검증이 각 consumer별로 계속 유지돼야 함

## 권한과 기능의 교환관계

### 현재 제품의 bounded 설계가 얻는 것

- WebBrain보다 작은 command allowlist와 사내 host 범위
- trusted input을 지원하면서 action 직후 debugger detach
- page context 임의 실행과 broad CDP command surface가 없음
- offscreen 다중 consumer 사이의 lifecycle·message coupling이 없음
- 모델/provider/page가 selector·좌표·method와 execution path를 지정할 수 없음

### 현재 제품이 계속 제외하는 것

- closed shadow DOM과 cross-origin frame의 일관된 접근
- pixel 기반 screenshot과 full-page capture
- console·network를 포함한 현장 진단성
- service worker에서 제공하기 어려운 media, WebGPU와 장기 연결 기능
- local HTTP provider에서 PNA·CORS 문제가 발생할 때의 browser-native fallback

WebBrain의 높은 수준은 제품 범위와 호환성을 위한 선택이고, 현재 제품의 bounded 수준은 trusted input 신뢰성과 최소 권한을 함께 유지하려는 선택이다. 수준 차이만으로 어느 쪽이 더 적합하다고 결론 내릴 수 없다.

## 채택된 CDP 경계와 향후 offscreen 검토

CDP 항목은 `docs/15-bounded-cdp-adapter.md`의 규범 결정으로 채택됐고 구현은 S2 `Planned`다. offscreen 항목은 여전히 비규범 검토사항이다.

### 채택된 bounded CDP

WebBrain 전체 command surface를 복제하지 않고 Level 2 adapter를 다음 경계로 채택했다.

- command와 parameter allowlist 고정
- model이 raw CDP method, JavaScript 또는 selector를 직접 지정하지 못하게 차단
- tab, frame, document epoch, run과 permission grant에 attach를 결속
- action 검증 직후, navigation, Stop과 worker cleanup에서 detach
- attach·command·detach를 secret 없는 audit event로 기록
- content-script fallback과 CDP trusted path의 결과 검증 계약 통일
- detach leak, 다른 debugger와의 충돌, tab close와 service-worker restart negative test 추가

### Offscreen이 필요한 경우

기능별 필요성을 먼저 증명하고 single-host 제약을 명시적으로 설계해야 한다.

- service worker direct fetch와 PNA/CORS 검증 후 network fallback 여부 결정
- 허용 consumer, message type, payload size와 sender 검증
- provider request 외 임의 URL proxy 금지
- reason별 데이터 분리와 egress allowlist
- idle close 또는 의도적인 지속 lifecycle 결정
- consumer 장애 격리, reconnect, cancellation과 stale response 처리
- recording, model inference와 cloud bridge처럼 범위 밖 기능의 reason 선등록 금지 여부 검토

Offscreen을 실제 개발 범위로 채택할 때는 `docs/01-architecture.md`, `docs/02-security-policy.md`, `docs/03-extension-design.md`, Sprint 문서와 verification plan에 계약과 negative test를 반영해야 한다.

## 참고한 로컬 근거

현재 제품:

- `extension/manifest.json`
- `extension/src/content/entry.ts`
- `extension/src/content/semantic-collector.ts`
- `extension/src/content/executor.ts`
- `extension/src/service-worker/entry.ts`
- `scripts/chrome-preview-e2e.mjs`
- `scripts/chrome-extension-smoke.mjs`
- `docs/01-architecture.md`
- `docs/03-extension-design.md`
- `docs/11-sprint-progress.md`
- `docs/15-bounded-cdp-adapter.md`
- `references/company-web-agent-detailed-design(1).md`

WebBrain checkout `70271912921afa4c208a62b1408f99a0b9e7d7f1`:

- `src/chrome/manifest.json`
- `src/chrome/ARCHITECTURE.md`
- `src/chrome/src/cdp/cdp-client.js`
- `src/chrome/src/agent/agent.js`
- `src/chrome/src/offscreen/ensure.js`
- `src/chrome/src/offscreen/offscreen.html`
- `src/chrome/src/offscreen/offscreen.js`
- `src/chrome/src/offscreen/vision-inference-host.js`
- `src/chrome/src/offscreen/inference-worker.js`
- `src/chrome/src/offscreen/skill-download.js`
- `src/chrome/src/offscreen/recorder.js`
- `src/chrome/src/offscreen/cloud-bridge.js`
- `src/chrome/src/offscreen/watch-audio.js`
