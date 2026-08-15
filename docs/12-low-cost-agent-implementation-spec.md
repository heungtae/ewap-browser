# 12. 저가형 AI 구현 실행 명세서

## 1. 목적과 우선순위

이 문서는 **S0부터 S5까지를 사람이 지속적으로 설계 보완하지 않아도 구현할 수 있게 하는 실행 기준**이다. 구현 담당자가 저가형 AI이거나 경험이 적어도 다음만 따르면 동일한 경계와 검증 결과를 만들 수 있어야 한다.

1. 이 문서에서 지정한 파일과 공개 계약만 만든다.
2. 한 작업 카드의 범위 밖 파일, 도구, 권한, 네트워크 호출을 추가하지 않는다.
3. 모호하거나 운영 입력이 비어 있으면 추측하지 않고 지정한 오류 코드로 종료한다.
4. 코드보다 먼저 해당 작업 카드의 테스트를 작성하거나 갱신한다.
5. 한 Sprint의 완료 조건을 모두 증명하기 전에는 다음 Sprint를 시작하지 않는다.

이 문서와 01~07의 규칙이 충돌하면 보안·데이터 최소화 규칙은 02/06을 우선하고, 나머지는 이 문서의 더 좁은 계약을 우선한다. 값이 비어 있는 운영 구성은 개발용 기본값으로 채우지 않는다.

### 1.1 구현에서 금지하는 추론

구현자는 다음을 편의상 추가하거나 바꾸면 안 된다.

- `any`, 무검증 type assertion, 동적 import, 문자열 기반 command dispatch
- `execute_js`, CSS selector/XPath를 모델 입력 또는 public tool argument로 노출
- `<all_urls>`, wildcard host permission, remote script, `eval`, loopback TCP listener
- prompt/completion/raw DOM/raw input value를 log, fixture golden, persistent storage에 저장
- network/SSO/Profile의 mock 성공을 production fallback으로 사용
- mutation의 timeout, `UNKNOWN`, navigation, worker restart 뒤 자동 재시도
- 문서에 없는 dependency, permission, runtime message, tool, error code

필요성이 생기면 구현을 멈추고 02, 03, 07과 이 문서를 함께 변경하는 별도 설계 변경으로 제출한다.

## 2. 고정 기술 선택과 저장소 레이아웃

S0에서는 다음 선택을 바꾸지 않는다. 선택지를 열어 두면 구현 에이전트가 서로 다른 build/test 구조를 만들기 쉽다.

| 영역 | 고정 선택 | 이유 |
|---|---|---|
| extension | TypeScript strict, Chrome MV3, esbuild | 작은 산출물과 명시적 entry point |
| extension test | Vitest + Playwright Chromium fixture | 순수 함수와 실제 Chrome을 분리 |
| native host | .NET 8 C#, Native Messaging console executable | Windows IWA, ACL named pipe API를 안정적으로 사용 |
| native-host test | xUnit | .NET 기본 테스트 경로 |
| package manager | Node 22 LTS + pnpm 9 lockfile | 재현 가능한 workspace install |
| format/lint | ESLint + Prettier, C# `dotnet format --verify-no-changes` | CI와 로컬 결과를 일치 |
| contract format | JSON Schema 2020-12 + TypeScript generated/static type | 경계마다 schema 검증 |

처음 만드는 파일 구조는 다음과 같다. `src` 밖에 구현 코드를 만들지 않는다. 각 디렉터리의 `README`는 만들지 않으며, 설명은 이 문서를 단일 기준으로 한다.

```text
package.json                         # root script만 보유
pnpm-workspace.yaml
pnpm-lock.yaml
tsconfig.base.json
eslint.config.mjs
prettier.config.mjs
extension/
  manifest.json
  src/
    contracts/                       # extension public boundary type/schema
    security/                        # pure validation/redaction/digest functions
    policy/                          # pure policy decision
    state/                           # run, confirmation, tool registry
    service-worker/                  # coordinator, chrome adapters only
    content/                         # DOM-only collection/execution
    sidepanel/                       # render/event dispatch only
  tests/unit/
  tests/fixtures/
  tests/e2e/
native-host/
  Company.WebAgent.Host.sln
  src/Company.WebAgent.Host/
  tests/Company.WebAgent.Host.Tests/
contracts/
  json-schema/                       # tool, message, audit, profile schemas
  fixtures/                          # valid/invalid JSON samples only
deployment/
  managed-policy.schema.json
  managed-policy.example.json        # non-routable example only
  compatibility-matrix.json
scripts/
  bootstrap-local.ps1
  build-extension.ps1
  test-local.ps1
  run-chrome-dev.ps1
  install-native-host-dev.ps1
  uninstall-native-host-dev.ps1
tests/                               # cross-component fixture assets only
docs/
```

### 2.1 의존성 경계

| 모듈 | 허용 import | 금지 import |
|---|---|---|
| `contracts` | standard library/schema helper | Chrome API, DOM, network, UI |
| `security`, `policy`, `state` | `contracts`, standard library | Chrome API, DOM, fetch, Native Messaging |
| `content` | `contracts`, `security` | service-worker internals, fetch, storage, native API |
| `sidepanel` | `contracts` | content module, policy internals, native API |
| `service-worker` | 모든 extension 내부 module | raw DOM access, arbitrary fetch |
| native host domain | its contracts/domain only | console output, registry, network implementation |
| native host adapters | domain/contracts | extension source import |

lint rule와 dependency-cruiser(또는 동등한 import boundary test)는 위 표를 검사해야 한다. S0에서는 tool을 만들지 않아도 이 검사를 먼저 만든다.

## 3. 공통 데이터 계약

모든 JSON은 unknown key를 거부한다. `id`는 UUID 또는 crypto-random opaque ID이고, 페이지 DOM ID, URL, Windows identity를 재사용하지 않는다. 문자열은 명시된 길이보다 길면 truncate하지 말고 `INVALID_ARGUMENT`으로 거부한다.

### 3.1 enum과 크기 제한

