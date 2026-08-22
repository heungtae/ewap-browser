# 09. Sprint 개발 계획서

## 순서

1. S0: Node, pnpm, MV3 build, Chrome fixture와 package 생성, 제품 계정·SSO·Cloud Sync surface 부재 baseline
2. S1: document registration, projection, `ref_id`/`model_ref`, Page Profile Resolver 설정·검증, Ask chat UI와 browser credential 비노출
3. S2: capability registry, per-host permission card, R0-R3와 credential target 거부, preflight, confirmation, DOM executor, Level 2 bounded CDP adapter, action-scoped attach/detach와 verifier
4. S3: provider plugin manifest/SDK/registry/host, OpenAI-compatible 내장 plugin, core-owned API key/header 인증과 OAuth/token surface 거부
5. S4: plugin 설치·선택·version lifecycle, provider secret write/redacted-read 경계, Profile-bound Business MCP transport, 연결 시험, local-network endpoint, secret 없는 import/export와 redacted diagnostics
6. S5: closed Chat event, streaming/resync, virtual transcript, tool timeline, permission/action modal, screenshot/tab/plan card, 접근성과 반응형 UI
7. S6: hidden DOM 기본 `all_dom` projection, focused `read_page`, `get_page_text`, deterministic `find`, screenshot/zoom, tab context와 read-only batch
8. S7: generic Page Profile action registry, 기존 mutation coordinator·bounded CDP의 실제 Act 연결, verifier, Stop/recovery와 demo 외 Chrome E2E
9. S8: `standard`, `follow_a_plan`, `skip_all_permission_checks` mode와 permission-less hard-policy security matrix
10. S9: Windows/Linux 단일 Chrome profile 설치·업데이트·rollback, 전체 사용자·provider 인증/행동 인가 release evidence

각 Sprint는 code, unit test, Chrome E2E, 상태 원장 증적을 같은 변경 세트로 가진다. 인증과 인가 검증은 웹사이트 session, 제품 사용자 identity, provider credential, browser 행동 permission을 서로 다른 경계로 다룬다. S2는 fixture뿐 아니라 synthetic input을 거부하는 staging-equivalent control을 포함하고, product CDP allowlist와 외부 E2E CDP harness를 별도 test surface로 검증한다. S5~S9의 상세 계약과 test ID는 [17. 채택 설계](17-claude-browser-capability-adoption-design.md)와 [18. 검증계획](18-claude-browser-capability-verification-plan.md)을 따른다. Claude artifact는 behavior reference일 뿐 build input이나 복사 source가 아니다.
