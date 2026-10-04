# Sprint 검증 계획서

## Community 출시와 Enterprise 검증 분리 (2026-10-04)

[후속 Sprint gate](sprints/community-release-enterprise-followup.md)를 적용한다.
Community는 지원 OS별 clean-profile 설치·update/rollback·migration·실제 배포를
검증한다. S9 Linux 로컬 완료만으로 Windows/대외 출시를 선언하지 않는다.
Enterprise 계약 서버+실제 Chrome 검증과 실제 Platform L5/L6/운영 검증은
별도 증거이며 후자가 없으면 Enterprise 운영 연동 완료로 기록하지 않는다.

## Browser S13 분석 수집 종료 gate (2026-10-04)

[S13-C1~C8](sprints/s13-ask-act-analysis-data-acquisition.md)은 실제 Chrome
Side Panel·Worker와 통제 HTTPS Provider의 source 선택·R0 승인·재투입,
coverage, mutation review 분리, Stop·scope 변경·재시작과 저장소·진단·실제
ZIP 비노출을 검증했다. 453개 unit 및 가상 grid 회귀도 통과했다.
[완료 증거](evidence/s13-analysis-closure-2026-10-04.md)의 명령·결과를 따른다.
외부 live provider·실제 사이트 adapter·Enterprise Act audit evidence와
검증 범위를 구분한다.

## Browser 리뷰 후속 gate (2026-10-01)

[S10-R](sprints/s10-r-page-api-request-cancellation.md)의 R-01~R-07을 따른다.
probe/observation/marker 대기 중 Stop 이후 변경 호출 0건과 같은 탭의 새 요청에
이전 작업의 marker/progress/terminal이 기록되지 않음을 결합 단위 테스트로 검증한다.
dispatch 전 Stop·새 요청 시작 및 dispatch 이후 UNKNOWN 보존을 실제 Chrome에서
확인했다. [검증 증거](evidence/s10-r-request-cancellation-2026-10-01.md). 기존 S10의 dispatch 이후 Stop 증거만으로 이 gate를 통과한 것으로 판정하지 않는다.

## Enterprise Web AI Platform 정렬 (2026-08-31)

S10\~S15의 필수 추가 gate:

  -----------------------------------------------------------------------
  Sprint                              필수 검증
  ----------------------------------- -----------------------------------
  S10                                 현행 compact JWS의 손상 서명·path
                                      segment·version 거부, 저장 기록 손상·
                                      실패·rollback 거부, Worker 재시작
                                      후 실제 Side Panel 검증

  S11                                 Profile binding endpoint·argument
                                      거부, stale/expired 호출 전 차단,
                                      bounded result·non-OK 거부,
                                      실제 Side Panel MCP 경로와
                                      모델 catalog 비노출

  S12                                 managed 설정 손상·읽기 실패 거부,
                                      PDP allow/deny/outage·응답 제한,
                                      자동 권한·미사용 approval 거부,
                                      로컬 deny/plan scope 유지

  S13                                 Act policy/terminal closed allowlist,
                                      raw 값·URL path·unknown code 거부,
                                      UNKNOWN·무재시도·중복 terminal 검사,
                                      해시된 Profile/workflow correlation

  S14                                 complete top-frame all_dom 비교,
                                      stale/incomparable 구분, exact path,
                                      선택·시작 재검사와 실제 Chrome Panel

  S15                                 managed Chrome policy, signed
                                      release/revoke/rollback,
                                      Windows/Linux/on-prem/air-gap
                                      evidence
  -----------------------------------------------------------------------

  --------------------------------------------------------------------------------------
  Sprint   자동 검증                                      수동 증적
  -------- ---------------------------------------------- ------------------------------
  S0       install, build, browser manifest, Community    Linux Chrome
           runtime의 enterprise dependency 없는 동작      local-mode load

  S1       projection schema, stale ref, Resolver         로그인 페이지 Ask chat와
           JWS/config validation, credential field        password/OTP/token 비노출
           redaction                                      

  S2       permission/confirmation, R0-R3, credential     trusted input, 인가 우회 거부,
           거부, CDP allowlist, target binding, no-retry, conflict, Stop과 session 0
           detach cleanup                                 

  S3       plugin schema/registry/isolation, key header   선언형/내장 plugin 연결과
           3종, static header, OAuth/token field 거부,    core-owned 인증 시험
           error redaction                                

  S4       plugin lifecycle, settings migration,          plugin install/remove, MCP
           Profile-bound MCP result, redacted read,       HTTPS endpoint, secret 삭제
           secret export/sync/diagnostics 제외, timeout   선택과 loopback/private
                                                          network endpoint

  S5       Chat event schema, streaming order,            실제 Side Panel reopen, worker
           duplicate/gap/resync, Stop race, safe debug,   suspend/recovery와
           a11y와 virtual-list 성능                       320px/keyboard smoke

  S6       hidden reason, text value redaction, focused   실제 Side Panel read/find/batch,
           read, find, active-tab capture와 read-batch    active-tab screenshot/zoom,
           제한                                           단일 탭·권한 음성 검사

  S7       Profile action authority, generic proposal,    통제 HTTPS 일반 페이지
           ref/value slot, bounded CDP, verifier,         2개 이상에서 실제 Side
           fail-closed/no-retry, cleanup와 S2 regression   Panel·승인·trusted input

  S8       standard/follow-plan/skip Browser matrix,      실제 Settings typed
           exact origin, mode 전환 취소, 저장 deny와         activation, Side Panel
           R2/credential/restricted hard guard            R1/R2와 계획 scope Chrome

  S9       package/plugin/Chat/read/Act/permission-mode   Linux clean profile
           compatibility, artifact exclusion,             설치·upgrade·rollback과
           update/rollback                                인증·인가 경계 smoke
  --------------------------------------------------------------------------------------

모든 네트워크 검증은 local fixture 또는 사용자가 제공한 endpoint에서
수행한다. 실제 API key와 header 값은 test log에 남기지 않는다. 웹사이트
session, 제품 사용자 identity, provider credential과 browser 행동
permission을 하나의 `auth` 상태로 합치지 않고 각각 독립적으로 검증한다.
Windows clean-profile 증거와 별도 출시 검토자 승인은 S0~S9 `Completed`
조건에서 제외한다. S9는 Linux 로컬 release candidate 완료만 판정하며
Windows 배포와 대외 출시는 별도 판정 대상이다. 31~33번의 현재 Ask/Act
범위 밖인 복수 source 선택·reviewed Page API read도 S0~S9의 완료
조건으로 소급하지 않는다.

S2 Chrome 검증은 product extension의 `chrome.debugger` 경로와 외부
remote-debugging harness를 구분한다. 최소 negative set은 unknown
domain/parameter, raw selector/coordinate injection, stale/cross-tab
target, duplicated action token, sensitive target, R2 pre-confirmation
attach, post-dispatch fallback, competing debugger,
navigation/Stop/tab-close/worker-restart detach와 cleanup-failed
quarantine이다.

S5\~S9는 [18. Claude 브라우저 기능 채택
검증계획](18-claude-browser-capability-verification-plan.md)의 ID별
test와 V0\~V5 evidence 수준을 사용한다. 특히
`skip_all_permission_checks`는 permission prompt가 0이라는 positive
test뿐 아니라 R2/R3, credential, denylist/category, restricted origin,
schema/ref/preflight, verifier와 detach hard policy가 그대로 실행된다는
negative matrix를 모두 통과해야 한다.
