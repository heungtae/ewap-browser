# Sprint 진행 상태

## S0~S9 Browser 기반 종료 범위 (2026-09-26)

[Sprint 설계 인덱스](sprint-design.md)의 종료 판정 범위를 따른다. 현재
Linux/Chrome for Testing 환경에서 실행 가능한 Browser 기반 증거로
`Completed`를 판정한다. Windows clean-profile과 별도 release reviewer
승인은 S0~S9 종료 조건에서 제외하며, S9 `Completed`는 Linux 로컬
release candidate만 뜻한다. [31번](31-act-request-execution-current-implementation.md)·
[33번](33-ask-request-execution-current-implementation.md)의 현재 Ask/Act
경로를 판정 대상으로 삼고 [32번](32-ask-act-analysis-data-acquisition-design.md)의
미완료 분석 수집 범위를 S0~S9 완료에 포함하지 않는다.

- **S0: Completed** — 현재 커밋 `d3bcf552`의 clean archive에서 pnpm 9
  offline frozen-lockfile 설치와 Node 22.23.2 기준 build, typecheck,
  lint, package policy,
  269 unit/1 fixture/1 source E2E가 통과했다. Chrome for Testing 147의
  격리된 profile에서 unpacked Service Worker, Side Panel 문서와 Settings
  로드를 확인했다. [S0 증거](evidence/s0-closure-2026-09-24.md).
- **S1: Completed** — 실제 Side Panel과 HTTPS fixture에서 projection,
  Resolver 정상/손상 JWS, Ask, 민감값·credential header 비노출,
  DOM 교체·navigation·worker 재시작을 확인했다.
  [S1 증거](evidence/s1-closure-2026-09-24.md).
- **S2: Completed** — 실제 Side Panel과 HTTPS fixture에서 permission,
  R2 submit 확인, trusted click/key/text, Stop·navigation·tab close·worker
  restart cleanup을 확인했다. adapter/policy negative 단위 검증도 통과했다.
  [S2 증거](evidence/s2-closure-2026-09-25.md).
- **S3: Completed** — 실제 Side Panel의 Ask와 통제 HTTPS Provider fixture에서
  세 API key header, 두 wire API stream, Stop, plugin disable 뒤 전송 0건을
  확인했다. manifest·secret·browser authority 음성 검사도 통과했다.
  [S3 증거](evidence/s3-closure-2026-09-25.md).
- **S4: Completed** — Settings write-only secret, 선언형 plugin 재시작/제거,
  HTTP loopback·사설 IPv4 권한 경계와 Profile-bound MCP 음성 검사를
  확인했다. [S4 증거](evidence/s4-closure-2026-09-25.md).
- **S5: Completed** — 실제 HTTPS Provider의 1,000 delta, worker 재시작,
  실행 중 Panel 닫기·재열기, sequence/Stop/card/scroll 경계를 현재 빌드의
  Chrome에서 확인했다. [S5 증거](evidence/s5-closure-2026-09-25.md).
- **S6: Completed** — 실제 Side Panel/HTTPS Provider에서 snapshot 기반
  read/find/batch, 단일 탭, 선택 권한을 받은 screenshot/zoom과 권한 없는
  capture 거부를 확인했다. [S6 증거](evidence/s6-closure-2026-09-25.md).
- **S7: Completed** — 실제 Side Panel/HTTPS Provider에서 서로 다른 두
  일반 페이지의 서명 R1/R2 Act, Resolver 없는 페이지의 사용자 text 값,
  손상 JWS와 postcondition 없는 클릭 거부를 확인했다. S1/S2/S6 Chrome
  회귀도 통과했다. [S7 증거](evidence/s7-closure-2026-09-26.md).
- **S8: Completed** — 실제 Settings와 Side Panel에서 skip R1/R2,
  standard 권한 질문 복귀, 저장된 deny와 follow-plan의 exact-origin·세션
  종료 경계를 확인했다. [S8 증거](evidence/s8-closure-2026-09-26.md).
- **S9: Completed** — 0.1.86 로컬 ZIP을 재현 가능하게 만들고 Linux
  Chrome for Testing의 동일한 격리 profile에서 0.1.85 → 0.1.86 → 0.1.85
  upgrade/rollback을 확인했다. Settings·Provider·저장된 deny가 유지되고
  복구된 deny가 Act를 차단했다. S1~S8 Chrome 회귀와 324개 테스트가
  통과했다. [S9 증거](evidence/s9-closure-2026-09-26.md).