| 항목 | 허용값 또는 상한 |
|---|---|
| `Mode` | `ask`, `act` |
| `Risk` | `R0`, `R1`, `R2`, `R3` |
| terminal `Outcome` | `VERIFIED`, `FAILED`, `UNKNOWN`, `CANCELLED` |
| `Decision` | `ALLOW`, `REQUIRE_CONFIRMATION`, `DENY` |
| `run_id` | UUID v4, 36 chars |
| opaque `ref_id` | base64url 16~64 chars; DOM text/selector 금지 |
| opaque `model_ref` | base64url 16~64 chars; run 한정, Host/LLM target correlation 전용 |
| opaque `value_slot_id` | base64url 16~64 chars; service worker 생성, run/target/tool 한정, 모델·Host 비노출 |
| accessible name | redaction 후 최대 160 Unicode code point |
| protected text value | 최대 4,096 Unicode code point; NUL·unpaired surrogate 거부, 내용 변환·truncate 금지 |
| protected option name | 최대 160 Unicode code point; NUL·줄바꿈·unpaired surrogate 거부 |
| projection node 수 | frame당 최대 500, snapshot 최대 256 KiB |
| LLM prompt/response | redacted payload 최대 256 KiB, stream 최대 2 MiB |
| runtime/native message | 최대 512 KiB |
| profile response | 최대 64 KiB |
| R2 confirmation TTL | 최대 120초; profile/session expiry보다 길 수 없음 |
| user value buffer TTL | 최대 5분; terminal event가 먼저면 즉시 폐기 |

모든 한도 초과는 해당 run을 `FAILED`로 끝내고 reason code `PAYLOAD_LIMIT_EXCEEDED`를 기록한다. action은 시작하지 않는다.

### 3.2 semantic projection schema

아래는 `read_semantic_projection`의 반환 모델이다. HTML/AX tree의 사본이 아니라 허용된 필드만 가진 별도 DTO다.

```ts
type SemanticState = {
  disabled?: boolean; checked?: boolean; selected?: boolean;
  expanded?: boolean; required?: boolean;
};
type SemanticNode = {
  ref_id: string;
  role: "button" | "checkbox" | "combobox" | "heading" | "link" |
        "option" | "radio" | "textbox" | "listbox" | "tab" | "menuitem" |
        "dialog" | "alert" | "status" | "navigation" | "main" | "form";
  name: string;                 // redacted, max 160
  state: SemanticState;
  visible: boolean;
  enabled: boolean;
  parent_ref_id?: string;       // same frame only
  label_ref_id?: string;        // same frame only
};
type SemanticSnapshot = {
  document_epoch: string;       // random token, navigation마다 변경
  frame_id: number;
  nodes: SemanticNode[];
};
```

`SemanticSnapshot`은 content/service worker 내부 DTO다. service worker는 모델 요청 시 모든 `ref_id`, `parent_ref_id`, `label_ref_id`를 동일 run의 서로 다른 `model_ref`로 전부 치환한 `ModelSemanticSnapshot`만 만든다. `ModelActionProposal`의 target은 `model_ref` 하나뿐이며 raw `ref_id`, selector, URL을 포함할 수 없다. mapping은 service worker 메모리에만 두고 proposal 하나를 성공적으로 해석하거나 run이 terminal/navigation/profile-change/worker-restart가 되면 폐기한다. unknown, 다른 run, 이미 해석한 `model_ref`와 Host/LLM payload의 raw `ref_id`는 `INVALID_ARGUMENT`으로 거부한다.

collector 순서는 DOM preorder다. 지원 role이 아니거나 `visible=false`인 node는 기본적으로 제외한다. 단, 현재 target verifier에 필요한 node는 `visible=false`여도 executor 내부에서만 관찰할 수 있고 snapshot/LLM에는 보내지 않는다. `name` 계산은 native label, `aria-label`, `aria-labelledby`, text 순으로 하되, 160자 전 redaction을 실행한다. `input`, `textarea`, `select`의 현재 value와 placeholder, title, dataset, URL, HTML은 사용하지 않는다. password, autocomplete OTP, label이 secret/비밀번호/인증/OTP/MFA와 case-insensitive 일치하는 element는 node 전체를 제외한다.

Page Profile용 fingerprint canonicalizer는 이 DTO를 임의로 축약하지 않고 [14-semantic-projection-fingerprint.md](14-semantic-projection-fingerprint.md)의 top-frame filtering, closed object 생성, label alias, 현재 상태값을 제외한 state capability 변환, RFC 8785와 golden vector를 그대로 구현한다. canonicalizer는 pure function으로 두고 raw accessible name을 반환값, 오류 또는 log에 포함하지 않는다.

### 3.3 모델 비노출 value slot 계약

`set_text_by_ref`와 `select_option_by_ref`의 raw value는 모델 proposal 뒤에 Side Panel에서 수집한다. Act의 최초 모델 요청에는 raw value input control이 없으며, 모델은 value, value digest, `value_slot_id`, value 길이·문자 class·미리보기 중 어느 것도 받지 않는다. 사용자는 먼저 값 없는 작업 의도를 요청하고, service worker가 모델 proposal의 target을 현재 `ref_id`로 한 번 해석하고 target preflight를 통과시킨 뒤에만 Side Panel이 protected value control을 연다.

모델 proposal과 panel/runtime payload는 다음 closed schema를 따른다.

```ts
type ProposalBase = {
  target: string;                 // current run의 model_ref
};
type ModelActionProposal =
  | (ProposalBase & { tool: "set_text_by_ref" | "select_option_by_ref" })
  | (ProposalBase & { tool: "set_checked_by_ref"; argument: { checked: boolean } })
  | (ProposalBase & { tool: "press_key_by_ref"; argument: { key: "Enter" | "Space" | "Escape" } })
  | (ProposalBase & { tool: "click_by_ref" });

type AwaitingValueBase = {
  state: "AWAITING_VALUE";
  value_slot_id: string;
  target: { role: SemanticNode["role"]; name: string }; // redacted name only
  expires_at: string;
};
type AwaitingValuePanelState =
  | (AwaitingValueBase & {
      value_kind: "text";
      constraints: { max_code_points: 4096; multiline: boolean };
    })
  | (AwaitingValueBase & {
      value_kind: "option";
      constraints: { max_code_points: 160; multiline: false };
    });

type SubmitActionValuePayload =
  | { value_slot_id: string; value_kind: "text"; value: string }
  | { value_slot_id: string; value_kind: "option"; value: string };
```

