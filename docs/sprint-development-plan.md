# Sprint 개발 계획서

## Browser 리뷰 후속 우선순위 (2026-10-01)

[S10-R](sprints/s10-r-page-api-request-cancellation.md)은 Completed 상태의 P1
수정 스프린트다. 원래 요청에 결속된 dispatch hook, runner의 비동기 단계별
취소 검사, 실제 lifecycle 결합 테스트, Chrome Stop/새 요청 검증까지 완료했다.
S13 분석 연결과 S15 배포를 선행 조건으로 요구하지 않는다.

## Enterprise Web AI Platform 정렬 (2026-08-31)

S0\~S9는 폐기하지 않고 Browser Runtime foundation으로 취급한다.
S10·S11·S12·S13·S14는 각각 Browser 로컬 Profile 수락, Business MCP
binding, managed policy fail-closed, redacted Act evidence, 기록된
워크플로우 비교 경계만 완료한다. Enterprise Platform 연동은 이 완료 범위에
포함되지 않으며 S15와 별도 계약 작업에서 이어간다.

1.  S10: 현행 Browser compact JWS Page Profile의 claim/path/version
    검증과 Worker 재시작을 견디는 로컬 replay high-water.
2.  S11: 현행 signed Profile의 closed Business MCP binding, HTTPS
    endpoint·argument 검증, 호출 직전 page/Profile 재검사, bounded result와
    모델 catalog 비노출.
3.  S12: Browser 로컬 managed 설정 손상/읽기 실패, PDP allow/deny/outage,
    응답 크기·schema, Act의 로컬 권한 교집합을 fail-closed로 검증한다.
    SSO/RBAC·중앙 approval·`managed-auto`는 현재 완료 범위에서 제외한다.
4.  S13: Browser 로컬 Act policy·terminal AuditEvent의 closed metadata,
    선택적 managed HTTPS sink의 상태·실패 격리와 UNKNOWN 보존.
    중앙 Audit Service의 인증·receipt·retention은 완료 범위에서 제외한다.
5.  S14: Browser 로컬 `semantic-projection-fp-v1`로 기록된 워크플로우와
    complete 현재 projection을 비교하고, 불완전 관찰·구조 변경·범위
    불일치를 구분해 선택/시작 시 재검사한다. Studio Capture, L0\~L6,
    Change/Impact는 완료 범위에서 제외한다.
6.  S15: Managed Chrome force-install/config, KMS/HSM trust,
    on-prem/air-gap, clean-profile upgrade/rollback/revoke evidence.

## 순서

1.  S0: Node, pnpm, MV3 build, Linux Chrome fixture와 package 생성, 제품
    계정·SSO·Cloud Sync surface 부재 baseline
2.  S1: document registration, projection, `ref_id`/`model_ref`, Page
    Profile Resolver 설정·검증, Ask chat UI와 browser credential 비노출
3.  S2: capability registry, per-host permission card, R0-R3와
    credential target 거부, preflight, confirmation, DOM executor, Level
    2 bounded CDP adapter, action-scoped attach/detach와 verifier
4.  S3: provider plugin manifest/SDK/registry/host, OpenAI-compatible
    내장 plugin, core-owned API key/header 인증과 OAuth/token surface
    거부
5.  S4: plugin 설치·선택·version lifecycle, provider secret
    write/redacted-read 경계, Profile-bound Business MCP transport, 연결
    시험, local-network endpoint, secret 없는 import/export와 redacted
    diagnostics
6.  S5: closed Chat event, streaming/resync, virtual transcript, tool
    timeline, permission/action modal, screenshot/tab/plan card,
    접근성과 반응형 UI
7.  S6: hidden DOM 기본 `all_dom` projection, focused `read_page`,
    `get_page_text`, deterministic `find`, screenshot/zoom, tab
    context와 read-only batch
8.  S7: generic Page Profile action registry, 기존 mutation
    coordinator·bounded CDP의 실제 Act 연결, verifier, Stop/recovery와
    demo 외 Chrome E2E
9.  S8: `standard`, `follow_a_plan`, `skip_all_permission_checks` mode와
    permission-less hard-policy security matrix
10. S9: Linux Community Browser Runtime 로컬 release candidate의
    설치·업데이트·rollback, provider 인증/행동 인가 evidence

각 Sprint는 code, unit test, Chrome E2E, 상태 원장 증적을 같은 변경
세트로 가진다. 인증과 인가 검증은 웹사이트 session, 제품 사용자
identity, provider credential, browser 행동 permission을 서로 다른
경계로 다룬다. S2는 fixture뿐 아니라 synthetic input을 거부하는
staging-equivalent control을 포함하고, product CDP allowlist와 외부 E2E
CDP harness를 별도 test surface로 검증한다. S5\~S9의 상세 계약과 test
ID는 [17. 채택 설계](17-claude-browser-capability-adoption-design.md)와
[18. 검증계획](18-claude-browser-capability-verification-plan.md)을
따른다. Claude artifact는 behavior reference일 뿐 build input이나 복사
source가 아니다.
