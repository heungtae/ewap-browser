# 06. 데이터, 감사 및 개인정보 경계

> 2026-09-06 문서 정렬. [Platform alignment](platform-alignment.md)의 revision을 기준으로 현재 저장/출력과 목표 감사 계약을 구분한다. 중앙 Audit Service 통합 완료를 주장하지 않는다.

## 1. 현재 저장 위치와 수명

| 위치                               | 현재 용도                                                                                                                       | 경계                                                                                                                       |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| chrome.storage.local               | provider/plugin/API key/static headers, permissions, preferences, Profile Resolver URL/public key ring, 사용자 workflow catalog | 사용자 기기 저장소이며 secret vault가 아니다. Profile artifact persistent cache와 enterprise access-token 관리 기능은 없음 |
| chrome.storage.session             | bounded/redacted 탭별 chat, CDP ownership metadata, 5분 workflow 선택 계획                                                      | 실행 ref/value/confirmation token을 복원하는 저장소가 아님                                                                 |
| Service Worker memory              | run/model-ref mapping, action value/confirmation, resolved Profile proof, replay high-water                                     | worker 재시작을 넘는 Profile anti-replay 또는 audit queue가 아님                                                           |
| Content script / CDP action memory | document refs, preflight, transient target/input                                                                                | 종료된 action 권한으로 재사용 금지                                                                                         |
| Vision run memory                  | screenshot/zoom capture                                                                                                         | audit/cache/export 대상으로 삼지 않음                                                                                      |
| chrome.storage.managed read ports  | enterprise_policy, enterprise_identity, runtime_evidence                                                                        | manifest schema가 현재 세 read port를 제한하지만 force-install, verified identity와 release/trust configuration은 미완성   |

[storage bootstrap](../extension/src/service-worker/storage-bootstrap.ts)은 trusted contexts 접근을 설정하고 local permissions/preferences와 session chat/선택을 복구한다. [19번](19-tab-scoped-chat-session-design.md)의 chat 수명·크기 제한을 유지한다. persistent Profile cache는 [22번](22-page-profile-provider-design.md)의 Planned 기능이다.

Provider API key/static header는 모델·페이지·감사·export에 전달하지 않는 별도 core transport 경계다. 웹사이트 로그인 세션, LLM credential, 향후 Platform access token은 서로 대체할 수 없다.

## 2. 현재 감사 전송과 로컬 이벤트

[AuditEvent](../extension/src/security/audit.ts)의 event enum은 policy/terminal/mcp/workflow다. enum에 존재하는 것과 실제 emit은 다르다. 프로덕션 연결은 [Act proposal executor](../extension/src/service-worker/act-proposal-executor.ts)의 authorize 성공 후 `policy`, `decision=ALLOW`, `stage=authorized` 전송뿐이다. DENY는 client가 throw하므로 이 emit에 도달하지 않는다. Community ALLOW도 이 경로를 지나므로 수신 이벤트를 중앙 PDP의 검증된 결정으로 해석할 수 없다.

[runtime evidence sink](../extension/src/service-worker/runtime-evidence.ts)는 managed endpoint가 유효할 때만 HTTPS POST한다. 인증 header, event ID/timestamp/receipt, durable queue, retry/deduplication이 없고 HTTP 성공 여부를 확인하지 않으며 network failure를 삼킨다. endpoint가 없으면 아무것도 보내지 않는다. 이는 **Partially Implemented / best-effort**이고 Platform Audit Service의 durable 수신 증거가 아니다.

| Event              | Currently emitted to evidence sink | Currently logged locally / UI stream                              | Planned audit event / Platform integration required             |
| ------------------ | ---------------------------------- | ----------------------------------------------------------------- | --------------------------------------------------------------- |
| Profile loaded     | 없음                               | page-context-runtime의 resolved metadata Console                  | release/digest/environment/trust 확인 후 loaded                 |
| Profile rejected   | 없음                               | 호출자 오류 처리 또는 generic fallback; 전용 rejection event 없음 | bounded reason/version/correlation의 rejected                   |
| Agent started      | 없음                               | Ask/Act chat run_started                                          | authenticated agent/run started                                 |
| Workflow started   | 없음                               | 후보/선택 UI와 단계별 run; 독립 중앙 workflow-start event 없음    | workflowRun/release/workflow version 시작                       |
| Browser action     | 없음                               | tool_started/tool_finished, review/confirmation UI                | preflight/dispatch/verifier outcome                             |
| MCP tool call      | 없음                               | Ask generic tool_started/tool_finished                            | server/tool/release/policy + outcome, raw arguments/result 제외 |
| Policy allowed     | optional policy ALLOW POST         | proposal 진행                                                     | 실제 decisionId/policyVersion/expiry와 authenticated actor 결속 |
| Policy denied      | 없음                               | 오류 처리, denial 전용 중앙 event 없음                            | deny/error와 안정 reason code                                   |
| User approval      | 없음                               | permission/confirmation UI 메시지                                 | central approval ID/consumed outcome; token/nonce 제외          |
| Workflow completed | 없음                               | step terminal/최종 UI 결과                                        | 별도 workflowRun terminal과 전체 결과                           |
| Workflow failed    | 없음                               | step 실패/run terminal; 일부 UNKNOWN                              | workflow/step/result correlation과 failed/unknown               |

