# 17. Claude 브라우저 기능 채택 설계

## Enterprise Web AI Platform 정렬 (2026-08-31)

이 문서에서 채택한 browser behavior는 Community Runtime의 구현
reference로 유지하되 Enterprise 제품에서는 다음 상위 계약이 우선한다.

-   현재 Semantic Projection = runtime observation SSoT.
-   Signed Page Profile = business meaning/action
    risk/verifier/workflow/MCP capability binding.
-   Enterprise Policy = 현재 user/device가 지금 실행 가능한지 결정.
-   Local Runtime hard guard = 중앙 정책도 우회 불가.
-   `skip_all_permission_checks`는 Community compatibility mode이며
    Enterprise에서는 policy-controlled `managed-auto`로 노출할 수 있다.
-   Business MCP는 Profile에 tool schema를 고정하지 않고
    Registry/discovery + capability selection을 사용한다.
-   Claude artifact는 계속 behavior oracle일 뿐 build/source
    dependency가 아니다.

## 1. 결정과 범위

ContextPilot은 Claude 1.0.81에서 확인한 고급 page read와 Chat workspace
UX를 독립 구현한다. 기존 제한형 semantic projection과 bounded mutation을
폐기하지 않고, 그 위에 다음 기능을 추가한다.

1.  hidden DOM을 기본 포함하는 계층형 `read_page`
2.  본문 중심 `get_page_text`
3.  자연어 `find`
4.  screenshot과 region zoom
5.  승인된 tab group context
6.  read-only batch
7.  `standard`, `follow_a_plan`, `skip_all_permission_checks` permission
    mode
8.  streaming, tool timeline, permission/action review, screenshot과 tab
    context를 통합한 Chat UI
9.  현재 demo 전용 Act를 일반 사이트의 profile-bound ref action으로 확장

이 결정은 다음 기능을 만들지 않는다.

-   model 지정 raw selector, DOM/CDP node ID, viewport 좌표와 CDP method
-   arbitrary JavaScript 또는 `Runtime.evaluate`
-   password, OTP, recovery code, API key와 token 입력
-   hidden target에 대한 mutation
-   dispatch 이후 DOM/CDP fallback이나 자동 retry
-   출처·license가 확인되지 않은 번들 source의 복사

## 2. 제품 원칙

### 2.1 읽기와 실행을 분리한다

hidden DOM은 읽기 정확도를 높이기 위해 모델에 제공하지만 실행 가능성을
의미하지 않는다. 모든 node는 `visibility`를 가지며 `hidden` node의
`model_ref`는 read/focus 도구에만 유효하다. mutation resolver는 hidden
target을 항상 `TARGET_NOT_ACTIONABLE`로 거부한다.

### 2.2 permission 생략과 hard policy 생략을 구분한다

`skip_all_permission_checks`는 capability × host prompt와
domain-transition prompt를 생략한다. 다음 hard policy는 어떤 mode에서도
생략하지 않는다.

-   restricted scheme과 Chrome 제한 페이지 차단
-   organization/user denylist와 category block(Enterprise) 또는 local
    deny/category policy(Community)
-   credential target 읽기 값 redaction과 mutation 금지
-   R2의 현재 intent confirmation과 R3 기본 거부
-   document/run/ref binding, schema validation과 stale target 거부
-   CDP closed allowlist, action-scoped detach와 verifier
-   provider secret과 browser credential 비노출

UI에는 이 차이를 "권한 질문 생략"과 "안전 제한 유지"로 정확히 표시한다.

### 2.3 모델 입력은 모두 비신뢰 데이터다

visible/hidden page content, screenshot OCR/vision 결과, tab title/URL,
Business MCP result는 system instruction이 아니다. 모든 payload를
명시적인 untrusted delimiter로 감싸고 page 안의 지시를 따르지 않도록
system prompt에 고정한다.

## 3. 목표 구조

``` text
Side Panel Chat Workspace
  ├─ Composer / mode / model / permission mode
  ├─ Conversation virtual list
  ├─ Tool timeline / screenshot / plan / tab cards
  ├─ Permission and confirmation modal layer
  └─ Run status / Stop / retry-with-new-run
                  │ closed UI messages
                  ▼
Service Worker Run Coordinator
  ├─ Page Read Orchestrator
  │    ├─ semantic projection
  │    ├─ read_page tree
  │    ├─ get_page_text
  │    ├─ find index
  │    └─ screenshot/zoom adapter
  ├─ Permission Mode Policy
  ├─ Model Tool Registry
  ├─ Mutation Coordinator / Verifier
  ├─ Tab Group Coordinator
  └─ Provider Runtime
                  │ sender/document validated messages
                  ▼
Content Script
  ├─ visible + hidden DOM collector
  ├─ document ref registry
  ├─ DOM preflight/executor
  └─ bounded CDP target marker bridge
                  │
          ┌───────┴────────┐
          ▼                ▼
Bounded CDP Adapter   Vision Capture Adapter
  └ fixed DOM/Input     └ fixed screenshot command
```

