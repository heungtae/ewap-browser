# Company Web Agent 설계 리뷰 — 2026-08-15

## 결론

설계의 fail-closed, R3 거부, `UNKNOWN` 재시도 금지, 감사 allowlist 원칙은 일관적이다. 초기 검토 R-01~R-07, 후속 계약 검토 R-08~R-15와 2차 재검토 R-16~R-24를 모두 설계·검증 계약에 반영했다. verifier 소유권, idempotent Profile replay CAS, exact page-record/document identity, Business MCP call-kind wire, effect 기반 R2 승격, persistent Native port, storage access level과 visibility identity 결정이 닫혔다. 따라서 이 리뷰의 설계 지적은 **반영 완료**다. 이는 구현·Chrome E2E 또는 production 승인을 뜻하지 않으며, S1은 외부 호출 없는 semantic projection preview이고 verified Profile과 Host가 갖춰지는 S5 전에는 production Ask/Act를 활성화하지 않는다.

## 검토 범위

- `docs/01-architecture.md` ~ `docs/07-verification-and-release.md`
- Sprint 설계·개발·검증·현황 문서: `docs/08-sprint-design.md` ~ `docs/11-sprint-progress.md`
- 실행·경계 계약: `docs/12-low-cost-agent-implementation-spec.md` ~ `docs/14-semantic-projection-fingerprint.md`
- Chrome MV3의 현재 Native Messaging·host permission·scripting 제약

## 처리 현황과 반영 추적

아래 표는 이 리뷰의 각 지적이 이후 설계에 어떻게 처리됐는지 기록하는 단일 기준이다. 설계 문서를 수정할 때 해당 행을 함께 갱신한다. 단순히 문구를 바꾼 경우에는 `반영`으로 표시하지 않으며, 해당 위험을 닫는 결정·계약·검증이 있어야 한다.

