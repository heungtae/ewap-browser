# S0 — 개발·패키지 기반

Node 22, pnpm 9, TypeScript build, MV3 manifest, local fixture, Windows/Linux Chrome smoke와 package 생성을 확립한다. 제품은 Chrome profile 소유자를 유일한 로컬 사용자로 간주하며 제품 계정, SSO, 조직 RBAC, service account, 중앙 session과 Cloud Sync를 위한 runtime·permission·dependency를 포함하지 않는다.

완료 조건: clean checkout build, unit test, unpacked extension load, package manifest 검사와 제품 인증·동기화 surface 부재 snapshot. 이후 Sprint가 `debugger` 같은 권한을 추가하면 S0의 manifest snapshot 검증을 함께 갱신해야 한다. Windows/Linux clean profile에서 별도 제품 로그인 없이 설치되고 로컬 Chrome profile 밖의 사용자 identity·subscription·sync token을 생성하거나 요청하지 않음을 확인한다.