`set_text_by_ref`는 `text`, `select_option_by_ref`는 `option` slot을 반드시 요구한다. 이 두 proposal에는 `argument`를 허용하지 않는다. `set_checked_by_ref`는 `checked` 하나, `press_key_by_ref`는 `key` 하나만 요구하며 value slot을 만들지 않는다. `click_by_ref`에는 `argument`와 value slot이 모두 없다. `option_name`, text, selector, DOM value를 model schema에 추가할 수 없다.

모델 proposal schema는 `additionalProperties: false`다. `expected`, verifier ID/predicate, risk, profile/effect, navigation path를 모델이 보내면 proposal 전체를 `INVALID_ARGUMENT`으로 거부한다. 이 값들은 target을 해석한 뒤 service worker만 만든다.

service worker는 preflight가 끝난 pending proposal마다 crypto-random `value_slot_id` 하나만 만들고 `(run_id, tab_id, frame_id, document_epoch, profile id/version, tool, ref_id, value_kind, expires_at, consumed=false)`에 결속해 메모리에 저장한다. `PANEL_STATE/AWAITING_VALUE`에는 redacted target 정보와 제약만 넣는다. raw value는 `SUBMIT_ACTION_VALUE`에서 처음 생기며 Side Panel sender, active run state, 모든 binding, kind, 길이와 TTL이 일치할 때만 받는다. mismatch, duplicate, expiry 또는 navigation에는 slot과 제출값을 폐기하고 `VALUE_BINDING_INVALID`로 terminal 처리한다.

value digest는 raw value를 받은 service worker 메모리에서만 다음 closed object의 RFC 8785 UTF-8 bytes를 SHA-256 unpadded base64url로 계산한다.

```ts
type ValueDigestInput = {
  schema_version: 1;
  run_id: string;
  tab_id: number;
  frame_id: number;
  document_epoch: string;
  profile_id: string;
  profile_version: number;
  tool: "set_text_by_ref" | "select_option_by_ref";
  ref_id: string;
  value_slot_id: string;
  value_kind: "text" | "option";
  value: string;
};
```

이 input object는 hash 계산 직후 폐기하며 저장·log·audit·Host/bridge/LLM payload가 아니다. service worker는 target을 다시 preflight한 뒤 slot을 atomic consume하고 정확히 한 번의 `EXECUTE_ACTION`에만 다음 delivery를 붙인다.

```ts
type ValueBinding = {
  value_slot_id: string;
  value_kind: "text" | "option";
  value_digest: string;
};

type ExecuteActionPayload = {
  intent: ActionIntent;           // raw value 없음
  value_delivery?: {
    value_slot_id: string;
    value_kind: "text" | "option";
    value: string;
  };
};
```

content script는 envelope/intent의 run·tab·frame·epoch, slot ID/kind와 재계산한 digest가 모두 일치할 때만 raw value를 DOM executor에 넘긴다. 동일 `value_slot_id`의 두 번째 delivery는 거부한다. `chrome.runtime` 내부 IPC를 통과한 raw value는 content script의 해당 call stack과 verifier에만 유지하고 terminal result 직후 참조를 제거한다. JavaScript string의 물리적 메모리 overwrite를 보장한다고 주장하지 않으며, retained reference·storage·log·error serialization이 없음을 검증한다. send 실패나 worker/content disconnect 뒤에는 slot을 복구·재전송하지 않고 `UNKNOWN`으로 끝낸다.

### 3.4 ActionIntent와 canonical digest

`ActionIntent`는 coordinator가 executor에 주는 유일한 mutation 입력이다. 모델 proposal은 3.3의 `ModelActionProposal`이고, service worker만 `model_ref`를 내부 target으로 해석한 뒤 아래 intent를 만든다. value tool은 같은 run/target/tool에 결속된 아직 미소비 slot의 `ValueBinding`을 반드시 포함하고 raw value는 포함하지 않는다. slot은 executor 전송 직전에 atomic consume한다.

```ts
type ActionIntent = {
  tool: "set_text_by_ref" | "select_option_by_ref" | "set_checked_by_ref" |
        "click_by_ref" | "press_key_by_ref";
  run_id: string;
  tab_id: number;
  frame_id: number;
  document_epoch: string;
  profile: { id: string; version: number };
  ref_id: string;
  risk: "R1" | "R2";
  effect: "local-ui-only" | "server-side";
  verifier: VerifierPredicate;
  argument?: { checked?: boolean; key?: "Enter" | "Space" | "Escape" };
  value_binding?: ValueBinding;
};

type VerifierPredicate =
  | {
      kind: "semantic-state-transition";
      declaration_id: string;
      pre_state_digest: string;
      required_changes: SemanticStatePredicate[];
    }
  | {
      kind: "exact-navigation-transition";
      declaration_id: string;
      pre_page_context_digest: string;
      origin: string;
      path_template_id: string;
      required_post_states: SemanticStatePredicate[];
    }
  | {
      kind: "business-state-transition";
      declaration_id: string;
      precondition_token: string;
      authoritative_field_id: string;
      expected_transition: string;
    };
```

`VerifierPredicate`는 모델이나 Side Panel payload가 아니다. service worker가 current signed Profile의 tool/effect/verifier declaration을 exact match하고 실행 직전 pre-state를 캡처한 뒤 closed enum만으로 생성한다. `pre_state_digest`와 `pre_page_context_digest`는 current run/document 내부 결속값이며 Host·LLM·audit에 보내지 않는다. 이미 predicate가 참이면 no-op 방지를 위해 실행 전에 거부한다. `server-side` effect는 `business-state-transition` 또는 exact navigation 뒤 authoritative post-state가 없으면 `TARGET_NOT_ACTIONABLE`이다.