| ID | 처리 상태 | 결정 및 근거 | 반영 문서·검증 | 최종 확인일 |
|---|---|---|---|---|
| R-01 | 반영 | Chrome AX API를 전제하지 않고 DOM semantic projection으로 전환했다. 수집 필드·제외 필드·`ref_id` registry 폐기 규칙을 고정했다. | [01](../01-architecture.md), [03](../03-extension-design.md), [09 S1](../09-sprint-development-plan.md), [10 S1](../10-sprint-verification-plan.md) | 2026-08-15 |
| R-02 | 반영 | Ask도 page read, resolver, LLM egress를 독립 allowlist로 판정하고 비회사/local origin을 기본 거부한다. | [02](../02-security-policy.md), [03](../03-extension-design.md), [S1](../sprints/s1-semantic-projection-preview.md), [10 S1](../10-sprint-verification-plan.md) | 2026-08-15 |
| R-03 | 반영 | localhost HTTP 대신 ACL named pipe와 상호 요청 서명·nonce replay 방지를 채택하고 static header 소유권을 Host/bridge ACL 구성으로 제한했다. | [04](../04-llm-and-sso-integration.md), [05](../05-deployment-operations.md), [S4](../sprints/s4-native-host-and-ai-hub-boundary.md), [10 S4](../10-sprint-verification-plan.md) | 2026-08-15 |
| R-04 | 반영 | release artifact의 `permission_origins`를 상한 source of truth로 삼고 managed policy는 축소만 허용한다. pattern 변경은 manifest/정책/compatibility matrix를 포함한 extension update다. | [02](../02-security-policy.md), [03](../03-extension-design.md), [05](../05-deployment-operations.md), [10 S0/S1](../10-sprint-verification-plan.md) | 2026-08-15 |
| R-05 | 반영 | ActionIntent digest 대상, `user_supplied` value origin, transient lifetime/reference disposal, Host opaque session binding을 계약화했다. | [02](../02-security-policy.md), [04](../04-llm-and-sso-integration.md), [S2](../sprints/s2-deterministic-mutation-foundation.md), [S3](../sprints/s3-r2-confirmation-and-terminal-state.md), [10 S2/S3](../10-sprint-verification-plan.md) | 2026-08-15 |
| R-06 | 반영 | signed Profile의 ID/version, ES256 key ring/rotation, expiry/replay/size/matcher/cache atomicity를 계약화했다. | [03](../03-extension-design.md), [S5](../sprints/s5-profile-mcp-and-managed-pilot.md), [09 S5](../09-sprint-development-plan.md), [10 S5](../10-sprint-verification-plan.md) | 2026-08-15 |
| R-07 | 반영 | R-02~R-06의 우회 경로를 S0~S5와 release-blocking regression에 negative test로 추가했다. | [07](../07-verification-and-release.md), [10](../10-sprint-verification-plan.md) | 2026-08-15 |
| R-08 | 반영 | 모델에는 run 한정 `model_ref`만 주고 service worker가 한 번만 내부 `ref_id`로 해석한다. raw ref/mapping은 Host·LLM·audit에서 금지했다. | [01](../01-architecture.md), [02](../02-security-policy.md), [03](../03-extension-design.md), [06](../06-data-audit-and-privacy.md), [10 S4](../10-sprint-verification-plan.md), [12 3/5](../12-low-cost-agent-implementation-spec.md) | 2026-08-15 |
| R-09 | 반영 | content script가 document epoch를 단독 생성·등록하고 worker는 검증된 registration만 채택한다. 재시작·late message 경로를 fail closed로 고정했다. | [01](../01-architecture.md), [03](../03-extension-design.md), [10 S1](../10-sprint-verification-plan.md), [12 3/4](../12-low-cost-agent-implementation-spec.md) | 2026-08-15 |
| R-10 | 반영 | S1을 Host/Profile/LLM 없는 preview로 축소하고 production Ask/Act 활성화를 S5로 이동했다. mock success는 금지한다. | [S1](../sprints/s1-semantic-projection-preview.md), [S5](../sprints/s5-profile-mcp-and-managed-pilot.md), [09](../09-sprint-development-plan.md), [10 S1/S5](../10-sprint-verification-plan.md), [11](../11-sprint-progress.md), [12 4](../12-low-cost-agent-implementation-spec.md) | 2026-08-15 |
| R-11 | 반영 | opaque tab context와 `BIND_SESSION` → `ISSUE_CONFIRMATION` → `VERIFY_CONFIRMATION` schema를 고정하고 Host atomic consume을 요구했다. | [02](../02-security-policy.md), [04](../04-llm-and-sso-integration.md), [10 S3/S4](../10-sprint-verification-plan.md), [12 5](../12-low-cost-agent-implementation-spec.md) | 2026-08-15 |
| R-12 | 반영 | Profile의 programmatic activation capability를 opt-in으로 두고 trusted-input 필요 target은 `TARGET_NOT_ACTIONABLE`로 거부한다. trusted input 우회 채널은 추가하지 않는다. | [S3](../sprints/s3-r2-confirmation-and-terminal-state.md), [S5](../sprints/s5-profile-mcp-and-managed-pilot.md), [09 S3](../09-sprint-development-plan.md), [10 S3/S5](../10-sprint-verification-plan.md), [12 4](../12-low-cost-agent-implementation-spec.md) | 2026-08-15 |
| R-13 | 반영 | `semantic-projection-fp-v1`의 closed schema·label alias·현재 상태값을 제외한 state capability·relation 정규화·golden hash와 Host의 OS 보호 durable high-water CAS를 정하고 restart/corruption을 fail closed로 처리했다. | [03](../03-extension-design.md), [04](../04-llm-and-sso-integration.md), [05](../05-deployment-operations.md), [06](../06-data-audit-and-privacy.md), [10 S5](../10-sprint-verification-plan.md), [14](../14-semantic-projection-fingerprint.md) | 2026-08-15 |
| R-14 | 반영 | stricter rule을 단일 기준으로 채택해 Managed Storage의 모든 header 이름·값을 금지하고 Host/bridge ACL 구성만 소유하게 했다. | [03](../03-extension-design.md), [04](../04-llm-and-sso-integration.md), [06](../06-data-audit-and-privacy.md), [10 S5](../10-sprint-verification-plan.md) | 2026-08-15 |
| R-15 | 반영 | value-bearing tool은 모델이 target을 제안한 뒤 Side Panel에서 값을 수집하고, run/target/tool 한정 slot·digest를 atomic consume해 content script에 한 번만 전달한다. slot/value는 model·Host·storage·audit에서 금지하고 disconnect 재전송도 금지했다. | [01](../01-architecture.md), [02](../02-security-policy.md), [03](../03-extension-design.md), [06](../06-data-audit-and-privacy.md), [10 S2](../10-sprint-verification-plan.md), [12 3.3/4](../12-low-cost-agent-implementation-spec.md) | 2026-08-15 |
| R-16 | 반영 | 모델 proposal에서 verifier/`expected`를 제거했다. service worker가 signed Profile+pre-state+tool rule로 predicate를 만들며 no-op과 단순 same-origin 이동을 성공으로 보지 않는다. | [01](../01-architecture.md), [02](../02-security-policy.md), [07](../07-verification-and-release.md), [10 S2/S3](../10-sprint-verification-plan.md), [12 3.3/3.4/4](../12-low-cost-agent-implementation-spec.md), [13 3.3](../13-page-profile-and-business-mcp-contract.md) | 2026-08-15 |
| R-17 | 반영 | high-water key를 `(deployment_id, profile_id)`로 통합하고 JWS-signed 안정 Profile 정의 digest에 대해 higher-version advance, same-version/same-digest idempotent accept, 다른 정의/lower version reject로 고정했다. record별 nonce/context/token은 별도 binding으로 검증한다. | [03 7](../03-extension-design.md), [04 4](../04-llm-and-sso-integration.md), [07](../07-verification-and-release.md), [10 S5](../10-sprint-verification-plan.md), [12 5](../12-low-cost-agent-implementation-spec.md), [13 3](../13-page-profile-and-business-mcp-contract.md) | 2026-08-15 |
| R-18 | 반영 | resolver nonce와 canonical exact-page digest를 JWS, cache, extension→Host, Host→gateway에 결속하고 cross-record/late response를 양쪽에서 거부한다. | [03 7](../03-extension-design.md), [07](../07-verification-and-release.md), [10 S5](../10-sprint-verification-plan.md), [13 2/3/4/6](../13-page-profile-and-business-mcp-contract.md) | 2026-08-15 |
| R-19 | 반영 | Chrome 106+의 authoritative sender tab/frame/documentId/lifecycle을 채택하고 content 주장 metadata와 old/prerender/frozen document를 거부한다. | [03 2/4/5](../03-extension-design.md), [05 4](../05-deployment-operations.md), [07](../07-verification-and-release.md), [09 S1](../09-sprint-development-plan.md), [10 S1](../10-sprint-verification-plan.md), [12 3.5/4](../12-low-cost-agent-implementation-spec.md) | 2026-08-15 |
| R-20 | 반영 | authoritative field와 agentic-read의 Host→gateway request/response를 별도 closed schema로 분리하고 model enum, exact result key/kind/scalar를 Registry와 교차 검증한다. | [07](../07-verification-and-release.md), [09 S5](../09-sprint-development-plan.md), [10 S5](../10-sprint-verification-plan.md), [13 3.4/4/5/6](../13-page-profile-and-business-mcp-contract.md) | 2026-08-15 |
| R-21 | 반영 | primitive와 risk pipeline을 분리했다. 모든 mutation은 signed effect에 따라 R2로 승격되며 autosave/server effect에 authoritative verifier가 없으면 거부한다. | [02 3/4/5](../02-security-policy.md), [07](../07-verification-and-release.md), [S2](../sprints/s2-deterministic-mutation-foundation.md), [S3](../sprints/s3-r2-confirmation-and-terminal-state.md), [S5](../sprints/s5-profile-mcp-and-managed-pilot.md), [09 S2/S3](../09-sprint-development-plan.md), [10 S2/S3](../10-sprint-verification-plan.md), [12 4](../12-low-cost-agent-implementation-spec.md), [13 3.3](../13-page-profile-and-business-mcp-contract.md) | 2026-08-15 |
| R-22 | 반영 | `connectNative()` persistent port만 사용하고 multi-frame loop, request/stream correlation, cancellation, concurrency 및 disconnect/crash cleanup을 고정했다. | [04 4](../04-llm-and-sso-integration.md), [07](../07-verification-and-release.md), [S4](../sprints/s4-native-host-and-ai-hub-boundary.md), [09 S4](../09-sprint-development-plan.md), [10 S4](../10-sprint-verification-plan.md), [12 5.2](../12-low-cost-agent-implementation-spec.md) | 2026-08-15 |
| R-23 | 반영 | service-worker bootstrap 첫 단계에서 managed/local/session을 `TRUSTED_CONTEXTS`로 잠그고 성공 전 모든 run/audit를 fail closed 한다. | [03 3](../03-extension-design.md), [06 2](../06-data-audit-and-privacy.md), [07](../07-verification-and-release.md), [09 S1](../09-sprint-development-plan.md), [10 S1](../10-sprint-verification-plan.md), [12 3.6/4.1](../12-low-cost-agent-implementation-spec.md) | 2026-08-15 |
| R-24 | 반영 | visibility membership을 Profile identity로 결정했다. invisible node는 제외하고 toggle은 hash 변경·즉시 tool 철회·재해결을 일으키며 포함 node의 다른 현재 상태값은 hash하지 않는다. | [03 7](../03-extension-design.md), [06 1](../06-data-audit-and-privacy.md), [07](../07-verification-and-release.md), [09 S5](../09-sprint-development-plan.md), [10 S5](../10-sprint-verification-plan.md), [14 1/3/6](../14-semantic-projection-fingerprint.md) | 2026-08-15 |

