# ISS-20261012-005: 페이지 수집 전체의 10초 제한과 수집 항목 표시 누락

## 관리 정보

- 상태: 검증 중
- 발생일·최근 갱신: 2026-10-12 KST
- 발생 버전: 0.1.107; 진단 request `36012be2-2d4b-4fa1-893b-990b08b5d925`
- 분석 revision: `c0ae91f72` + 기존 작업트리; 수정은 미커밋
- 다음 작업: 원래 사용자 사이트에서 항목별 수집과 시간 초과 재현 확인
- 관련 회귀: ISS-20261011-004의 이동 후 문서·URL binding

## 증상과 원인

Worker가 `CONTENT_SNAPSHOT` 전체 응답에 10초를 적용해 시작 후 10,014ms에
`PAGE_SNAPSHOT_TIMEOUT`으로 종료됐다. 요소·상태, Workflow, 본문·기사 텍스트를
동일 응답 전에 수집했다. Provider 호출과 액션 실행 전 실패다.
Content trace 833,622건 누락으로 원래 사이트의 어느 수집 항목이 지연됐는지는
확정하지 않았다. 상세 추적 부하나 DOM 탐색 비용은 가능성이며 검증된 근본 원인이 아니다.

## 수정

- Worker의 현재 읽기는 `CONTENT_SNAPSHOT_PART`로 문서 등록, 요소·상태,
  Workflow 선언, 본문 텍스트, 기사 텍스트를 순차 요청한다. 각 요청은 별도 10초
  예산을 갖는다. 제한 초과 detail에 안전한 항목 ID를 남긴다.
- 문서 epoch, 페이지 scope epoch, URL binding을 각 응답에 대조하고 마지막
  URL·문서 등록 검사도 유지한다. 초기 Ask/Act 요청의 취소 상태를 항목 사이에 검사한다.
- 각 항목 시작 시 바인딩된 패널에 진행 표시를 전달한다. 실행 중인 활성 탭만 표시한다.
- Provider 본문 event에 출처를 보존하고 **실행 상세 창**에서 응답 첫 부분에 `ai `를 표시한다.
  대화 응답에는 접두사를 붙이지 않는다. 수집 항목도 실행 상세 창에 기록한다.
  스트리밍 조각마다 반복하지 않으며 로컬 승인·검증 안내에는 붙이지 않는다.
- 기존 내부 `CONTENT_SNAPSHOT` 호출은 호환성을 위해 유지했다. Provider 메시지나
  페이지 원문에는 UI 접두사를 삽입하지 않는다. 권한·민감정보 마스킹은 유지한다.

## 검증과 한계

- Unit: 관련 125 files / 557 tests PASS. 새 회귀는 전체 40초/각 항목 8초 성공,
  단일 항목 10초 실패, 후속 항목 미실행, stale 문서·URL 거절, 수집기 분리,
  스트리밍 접두사와 로컬 안내 구분을 확인한다.
- `tsc --noEmit`, ESLint, module boundaries PASS.
- 버전 증가 없는 `pnpm exec tsc -p tsconfig.build.json` + 빌드 + package validation PASS.
- `scripts/chrome-page-collection-smoke.mjs`: Linux Chrome for Testing 통제 HTTPS
  fixture에서 다섯 수집 항목 표시, Provider 응답 접두사, event 출처 보존 PASS.
- 화면: [ai 응답 표시](../../evidence/page-collection-ai-label-2026-10-12.png).
- 이전 이동 후 문서·URL binding 회귀는 관련 unit suite에 포함돼 PASS.
- 원래 사용자 사이트, 실제 Provider, 사용자 설치 갱신·배포는 미검증.
  기존 요청 전체의 180초 budget은 유지한다. 실행 중인 수집 자체가 메인 스레드를
  막으면 Worker timeout은 종료하지만 해당 Content 동기 작업을 강제 중단하지 않는다.

## 이력

- 2026-10-12: 진단 분석 및 사용자 요청 구현, unit/통제 Chrome 확인. 실제 사이트
  확인이 남아 검증 중으로 유지한다. 원본 진단 ZIP과 민감 원문은 저장하지 않았다.

- 2026-10-12 사용자 정정: `ai ` 위치를 대화 응답에서 실행 상세 창으로 이동했다.
  수집 항목과 Provider 응답을 최대 50개 항목, 응답당 4,000자로 표시하며 진단 refresh 후에도
  유지한다. 이 표시 이력은 패널 메모리에서만 관리하고 ZIP이나 저장소에 추가하지 않는다.