Screenshot capture는 mutation adapter와 동일한 raw command interface를
공유하지 않는다. `Page.captureScreenshot`만 가진 별도 typed
`VisionCaptureAdapter`를 두고 input command를 노출하지 않는다.

## 4. Settings 계약

``` ts
type PermissionMode =
  | "standard"
  | "follow_a_plan"
  | "skip_all_permission_checks";

type PageReadScope = "all_dom" | "visible_only" | "interactive";

type AgentPreferences = {
  permission_mode: PermissionMode;
  default_read_scope: PageReadScope; // default: all_dom
  screenshot_policy: "manual_or_model" | "manual_only" | "disabled";
  group_tools_in_timeline: boolean;
  show_tool_debug_details: boolean;
};
```

### 4.1 `skip_all_permission_checks` 활성화

활성화는 Settings에서만 가능하며 Chat message나 model tool call로 변경할
수 없다.

1.  위험 설명 화면에서 생략되는 prompt와 유지되는 hard policy를 표로
    보여준다.
2.  사용자는 `권한 질문 생략` 확인 문구를 직접 입력한다.
3.  설정 저장 후 현재 run은 취소한다.
4.  새 Chat run header에 붉은 `Permission-less` badge를 고정한다.
5.  mode 변경은 다음 run부터 적용하며 진행 중 run에 소급하지 않는다.
6.  managed policy가 mode를 금지하면 UI와 message schema 양쪽에서
    거부한다.
7.  audit에는 page content 없이 mode activation/deactivation과 run
    mode만 기록한다.

이 mode는 host allow prompt를 만들지 않지만, 현재 tab URL과 action
origin을 매 tool 실행 전에 다시 계산한다. navigation으로 origin이 바뀌면
새 origin을 기록하고 category/hard policy를 다시 검사한다.

### 4.2 `follow_a_plan`

첫 mutation이나 navigation 전에 모델은 `update_plan`으로 domain과 단계
목록을 제안한다. 사용자가 승인한 exact registrable host 집합은 run
memory에만 저장한다. 계획 밖 host는 permission prompt가 아니라
`PLAN_SCOPE_VIOLATION`으로 중단하고 새 계획 승인을 요구한다.

## 5. Page read 계약

### 5.1 snapshot schema

``` ts
type ModelPageNode = {
  model_ref: string;
  role: string;
  name: string;
  visibility: "visible" | "hidden";
  hidden_reason?:
    | "display_none"
    | "visibility_hidden"
    | "opacity_zero"
    | "aria_hidden"
    | "outside_viewport"
    | "collapsed"
    | "zero_box"
    | "ancestor_hidden";
  enabled: boolean;
  state: Record<string, boolean | string | number>;
  parent_model_ref?: string;
  label_model_ref?: string;
  href?: string;
  input_type?: string;
  placeholder?: string;
};

type ModelPageSnapshot = {
  schema_version: 2;
  document_epoch: string;
  frame_id: number;
  scope: PageReadScope;
  truncated: boolean;
  node_count: number;
  nodes: ModelPageNode[];
  visible_text: string;
};
```

`default_read_scope`는 `all_dom`이다. 초기 Ask/Act request에도 hidden
node를 포함한다. 단, 다음 데이터는 scope와 무관하게 포함하지 않는다.

-   `script`, `style`, `meta`, `link`, `noscript`의 source/text
-   raw HTML, CSS, event handler source와 dataset 전체
-   input/textarea의 current value
-   password/hidden input, OTP, recovery, card security, API key와 token
    field의 value와 option value
-   cookie, local/session storage, Authorization header와 browser
    credential
-   closed shadow root와 cross-origin frame DOM

href는 `http(s)` absolute URL의 origin/path까지만 허용하고 userinfo,
query와 fragment를 제거한다. option은 visible label만 보내며 raw value는
보내지 않는다.

### 5.2 수집과 제한

-   main frame과 same-origin child frame을 별도 frame scope로 수집한다.
-   node 상한은 frame당 2,000, 전체 5,000이다.
-   기본 depth는 15, 기본 직렬화 상한은 50,000자, 절대 상한은
    200,000자다.
