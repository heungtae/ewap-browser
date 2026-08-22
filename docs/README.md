# ContextPilot 설계서

ContextPilot은 한 사용자가 자신의 Chrome profile에 설치해 현재 로그인 세션을 대상으로 Ask/Act 작업을 실행하는 로컬 우선 MV3 확장이다. 별도 제품 계정, SSO, 조직 RBAC, Cloud Sync는 제공하지 않는다. LLM 연결은 사용자가 설치·선택하는 provider plugin과 로컬 설정으로 구성한다.

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

## 비규범 참고자료

- [읽기 전용 참고자료](references/README.md) — 배경 이해와 비교 검토에만 사용하며 요구사항, 설계 결정, 구현 또는 검증 근거로 사용하지 않는다.
