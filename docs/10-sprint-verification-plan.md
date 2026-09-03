# 10. Sprint 검증 계획서

## Enterprise Web AI Platform 정렬 (2026-08-31)

S10\~S15의 필수 추가 gate:

  -----------------------------------------------------------------------
  Sprint                              필수 검증
  ----------------------------------- -----------------------------------
  S10                                 tampered/expired/revoked Profile
                                      거부, current projection 우선,
                                      ambiguous/stale semantic resolution
                                      거부

  S11                                 registry trust/auth, tools/list
                                      schema cache, capability
                                      deny/maxRisk, removed/incompatible
                                      tool detection

  S12                                 RBAC/PDP allow/deny/approval, PDP
                                      outage write fail-closed, local
                                      hard guard 우회 불가

  S13                                 audit allowlist/secret scan,
                                      UNKNOWN/no-retry evidence,
                                      workflow/profile/policy correlation

  S14                                 L0\~L6 validation, semantic diff,
                                      dependency impact, changed
                                      page/workflow regression selection

  S15                                 managed Chrome policy, signed
                                      release/revoke/rollback,
                                      Windows/Linux/on-prem/air-gap
                                      evidence
  -----------------------------------------------------------------------

  --------------------------------------------------------------------------------------
  Sprint   자동 검증                                      수동 증적
  -------- ---------------------------------------------- ------------------------------
  S0       install, build, browser manifest, Community    Windows/Linux Chrome
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

  S6       hidden reason, credential redaction, focused   실제 페이지 hidden DOM,
           read, find, vision command allowlist, tab      screenshot/zoom, multi-tab과
           ownership와 read-batch 제한                    prompt-injection Chrome smoke

  S7       generic proposal/ref/value slot, DOM/CDP path, demo 외 일반 사이트 2개와
           verifier, no-retry, cleanup와 demo regression  staging-equivalent
                                                          trusted-input Act

  S8       standard/follow-plan/skip-all matrix, mode     permission-less
           immutability,                                  warning/activation과
           denylist/R2/R3/credential/restricted hard      redirect/adversarial Chrome
           policy                                         smoke

  S9       package/plugin/Chat/read/Act/permission-mode   Windows/Linux clean profile
           compatibility, artifact exclusion,             설치·upgrade·rollback과
           update/rollback                                인증·인가 경계 smoke
  --------------------------------------------------------------------------------------

모든 네트워크 검증은 local fixture 또는 사용자가 제공한 endpoint에서
수행한다. 실제 API key와 header 값은 test log에 남기지 않는다. 웹사이트
session, 제품 사용자 identity, provider credential과 browser 행동
permission을 하나의 `auth` 상태로 합치지 않고 각각 독립적으로 검증한다.

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
