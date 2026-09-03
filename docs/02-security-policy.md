# 02. 보안 및 행동 정책

## Enterprise Web AI Platform 정렬 (2026-08-31)

보안 판단은 다음 계층을 순서대로 적용한다.

`Chrome permission → Local capability×host → Signed Page Profile → Enterprise PDP/RBAC → User/Device authorization → Risk/Approval → Runtime hard guard → Executor/Verifier`

-   기존 R0\~R3는 Browser Runtime의 local risk 분류로 유지한다.
    Enterprise Profile/Policy의 READ/WRITE/PRIVILEGED/CRITICAL과
    매핑한다.
-   제품 사용자는 로컬 Chrome profile 소유자로 한정하지 않는다.
    Enterprise 모드에서는 검증된 enterprise identity, organization,
    role/device context가 추가된다.
-   Page/DOM/AX/Vision/Tab/MCP result/LLM tool call은 모두 untrusted
    data다. 관리형 MCP endpoint의 신뢰와 MCP가 반환한 content의
    instruction authority는 구분한다.
-   `skip_all_permission_checks`는 Community 호환 명칭이다. Enterprise
    UI에서는 `managed-auto`로 정규화할 수 있으며 중앙 정책이 비활성화할
    수 있다. 어떤 경우에도 local hard guard는 유지한다.
-   WRITE/PRIVILEGED/CRITICAL에서 정책 서비스가 필요한데 사용할 수
    없으면 fail-closed한다.

## 1. 신뢰 경계

  -----------------------------------------------------------------------------
  입력                     처리
  ------------------------ ----------------------------------------------------
  웹 페이지와              visible/hidden 모두 비신뢰 데이터로
  content-script 결과      schema·길이·형식을 검증하고 모델에 명시적으로 표시

  LLM 텍스트와 tool call   비신뢰 제안으로 schema, 현재 run, capability gate를
                           다시 검증

  사용자 Settings          사용자가 소유하는 provider·header·권한 설정

  `chrome.storage.local`   사용자 기기 저장소. provider key와 header는
                           암호화되지 않았다고 가정

  현재 Chrome 로그인 세션  웹사이트가 직접 인증한 사용자 세션. 확장은
                           password·OTP를 읽거나 대신 입력하지 않음

  provider plugin manifest 비신뢰 설치 입력. closed schema, 크기, ID, version과
                           capability를 검증

  CDP target과 event       현재 action에 결속되지 않은 target, node, 좌표와
                           event는 거부
  -----------------------------------------------------------------------------

Community 모드는 로컬 Chrome profile 소유자를 승인 주체로 사용할 수
있다. Enterprise 모드는 검증된 SSO/user/organization/RBAC/device
context와 중앙 PDP를 추가 권한 근거로 사용한다. 웹사이트 세션 권한,
enterprise identity, provider credential, Browser Runtime 행동 승인은
서로 다른 경계다.

## 2. 브라우저 권한과 사용자 승인

확장 manifest는 페이지 읽기와 automation에 필요한 browser permission을
선언한다. 런타임 행동은 manifest 권한만으로 실행하지 않고 capability ×
host gate를 통과한다.

`debugger`는 bounded CDP adapter를 위해 선언하지만 일반 browser 권한으로
취급하지 않는다. Chrome의 `debugger` 권한은 host permission만으로
command surface가 충분히 제한되지 않으므로 service worker가 attach 전에
sender에서 확정한 exact origin을 `permission_origins`와 capability ×
host grant에 대조한다. `chrome:`, `chrome-extension:`, `file:`,
data/blob URL, loopback/IP와 미승인 origin은 attach 전에 거부한다. risk
확인, current-run target binding과 preflight가 모두 끝난 action만
attach할 수 있다. `debugger` 권한은 새로운 tool, host, R 등급 또는
confirmation 우회를 만들지 않는다.

  capability                         예
  ---------------------------------- ----------------------
  `navigate`                         이동, 새 탭
  `click`                            click, submit, Enter
  `type`                             일반 텍스트 입력
  `network_write`                    fetch/research 요청
  `download`, `upload`, `schedule`   파일·예약 작업

사용자는 각 `(capability, host)`에 대해 이번 작업 또는 항상 허용을
선택한다. 항상 허용은 `contextpilot_permissions`에 저장하며 Settings에서
개별 또는 전체 철회할 수 있다. 사용자는 필요하면 결과적 행동 질문을 끌
수 있으나, 제출·결제·삭제·외부 공개와 API write는 항상 개별 확인을
요구한다.

permission mode는 다음과 같다.

  -----------------------------------------------------------------------------------------
  mode                           capability/host     유지되는 hard policy
                                 처리                
  ------------------------------ ------------------- --------------------------------------
  `standard`                     once/always/deny    전체
                                 prompt              

  `follow_a_plan`                승인한 exact domain 전체 + plan scope
                                 plan으로 대체       

  `skip_all_permission_checks`   capability와        restricted/category/denylist,
                                 domain-transition   credential, R2/R3, binding, CDP
                                 prompt 생략         allowlist, verifier
  -----------------------------------------------------------------------------------------

