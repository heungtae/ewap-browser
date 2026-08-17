# 09. Sprint 개발 계획서

## 순서

1. S0: Node, pnpm, MV3 build, Chrome fixture와 package 생성
2. S1: document registration, projection, `ref_id`/`model_ref`, Ask UI
3. S2: capability registry, per-host permission card, preflight, confirmation, DOM executor, Level 2 bounded CDP adapter, action-scoped attach/detach와 verifier
4. S3: provider plugin manifest/SDK/registry/host, OpenAI-compatible 내장 plugin, core transport와 key/header validation
5. S4: plugin 설치·선택·version lifecycle, provider 연결 시험, local-network endpoint, secret 없는 import/export와 redacted diagnostics
6. S5: Windows/Linux 단일 Chrome profile 설치·업데이트, bundled plugin registry snapshot, package smoke와 release evidence

각 Sprint는 code, unit test, Chrome E2E, 상태 원장 증적을 같은 변경 세트로 가진다. S2는 fixture뿐 아니라 synthetic input을 거부하는 staging-equivalent control을 포함하고, product CDP allowlist와 외부 E2E CDP harness를 별도 test surface로 검증한다.
