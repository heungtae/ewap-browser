# ContextPilot / EWAP Browser

현재 Chrome 페이지를 대상으로 Ask/Act를 실행하는 로컬 우선 Manifest V3 확장이다.
TypeScript 구현은 [extension/src](extension/src)에 있다.

현재 동작과 계약의 SSOT는 코드와 설정이다. 문서는 코드를 찾고 설치·검증하며
실행 이력을 확인하는 데 사용한다.

- [문서 안내](docs/README.md)
- [코드 탐색 안내](docs/source-guide.md)
- [설치·업데이트·복구](docs/community-installation.md)
- [개발·테스트 실행](docs/test.md)
- [검증 증거](docs/evidence/README.md)
- [Sprint 이력과 남은 작업](docs/sprints/README.md)
- [기여 규칙](AGENTS.md)

패키지 매니저는 `package.json`에 고정된 `pnpm@9.15.4`를 사용한다.
`pnpm build`와 `pnpm test`는 확장 버전을 올린다.
버전을 유지하는 빌드 명령은 [테스트 가이드](docs/test.md#범위와-사전-검증)를 따른다.