[Chat lifecycle](../extension/src/service-worker/chat-run-lifecycle.ts)의 UI event와 redacted session history는 중앙 audit가 아니다. 현재 `run_terminal`을 `AuditEvent.event=terminal`로 변환해 전송하는 호출 경로도 없다.

## 3. 진단 출력의 AS-IS와 알려진 차이

Page context, Ask/Act의 최종 model messages/tool schema와 provider raw response를 Console이나 페이지 DevTools로 전달하는 경로는 제거했다. 연결 테스트의 요청·응답 표시는 사용자가 Settings에서 명시적으로 켠 경우에만 해당 화면에 한정하며, URL과 credential-like key/value는 가린다.

이 진단 표시는 휘발성 UI이며 audit 보존 체계가 아니다. 중앙 telemetry로 전달해서는 안 되며, 후속 **P1 T08**은 event coverage, 인증·receipt, deduplication, quota/retention과 capture privacy를 별도로 검증해야 한다.

현재 일반 page read는 DOM/ARIA semantic projection을 수집한다. 사용자가 동의한 workflow 코드 분석은 별도 제한된 초안 생성 경로로 script를 읽으므로 “모든 기능에서 script를 전혀 읽지 않는다”는 주장도 피한다. 그 기능은 [21번](21-declarative-act-workflow-design.md)의 경계이며 Platform capture 권한이 아니다.

## 4. Target Audit / Telemetry Client — Planned

Platform은 중앙 감사 저장·조회·retention·조직 scope를 소유하고 Browser는 정확한 runtime event 생성, 로컬 최소화, 인증된 전송과 전송 상태를 소유한다. [Platform governance](../../ewap-platform/docs/aidlc/modules/governance-trust-release.md)의 actor/organization/correlation/release/workflow/policy/outcome 정보를 목표로 하되 공유 event wire schema는 [C06](platform-alignment.md)에 남아 있다. Browser body의 actor 주장을 신뢰하지 않고 서버가 인증 context와 결속해야 한다.

목표 event에는 version, event ID, occurredAt, run/workflowRun/step, profile/workflow/release identity와 digest, environment, policy decision/approval reference, capability/risk, execution stage/path/outcome/reason을 closed schema로 정한다. 원문 URL은 logical page/route identity로 대체한다. raw prompt/page text/tool result/action value, HTML/JS, selector/ref/node/coordinate, screenshot, credential/token/approval nonce는 감사 payload에 넣지 않는다. business-value 감사가 필요하면 Platform의 별도 domain audit 계약으로 다룬다.

전송은 runtime audience 인증, bounded queue/quota/retention, event-ID 기반 중복 제거, receipt 확인, 제한된 retry/backoff와 명시적 delivery-failure 상태를 설계한다. action 재실행과 event 재전송은 별개다. 실패한 감사 전송 때문에 action을 자동 재실행하지 않는다. 중앙 policy가 durable audit를 필수로 요구하는 행동은 receipt 확보 등 공유 계약의 admission 조건을 충족하지 못하면 dispatch하지 않는다. 이미 dispatch된 행동의 불명 결과는 verifier와 incident로 기록하며 rollback을 가장하지 않는다. 구체적인 queue 저장 위치·한도·offline admission은 C06 review에서 확정한다.

## 5. Platform Change Detector / Impact Analyzer 입력 — Planned

Browser는 scoped metadata, sanitized DOM/ARIA observation, Profile mismatch, workflow/action failure와 verifier outcome을 제공할 수 있다. native AX 관찰은 해당 adapter 도입 후에만 가능하다. Platform이 baseline/diff/classification, graph/impact score와 revalidation을 소유한다.

일반 runtime telemetry와 [capture-session evidence](../../ewap-platform/docs/aidlc/contracts/evidence-jobs.md)는 audience와 권한이 다르다. capture는 명시된 session/origin/application/environment, 짧은 token 수명과 sanitization policy를 필요로 한다. completeness/sequence/algorithmVersion을 포함해 누락 frame이나 algorithm mismatch를 성공적인 관찰로 보고하지 않는다. Browser의 기존 fingerprint를 Platform semantic-v1 digest로 표기하지 않는다.

Platform evidence/job retention은 서버 책임이며 Browser chat storage를 중앙 evidence 저장소로 승격하지 않는다. test-only `studio/semantic-impact.ts`와 `studio/validation.ts`는 실제 Change Detector/Impact Analyzer 또는 L5 검증 엔진이 아니다.

## 6. 검증 경계

현재 소스의 emit call site와 storage 경로를 읽어 위 표를 작성했다. 이번 작업은 runtime/Chrome 테스트, 실제 sink receipt, SSO, 중앙 감사 보존·복구 검증을 수행하지 않는다. 후속 task는 event coverage, denial/approval, auth failure, duplicate delivery, quota/offline, expiry/revoke와 로그·전송·저장 privacy를 각각 검증해야 한다.