intent digest는 `ActionIntent`의 UTF-8 RFC 8785 canonical JSON을 SHA-256 unpadded base64url로 계산한다. key 순서, 빈 optional key, `undefined`는 canonical JSON에 넣지 않는다. raw value는 intent에 추가하지 않는다. `value_binding.value_digest`는 intent 결속과 duplicate 방지에만 쓰며 raw value와 함께 persistence, audit, Host, bridge, LLM로 전송하지 않는다.

### 3.5 Runtime message envelope

모든 `chrome.runtime` 메시지는 다음 envelope를 사용한다. payload schema도 `kind`별 JSON Schema로 검증한다.

```ts
type RuntimeEnvelope<T> = {
  schema_version: 1;
  kind: "START_PREVIEW" | "START_ASK" | "START_ACT" | "SUBMIT_ACTION_VALUE" |
        "CONTENT_SNAPSHOT" | "EXECUTE_ACTION" |
        "VERIFY_RESULT" | "CONFIRM" | "CANCEL" | "PANEL_STATE" | "NATIVE_LLM_REQUEST";
  message_id: string;
  run_id: string;
  tab_id: number;
  frame_id: number;
  document_epoch: string;
  payload: T;
};
```

`DOCUMENT_REGISTER`는 run envelope와 분리된 content-only schema다: `{ schema_version: 1, kind: "DOCUMENT_REGISTER", document_epoch }`. document start의 content script만 epoch를 만들고 이 schema로 등록한다. service worker는 `sender.id`, `sender.tab.id`, `sender.frameId`, `sender.documentId`, `sender.documentLifecycle === "active"`를 Chrome의 권한 근거로 사용해 `(tab, frame, documentId) → epoch`를 저장한다. content payload가 tab/frame/document/lifecycle을 주장하면 unknown key로 거부한다. worker 재시작 뒤에는 content script가 같은 epoch를 현재 active `sender.documentId`에서 다시 등록해야 하고, competing old/prerender/frozen document 또는 늦게 온 epoch를 생성·대체·채택하지 않는다.

service worker는 `sender.id === chrome.runtime.id`, sender tab/frame, 등록된 document와 run의 tab/frame/epoch가 모두 맞을 때만 수락한다. `START_*`, `SUBMIT_ACTION_VALUE`, `CONFIRM`, `CANCEL`은 Side Panel sender만, `CONTENT_*`, `VERIFY_*`는 해당 content frame만, `EXECUTE_ACTION`과 `NATIVE_LLM_REQUEST`는 service worker 내부 coordinator/adapter만 생성할 수 있다. `SUBMIT_ACTION_VALUE`는 run이 `AWAITING_VALUE`일 때만 수락한다. `postMessage`, external message, event detail은 어떤 경우에도 이 envelope로 승격하지 않는다.

### 3.6 오류와 사용자 표시

내부 exception message를 UI, audit, LLM에 보내지 않는다. 아래 code만 계약으로 사용한다.

| code | 사용자 문구 | retry 규칙 |
|---|---|---|
| `INVALID_ARGUMENT` | 작업 요청 형식이 올바르지 않습니다. | 새 요청만 가능 |
| `POLICY_DENIED` | 회사 정책상 이 작업을 할 수 없습니다. | 새 요청만 가능 |
| `ORIGIN_NOT_ALLOWED` | 이 사이트에서는 사용할 수 없습니다. | navigation 뒤 새 요청 |
| `PROFILE_UNAVAILABLE` | 이 페이지의 업무 프로필을 확인할 수 없습니다. | 새 요청만 가능 |
| `UNKNOWN_PROFILE` | 등록된 업무 프로필이 없어 읽기 전용으로만 사용할 수 있습니다. | Ask basic-read-only만 가능 |
| `TARGET_STALE` | 페이지가 변경되어 대상을 다시 확인해야 합니다. | 새 Ask 후 가능 |
| `TARGET_NOT_ACTIONABLE` | 현재 대상에 작업을 수행할 수 없습니다. | 사용자 수정 후 새 요청 |
| `VALUE_BINDING_INVALID` | 입력값이 만료되었거나 현재 작업과 일치하지 않습니다. | 새 Act부터 |
| `CONFIRMATION_INVALID` | 확인이 만료되었거나 변경 내용이 달라졌습니다. | 새 Act부터 |
| `AI_HUB_NOT_CONFIGURED` | AI Hub 연결이 아직 구성되지 않았습니다. | 운영 구성 후 새 요청 |
| `TRANSPORT_FAILED` | AI Hub 연결에 실패했습니다. | 사용자의 명시적 새 요청만 |
| `PAYLOAD_LIMIT_EXCEEDED` | 페이지 정보가 허용 범위를 초과했습니다. | 페이지 범위 변경 후 새 요청 |
| `STORAGE_BOUNDARY_UNAVAILABLE` | 브라우저 저장소 보안 경계를 설정할 수 없습니다. | Chrome/정책 복구 후 새 요청 |
| `INTERNAL_FAILURE` | 작업을 안전하게 완료할 수 없습니다. | 새 요청만 |

R2가 action 뒤 결과를 확정할 수 없으면 UI outcome은 `UNKNOWN`이고 error code가 있더라도 재시도 button을 렌더링하지 않는다.

## 4. 결정적 알고리즘

### 4.1 Run coordinator

각 tab에는 한 active run만 허용한다. 새 start 요청은 기존 run이 `READING`, `PROPOSING` 또는 `AWAITING_VALUE`이면 retained value reference와 slot을 지우고 먼저 `CANCELLED`로 종료한 뒤 시작한다. `PREFLIGHT` 이후에는 기존 run을 취소한 결과가 확정되기 전 새 run을 시작하지 않는다.

service worker bootstrap은 runtime listener가 run을 처리하기 전에 managed/local/session storage access level을 모두 `TRUSTED_CONTEXTS`로 설정하고 세 Promise의 성공을 기다린다. 어느 호출이든 실패하면 document registration, preview, Ask/Act와 audit write를 받지 않고 `STORAGE_BOUNDARY_UNAVAILABLE`로 fail closed 한다.

