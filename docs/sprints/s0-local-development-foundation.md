# S0 — 개발·패키지 기반

Node 22, pnpm 9, TypeScript build, MV3 manifest, local fixture, Linux Chrome for Testing smoke와 package 생성을 확립한다. Community 로컬 모드는 Chrome profile 소유자를 사용자로 취급하며 별도 제품 계정·SSO·중앙 session·Cloud Sync를 요구하지 않는다. 후속 Enterprise용 managed policy/identity 코드는 선택적 경계로 존재할 수 있으며, 그 존재 자체를 S0 실패로 판정하지 않는다.

완료 조건: 현재 커밋의 clean checkout build, unit test, unpacked extension/Service Worker/Side Panel load, package manifest 검사와 필수 제품 인증·동기화 surface 부재 snapshot. 이후 Sprint가 `debugger` 같은 권한을 추가하면 S0의 manifest snapshot 검증을 함께 갱신해야 한다. Linux의 격리된 새 Chrome profile에서 별도 제품 로그인 없이 로드되고 Community 로컬 시작에 identity·subscription·sync token이 필수 아님을 확인한다. Windows 설치 증거는 S0 `Completed` 조건에서 제외하며 Windows 배포 판정에서 별도로 수집한다.
