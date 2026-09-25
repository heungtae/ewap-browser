# Sprint 진행 상태

## S0~S9 Browser 기반 종료 범위 (2026-09-25)

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
- **S5~S8: In Progress** — 각 Sprint의 Chrome/negative matrix와 상태
  증거를 현재 빌드에서 확인한 뒤 순서대로 판정한다.
- **S9: In Progress** — S0~S8 `Completed`가 선행 조건이다. 현재
  `scripts/release-smoke.mjs`는 manifest host coverage 기대값 불일치로
  실패했으며 Linux clean-profile upgrade/rollback은 아직 실행하지 않았다.

## Enterprise Web AI Platform 전환 상태 (2026-08-31)

이 문서의 기존 상태는 2026-08-22 ContextPilot 구현 증적으로 보존한다.
Enterprise Web AI Platform 관점에서 S0\~S9는 Browser Runtime
foundation이며, S10\~S15는 아직 별도 구현/검증이 필요한 신규 범위다.
기존 Sprint를 Enterprise 기능까지 완료한 것으로 재해석하지 않는다.

-   S10 Profile Runtime: Planned
-   S11 MCP Registry/Discovery: Planned
-   S12 Enterprise Policy/Identity: Planned
-   S13 Enterprise Audit/Evidence: Planned
-   S14 Studio Integration: Planned
-   S15 Managed Enterprise Release: Planned
-   S6-R Collection Reading: In Progress — Ask와 Act의 explicit unique
    collection read/reinjection, Act closed route gate는 구현·unit 검증됐다.
    실제 Side Panel과 HTTPS 제어 provider fixture로 Ask/Act의 bounded context
    전달도 검증됐다. 복수 source 선택 및 승인 후 재개, reviewed API/export reader,
    live provider 및 virtual-scroll completeness evidence는 별도다. 세부 계약과
    CR-1~CR-5는 [28번](28-collection-reading-strategy-design.md)을 따른다.
-   S13 Ask/Act Analysis Data (Browser slice): In Progress — S13-C7에서 수집 종료
    뒤 page scope를 재검사하고 page change·Stop·timeout 결과의 수집 행을
    Provider context에서 버리는 경계를 unit 검증했다. Chrome 실사용 검증과
    복수 source 선택·권한 승인 후 같은 요청 재개는 미완료다.
-   S13-C7 Provider 투입 경계: Ask의 Profile resolve와 Act의 action-planning
    turn 사이에 page scope가 달라지면 수집 행을 `PAGE_CHANGED`·0건으로
    대체한다. scope 표식은 worker 메모리에만 보관한다. TypeScript, ESLint,
    format 검사는 통과했으며 이 추가 경계의 런타임/Chrome 검증은 별도다.
-   S13-C4 Provider context cap 보정: reader가 `complete`여도 Provider에
    전달할 행·셀·문자가 잘리면 `partial`·`CONTEXT_TRUNCATED`·`truncated`로
    표시한다. 기존 reader의 `partial`/`viewport_only` 사유는 유지한다.
    범위 표시는 소스 변경 단계이며 Provider 응답의 정확성 검증은 별도다.
-   S13-C7 Ask tool loop scope 보정: collection 분석 데이터가 있는 Ask는
    각 Provider 호출 직전과 응답 직후 현재 page scope를 새 snapshot으로
    확인한다. 변경·조회 실패 시 `PAGE_SCOPE_STALE`로 종료하고 assistant
    delta도 확인 전에는 표시하지 않는다. 런타임/Chrome 검증은 별도다.
-   S14-B1 Browser 로컬 비교: 기록된 워크플로우의 현재 projection이 잘렸거나
    비교 범위가 다르면 `incomparable`로 표시하고 선택·시작을 차단한다.
    선택·시작 시 저장 기록과 현재 snapshot을 다시 대조한다. Platform의
    capture ingest, C06/C07 계약, Change/Impact 서비스, L0~L6 검증은
    미구현이므로 S14 전체 상태는 Planned다.
-   S10-C4 Browser 검토 화면: Page API 후보를 대화 기록과 분리한 일시적
    dialog에 표시한다. 닫기·탭 변경·페이지 변경 때 목록과 늦은 응답을
    폐기하고, `adapter 검토 필요`는 화면 상태로만 남긴다. 검토자 인증,
    외부 작업 항목 생성, reviewed `page_api_read` adapter 및 전체 Chrome
    matrix는 별도이므로 S10 전체 상태는 Planned다.

기준일: 2026-09-25. S5~S9의 기존 근거는 아래 2026-08-22 구현 증적이며,
현재 빌드의 종료 재검증은 아직 끝나지 않았다. S0~S4는 위 최신 증거를 따른다.

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

  S5       In         Chat streaming/resync, tool timeline, modal, a11y와 실제
           Progress   Chrome UI

  S6       In         hidden DOM 기본 read, find, vision, tabs와 read batch
           Progress   Chrome E2E

  S7       In         generic Act, bounded CDP 실제 연결, verifier와 일반
           Progress   fixture E2E

  S8       In         standard/plan/skip permission mode와 hard-policy matrix
           Progress   

  S9       In         Linux package와 전체 인증·인가·upgrade·rollback
           Progress   로컬 release candidate 증적
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

S5~S9 상태를 아직 `Completed`로 바꾸지 않은 이유는 명시적 종료 증적이
남아 있기 때문이다. S5는 통제된 provider SSE 1,000 delta/tool interleave와
worker suspend·panel close/reopen 뒤 event-store 복구, modal Stop race,
accessibility/performance gate를 실제 Chrome에서 실행해야 한다. S6는
vision zoom/tab-group/batch cancellation, S7은 Profile R2 binding 및 두
일반 Profile fixture, S8은 전체 adversarial hard-policy matrix, S9는
Linux clean profile과 upgrade/rollback을 각각 실제 환경에서 실행해야
한다. 이 항목은 구현되거나 실행되지 않은 상태에서 pass로 대체하지
않는다.