```text
start(mode, userRequest)
  validate panel sender, exact page_read origin, policy bundle, registered content epoch
  adopt registered authoritative (tab, frame, sender.documentId, document_epoch); create opaque tab_context; persist only redacted summary
  request content snapshot
  validate snapshot size/schema/epoch; resolve and verify profile
  make model_ref mapping; call Host only for Ask interpretation or action proposal
  validate every model result against tool schema; reject verifier/expected fields; never execute model text
  if Ask: render read-only response; terminal COMPLETED
  if Act: resolve exactly one ModelActionProposal target
    if value tool: target preflight; create one bound slot; transition AWAITING_VALUE
    otherwise: derive verifier from signed profile + pre-state + tool rule; build one ActionIntent and continue through preflight

submitActionValue(payload)
  require Side Panel sender and AWAITING_VALUE
  validate slot/run/tab/frame/epoch/profile/tool/ref/kind/TTL and raw value constraints
  compute value digest; derive verifier from signed profile + fresh pre-state + tool rule; build ValueBinding and one ActionIntent
  process intent through preflight; keep raw value only in pending slot memory

preflight(intent)
  validate run/tab/frame/epoch/profile/ref/argument schema
  for value tool require matching unconsumed slot and fresh target preflight
  require signed effect/risk/verifier declaration; compute risk from effect and policy
  reject local-ui-only claim if autosave/server effect is possible; reject server-side without authoritative predicate
  reject R3; deny Ask mutation; reserve digest once
  request content target preflight
  if decision ALLOW: executeOnce(intent)
  if REQUIRE_CONFIRMATION: issue confirmation then await
  otherwise: terminal FAILED(POLICY_DENIED)

confirm(token)
  validate local token, expiry, session binding, tab_context/epoch/digest/profile
  call Host VERIFY_CONFIRMATION and require atomic CONSUMED
  atomically consume local token before sending EXECUTE_ACTION
  executeOnce(intent)

executeOnce(intent)
  if value tool: atomically consume matching slot and construct one-time value_delivery
  transition EXECUTING; send only one EXECUTE_ACTION
  if value tool: content recomputes binding digest and rejects duplicate slot before DOM mutation
  accept one matching VERIFY_RESULT
  map verified -> VERIFIED; predicate false -> FAILED; lost evidence -> UNKNOWN
  clear value slot/value references, confirmation, native port; write allowlisted audit; terminal
```

S1의 `START_PREVIEW`는 snapshot을 Side Panel에만 렌더링하며 profile resolver, Host, LLM egress를 호출하지 않는다. `START_ASK`/`START_ACT`는 S5의 verified Profile과 S4 Host가 모두 준비되기 전 `PROFILE_UNAVAILABLE`로 끝낸다. `terminal`은 idempotent다. 같은 run의 늦은 message는 audit에 raw payload를 남기지 않고 메모리에서 무시한다. terminal transition은 `COMPLETED`, `FAILED`, `UNKNOWN`, `CANCELLED` 중 하나로 한 번만 된다.

### 4.2 ref registry와 stale 판정

content script는 매 document start마다 random `document_epoch`를 한 번 만들고 `DOCUMENT_REGISTER`로 service worker에 등록한 뒤, `WeakMap<Element, RefRecord>`를 가진다. worker restart에는 현재 epoch를 다시 등록할 수 있으나 새 epoch를 만들지 않는다. 새 element에는 `crypto.getRandomValues` 기반 `ref_id`를 부여한다. ref record에는 role/name fingerprint와 creation epoch만 둔다.

다음 중 하나면 ref를 stale로 판정한다: document epoch 불일치, element가 `isConnected=false`, frame 불일치, element role 변경, redacted name fingerprint 변경, MutationObserver가 target 또는 ancestor의 relevant attribute/child list 변경을 관찰. stale ref는 다시 resolve하지 않고 `TARGET_STALE`을 반환한다. CSS selector로 재탐색하지 않는다.

### 4.3 Mutation primitive executor

아래 표는 DOM primitive를 정의할 뿐 위험 pipeline을 고정하지 않는다. 각 primitive는 signed Profile의 effect declaration에 따라 R1 또는 R2로 들어간다. executor는 service worker가 만든 `VerifierPredicate`만 받고 모델 proposal에서 성공 조건을 읽지 않는다.

| tool | preflight | 실행 | local verifier 및 추가 요구 |
|---|---|---|---|
| `set_text_by_ref` | `input`/`textarea`, visible, enabled, sensitive 아님, one-time `text` delivery binding 일치 | delivery의 value로 native setter + `input`, `change` event | same element의 value가 delivery와 정확히 같은지 content 내부 확인; R2이면 authoritative 업무 전이 추가 필수 |
| `select_option_by_ref` | `select` 또는 approved combobox, one-time `option` delivery binding과 option name 단일 일치 | delivery와 일치하는 option 선택 + `input`, `change` | selected option state 확인; R2이면 authoritative 업무 전이 추가 필수 |
| `set_checked_by_ref` | checkbox/radio, target group/profile rule 유효 | desired value와 다를 때만 click | pre-state와 다른 `checked` 전이 확인; R2이면 authoritative 업무 전이 추가 필수 |
| `click_by_ref` | capability가 허용한 role, visible/enabled, trusted input 불필요 | `HTMLElement.click()` 한 번 | Profile-derived state/navigation/business transition |
| `press_key_by_ref` | capability가 허용한 key와 focus target, trusted input 불필요 | 허용 key의 `keydown`/`keyup` 한 번 | Profile-derived state/navigation/business transition |

`set_text_by_ref`와 `select_option_by_ref`는 3.3의 `AWAITING_VALUE → SUBMIT_ACTION_VALUE → EXECUTE_ACTION` 경로만 사용한다. raw value를 `START_ACT`, 모델 proposal, `ActionIntent.argument`, confirmation, audit 또는 Host request로 복사하는 대체 경로는 없다. 이 전달·consume·retained-reference 검증을 구현할 수 없으면 두 tool을 registry에 추가하지 않는다.

### 4.4 R2 confirmation 및 verifier pipeline