### 상태 규칙

- `Pending`: 아직 설계 결정을 내리지 않았거나 반영 증거가 없다.
- `반영`: 권장 조치를 수용했다. 결정 이유, 변경한 문서 링크, 해당 negative test 또는 검증 증거를 반드시 남긴다.
- `대안 반영`: 권장 조치 자체는 채택하지 않았지만 동일하거나 더 강한 위험 완화책을 채택했다. 대안의 위협 모델과 검증 증거를 남긴다.
- `보류`: 외부 운영 입력 또는 선행 결정이 필요하다. blocker, owner, 재검토 조건을 남긴다. `보류` 항목이 release-blocking이면 관련 Sprint를 `Blocked`로 기록한다.
- `미반영`: 의도적으로 수용하지 않는다. 수용하지 않는 이유, 잔여 위험을 승인한 owner, 재검토 조건을 남긴다. 근거나 승인 없이 `미반영`으로 닫을 수 없다.

상태를 `반영`, `대안 반영`, `미반영`으로 바꿀 때는 `결정 및 근거` 칸에 짧은 결정 기록을 쓰고, `반영 문서·검증` 칸에는 수정한 설계 문서와 테스트/검증 위치를 Markdown 링크로 기록한다. 구현 Sprint가 시작된 뒤에는 [11-sprint-progress.md](../11-sprint-progress.md)의 해당 Sprint 기록에도 같은 리뷰 ID를 연결한다.

## 발견 사항

### R-01 — 높음 — AX tree 수집의 구현 경로가 정의되지 않음

`content script`가 Accessibility Tree(AX tree)를 수집한다고 전제하지만, 일반 Chrome MV3 확장 API에는 렌더러 Accessibility Tree를 읽는 API가 없다. `accessibilityFeatures` API는 Chrome 접근성 기능 설정용이며 AX snapshot API가 아니다.

- 영향: S1의 `read_accessibility_tree`, `ref_id`, verifier의 핵심 계약이 구현 가능한 인터페이스에 대응하지 않는다.
- 근거: [01-architecture.md](../01-architecture.md)는 AX tree와 `ref_id`를 기본 표현으로 지정하고, [03-extension-design.md](../03-extension-design.md)는 content AX collector를 둔다. [09-sprint-development-plan.md](../09-sprint-development-plan.md)는 이를 S1 산출물로 지정한다.
- 조치: 다음 중 하나를 설계 결정으로 고정한다.
  1. DOM에서 생성한 제한된 semantic projection으로 용어와 계약을 바꾸고, `ref_id` 안정성·role/name/state의 산출 규칙을 정의한다.
  2. 별도 브라우저 자동화/접근성 채널을 도입하고, 필요한 권한·배포 방식·신뢰 경계·지원 Chrome 버전을 추가 설계한다.
- 완료 조건: fixture가 아닌 실제 Chrome에서 수집 가능한 필드와 수집 불가능한 필드를 명시하고, S1 계약/테스트를 그 인터페이스에 맞춘다.

### R-02 — 높음 — Ask의 데이터 반출 origin 정책이 없음

Act만 enterprise origin allowlist로 제한한다. 그러나 Ask도 redacted snapshot을 Native Host와 AI Hub에 전달하므로 외부 사이트, 개인 서비스, 로컬 개발 페이지의 내용을 모델로 전송할 수 있다.

- 영향: 읽기 전용이라는 이유만으로 데이터 반출 위험이 사라지지 않는다.
- 근거: [02-security-policy.md](../02-security-policy.md)는 Act에만 allowlist 조건을 부여하고, [01-architecture.md](../01-architecture.md)의 Ask 흐름은 snapshot을 Agent Host로 보낸다.
- 조치: 페이지 읽기, Profile resolver 호출, LLM 전송 각각에 대한 allowlist를 분리해 정의한다. 기본 정책은 비회사 origin·`localhost`·IP literal·파일 URL에서 snapshot 수집과 모델 전송을 모두 거부하는 것으로 한다. 허용되는 로컬 fixture/development origin은 production policy와 분리한다.
- 완료 조건: S1에 allowed/blocked origin별 snapshot·LLM egress negative test를 추가한다.

### R-03 — 높음 — localhost bridge에 호출자 인증이 없음

Host가 assertion과 static header를 붙여 localhost bridge로 보내는 구조에서 localhost-only bind는 호출자 인증을 제공하지 않는다. 같은 Windows 사용자 세션의 다른 프로세스가 bridge에 직접 요청할 수 있다.

