# Company Web Agent 설계 리뷰 — 2026-08-15

## 결론

설계의 fail-closed, R3 거부, `UNKNOWN` 재시도 금지, 감사 allowlist 원칙은 일관적이다. 그러나 S1의 페이지 의미 정보 수집 방식과 S4의 로컬 신뢰 경계에는 구현 전에 확정해야 하는 공백이 있다. 아래 높음 등급 항목을 해결하기 전에는 S0의 manifest/계약을 확정하거나 S1 구현을 시작하지 않는다.

## 검토 범위

- `docs/01-architecture.md` ~ `docs/07-verification-and-release.md`
- Sprint 설계·개발·검증·현황 문서: `docs/08-sprint-design.md` ~ `docs/11-sprint-progress.md`
- Chrome MV3의 현재 Native Messaging·host permission·scripting 제약

## 처리 현황과 반영 추적

아래 표는 이 리뷰의 각 지적이 이후 설계에 어떻게 처리됐는지 기록하는 단일 기준이다. 설계 문서를 수정할 때 해당 행을 함께 갱신한다. 단순히 문구를 바꾼 경우에는 `반영`으로 표시하지 않으며, 해당 위험을 닫는 결정·계약·검증이 있어야 한다.

| ID | 처리 상태 | 결정 및 근거 | 반영 문서·검증 | 최종 확인일 |
|---|---|---|---|---|
| R-01 | Pending | - | - | - |
| R-02 | Pending | - | - | - |
| R-03 | Pending | - | - | - |
| R-04 | Pending | - | - | - |
| R-05 | Pending | - | - | - |
| R-06 | Pending | - | - | - |
| R-07 | Pending | - | - | - |

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
- 근거: [03-extension-design.md](../03-extension-design.md)의 최소 manifest 원칙과 Managed Storage 계약, [08-sprint-design.md](../08-sprint-design.md)의 S1/S2 경계가 충돌한다.
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
- 근거: [01-architecture.md](../01-architecture.md)의 Page Profile 규칙과 [08-sprint-design.md](../08-sprint-design.md)의 S5 범위.
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

## 권장 결정 순서

1. R-01 semantic projection 또는 별도 AX 접근 경로를 결정한다.
2. R-02와 R-04의 origin/host permission 단일 source of truth를 정한다.
3. R-03의 Host↔bridge 인증 채널과 고정 헤더 소유권을 정한다.
4. R-05의 ActionIntent·confirmation·value 수명 계약을 정한다.
5. R-06의 Profile trust contract와 R-07의 검증 항목을 문서에 반영한다.
6. 위 결정 후 S0을 시작한다. 모든 Sprint는 현재 [11-sprint-progress.md](../11-sprint-progress.md)의 `Planned` 상태를 유지한다.

## 참고

- Chrome Native Messaging: <https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging>
- Chrome `scripting` API: <https://developer.chrome.com/docs/extensions/reference/api/scripting>
- Chrome extension API reference: <https://developer.chrome.com/docs/extensions/reference/api>