-   상한 초과 시 line/node 경계에서 자르고 `truncated`, 원래
    node/character 수와 focus 방법을 반환한다.
-   동일 document 안에서 ref registry를 재사용하지만 provider에는 매 run
    새 `model_ref`를 만든다.
-   role/name/visibility/DOM identity 변화는 기존 ref를 stale 처리한다.
-   hidden node에도 ref를 만들지만 mutation mapping에는 등록하지 않는다.

### 5.3 모델 도구

  --------------------------------------------------------------------------------------
  도구                         입력                        결과               mutation
                                                                              가능성
  ---------------------------- --------------------------- ------------------ ----------
  `read_page`                  tab, scope, depth, parent   계층형 page tree   없음
                               model ref, max chars                           

  `get_page_text`              tab, max chars              main/article 우선  없음
                                                           visible text       

  `find`                       tab, query, scope, limit    ranked model refs  없음

  `read_semantic_projection`   없음                        현재 initial       없음
                                                           snapshot 재조회    
  --------------------------------------------------------------------------------------

`read_page`의 scope 기본값은 `all_dom`이다. `find`도 기본적으로
visible과 hidden 후보를 모두 검색하고 각 결과에 visibility를 표시한다.

### 5.4 `find` 구현

1.  role/name/text token, exact/substring/fuzzy score로 deterministic
    후보를 최대 100개 만든다.
2.  score가 충분하면 상위 결과를 바로 반환한다.
3.  모호한 query만 선택된 provider의 small/fast model로 재정렬한다.
4.  재정렬 모델은 새로운 ref를 만들거나 visibility를 바꾸지 못한다.
5.  결과는 최대 20개이며 hidden 결과는 `read-only hidden`으로 표시한다.

## 6. Vision read 계약

`screenshot`과 `zoom`은 별도 `vision_read` capability로 분류한다.
`skip_all_permission_checks`에서는 prompt를 생략하지만 hard policy와
restricted page 차단은 유지한다.

-   기본 viewport screenshot만 캡처한다.
-   full-page capture, browser chrome, 다른 window와 background tab
    capture는 지원하지 않는다.
-   최대 긴 변 1,568px, 최대 1.4MB base64, JPEG 기본 quality 75다.
-   screenshot은 provider request와 현재 run memory에만 존재하고
    storage/audit/diagnostics에 저장하지 않는다.
-   tool result에 `capture_id`, viewport size, image format을 넣고 좌표
    실행용 authority로 사용하지 않는다.
-   `zoom` region은 이전 screenshot에서 사용자가 선택하거나 model이
    제안할 수 있지만 capture 범위로만 쓰며 click coordinate로 재사용하지
    않는다.
-   password manager popup, browser UI, restricted URL과 protected video
    capture 실패는 정상 오류로 처리한다.

## 7. Tab context와 read-only batch

`tabs_context`는 현재 run이 소유한 tab group의 tab ID, redacted title,
origin/path URL, active/loading 상태만 반환한다. query/fragment와 opener
정보는 제외한다.

`tabs_create`와 navigation은 mutation 도구이므로 read-only batch에
포함하지 않는다. `read_batch`는 다음 도구만 순차 실행한다.

-   `read_page`
-   `get_page_text`
-   `find`
-   `screenshot`
-   `zoom`
-   `tabs_context`
-   Profile-bound read-only Business MCP

batch는 1\~8개 action, 전체 3MB, 30초로 제한하고 첫 오류에서 중단한다.
각 item은 독립 schema와 hard policy를 다시 검사한다. batch result는
item별 status와 tool result를 원래 순서로 반환한다.

## 8. 범용 Act 연결

S7에서 demo 전용 proposal schema를 일반 Page Profile tool definition으로
대체한다.

  -------------------------------------------------------------------------------
  모델 도구                target                       실행 경로
  ------------------------ ---------------------------- -------------------------
  `click_by_ref`           visible enabled              DOM 또는 bounded CDP left
                           button/link/menuitem         click

  `set_text_by_ref`        visible non-sensitive        user value slot 후
                           textbox                      DOM/CDP text

  `select_option_by_ref`   visible combobox             closed option label과 DOM
                                                        event

  `set_checked_by_ref`     visible checkbox/radio       DOM click과 state
                                                        verifier

  `press_key_by_ref`       visible focusable target     closed key enum과 bounded
                                                        CDP

  `navigate`               normalized HTTPS URL         tab API와
                                                        domain/hard-policy 검증
  -------------------------------------------------------------------------------