## Enterprise Web AI Platform 전환 상태 (2026-08-31)

이 문서의 기존 상태는 2026-08-22 ContextPilot 구현 증적으로 보존한다.
Enterprise Web AI Platform 관점에서 S0\~S9는 Browser Runtime
foundation이다. S10·S11·S12·S13·S14는 각각 Browser 로컬 Profile 수락,
Business MCP binding, managed policy fail-closed, Act evidence,
기록 워크플로우 비교 경계만 완료했고, S15 및 Platform 연동은 별도
구현·검증이 필요하다. 기존 Sprint를
Enterprise 기능까지 완료한 것으로 재해석하지 않는다.

-   S10 Browser 로컬 Profile 수락: Completed — 현행 compact JWS의
    path segment·안전한 version 검증과 해시된 replay high-water 저장을
    완료했다. 326개 unit test와 실제 Chrome Side Panel·Worker 재시작
    후 rollback 거부를 확인했다. Workspace `ewap/v1`, Platform
    release·철회, `semanticId` binding은 이 완료 범위에 포함되지
    않는다. [S10 완료 범위](sprints/s10-profile-runtime.md),
    [검증 증거](evidence/s10-progress-2026-09-26.md).
-   S11 Browser 로컬 Business MCP binding: Completed — signed Profile의
    HTTPS endpoint·closed argument를 수락 시 검증하고, 요청 직전
    page scope/digest·Profile 만료를 재확인한다. 응답 본문은 24 KiB로
    제한한다. 333개 unit test와 실제 Chrome Side Panel에서 허용된
    HTTPS Business MCP 호출·모델 catalog 비노출을 확인했다. Platform
    Registry discovery, Gateway, PDP, release/철회는 범위 밖이다.
    [S11 완료 범위](sprints/s11-business-mcp-binding.md),
    [검증 증거](evidence/s11-closure-2026-09-26.md).
-   S12 Browser 로컬 managed policy 경계: Completed — managed 설정이
    없을 때만 Community를 유지하고, 손상된 값·읽기 실패는 차단한다.
    PDP allow/deny/outage와 제한된 응답을 검증하며 자동 권한·미사용
    승인 토큰을 거부한다. PDP allow 뒤에도 Act의 로컬 권한과 hard guard를
    유지한다. 검증 범위와 실행 결과는 [S12 완료 범위](sprints/s12-managed-policy-boundary.md),
    [증거](evidence/s12-closure-2026-09-27.md)를 따른다.
-   S13 Browser 로컬 Act evidence: Completed — policy ALLOW/DENY/장애와
    Act terminal의 closed metadata만 선택적 managed HTTPS sink로 전송한다.
    Profile/workflow ID는 해시로 상관관계를 남기고 raw 값·URL path·
    알 수 없는 code를 제외한다. 전송 실패 상태를 구분하고 재시도나
    행동 재실행을 하지 않는다. 중앙 Audit Service의 인증·receipt·보존은
    범위 밖이다. [완료 범위](sprints/s13-runtime-evidence-browser.md),
    [증거](evidence/s13-closure-2026-09-27.md).
-   S14 Browser 로컬 기록 워크플로우 비교: Completed — complete top-frame
    `all_dom`에서만 기록 fingerprint를 비교한다. 잘림·범위 불일치·형식이
    잘못된 fingerprint는 `incomparable`, 구조 변경은 `stale`로 표시한다.
    정확한 path segment 경계와 선택·시작 재검사를 실제 Chrome Side Panel에서
    확인했다. Studio Capture·L0~L6·Change/Impact는 범위 밖이다.
    [완료 범위](sprints/s14-studio-integration-browser-boundary.md),
    [증거](evidence/s14-closure-2026-09-27.md).
-   S15 Managed Enterprise Release: Planned
-   S6-R Collection Reading: Completed — Ask/Act collection context 재투입과
    Act closed route gate, 복수 source 선택 및 collection 권한 승인 후 같은
    요청 재개를 검증했다. headed Chrome for Testing에서 virtual grid 1,000행의
    EOF/total, 200행 chunk, 위치 복구를 확인했고, 제어 provider fixture에서
    Ask/Act 모두 선택한 source의 collection data만 재투입됨을 확인했다. reviewed
    API fixture는 exact origin/path와 closed schema로 연결했다. 타입, lint/format,
    전체 unit 및 extension build도 통과했다. 외부 live provider 동작은 완료
    범위에 포함하지 않는다. [완료 증거](evidence/s6-r-closure-2026-10-01.md),
    세부 계약과 CR-1~CR-5는 [28번](28-collection-reading-strategy-design.md)을 따른다.