- 영향: assertion 전달, model invocation, 고정 헤더 정책이 Native Host의 allowlisted extension 경계를 우회할 수 있다.
- 근거: [04-llm-and-sso-integration.md](../04-llm-and-sso-integration.md)는 Host에서 HTTP loopback bridge를 호출하고 localhost bind만 요구한다. [03-extension-design.md](../03-extension-design.md)의 Managed Storage 예시는 extension-readable `request_headers`를 둔다.
- 조치: Host↔bridge 경로를 Windows ACL이 적용된 named pipe로 변경하거나, 설치 단위의 상호 인증·요청 서명·replay 방지를 명시한다. static header와 bridge endpoint는 Host/bridge의 관리자 ACL 구성만이 소유하도록 하며 Managed Storage에는 식별자만 둔다.
- 완료 조건: S4에서 직접 loopback 호출, header 위조, 재전송을 거부하는 통합 보안 테스트를 추가한다.

### R-04 — 높음 — Managed allowlist와 manifest host permission의 갱신 모델이 불일치

Managed Storage의 `allowed_origins` 또는 resolver URL을 바꿔도 설치된 manifest의 `host_permissions`는 바뀌지 않는다. `<all_urls>`를 금지한 상태에서 content script injection, service-worker fetch, Profile/MCP endpoint 접근이 어떤 배포 단위로 허용되는지 정의되어 있지 않다.

- 영향: 정책상 허용되었어도 Chrome이 주입/요청을 거부하거나, 반대로 manifest 범위가 정책보다 넓어진다.
- 근거: [03-extension-design.md](../03-extension-design.md)의 최소 manifest 원칙과 Managed Storage 계약, [S1](../sprints/s1-semantic-projection-preview.md)/[S2](../sprints/s2-deterministic-mutation-foundation.md)의 경계가 충돌한다.
- 조치: host pattern을 release artifact에 고정하고 정책 변경 시 extension update와 compatibility matrix를 함께 배포할지, 또는 명시 사용자 동작에 한정된 `activeTab`을 사용할지 결정한다. resolver/MCP endpoint도 같은 모델로 포함한다.
- 완료 조건: S0 manifest permission snapshot과 S1의 origin gate가 같은 source of truth를 검증한다.

### R-05 — 중간 — R2 확인 주체와 값 입력의 데이터 수명 계약이 부족함

confirmation은 사용자·탭·document epoch·intent digest에 결속된다고 하나, extension이 신뢰할 수 있는 Windows 사용자 주체를 어떻게 얻고 확인하는지는 정의되지 않았다. 또한 `set_text_by_ref`가 필요한 값이 Side Panel, 모델, Host 중 어디를 어떻게 통과하는지와 모델 생성값/사용자 제공값의 구분이 없다.

- 영향: 확인 재사용, 잘못된 사용자/세션 결속, 값의 불필요한 모델 전송 또는 로그 유입을 검증할 수 없다.
- 근거: [01-architecture.md](../01-architecture.md)의 상태 모델, [02-security-policy.md](../02-security-policy.md)의 `set_text_by_ref`, [06-data-audit-and-privacy.md](../06-data-audit-and-privacy.md)의 값 저장 금지 규칙.
- 조치: `ActionIntent`에 digest 대상 필드, value origin, 값의 ephemeral lifetime, confirmation binding을 명시한다. Windows 주체는 Host가 검증한 opaque session binding으로만 확장에 노출한다.
- 완료 조건: S2/S3에 cross-session confirmation, stale value buffer, value audit leakage negative test를 추가한다.

### R-06 — 중간 — Page Profile의 신뢰·갱신 계약이 검증 가능하지 않음

Profile은 도구 노출, risk override, verifier 기대값을 결정하지만 “서명 또는 신뢰할 수 있는 endpoint”만 정의되어 있다.

- 영향: 오래되었거나 변조된 profile이 권한을 확대하거나 verifier를 약화할 수 있다.
- 근거: [01-architecture.md](../01-architecture.md)의 Page Profile 규칙과 [S5 설계](../sprints/s5-profile-mcp-and-managed-pilot.md)의 범위.
- 조치: profile ID/version, 서명 알고리즘과 공개키 배포·rotation, expiry/max-age, replay 방지, 응답 크기 제한, origin/path 매칭 우선순위, atomic cache invalidation을 계약화한다.
- 완료 조건: S5에 invalid signature, stale/replayed profile, profile change 중 action 취소 테스트를 추가한다.

### R-07 — 중간 — 검증 계획이 핵심 우회 경로를 다루지 않음

현재 S4 검증은 malformed Native Messaging과 header allowlist를 포함하지만, R-02~R-06의 우회 경로를 검증하지 않는다.

- 조치: 다음을 release-blocking negative test로 추가한다.
  - 비허용 origin에서 snapshot 수집과 LLM egress 거부
  - 직접 bridge 호출 및 header/assertion 재사용 거부
  - policy와 manifest host permission 불일치 fail-closed
  - cross-session confirmation·stale value buffer 거부
  - unsigned, expired, replayed Profile 거부

## 후속 계약 검토 발견 사항

### R-08 — 높음 — LLM 대상 식별자와 privacy 경계가 충돌함

`SemanticSnapshot`의 node는 `ref_id`와 관계 `parent_ref_id`/`label_ref_id`를 포함하고, 이 snapshot은 Host를 거쳐 모델 요청에 들어간다. 그러나 데이터 정책은 모델 전송 대상에서 raw `ref_id`를 제외한다. 반대로 모델이 `ActionIntent`를 제안하려면 현재 대상과 대응되는 식별자가 필요하다.