`skip_all_permission_checks`는 Settings danger flow에서만 활성화하며
model/page/runtime message로 변경하지 못한다. 진행 중 run의 mode는
불변이고 설정 변경은 해당 run을 취소한다.

`execute_js`는 현재 제품 capability와 tool registry에 존재하지 않는다.
bounded CDP adapter도 JavaScript 실행 capability를 암묵적으로 만들지
않는다.

## 3. 행동 등급

  ---------------------------------------------------------------------------
  등급   예                         처리
  ------ -------------------------- -----------------------------------------
  R0     visible/hidden 읽기, 요약, permission mode에 따른 read/vision gate,
         요소 찾기, screenshot      mutation authority 없음

  R1     입력, 선택, 일반 click     capability × host 허용과 preflight

  R2     제출, 생성, 전송, 외부     R1 + 현재 intent의 명시 확인 + 결과 확인
         상태 변경                  

  R3     결제, 계약 확정, 계정/보안 기본 거부. 사용자의 명시 작업과 전용 확인
         설정, 삭제                 UI가 있을 때만 제한된 도구로 실행
  ---------------------------------------------------------------------------

## 4. 실행 규칙

1.  모델은 raw selector, arbitrary script, password, OTP, API key를
    받거나 만들지 않는다.
2.  `ref_id`와 `model_ref`는 현재 document/run에서만 유효하다.
3.  password, passcode, token, secret, recovery code, MFA/OTP로 판정된
    필드는 읽기·기록·자동 입력을 거부한다.
4.  같은 submit action의 반복 실행은 화면 상태를 다시 읽고 사용자가
    재시도를 확인할 때만 허용한다.
5.  페이지가 제공한 WebMCP `readOnly` 표시는 권한 근거가 아니다.
    호출마다 capability gate와 명시 확인을 적용한다.
6.  임의 host로의 fetch, explicit URL PDF 읽기, 다운로드는 목적 host에
    대한 별도 권한을 요구한다.
7.  모델, provider, plugin, 페이지와 site adapter는 CDP method,
    selector, node ID, 좌표, session ID와 execution path를 지정하지
    못한다.
8.  CDP adapter는 `docs/15-bounded-cdp-adapter.md`의 closed command
    allowlist와 parameter builder만 사용한다. unknown
    method/domain/parameter는 dispatch 전에 거부한다.
9.  content script target binding과 CDP hit test가 일치하지 않거나
    target이 stale, sensitive, hidden, disabled, occluded 또는 중복
    marker이면 `TARGET_NOT_ACTIONABLE`로 실패한다.
10. DOM 또는 CDP에서 상태 변경 dispatch가 시작된 뒤에는 다른 실행 경로로
    fallback하거나 자동 재시도하지 않는다.
11. CDP attach는 action-scoped다. terminal transition, navigation, Stop,
    tab close와 service-worker recovery에서 detach를 확인하며 실패한
    tab은 `CDP_CLEANUP_FAILED` 상태로 격리한다.
12. product mutation CDP에는 `Runtime.evaluate`, `Network.*`,
    `Target.*`, screenshot, file input과 임의 page script 실행을
    허용하지 않는다. 외부 Chrome E2E harness의 CDP 권한과 제품 runtime
    권한은 별도 경계다.
13. hidden DOM은 기본 `all_dom` read에 포함하지만
    `visibility=hidden`으로 표시하며 mutation resolver, DOM executor와
    bounded CDP target이 될 수 없다.
14. screenshot은 mutation CDP가 아니라 `Page.captureScreenshot`만 허용한
    별도 Vision adapter에서 수행한다. screenshot은 current run 밖에
    저장하거나 audit/diagnostics/export에 포함하지 않는다.
15. permission-less mode에서도 1\~14의 hard policy 검사 순서와 결과를
    생략하지 않는다.

## 5. 모델 및 provider 보안

-   `base_url`은 사용자가 Settings에서 직접 설정한다. local LLM은
    `http://localhost`, loopback 또는 사용자가 허용한 사설망 endpoint를
    사용할 수 있다.
-   API key와 정적 header는 모델 prompt, tool schema, audit, 오류 UI에
    넣지 않는다.
-   요청 header는 API key header와 Settings header 목록으로만 만들며
    모델과 웹 페이지가 header·endpoint·model을 변경할 수 없다.
-   API key와 provider header를 export·sync·telemetry·page script에
    전달하지 않는다.
-   runtime 설치 plugin은 선언형 manifest만 허용한다. remote JavaScript,
    `eval`, data URL module과 plugin 자체 network 요청은 금지한다.
-   plugin은 인증 scheme의 지원 목록만 선언할 수 있고 API key/header
    값은 받지 않는다. 인증 header는 core transport가 plugin request
    plan을 검증한 뒤 마지막 단계에서 추가한다.
-   executable provider adapter는 source tree에 포함되어 extension
    package와 함께 review·build·서명된 경우에만 등록한다.