-   Browser Diagnostics ZIP (기존 S12-C1~C6): Completed — 요청별 trace,
    closed page metadata와 truncation 표시를 보완했다. 실제 Chrome Side Panel의
    오류 카드/하단 버튼, 25×6 표, Provider 실패, navigation, Worker 재시작,
    요청 ID 누락과 섹션 실패에서 ZIP 생성·CRC·manifest SHA-256·원문 비노출을
    확인했다. OS 다운로드 경로와 live provider는 완료 범위 밖이다.
    [완료 증거](evidence/diagnostics-zip-closure-2026-10-01.md),
    [완료 카드](sprints/s12-diagnostics-download-bundle.md).
-   S13 Ask/Act Analysis Data (Browser slice): Completed — 2026-10-04.
    S13-C1~C8의 collection/reviewed API 공통 source 선택, 별도 R0 승인 뒤
    같은 요청 재개와 bounded context 재투입을 구현·검증했다. 실제 Chrome
    Side Panel·Worker와 통제 HTTPS Provider에서 API complete/partial/cap/
    invalid/timeout, 분석 후 별도 mutation review, Stop·scope 변경·Worker
    재시작, adapter 검토 카드와 저장소·진단·실제 ZIP 비노출을 확인했다.
    가상 grid 1,000행·EOF·위치 복구와 Stop 회귀도 통과했다. 453개 unit,
    fixture/source E2E, 타입·lint·module boundary·build·package 검사가 통과했다.
    실제 사이트 adapter·외부 live provider·Platform 연동은 별도 범위다.
    [완료 카드](sprints/s13-ask-act-analysis-data-acquisition.md),
    [완료 증거](evidence/s13-analysis-closure-2026-10-04.md).
-   S13-C4/C7 보정: Provider cap에서 partial/CONTEXT_TRUNCATED와 수집 수·
    전달 수를 구분한다. collection/API의 Provider 호출 전후 scope를 확인하고
    stale 데이터·delta·proposal을 차단한다. 정적 검사만 기록했던 이전 경계는
    위 단위·Chrome 증거로 검증했다.
-   Browser S10 Page API·Discovery (기존 S10-C1~C5): Completed — 실제
    Side Panel의 승인·R1 권한·MAIN 호출·독립 UI 검증과 실패/취소/재시작
    경계를 확인했다. Discovery 검토 화면의 redaction·Stop·timeout·닫기·
    탭/페이지 변경 및 저장 비노출을 확인했고, exact scope에 결속된 내부
    `page_api_read` fixture 계약과 별도 R0 권한·closed result·cap·no-retry를
    검증했다. Ask/Act source 선택·재투입은 S13에 남으며 검토자 인증·외부
    작업 항목과 실제 사이트/Platform 연동은 별도다.
    [완료 카드](sprints/s10-page-api-discovery-handoff.md),
    [API/Discovery 검증 증거](evidence/s10-page-api-closure-2026-10-01.md).
    2026-10-01 리뷰에서 dispatch 전 Stop과 같은 탭 새 요청의 바인딩에 P1
    결함을 재현했다. 위 완료 증거의 Stop 검증은 dispatch 이후 범위이며,
    이 결함은 S10-R에서 수정하고 별도 증거로 검증했다.
-   **S10-R Browser Page API 취소·요청 바인딩 보강: Completed — 2026-10-01.**
    원래 요청 ID/generation에 dispatch를 결속하고, probe/observation/marker
    대기 중 취소 이후 변경 호출 0건과 새 요청 상태 격리를 검증한다.
    dispatch 이후 UNKNOWN·무재시도를 유지한다. 결합 단위와 실제 Chrome 검증이 통과했다.
    [S10-R 검증 증거](evidence/s10-r-request-cancellation-2026-10-01.md).
    [수정 계획과 R-01~R-07](sprints/s10-r-page-api-request-cancellation.md).

