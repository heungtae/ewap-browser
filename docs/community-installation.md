# Community 설치·업데이트·복구

현재 빌드의 이름·버전·최소 Chrome 버전·권한은 [manifest](../extension/manifest.json),
개발 명령은 [package.json](../package.json)에서 확인한다. 기능별 실행 경로는
[코드 안내](source-guide.md)를 따른다. Provider 연결 정보는 사용자가 Settings에서 준비한다.

## 빌드와 로컬 설치

설치된 개발 의존성으로 버전을 올리지 않고 현재 코드를 빌드·패키징한다.
처음 개발 환경을 준비할 때는 [테스트 가이드](test.md#범위와-사전-검증)를 따른다.

```bash
pnpm exec tsc -p tsconfig.build.json
node scripts/build-extension.mjs
pnpm validate:package
pnpm package:local
```

1. 로컬 개발은 Chrome의 `chrome://extensions`에서 개발자 모드를 켜고
   **압축해제된 확장 프로그램을 로드합니다**로 `dist-extension/`을 선택한다.
2. ZIP 설치는 패키징 결과의 `dist/contextpilot-<version>.zip`을 별도 폴더에
   압축 해제하고 그 폴더를 같은 방식으로 로드한다. 버전은 명령 출력에서 확인한다.
3. 확장 옵션의 Settings에서 Provider URL·모델·인증 정보를 저장한다.
4. 작업할 웹 페이지에서 ContextPilot Side Panel을 열고 Ask 또는 Act를 실행한다.
   페이지·소스·vision 접근 권한과 계획·동작 검토는 실제 UI 안내를 따른다.

패키지 생성은 공개 업로드·Chrome Web Store 배포와 구분한다.
`pnpm build`와 `pnpm test`는 patch 버전을 올리므로 위의 재생성 명령과 구분한다.

## 설정과 문제 확인

API key는 Settings의 secret 입력으로 저장한다. 공유용 설정·진단에는 실제 key나
인증 header를 넣지 않는다. 설정을 수정한 뒤 Provider 연결 시험과 새 요청으로 확인한다.
HTTP localhost·사설망 Provider는 해당 사이트 접근 권한이 필요하다.

권한을 철회하거나 permission mode를 변경하면 새 요청으로 동작을 확인한다.
managed 설정이 요구하는 외부 서비스가 실패할 때는 관리 설정을 제거해 우회하지 않는다.
실패 원인은 Side Panel의 실행 상세·진단에서 확인하고, 재현 시 확장 버전·명령·환경과
민감값을 제거한 결과를 기록한다. [메서드 진단](reference/method-execution-diagnostics.md)을 참조한다.

## 업데이트와 복구

Chrome을 종료하고 현재 확장 폴더를 백업한다. 같은 경로에 새 ZIP 내용을 교체한 뒤
Chrome을 재시작한다. 복구는 Chrome 종료 후 같은 경로에 이전 ZIP을 복원한다.
다른 경로에 설치하면 기존 확장 ID와 저장소의 보존을 기대할 수 없다.
대화는 browser session 데이터이므로 Chrome 재시작 후 영구 보존을 전제로 하지 않는다.

Settings·Provider 공개 설정·실제 credential·저장된 deny·schema migration을 각각 확인한다.
업데이트 전후의 버전·artifact digest·설치 경로·Chrome/OS·검증 결과를 남긴다.

## 검증 기록과 재현

[2026-10-04 Community 증거](evidence/community-readiness-2026-10-04.md)는
Linux Chrome for Testing의 unpacked ZIP 설치와 0.1.87 → 0.1.88 → 0.1.87 검증 기록이다.
Windows·스토어 설치·대외 업로드·실제 credential migration의 검증을 뜻하지 않는다.
이 기록의 버전과 PASS를 새 패키지의 결과로 재사용하지 않는다.

`CHROME_FOR_TESTING_BIN`을 지정하고 `pnpm test:chrome-community`로 Platform 없이
시작하는 통제 fixture 경로를, `pnpm test:chrome-s9`로 로컬 update/rollback 경로를 검증한다.
나머지 Chrome·live 실행은 [테스트 가이드](test.md), 실제 공개 배포·Enterprise 통합은
[후속 backlog](sprints/community-release-enterprise-followup.md)를 따른다.
