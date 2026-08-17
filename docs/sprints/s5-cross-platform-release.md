# S5 — Windows/Linux 단일 사용자 배포

Windows와 Linux의 clean Chrome profile에서 extension package 설치, 업데이트, provider plugin API/registry, Settings schema 호환과 rollback을 검증한다. 설치와 설정은 로컬 사용자가 소유하며 관리형 사용자·조직 정책 배포는 출시 범위에 포함하지 않는다.

완료 조건: 두 OS의 clean profile 설치, `debugger` 권한 설명과 bounded CDP allowlist snapshot, 선언형/bundled provider 설정, Ask/Act permission flow, trusted-input smoke, attached-session leak 0, plugin/extension upgrade와 rollback 증적.
