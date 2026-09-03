# 11. Sprint 진행 상태

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

기준일: 2026-08-22

  ----------------------------------------------------------------------------
  Sprint   상태       완료 조건
  -------- ---------- --------------------------------------------------------
  S0       In         build, package, 제품 인증 surface 부재, Windows/Linux
           Progress   Chrome smoke

  S1       In         projection·Ask E2E와 browser credential 비노출
           Progress   

  S2       In         permission/R0-R3, credential 거부, bounded CDP와
           Progress   detach-leak E2E

  S3       In         provider plugin, core-owned API key auth와 OAuth/token
           Progress   거부

  S4       In         plugin Settings/secret lifecycle, local network,
           Progress   diagnostics contract

  S5       In         Chat streaming/resync, tool timeline, modal, a11y와 실제
           Progress   Chrome UI

  S6       In         hidden DOM 기본 read, find, vision, tabs와 read batch
           Progress   Chrome E2E

  S7       In         generic Act, bounded CDP 실제 연결, verifier와 일반
           Progress   fixture E2E

  S8       In         standard/plan/skip permission mode와 hard-policy matrix
           Progress   

  S9       In         Windows/Linux package와 전체 인증·인가·upgrade·rollback
           Progress   출시 증적
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

Sprint 상태를 `Done`으로 바꾸지 않은 이유는 명시적 종료 증적이 아직 남아
있기 때문이다. S5는 실제 provider SSE 1,000 delta/tool interleave와
worker suspend·panel close/reopen 뒤 event-store 복구, modal Stop race,
accessibility/performance gate를 실제 Chrome에서 실행해야 한다. S6는
vision zoom/tab-group/batch cancellation, S7은 Profile R2 binding 및 두
일반 Profile fixture, S8은 전체 adversarial hard-policy matrix, S9는
Windows clean profile과 upgrade/rollback을 각각 실제 환경에서 실행해야
한다. 이 항목은 구현되거나 실행되지 않은 상태에서 pass로 대체하지
않는다.