기준일: 2026-09-26. 아래 2026-08-22 구현 증적은 이력이며,
S0~S9의 현재 종료 판정은 위 최신 증거를 따른다.

  ----------------------------------------------------------------------------
  Sprint   상태       완료 조건
  -------- ---------- --------------------------------------------------------
  S0       Completed  clean build, package, Community 로그인 비필수,
                     Linux Chrome smoke — 2026-09-24 증거 연결

  S1       Completed  projection·Ask E2E와 browser credential 비노출 —
                     2026-09-24 증거 연결

  S2       Completed  permission/R0-R3, credential 거부, bounded CDP와
                     detach-leak E2E — 2026-09-25 증거 연결

  S3       Completed  provider plugin, core-owned API key auth와 OAuth/token
                     거부 — 2026-09-25 증거 연결

  S4       Completed  Settings secret write-only, plugin lifecycle, local network
                     권한 경계 — 2026-09-25 증거 연결

  S5       Completed  Chat streaming/resync, Stop/card, scroll·복구 Chrome UI
                     — 2026-09-25 증거 연결

  S6       Completed  snapshot read/find/batch, 단일 탭, vision Chrome E2E
                     — 2026-09-25 증거 연결

  S7       Completed  signed R1/R2와 page-derived text의 일반 Act,
                     bounded CDP·verifier·negative Chrome — 2026-09-26 증거

  S8       Completed  standard/plan/skip permission mode와 hard-policy
                     Browser 로컬 matrix — 2026-09-26 증거

  S9       Completed  Linux package와 전체 인증·인가·upgrade·rollback
                     로컬 release candidate — 2026-09-26 증거
  ----------------------------------------------------------------------------

## 2026-08-22 구현 및 검증 증적

-   S5: closed `ChatEvent`와 sequence resync store를 Side Panel
    workspace에 연결했다. Ask/Act의 streaming, tool lifecycle, action
    review, permission, value 및 R2 confirmation을 redacted event view로
    렌더링하고, UI는 provider wire object나 raw action value/ref를 직접
    받지 않는다. transcript는 1,000 item budget·scroll anchor·delta
    batching을 적용하며 Stop 뒤 terminal event 고정과 late provider
    response 무시를 유지한다. unit test는 post-terminal event,
    action-view extra field, confirmation view를 검증한다.
-   S6: semantic snapshot v2의 기본 `all_dom` read, hidden reason,
    read/find/batch, transient viewport capture와 URL redaction을
    구현했다. 실제 Chrome fixture는 `display:none` button이
    `hidden_reason=display_none`으로 읽히고 password field가 배제됨을
    확인한다.
-   S7: signed Profile의 closed action definition을 검증하고, generic
    Chat Act는 Profile이 허용한 click/select/check/key proposal만 모델
    tool schema에 노출한다. hidden model ref는 mutation mapping에서
    제외된다. `0c5a598e`에서 서비스 워커가 등록된 document identity,
    run-scoped permission 전제, transient action marker와 session
    cleanup을 사용해 bounded CDP click/key/text 경로를 실제로 호출하도록
    연결했다. Chrome fixture는 text/select/check/R2 confirmation/stale
    ref/document navigation/worker restart와 CDP click 뒤 semantic
    postcondition을 실제 extension에서 검증한다.
-   S8: Settings에서 typed acknowledgement를 요구하는
    `skip_all_permission_checks`, `follow_a_plan` exact-host approval,
    immutable preference save와 run cancellation을 구현했다. skip mode는
    stored explicit deny와 R2/R3/ref/preflight/credential 경계를
    우회하지 않는다.
-   S9: Linux에서 extension artifact build, package policy, release
    package smoke와 .NET native host persistent framing smoke를
    통과했다.

최근 통과 command:

``` text
pnpm test                                      # typecheck, lint, build, package, 97 unit, fixture, source E2E
pnpm test:chrome-preview                       # Chrome for Testing 실제 extension preview/mutation/restart
pnpm test:chrome-extension                     # Chrome for Testing service worker + Side Panel 로드
pnpm test:native-host                          # .NET build + persistent framing smoke
pnpm test:release                              # release package smoke
npx --yes node@22.23.2 scripts/chrome-extension-smoke.mjs
                                                # CFT Side Panel workspace + worker load
npx --yes node@22.23.2 scripts/chrome-preview-e2e.mjs
                                                # CFT semantic preview + bounded mutation regression
```

S9의 현재 Linux clean-profile·upgrade/rollback 결과는 위의
[2026-09-26 증거](evidence/s9-closure-2026-09-26.md)를 따른다.
