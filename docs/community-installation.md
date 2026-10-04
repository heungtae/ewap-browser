# Community 0.1.88 설치와 지원 범위

Community는 Platform과 EWAP 제품 계정 없이 사용한다. 모델 Provider는 사용자가
직접 준비한다. Provider 비용과 사용 가능 여부는 해당 서비스에 따른다.
현재 검증 범위는 Linux x86_64 / Chrome for Testing 147.0.7727.15의
로컬 ZIP을 풀어 설치하는 경로다. Windows, Chrome Web Store 설치 및 외부
live Provider/운영 사이트는 검증하지 않았다. 대외 공개 릴리스는 아직 아니다.

## 설치

1. `dist/contextpilot-0.1.88.zip`을 별도 폴더에 압축 해제한다.
2. Chrome의 `chrome://extensions`에서 개발자 모드를 켠다.
3. **압축해제된 확장 프로그램을 로드합니다**로 해당 폴더를 선택한다.
4. 확장 프로그램의 옵션에서 OpenAI-compatible Provider URL, 모델과 필요한
   인증 정보를 입력하고 저장한다. 제품 계정 로그인은 필요하지 않다.
5. 작업할 웹 페이지에서 Chrome Side Panel의 ContextPilot을 열어 Ask 또는
   Act를 선택한다. 요청된 권한과 실행 검토를 확인한 뒤 진행한다.

API key는 Settings에서 저장하며 내보내기나 진단 파일에 포함되지 않는다.
HTTP localhost/사설망 Provider는 명시적 사이트 접근 권한이 필요하다.
권한 질문 생략은 기본값이 아니며 확인 문구가 필요하다. credential 차단,
위험 작업 확인, 저장된 deny와 제한 페이지 정책은 유지된다.

## 지원 기능과 경계

- Ask/Act, OpenAI-compatible chat/responses, 선언형 Provider plugin 관리,
  Settings와 권한 철회, streaming과 Stop, Panel 재연결.
- 페이지 읽기/찾기, 허용한 screenshot/zoom, 단일 table/grid/list 읽기와
  분석 데이터 획득. 모호하거나 지원하지 않는 데이터/adapter는 차단한다.
- 로컬 기록 Workflow의 조회·선택 및 실행 전 페이지 재검증.
- redacted diagnostics와 ZIP export.
- 일반 페이지의 Act는 지원하는 페이지 기반 action/검증 경계에 한정한다.
  임의 클릭과 모든 사이트 자동화의 성공을 보장하지 않는다. signed Profile과
  Profile-bound MCP는 선택 기능이며 해당 Resolver/fixture 설정이 별도로 필요하다.
- Enterprise 관리 설정이 있으면 손상·읽기 실패·PDP deny/장애를 차단한다.
  관리 정책을 삭제하거나 Community로 자동 전환하여 우회하지 않는다.

## 업데이트와 복구

Chrome을 종료하고 현재 확장 폴더를 백업한다. 같은 폴더 경로에 새 ZIP 내용을
교체한 뒤 Chrome을 재시작한다. 복구는 Chrome 종료 후 같은 경로에 이전 ZIP
내용을 복원한다. 다른 경로에 새 확장으로 설치하면 기존 확장 ID와 저장소의
보존을 기대할 수 없다. 현재 검증한 조합은 0.1.87 → 0.1.88 → 0.1.87이다.
Provider 공개 설정, permission mode와 저장된 deny를 확인했다. 이전 대화는
browser session 데이터라 Chrome 재시작 후 유지되지 않는다. 실제 credential
보존과 다른 schema 버전 간 migration은 이번 검증에 포함되지 않는다.

## 재현

`npm run test:chrome-community`는 깨끗한 Chrome profile에서 Platform 설정
없이 Ask/Act를 실행하고 Resolver/business 요청 0건, 승인·권한·입력값 gate,
secret 비노출과 debugger detach를 확인한다. `CHROME_FOR_TESTING_BIN`이 필요하다.
빌드/패키징은 `npm run build`, `npm run test:release`, `npm run package:local`이다.
`build`는 patch 버전을 올린다. 동일 artifact 재생성에는
`node scripts/build-extension.mjs`를 사용한다.

[현재 검증 증거](evidence/community-readiness-2026-10-04.md)를 따른다.