R2는 4.3의 모든 mutation primitive에 적용할 수 있다. profile이 `effect: server-side`, `risk_floor: R2`, closed verifier declaration을 모두 제공하지 않으면 preflight에서 `TARGET_NOT_ACTIONABLE`다. click/key에는 추가로 `programmatic_activation` capability가 필요하다. capability는 tool별 허용 role, `press_key_by_ref`의 허용 key, `requires_trusted_input` target class를 명시하며 기본값은 deny다. confirmation 화면은 tool, redacted target name, profile display name, risk reason만 표시한다.

`click_by_ref`는 capability가 허용한 role에서만 `HTMLElement.click()`을 사용하고 pointer coordinate, synthetic mouse sequence, form submit 직접 호출을 사용하지 않는다. `press_key_by_ref`는 capability가 허용한 `Enter`, `Space`, `Escape`에 한해 focused target이 preflight ref와 같은지 확인한 뒤 `keydown`/`keyup` synthetic DOM event만 dispatch한다. 어느 경로도 trusted input을 만들지 않는다. Profile이 trusted input을 요구한다고 선언했거나 fixture/운영 검증에서 `isTrusted` 거부 target으로 분류한 경우 실행하지 않고 `TARGET_NOT_ACTIONABLE`로 끝낸다. action 뒤 3초 안에 Profile-derived predicate의 pre-state→post-state 전이를 증명해야 한다. navigation은 exact approved origin/path template과 required post-state를 모두 만족해야 하며 자체로는 성공 증거가 아니다. observer/Business MCP evidence가 끊기거나 timeout이면 `UNKNOWN`이다.

### 4.5 Policy decision table

아래 순서대로 첫 번째 일치 조건을 적용한다. 순서를 바꾸면 안 된다.

| 순서 | 조건 | decision / reason |
|---:|---|---|
| 1 | schema, sender, tab/frame/epoch, run 상태 불일치 | `DENY / INVALID_ARGUMENT` |
| 2 | page read origin 또는 required egress origin 불허 | `DENY / ORIGIN_NOT_ALLOWED` |
| 3 | Ask mode의 mutation | `DENY / POLICY_DENIED` |
| 4 | profile transport/서명·만료·fingerprint 불일치 | `DENY / PROFILE_UNAVAILABLE` |
| 5 | signed `UNKNOWN_PROFILE`의 Act 또는 Business MCP tool | `DENY / UNKNOWN_PROFILE` |
| 6 | signed `UNKNOWN_PROFILE`의 Ask basic-read-only | 다음 조건으로 진행 |
| 7 | target sensitive, stale, invisible, disabled, occluded | `DENY / TARGET_NOT_ACTIONABLE` 또는 `TARGET_STALE` |
| 8 | value tool의 slot 누락·kind/binding/TTL mismatch·이미 consume됨 | `DENY / VALUE_BINDING_INVALID` |
| 9 | mutation effect/risk/verifier 선언 누락, 모델 제공 verifier field, 이미 참인 predicate, server-side effect의 authoritative predicate 없음 | `DENY / TARGET_NOT_ACTIONABLE` 또는 `INVALID_ARGUMENT` |
| 10 | risk R3 또는 allowlist 밖 tool/key/option | `DENY / POLICY_DENIED` |
| 11 | duplicate digest가 예약됨 | `DENY / POLICY_DENIED` |
| 12 | R2이며 valid Host session binding 없음 | `DENY / CONFIRMATION_INVALID` |
| 13 | R2 | `REQUIRE_CONFIRMATION` |
| 14 | R0/R1의 모든 verifier 선언 유효 | `ALLOW` |

## 5. LLM과 Native Host의 최소 계약

LLM은 자연어 답변 또는 schema-valid tool proposal만 반환할 수 있다. service worker가 LLM에게 보낼 tool list는 현재 mode, exact origin, verified profile, risk policy를 모두 통과한 목록이다. prompt에서 “policy를 무시하라”는 page text/model output은 단순 텍스트로 취급한다.

### 5.1 extension → Host request

```json
{
  "schema_version": 1,
  "request_id": "uuid",
  "kind": "ASK_INTERPRETATION|ACTION_PROPOSAL|BIND_SESSION|ISSUE_CONFIRMATION|VERIFY_CONFIRMATION|PROFILE_REPLAY_CAS",
  "deployment_id": "opaque-configured-id",
  "run_id": "uuid",
  "allowed_tools": ["read_page_summary"],
  "snapshot": { "document_epoch": "opaque", "frame_id": 0, "nodes": [] },
  "cancel_after_ms": 30000
}
```

모델 요청의 `snapshot`은 `model_ref`만 포함한 `ModelSemanticSnapshot`이다. Host request에는 `tab_id`, `ref_id`, ref/model-ref mapping, URL path/query, raw typed value, profile secret, extension user preference를 넣지 않는다. Host response에는 identity/assertion/header/prompt/raw upstream error가 없어야 한다. response는 `request_id`, `kind`, `result` 또는 위 3.5의 `error_code`만 가진다.

R2 request/response schema는 다음처럼 고정한다. 모든 opaque ID는 crypto-random이며 unknown key, 누락/초과 field, 만료된 timestamp를 거부한다.

```ts
type BindSessionRequest = {
  kind: "BIND_SESSION"; extension_instance_id: string; run_id: string;
  tab_context: string; document_epoch: string; expires_at: string;
};
type BindSessionResult = {
  session_binding_id: string; binding_nonce: string; expires_at: string;
};
type IssueConfirmationRequest = {
  kind: "ISSUE_CONFIRMATION"; extension_instance_id: string; run_id: string;
  session_binding_id: string; binding_nonce: string; tab_context: string;
  document_epoch: string; intent_digest: string;
};
type IssueConfirmationResult = {
  confirmation_id: string; confirmation_nonce: string; expires_at: string;
};
type VerifyConfirmationRequest = {
  kind: "VERIFY_CONFIRMATION"; extension_instance_id: string; run_id: string;
  session_binding_id: string; binding_nonce: string; confirmation_id: string;
  confirmation_nonce: string; tab_context: string; document_epoch: string;
  intent_digest: string;
};
type VerifyConfirmationResult = { status: "CONSUMED" };
```

