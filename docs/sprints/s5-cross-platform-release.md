# S5 — Windows/Linux 단일 사용자 배포

Windows와 Linux의 clean Chrome profile에서 extension package 설치, 업데이트, provider plugin API/registry, Settings schema 호환과 rollback을 검증한다. 설치와 설정은 로컬 사용자가 소유하며 별도 제품 로그인, SSO, 조직 RBAC, service account, Cloud Sync, 관리형 사용자·조직 정책 배포는 출시 범위에 포함하지 않는다. 웹사이트 로그인과 MFA는 기존 Chrome session에서 사용자가 직접 수행한다.

완료 조건: 두 OS의 clean profile 설치와 별도 제품 인증 surface 부재, `debugger` 권한 설명과 bounded CDP allowlist snapshot, 선언형/bundled provider 설정, Ask/Act capability × host permission과 R2/R3 flow, credential 입력 거부, provider core-owned 인증, secret 없는 export·diagnostics, trusted-input smoke, attached-session leak 0, plugin/extension upgrade와 rollback 증적. 출시물에는 사용자 identity, API key/header, browser credential, OAuth/access/refresh/sync token이 없어야 한다.