- 영향: 구현자가 `ref_id`를 모델에 보내 privacy 계약을 위반하거나, 식별자를 보내지 않아 action proposal을 해석할 수 없게 된다.
- 근거: [12의 snapshot schema](../12-low-cost-agent-implementation-spec.md)는 `ref_id`를 포함하고, [12의 Host 요청](../12-low-cost-agent-implementation-spec.md)은 snapshot을 전달하며, [06](../06-data-audit-and-privacy.md)은 raw `ref_id` 전송을 제외한다.
- 조치: 서비스 워커만 보유하는 일회성 `model_ref → ref_id` 매핑을 도입하거나, opaque `ref_id`를 모델 전송 가능한 데이터로 명시적으로 재분류한다. 어느 경우든 Host/LLM payload, proposal schema, 감사 금지 필드를 함께 고정한다.
- 완료 조건: Host/LLM request fixture에 허용 식별자만 존재하고, proposal을 내부 target으로 단 한 번 해석하며, raw `ref_id`의 전송·로그 누출을 막는 negative test가 있다.

### R-09 — 높음 — document epoch의 생성 주체가 이중임

run coordinator는 새 run에서 `new epoch`를 만든다고 하나, ref registry는 content script가 `document_start`마다 random `document_epoch`를 만든다고 정의한다. 두 값이 독립 생성되면 정상 snapshot도 sender/run epoch 검증에서 거부될 수 있다.

- 영향: navigation 직후 정상 Ask/Act가 비결정적으로 `INVALID_ARGUMENT` 또는 stale로 끝나며, 구현자마다 서로 다른 동기화 우회로를 만들 수 있다.
- 근거: [12의 coordinator](../12-low-cost-agent-implementation-spec.md)는 run epoch 생성을, [12의 ref registry](../12-low-cost-agent-implementation-spec.md)는 content epoch 생성을 요구한다.
- 조치: content script가 생성·등록한 epoch만 service worker가 채택하게 하고, run은 검증된 `(tab_id, frame_id, document_epoch)`에 결속한다. 등록 이전 요청, navigation/worker restart 경합, 늦은 message의 처리 순서를 schema와 상태 전이로 정한다.
- 완료 조건: document-start registration, navigation race, worker restart, stale late message를 실제 Chrome E2E와 unit state-machine test로 검증한다.

### R-10 — 높음 — S1 범위가 Ask의 실제 선행 계약과 충돌함

S1은 Native Host·외부 LLM·Page Profile 구현을 제외하지만, 공통 start 알고리즘은 Profile availability를 확인하고 Host를 호출한 뒤 Ask 결과를 렌더링한다. 따라서 현재 정의만으로 S1의 “Ask 수직 경로” 성공 조건을 충족할 수 없다.

- 영향: S1에 production fallback인 mock을 넣거나, 문서와 달리 Host/Profile 코드를 앞당기는 범위 확장이 발생한다.
- 근거: [S1](../sprints/s1-semantic-projection-preview.md)은 Native Host/외부 LLM을 제외하고, [S5](../sprints/s5-profile-mcp-and-managed-pilot.md)는 Profile resolver를 포함하며, [12의 coordinator](../12-low-cost-agent-implementation-spec.md)는 Profile 검증과 Host 호출을 요구한다.
- 조치: S1을 모델 없는 “semantic projection preview”로 명확히 개명·검증하거나, fail-closed Profile/Host interface를 S1의 선행 산출물로 옮긴다. production Ask 활성화 Sprint와 mock-only 검증을 별도 상태로 기록한다.
- 완료 조건: 각 Sprint에서 사용자에게 노출되는 기능, 호출 가능한 외부 경계, mock 허용 범위가 표와 검증 계획에 일치한다.

### R-11 — 높음 — R2 session binding의 IPC 계약이 충분하지 않음

Host는 session binding을 extension instance, tab, document epoch, intent digest에 결속하고 확인 때 재검증해야 한다. 하지만 정의된 Host 요청은 `run_id`와 snapshot만 가지며 tab ID와 intent digest를 명시적으로 제외하고, `SESSION_BINDING` request와 confirmation proof의 request/response schema도 없다.

- 영향: S3의 local fake와 S4의 실제 Host가 다른 binding 의미를 구현하거나, cross-tab/cross-session 재사용을 검증하지 못한다.
- 근거: [04](../04-llm-and-sso-integration.md)은 Host binding의 결속 필드를 요구하고, [12](../12-low-cost-agent-implementation-spec.md)은 Host request에서 필요한 식별자를 제외한다.
- 조치: `BIND_SESSION`, `ISSUE_CONFIRMATION`, `VERIFY_CONFIRMATION`의 JSON Schema를 정의한다. Chrome tab ID를 Host에 노출하지 않아야 한다면 service worker가 검증한 opaque tab-context를 만들고, binding ID, nonce, expiry, intent digest, one-time consume 결과를 명시한다.
- 완료 조건: Native Host contract test가 cross-tab, cross-epoch, cross-session, expiry, reuse를 실제 request/response schema로 거부한다.

### R-12 — 높음 — 프로그램적 click/key의 지원 경계가 없음

R2 executor는 `HTMLElement.click()`만 사용하고 key 도구는 허용 키를 실행한다고 하지만, 이 이벤트는 신뢰된 사용자 입력이 아니다. `isTrusted`를 검사하는 업무 페이지에서는 click/key handler가 행동을 거부할 수 있고, 설계는 pointer input이나 다른 trusted-input 채널을 의도적으로 금지한다.