service worker는 authoritative document registration을 채택할 때만 `tab_context`를 만들고 local `(tab_id, frame_id, sender.documentId, document_epoch)` binding을 유지한다. `BIND_SESSION` → `ISSUE_CONFIRMATION` → 사용자 승인 → `VERIFY_CONFIRMATION`의 순서를 바꾸지 않는다. Host는 each step에서 current Windows session, extension instance, expiry 및 이전 binding fields를 재확인하고 마지막 response를 atomic one-time consume한다. `PROFILE_REPLAY_CAS`는 verified `profile_jws`와 claimed `(deployment_id, profile_id, profile_version, signed_definition_digest)`만 받고 `ADVANCED`, `IDEMPOTENT_ACCEPTED` 또는 `PROFILE_UNAVAILABLE`만 반환한다. extension과 Host는 13의 JWS-signed 안정 Profile 정의 projection에서 digest를 독립 계산하고 Host는 JWS/claim/digest mismatch를 거부한다. Host key는 `(deployment_id, profile_id)`이고 같은 version은 definition digest가 같을 때만 수락한다. high-water value를 읽거나 reset하는 schema는 없다.

### 5.2 Native Messaging implementation rules

- 확장은 `connectNative()`만 사용하고 Host는 port EOF까지 `stdin`의 4-byte little-endian size + UTF-8 JSON frame을 반복해서 읽는다. frame은 512 KiB를 넘을 수 없고 truncated·invalid JSON·duplicate request ID면 port를 닫고 모든 pending state를 폐기한다.
- `stdout`에는 성공/오류 Native Messaging frame만 기록한다. console logger를 stdout provider에 등록하지 않는다.
- 모든 request/response/stream chunk/`CANCEL_REQUEST`는 `request_id`로 correlate한다. 최대 동시 요청 수를 4로 제한하고 unknown/already-terminal cancellation은 idempotent no-op으로 답한다. port disconnect·Host crash에는 stream, confirmation, MCP request와 nonce를 폐기하며 `sendNativeMessage()`를 혼용하지 않는다.
- executable 시작 시 allowed extension origin, deployment config, pipe ACL, static header allowlist가 모두 검증되지 않으면 request를 받지 않고 `AI_HUB_NOT_CONFIGURED`만 반환한다.
- bridge pipe request는 request ID, body SHA-256, issued-at, nonce, sender signature를 포함한다. 수신자는 60초 nonce cache에서 중복을 거부하고, 60초보다 오래된 issued-at도 거부한다.
- Host는 arbitrary URL, command, header map, model name을 extension request에서 받지 않는다. 이 값은 administrator ACL 구성에서만 읽는다.

## 6. Sprint별 작업 카드

저가형 AI에는 한 번에 **하나의 카드만** 전달한다. 카드 완료 뒤 diff와 테스트 결과를 사람이 또는 상위 agent가 확인한 후 다음 카드를 준다. “S<N> 전체를 구현”처럼 넓은 지시는 금지한다.

### S0 카드

| ID | 만들 파일 | 완료 조건 |
|---|---|---|
| S0-1 | root config, `extension/manifest.json`, empty entry points | `pnpm typecheck`, `pnpm build` 성공; manifest는 no broad permission |
| S0-2 | `scripts/*.ps1` | non-zero propagation, dedicated Chrome profile, production registry 미접근 unit test |
| S0-3 | test configs, one fixture page, one Playwright smoke | Side Panel/service worker/content registration 확인 |
| S0-4 | schema validation utility + import boundary lint | invalid unknown key와 forbidden import가 실패 |

S0 target scripts는 다음 이름으로 고정한다. root `package.json`은 최소 `typecheck`, `lint`, `test:unit`, `test:fixture`, `test:e2e`, `build`, `test`를 노출하고 `test`는 앞 다섯 검사를 실패 즉시 종료한다.

### S1 카드

| ID | 만들 파일/책임 | 필수 negative test |
|---|---|---|
| S1-1 | `contracts/runtime-message`, minimal document-registration schema, authoritative sender validator | unknown kind, forged tab/frame/document metadata, old/prerender/frozen lifecycle, page postMessage, registration 전 run 거부 |
| S1-2 | `content/semantic-collector`, `ref-registry`, sender.documentId-bound epoch re-registration, redactor | competing/late epoch, worker restart, input value/password/closed shadow/cross-origin frame 미포함 |
| S1-3 | `security/origin-matcher`, policy bundle validator | `file:`, IP literal, localhost, permission 밖 preview read 거부 |
| S1-4 | storage access bootstrap + panel preview → coordinator → projection render | content storage read와 잠금 전 run, Host/resolver/LLM call 및 어떤 mutation message도 dispatch하지 않음 |

S1 fixture는 최소 button, checkbox, labelled textbox, selected option, navigation link, password field, dynamically replaced button을 제공한다. E2E는 실제 Chrome에서 projection field와 stale ref를 assert한다.

### S2 카드

| ID | 만들 파일/책임 | 필수 negative test |
|---|---|---|
| S2-1 | `policy/decision`, tool registry, model proposal/intent/value-slot JSON schemas | Ask mutation, raw value model argument, unknown profile, R3 deny |
| S2-2 | `content/preflight`, mutation primitive executor, Profile-derived verifier builder | model verifier field, no-op, occluded/disabled/stale/sensitive target deny |
| S2-3 | 3.3의 Side Panel value slot, digest/binding store, one-time content delivery와 retained-reference disposal hook | proposal 전/wrong-context/duplicate/expired submit, terminal/cancel/navigation/5분 후 slot 사용, raw value leak·send-failure 재전송 거부 |
| S2-4 | audit allowlist serializer | raw value/digest/path/name/ref가 output에 없음 |

S2에서 `click_by_ref`, `press_key_by_ref`, session binding, real Host network는 추가하지 않는다.

### S3 카드

| ID | 만들 파일/책임 | 필수 negative test |
|---|---|---|
| S3-1 | canonical digest, opaque tab context, confirmation store/state machine | duplicate/expired/cross-tab/cross-epoch token 거부 |
| S3-2 | three-step session-binding verifier interface + local fake | nonce/session/digest mismatch, fake production enable 거부 |
| S3-3 | all-primitive R2 confirmation/verifier pipeline + Stop/navigation cancellation | autosave without declaration, no confirmation, trusted-input target, R3, timeout UNKNOWN, retry 거부 |
| S3-4 | Side Panel confirmation/terminal renderer | raw value/digest가 화면에 없음 |