model은 raw text value를 받지 않는다. target 제안 뒤 Side Panel value
request에서 사용자가 값을 제공한다. option label은 signed/bundled Page
Profile이 공개 가능한 enum으로 선언한 경우에만 모델이 제안할 수 있다.

모든 action은
`PROPOSING → WAITING_PERMISSION? → WAITING_VALUE? → WAITING_CONFIRMATION? → PREFLIGHT → EXECUTING → VERIFYING`을
거친다. `skip_all_permission_checks`는 `WAITING_PERMISSION`만 제거한다.

## 9. Chat UI 설계

### 9.1 화면 구조

``` text
┌ Header: page favicon/title | Ask/Act | model | permission badge ┐
├ Run banner: plan scope / permission-less warning / blocked state ┤
├ Conversation viewport (virtualized)                              ┤
│  ├ user message                                                  ┤
│  ├ assistant streaming blocks                                    ┤
│  ├ grouped tool timeline                                         ┤
│  │   ├ page/tab/find/read card                                   ┤
│  │   ├ screenshot/zoom card                                      ┤
│  │   ├ action proposal/result card                               ┤
│  │   └ expandable safe debug detail                              ┤
│  └ final answer / error recovery                                 ┤
├ Inline pending area: value request / plan review                 ┤
├ Composer: attachments | prompt | send/stop                       ┤
└ Modal layer: permission / R2 confirmation / settings danger flow ┘
```

### 9.2 message model

UI는 provider wire message를 직접 렌더링하지 않는다. service worker가
다음 closed event를 보낸다.

``` ts
type ChatEvent =
  | { type: "run_started"; run_id: string; mode: "ask" | "act" }
  | { type: "assistant_delta"; run_id: string; sequence: number; text: string }
  | {
      type: "tool_started";
      run_id: string;
      tool_use_id: string;
      tool: string;
      summary: string;
    }
  | {
      type: "tool_progress";
      run_id: string;
      tool_use_id: string;
      progress: SafeProgress;
    }
  | {
      type: "tool_finished";
      run_id: string;
      tool_use_id: string;
      result: SafeToolResult;
    }
  | { type: "permission_required"; request: PermissionRequestView }
  | { type: "value_required"; request: ValueRequestView }
  | { type: "confirmation_required"; request: ConfirmationView }
  | {
      type: "run_terminal";
      outcome: "VERIFIED" | "FAILED" | "UNKNOWN" | "CANCELLED";
    };
```

sequence는 run마다 1부터 단조 증가한다. duplicate event는
`(run_id, sequence)`로 무시하고 gap이 생기면 `CHAT_RESYNC`로 service
worker snapshot을 요청한다.

### 9.3 streaming과 복구

-   assistant delta는 16\~50ms 단위로 batch render한다.
-   service worker suspend/reconnect 후 UI는 run snapshot과 마지막
    sequence를 다시 요청한다.
-   Stop은 composer와 header에 항상 보이고 한 번 누르면 즉시
    disabled/spinner로 바뀐다.
-   Stop 이후 들어온 provider delta와 tool result는 transcript에
    반영하지 않는다.
-   실패 card는 `다시 시도`가 아니라 `새 상태로 다시 읽기`를 제공한다.
    새 run과 새 model ref를 만든다.
-   provider timeout, permission 거부, stale target, unknown outcome과
    CDP conflict를 서로 다른 회복 문구로 표시한다.

### 9.4 tool timeline

-   연속된 read tool은 하나의 접을 수 있는 group으로 묶는다.
-   mutation, permission, confirmation과 오류는 자동 collapse하지
    않는다.
-   screenshot card는 lazy decode하고 viewport에 없으면 bitmap을
    release한다.
-   click 결과에는 좌표를 표시하지 않고 target semantic label과
    outcome만 표시한다.
-   debug detail은 secret scrubber를 통과한 schema field만 보여주며 raw
    provider response, prompt, page source, ref mapping을 표시하지
    않는다.

### 9.5 접근성·반응형·국제화

-   모든 tool status 변화는 과도하지 않은 `aria-live=polite` region으로
    알린다.
-   permission/confirmation modal은 focus trap, Escape 정책과 initial
    focus를 가진다.
-   keyboard만으로 Send, Stop, expand, approve/deny를 수행할 수 있다.
-   320px side panel부터 pop-out width까지 layout shift 없이 동작한다.
-   사용자 문자열은 locale catalog에 두고 tool/error code를 직접
    노출하지 않는다.
-   1,000개 timeline item에서도 virtual list를 사용하고 현재 streaming
    block의 focus를 유지한다.

