# EWAP Browser / ContextPilot 설계서

ContextPilot은 한 사용자가 자신의 Chrome profile에 설치해 현재 로그인 세션을 대상으로 Ask/Act 작업을 실행하는 로컬 우선 MV3 확장이다. 현재 검증된 제품 계정/SSO/조직 RBAC/Cloud Sync는 없으며 managed PDP/evidence 연결은 부분 구현이다. LLM 연결은 사용자가 설치·선택하는 provider plugin과 로컬 설정으로 구성한다.

[Platform alignment](platform-alignment.md)는 2026-09-06의 실제 구현 인벤토리, AS-IS/TO-BE, 계약 충돌과 후속 과제의 기준이다. 공유 EWAP 계약이 최우선이며 Platform 설계의 Proposed 기능을 현재 Browser 지원으로 읽지 않는다. 과거 sprint·참고자료는 당시 기록이며 최신 통합 상태를 대체하지 않는다.

- [Platform 정렬과 AS-IS/TO-BE](platform-alignment.md)
- [아키텍처](01-architecture.md)
- [보안 및 행동 정책](02-security-policy.md)
- [확장 설계](03-extension-design.md)
- [LLM provider plugin과 인증](04-llm-provider-plugin.md)
- [배포](05-deployment-operations.md)
- [데이터, 감사 및 개인정보 경계](06-data-audit-and-privacy.md)
- [검증](07-verification-and-release.md)
- [Sprint 설계 인덱스](08-sprint-design.md)
- [Sprint 개발 계획](09-sprint-development-plan.md)
- [Sprint 검증 계획](10-sprint-verification-plan.md)
- [Sprint 진행 상태](11-sprint-progress.md)
- [구현 실행 명세](12-low-cost-agent-implementation-spec.md)
- [사이트 도구 및 모델 계약](13-site-tool-contract.md)
- [Semantic Projection 계약](14-semantic-projection-fingerprint.md)
- [Level 2 Bounded CDP adapter](15-bounded-cdp-adapter.md)
- [반도체 데모 사이트](16-semiconductor-demo.md)
- [Claude 브라우저 기능 채택 설계](17-claude-browser-capability-adoption-design.md)
- [Claude 브라우저 기능 채택 검증계획](18-claude-browser-capability-verification-plan.md)
- [탭 범위 Chat Session과 LLM 문맥 설계](19-tab-scoped-chat-session-design.md)
- [안정성 중심 구조 리팩터링 설계](20-stability-refactoring-design.md)
- [선언형 다단계 Act Workflow 설계](21-declarative-act-workflow-design.md)
- [Page Profile 배포·신뢰·MCP 설계](22-page-profile-provider-design.md)
- [Service Worker composition 리팩터링 계획](23-service-worker-composition-refactoring-plan.md)

## 비규범 참고자료

- [읽기 전용 참고자료](references/README.md) — 배경 이해와 비교 검토에만 사용하며 요구사항, 설계 결정, 구현 또는 검증 근거로 사용하지 않는다.