### S4 카드

| ID | 만들 파일/책임 | 필수 negative test |
|---|---|---|
| S4-1 | persistent Native framed loop/correlation/cancellation, allowed-origin/model-ref/R2 binding schema/domain error mapper | malformed/oversize/duplicate ID/raw-ref or mapping/foreign origin/cross-context confirmation/disconnect state/stdout log leak 거부 |
| S4-2 | administrator config reader + no-config adapter | missing input에서 `AI_HUB_NOT_CONFIGURED`, network 없음 |
| S4-3 | named-pipe mutual-auth adapter, nonce cache | direct TCP, bad ACL/signature/nonce replay 거부 |
| S4-4 | SSO broker/profile-replay durable-store interface + mock contract test | assertion identity와 high-water value가 extension response에 없음 |

실제 IWA/AI Hub endpoint는 07의 운영 입력이 제공된 별도 integration environment에서만 활성화한다.

### S5 카드

| ID | 만들 파일/책임 | 필수 negative test |
|---|---|---|
| S5-1 | exact-page-bound JWS verifier, [14](14-semantic-projection-fingerprint.md)의 fp-v1 canonicalizer/visibility golden pairs, idempotent durable replay CAS, cache atomic swap | canonical drift, current-state hash 유입, cross-record binding, unsigned/expired/future/oversize/same-version-different-body/lower-version/tie/fingerprint mismatch/store corruption 거부 |
| S5-2 | [13의 resolver/profile/두 call-kind wire schema](13-page-profile-and-business-mcp-contract.md), Context Router, Host-owned MCP Registry/page profile extension adapter | cross-record JWS/subject/cache, SPA profile re-resolution/tool revocation, MCP failure 또는 다른 server/tool DOM/LLM fallback, profile 밖 field/server/tool, arbitrary route/header, call-kind/argument/result 혼합, visibility/audit leak, late response 거부 |
| S5-3 | package/policy/host compatibility validators | hash/version/header key mismatch deployment 차단 |
| S5-4 | installer/health/rollback + VM checklist | rollback 후 tool/host disabled 확인 |

## 7. 테스트 파일과 증적 규칙

각 production 파일에는 최소 하나의 가까운 unit test가 있어야 한다. 아래처럼 기능 이름으로 test를 배치한다. 테스트는 시간·randomness·Chrome에 직접 의존하지 않는 pure test와 fixture/E2E를 섞지 않는다.

| 대상 | unit test | fixture/E2E |
|---|---|---|
| origin/policy/digest | `extension/tests/unit/policy/*.test.ts` | 없음 |
| redaction/ref registry | `extension/tests/unit/content/*.test.ts` | `extension/tests/e2e/semantic-projection.spec.ts` |
| R1/R2 executor | `extension/tests/unit/actions/*.test.ts` | `extension/tests/e2e/actions.spec.ts` |
| message/coordinator | `extension/tests/unit/service-worker/*.test.ts` | `extension/tests/e2e/panel-flow.spec.ts` |
| audit | `extension/tests/unit/audit/*.test.ts` | golden allowlist JSON only |
| profile | `extension/tests/unit/profile/*.test.ts` | resolver mock contract |
| Host | `native-host/tests/.../*.cs` | named-pipe mock integration |

test 이름은 `given_<precondition>_when_<event>_then_<outcome>` 형식으로 쓴다. 보안 회귀는 success test만으로 대체하지 않는다. 예: R2 success test가 있어도 `given_expired_confirmation_when_confirm_then_denied`가 반드시 필요하다.

각 Sprint 종료 증적에는 다음을 남긴다.

```text
date / branch / commit candidate
changed card IDs
commands and exit codes
unit, fixture, E2E test counts
manual Chrome or VM result (if required)
known limitation and exact blocking owner
```

실행하지 않은 command, 추정 test count, “아마 동작함”은 증적이 아니다. 현재 프로젝트는 설계 단계이므로 이 문서 작성만으로 S0의 `Completed` 상태를 기록하지 않는다.

## 8. 저가형 AI 작업 지시 템플릿

상위 agent 또는 사람은 아래 template을 복사해 카드 하나를 전달한다. 대괄호 안만 채운다. 이 형식 밖의 장황한 구현 지시는 전달하지 않는다.

```text
Repository: [absolute repository path]
Current sprint/card: [for example S1-2]
Allowed files: [explicit paths]
Read first: docs/12-low-cost-agent-implementation-spec.md sections [x, y], docs/[other file]
Goal: [one observable behavior]
Do not: add dependency/permission/message/tool/network call; edit files outside Allowed files.
Implement exactly: [named type/function/schema and behavior]
Tests required: [exact test names and cases]
Commands: [exact commands]
Completion response: changed files, test commands with result, remaining uncertainty only.
Stop condition: if an undocumented decision or operating value is needed, do not guess; report it.
```

검토자는 다음 순서로만 merge/다음 카드를 허용한다: `git diff --check` → allowed file 확인 → required test 확인 → forbidden pattern search → Sprint 검증 명령 → 11의 증적 기록 → 단일 Sprint commit. 이 순서는 저가형 AI가 큰 diff를 만들거나 설계 범위를 넓히는 위험을 줄이는 통제다.

## 9. 구현 착수 전 확인 목록

- [ ] Node, pnpm, .NET, Chrome의 정확한 지원 버전을 S0 lockfile/CI에 고정했다.
- [ ] production extension ID, allowlisted origin, profile trust key, deployment ID는 운영 입력으로 분리했고 repository example에 실제 값을 넣지 않았다.
- [ ] manifest permission snapshot과 managed-policy schema validation test를 만들었다.
- [ ] 3.5의 모든 error code가 Side Panel mapping과 audit allowlist에 존재한다.
- [ ] 이 문서의 S0 카드만 완료될 때까지 S1~S5 source file를 만들지 않는다.
- [ ] 운영 입력이 없는 S4/S5 기능은 mock success 대신 fail-closed error를 반환한다.