## 10. Permission request와 confirmation UI

`standard` mode permission card는 capability, exact host, action
summary와 once/always/deny를 표시한다. raw typed value, selector, ref와
coordinate는 표시하지 않는다.

`follow_a_plan`은 plan review에서 domain 목록과 단계만 승인한다. R2
confirmation은 plan 승인과 별개다.

`skip_all_permission_checks`에서는 permission card를 만들지 않는다. 대신
run banner와 mutation card에 `권한 질문이 생략됨`을 표시한다. R2
confirmation modal은 그대로 표시하며 permission mode 변경으로 자동
승인되지 않는다.

## 11. 데이터와 감사

  ----------------------------------------------------------------------------------------------
  데이터               model/provider   run memory     persistent       audit
                                                       storage          
  -------------------- ---------------- -------------- ---------------- ------------------------
  visible/hidden       허용             허용           금지             금지
  semantic node                                                         

  screenshot           해당 turn만 허용 terminal까지   금지             금지

  raw ref mapping      금지             허용           금지             금지

  action value         금지             실행까지       금지             금지

  permission mode      mode 이름만 허용 허용           설정 저장        이름과 변경 시각

  permission decision  불필요           허용           always만 저장    capability/host/result

  credential/browser   금지             금지           provider         금지
  secret                                               secret만 local   
  ----------------------------------------------------------------------------------------------

hidden DOM 제공 사실은 Settings와 첫 실행 안내에 공개한다. 진단
export에는 node count, hidden count, truncation 여부만 포함하고
content는 포함하지 않는다.

## 12. 오류 계약

새 오류 코드는 다음과 같다.

  -------------------------------------------------------------------------------
  코드                           의미                         UI 처리
  ------------------------------ ---------------------------- -------------------
  `PAGE_READ_TRUNCATED`          절대 상한 때문에 일부만 반환 focus/depth 재조회
                                                              안내

  `VISION_CAPTURE_DISABLED`      screenshot policy가 disabled Settings link

  `VISION_CAPTURE_UNAVAILABLE`   restricted/hidden            text read 대안
                                 tab/capture 실패             

  `PLAN_SCOPE_VIOLATION`         승인 plan 밖의 host          새 plan review

  `PERMISSION_MODE_MANAGED`      managed policy가 mode 변경   읽기 전용 설명
                                 금지                         

  `CHAT_EVENT_GAP`               UI event sequence 손실       자동 resync

  `CHAT_RUN_RECOVERY_FAILED`     worker 복구 실패             새 run 시작
  -------------------------------------------------------------------------------

## 13. 구현 이관 원칙

Claude 번들은 behavior oracle로만 사용한다.

1.  artifact hash와 관찰한 behavior를 reference 문서에 고정한다.
2.  가져올 기능마다 ContextPilot 요구사항과 테스트를 먼저 작성한다.
3.  minified identifier, 문구, 함수 body와 UI asset은 복사하지 않는다.
4.  Chrome API는 공식 type/문서를 기준으로 새 adapter를 구현한다.
5.  behavior parity fixture에서 입력과 결과만 비교한다.
6.  license/provenance가 확인된 공개 의존성만 package에 추가한다.
7.  구현 PR에는 "참고한 behavior", "독립 구현 파일", "검증 evidence"를
    연결한다.

ContextPilot 내부의 기존 event store, message schema, virtual list,
permission component, semantic collector, ref registry, mutation
coordinator와 verifier는 먼저 inventory하고 재사용 가능 여부를 카드별로
판정한다. 계약이 맞는 코드는 그대로 연결하거나 작은 adapter로 확장하고,
계약이 다른 코드는 compatibility layer 없이 교체한다. 이 inventory와
wiring도 S5\~S8 구현 범위이며 새 코드만 작성하고 기존 foundation을
방치한 상태는 완료가 아니다.

## 14. 완료 정의

이 설계의 완료는 문서 작성이 아니라 S5\~S9가 상태 원장에서 각각 `Done`이
되는 것이다. 최소 완료 조건은 다음과 같다.

-   Chat UI streaming/recovery/accessibility Chrome E2E
-   hidden DOM 기본 projection과 credential negative test
-   screenshot/find/tabs/read batch의 실제 Chrome evidence
-   demo가 아닌 두 개 이상의 일반 fixture에서 generic Act
-   standard/follow-plan/skip-all mode의 positive/negative matrix
-   R2/R3, credential, stale ref, detach와 verifier hard policy 유지
-   Windows/Linux clean profile 설치, upgrade와 rollback