- 영향: 안전하게 fail closed 하더라도 문서가 약속한 R2 도구가 허용된 사이트에서 동작하지 않을 수 있으며, 구현자가 위험한 우회 채널을 추가할 유인이 생긴다.
- 근거: [12의 R2 executor](../12-low-cost-agent-implementation-spec.md)는 `HTMLElement.click()`만 허용한다. `HTMLElement.click()`으로 발생한 click은 `isTrusted=false`다. [MDN Event.isTrusted](https://developer.mozilla.org/en-US/docs/Web/API/Event/isTrusted)
- 조치: Profile에 프로그램적 activation 지원 capability와 허용 target 종류를 선언하고, 지원하지 않거나 `isTrusted` 요구가 확인된 target은 `TARGET_NOT_ACTIONABLE`로 거부한다. `press_key_by_ref`의 정확한 DOM 수행 방식도 정의하고 fixture에 `isTrusted` 거부 페이지를 추가한다.
- 완료 조건: 지원 Profile의 verified path와 `isTrusted` 요구 target의 fail-closed path가 Chrome E2E로 각각 증명된다.

### R-13 — 중간 — Profile fingerprint와 재시작 뒤 replay 방지의 결정성이 부족함

Profile은 semantic projection fingerprint match와 monotonic version으로 신뢰를 결정하지만 fingerprint의 canonical input/hash/version이 없고, 마지막 version cache가 worker restart 뒤에도 유지되는지 정해지지 않았다.

- 영향: 동등한 페이지를 다르게 계산하거나, 재시작 후 아직 만료되지 않은 과거 signed profile을 다시 받아들일 수 있다.
- 근거: [03](../03-extension-design.md)은 fingerprint match와 cache replay 거부를 요구하지만, persistent high-water mark와 canonicalization을 정의하지 않는다.
- 조치: fingerprint algorithm version, canonical input ordering, hash, mismatch behavior를 서명 claim으로 고정한다. replay 방지의 durable 저장소와 cache reset/rollback 정책을 data policy 및 test plan에 명시한다.
- 완료 조건: 동일 DOM의 결정성, 동적 DOM mismatch, restart 뒤 lower/equal version replay, cache corruption을 검증한다.

### R-14 — 중간 — Managed Storage header 소유권이 충돌함

데이터 정책은 Managed Storage에 비밀이 아닌 client/deployment 식별 header를 허용하지만, LLM 연동 설계는 Managed Storage에는 native host 식별자만 둘 수 있다고 제한한다.

- 영향: 구현자가 extension-readable managed policy에 static header를 넣어 R-03의 header 소유권 원칙을 되돌릴 수 있다.
- 근거: [06](../06-data-audit-and-privacy.md)의 저장소 표와 [04](../04-llm-and-sso-integration.md)의 Host/bridge 구성 소유권이 다르다.
- 조치: 후자의 stricter rule을 단일 기준으로 채택하고 06의 Managed Storage 허용 목록에서 header를 제거한다. 필요하면 header 이름·값 모두 Host/bridge 관리자 ACL 구성의 schema로 관리한다.
- 완료 조건: managed-policy schema와 packaging test가 header key를 거부하고, Host/bridge configuration test만 header allowlist를 수락한다.

## 2차 재검토 발견 사항

### R-16 — 높음 — verifier predicate를 비신뢰 모델이 선택함

`ModelActionProposal`이 `expected.state`와 `expected.navigation`을 포함하고, service worker가 이를 `ActionIntent`에 복사한다. 모델이 이미 참인 상태나 단순 `same-origin` navigation을 선택하면 실제 변경 효과가 없거나 의도하지 않은 경로로 이동해도 verifier가 성공으로 판정할 수 있다. signed Profile에 verifier 선언이 있어도 model proposal과 Profile predicate를 어떻게 결합·대체하는지 닫힌 알고리즘이 없다.

- 영향: 모델 오류 또는 prompt injection이 검증 기준 자체를 약화해 mutation 성공을 거짓으로 만들 수 있다.
- 근거: [12의 proposal schema](../12-low-cost-agent-implementation-spec.md)는 모델이 `expected`를 보내게 하고, [12의 ActionIntent](../12-low-cost-agent-implementation-spec.md)는 같은 필드를 실행 입력에 둔다. [13의 Profile verifier](../13-page-profile-and-business-mcp-contract.md)는 별도 `expected_states`를 선언하지만 두 값의 우선순위와 exact match 규칙이 없다.
- 조치: 모델 schema에서 `expected`를 제거한다. service worker가 signed Profile, 현재 pre-state와 deterministic tool rule로 verifier predicate를 생성한다. navigation verifier는 exact approved path/template과 상태 전이를 요구하고 단순 same-origin만으로 성공 처리하지 않는다.
- 완료 조건: 모델이 verifier field를 보내면 schema 단계에서 거부하고, 이미 참인 expected state·허용되지 않은 same-origin path·no-op action이 `VERIFIED`가 되지 않는 negative test를 추가한다.

### R-17 — 높음 — replay CAS가 정상 동일-version 사용을 차단하고 rollback namespace가 분산됨

Host high-water 규칙은 낮거나 같은 `profile_version`을 모두 거부한다. 반면 resolver transport 오류의 cache fallback도 동일 profile/version으로 Host replay CAS를 다시 통과해야 한다. 첫 version 17을 수락한 뒤 같은 정상 version 17을 새 run이나 새 tab에서 다시 확인하면 거부되므로 정상 반복 사용과 명시된 cache fallback을 동시에 구현할 수 없다. 또한 high-water key가 matcher와 fingerprint를 포함해, 같은 profile ID의 matcher/fingerprint가 바뀌면 더 낮은 version을 별 key에서 처음 보는 값처럼 수락할 수 있다.

- 영향: 첫 실행 뒤 production Ask/Act가 `PROFILE_UNAVAILABLE`로 막히거나, key 변형으로 profile 전역 rollback 방지 의도가 약해진다.
- 근거: [03의 replay 규칙](../03-extension-design.md)은 같은 version을 거부하고, [13의 cache 규칙](../13-page-profile-and-business-mcp-contract.md)은 cache 사용 때 CAS를 다시 요구한다.
- 조치: high-water를 최소 `(deployment_id, profile_id)`에 결속한다. 연산은 `higher version → advance`, `same version + same signed-payload digest → idempotent accept`, `same version + different digest 또는 lower version → reject`로 정의한다. matcher/fingerprint 변경 허용 여부는 version 상승과 signed payload digest로 검증한다.
- 완료 조건: 첫 수락 뒤 동일 signed profile의 새 run/tab/cache fallback은 성공하고, 같은 version의 다른 body와 더 낮은 version은 matcher/fingerprint 변경 여부와 무관하게 거부되는 Host contract test를 추가한다.

### R-18 — 높음 — Business MCP subject가 현재 exact page record에 결속되지 않음

fingerprint는 동일 화면의 다른 업무 record에서 같도록 설계됐다. Profile matcher도 path prefix만 서명하지만, `subject_token`은 resolver가 현재 exact origin/path에 대해 발급한다. extension→Host 요청은 Profile JWS와 field/tool ID만 보내므로 Host는 JWS가 현재 `/cases/123`용인지 `/cases/456`용인지 독립적으로 확인할 수 없다.

- 영향: SPA 전환, stale cache 또는 구현 오류로 이전 record의 authoritative 값이 현재 record에 표시되거나 모델에 전달될 수 있다.
- 근거: [14](../14-semantic-projection-fingerprint.md)는 record 변경 시 같은 hash를 요구하고, [13의 subject token](../13-page-profile-and-business-mcp-contract.md)은 current origin/path에서 발급되지만 [Host 요청](../13-page-profile-and-business-mcp-contract.md)에는 현재 exact page context를 검증할 claim이 없다.
- 조치: resolver request nonce와 canonical exact-page context의 privacy-preserving identifier를 JWS claim에 서명한다. service worker는 현재 page에서 다시 계산한 값을 확인하고 Host request에도 보내며, Host는 JWS claim·run·request nonce의 exact match를 요구한다. cache key에도 exact page-context binding을 포함한다.
- 완료 조건: 같은 profile/fingerprint를 가진 두 record 사이에서 JWS, subject token, cache와 late MCP response를 교차 사용하면 extension과 Host 양쪽에서 거부되는 contract/E2E test를 추가한다.

### R-19 — 높음 — document registration이 Chrome document identity에 결속되지 않음

`DOCUMENT_REGISTER`는 content script가 보낸 `tab_id`, `frame_id`, `document_epoch`, `registration_nonce`를 사용하고 service worker는 sender tab/frame과 nonce 형식을 검사한다. 그러나 sender가 제공한 tab/frame metadata가 authoritative하며, content가 생성한 nonce의 형식 검사는 freshness나 현재 document임을 증명하지 않는다. worker 재시작 뒤에는 메모리의 이전 epoch도 없어 늦은 문서와 현재 문서를 안정적으로 구분할 수 없다.

- 영향: stale/prerendered/frozen document의 registration 또는 late message가 현재 run의 document로 채택될 수 있다.
- 근거: [12의 registration schema](../12-low-cost-agent-implementation-spec.md)는 Chrome document ID 없이 content 주장 필드에 의존한다. Chrome `MessageSender`는 Chrome 106부터 `documentId`, `documentLifecycle`, `frameId`, `tab`을 제공한다. [Chrome runtime API](https://developer.chrome.com/docs/extensions/reference/api/runtime/)
- 조치: content-origin message에서 `tab_id`와 `frame_id`를 권한 근거로 사용하지 않고 `sender.tab.id`, `sender.frameId`, `sender.documentId`, 허용 lifecycle을 채택한다. `document_epoch`는 `sender.documentId`에 결속한 내부 nonce로만 사용한다. 최소 Chrome version을 이 API가 있는 버전 이상으로 고정한다.
- 완료 조건: forged tab/frame, 같은 tab/frame의 old document, prerender/frozen lifecycle, worker restart 뒤 competing registration과 late message를 거부하는 실제 Chrome E2E를 추가한다.

### R-20 — 높음 — `agentic-read`의 Host→gateway wire schema가 닫히지 않음

extension의 `CALL_PAGE_BUSINESS_TOOL`은 `tool_id`와 `arguments`를 보내지만 Host→gateway 예시는 authoritative-field 호출용 `field_id`와 `subject_token`만 포함하고 agentic arguments를 포함하지 않는다. 성공 response도 `field_id`, `value_kind`, `display_value`만 정의하는 반면 agentic result는 `result_key` 추출을 요구한다.

- 영향: 구현자가 agentic argument를 버리거나 임의 wire shape를 만들고, response validation과 visibility enforcement도 서로 달라진다.
- 근거: [13의 extension request](../13-page-profile-and-business-mcp-contract.md), [gateway request/response](../13-page-profile-and-business-mcp-contract.md), [agentic result 처리](../13-page-profile-and-business-mcp-contract.md)가 하나의 schema로 연결되지 않는다.
- 조치: `GET_AUTHORITATIVE_FIELD`와 `CALL_PAGE_BUSINESS_TOOL`의 Host→gateway request/response를 별도 closed schema로 정의한다. agentic schema에는 Registry 검증을 마친 closed `model_enum` argument와 profile의 exact `result_key/value_kind`만 허용한다.
- 완료 조건: 두 call kind의 valid/invalid fixtures, argument 전달, result-key mismatch, nested/raw result rejection과 visibility별 출력 contract test를 추가한다.

### R-21 — 높음 — effect 기반 위험 분류와 primitive별 고정 R1/R2가 충돌함

정책은 target·profile·현재 상태를 보고 더 높은 위험도를 적용한다고 하지만 Company Tool 표는 text/select/checkbox를 최대 R1로 제한하고 R2 executor는 click/key만 허용한다. 실제 업무 페이지의 `input`, `change`, checkbox click은 autosave, 외부 전송 또는 상태 변경을 일으킬 수 있다.

- 영향: R2여야 하는 업무 변경이 확인 없이 R1 경로로 실행되거나, 위험을 올바르게 계산했어도 실행 계약이 없어 구현자가 임의로 처리한다.
- 근거: [02의 위험 분류와 도구 표](../02-security-policy.md), [12의 R1 executor](../12-low-cost-agent-implementation-spec.md), [12의 R2 executor](../12-low-cost-agent-implementation-spec.md)가 서로 다른 경계를 둔다.
- 조치: 모든 mutation primitive가 signed Profile의 effect/risk declaration에 따라 R2로 승격될 수 있게 한다. autosave·server-side effect를 검증할 authoritative predicate가 없으면 해당 target을 거부한다. primitive와 risk/confirmation pipeline을 분리한다.
- 완료 조건: text/select/checkbox autosave fixture가 R2 confirmation과 business verifier를 요구하고, 선언이 없으면 `TARGET_NOT_ACTIONABLE`로 끝나는 E2E를 추가한다.

### R-22 — 중간 — Native Messaging process/port 수명 계약이 상충함

Host 구현 규칙은 stdin에서 frame 하나만 읽고 connection을 닫는 형태지만 다른 계약은 long-lived native port, stream cancellation, `BIND_SESSION → ISSUE_CONFIRMATION → VERIFY_CONFIRMATION` 상태를 요구한다. 요청별 `sendNativeMessage()` 프로세스라면 cancellation과 in-memory confirmation 상태를 유지할 수 없고, `connectNative()` port라면 여러 frame을 읽어야 한다.

- 영향: 구현 방식에 따라 cancellation이 무효가 되거나 confirmation state가 프로세스 종료와 함께 사라진다.
- 근거: [12의 Native Messaging 규칙](../12-low-cost-agent-implementation-spec.md)은 one frame만 읽고, [04](../04-llm-and-sso-integration.md)는 streaming/cancellation과 다단계 Host state를 요구한다. Chrome은 `connectNative()`는 port가 끊길 때까지 Host를 유지하고 `sendNativeMessage()`는 메시지마다 새 Host process를 시작한다. [Chrome Native Messaging](https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging)
- 조치: 한 방식을 명시적으로 선택한다. persistent port라면 framed read loop, correlation, cancellation, disconnect cleanup을 정의하고, 요청별 process라면 OS 보호 shared state와 cancellation 불가 범위를 재설계한다.
- 완료 조건: 선택한 process model의 multi-request confirmation, cancellation, disconnect, process crash와 state cleanup을 실제 Host integration test로 검증한다.

### R-23 — 중간 — Chrome storage access level이 trust boundary를 시행하지 않음

설계는 content script가 Managed Storage에 직접 접근하지 않고 local storage에는 비민감 run/audit 정보만 둔다고 선언하지만 Chrome storage access level을 잠그는 startup 계약이 없다. Chrome의 `storage.managed`와 `storage.local`은 기본적으로 content script에 노출된다.

- 영향: content script compromise 또는 모듈 경계 실수로 정책 bundle, deployment ID, resolver 식별자와 run/audit metadata를 직접 읽을 수 있어 선언한 `content → service worker` 경계를 우회한다.
- 근거: [03의 모듈·Managed Storage 경계](../03-extension-design.md)와 [06의 저장소 표](../06-data-audit-and-privacy.md)는 접근 금지를 전제한다. Chrome은 두 storage area의 기본 content-script 노출과 `setAccessLevel()` 제어를 명시한다. [Chrome storage API](https://developer.chrome.com/docs/extensions/reference/api/storage/)
- 조치: service worker 초기화의 첫 단계에서 managed/local storage를 `TRUSTED_CONTEXTS`로 제한하고 성공 전 run을 받지 않는다. 가능하면 transient run state는 기본 비노출 `storage.session` 또는 worker memory를 사용한다.
- 완료 조건: content script에서 managed/local policy·audit 접근이 실패하고 service worker만 읽을 수 있음을 실제 Chrome E2E와 startup failure test로 검증한다.

### R-24 — 중간 — fingerprint visibility 요구가 자기모순임

canonicalization은 `visible=false` node를 배열에서 제거하므로 visibility가 바뀌면 node 수, ordinal과 relation이 달라져 hash가 바뀐다. 하지만 필수 검증은 현재 `visible` 값 변경이 hash에 영향을 주지 않아야 한다고 요구한다.

- 영향: 구현자가 filtering 규칙과 golden/negative test 중 하나를 임의로 무시하고, SPA profile 재해결 빈도가 구현마다 달라진다.
- 근거: [14의 변환 1단계](../14-semantic-projection-fingerprint.md)는 invisible node를 제외하고, [14의 필수 검증](../14-semantic-projection-fingerprint.md)은 visible state가 hash에 들어가지 않음을 요구한다.
- 조치: visibility가 profile identity인지 결정한다. identity라면 필수 검증 문구를 제거하고 visibility transition에 따른 profile invalidation을 명시한다. identity가 아니라면 fingerprint 전용 collector는 hidden semantic node도 안정적으로 포함하되 모델 snapshot에는 계속 노출하지 않는다.
- 완료 조건: 같은 node의 visibility toggle golden pair와 SPA tool revocation 기대값을 하나의 결정으로 고정한다.

## 반영한 결정 순서

아래 순서는 닫힌 R-08~R-24의 결정 기록이다.

1. R-08의 LLM-scoped target identifier를 결정하고 model/Host/action schema를 맞췄다.
2. R-09의 content-owned document epoch registration과 run state transition을 확정했다.
3. R-10에 따라 S1을 preview-only로 축소하고 실제 Ask의 Profile/Host 선행 계약을 S5로 이동했다.
4. R-11의 R2 binding IPC schema와 R-12의 프로그램적 activation 지원 Profile을 확정했다.
5. R-13 fingerprint/replay cache와 R-14 header ownership을 data·deployment·verification 문서에 일관되게 반영했다.
6. R-15 value-bearing tool의 model 비노출 slot·digest·atomic consume을 확정했다.
7. R-16 verifier 소유권을 service worker로 옮기고 no-op/exact navigation transition을 고정했다.
8. R-17 replay namespace와 idempotent same-version CAS를 확정했다.
9. R-18 exact page-context digest/nonce를 JWS·cache·Host·gateway에 관통시켰다.
10. R-19 Chrome sender document identity/lifecycle을 registration 권한 근거로 채택했다.
11. R-20 Business MCP의 두 call kind request/response를 closed schema로 분리했다.
12. R-21 mutation primitive와 effect/risk/confirmation pipeline을 분리했다.
13. R-22 persistent Native port 수명과 cancellation/disconnect cleanup을 고정했다.
14. R-23 storage trust boundary와 R-24 visibility identity를 Chrome E2E/golden pair 검증에 연결했다.
15. 각 항목의 negative test 계획을 [10-sprint-verification-plan.md](../10-sprint-verification-plan.md)에 넣었다. 구현 전이므로 모든 Sprint는 [11-sprint-progress.md](../11-sprint-progress.md)의 `Planned` 상태를 유지한다.

## 참고

- Chrome Native Messaging: <https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging>
- Chrome `scripting` API: <https://developer.chrome.com/docs/extensions/reference/api/scripting>
- Chrome extension API reference: <https://developer.chrome.com/docs/extensions/reference/api>
