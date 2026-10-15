# ISS-20261012-006: 수동 페이지 데이터 읽기 실패와 기능 제거

## 관리 정보

- 상태: 검증 중
- 발생일·최근 갱신: 2026-10-12 KST
- 발생 버전: 0.1.108; 수정은 기존 작업트리 위의 미커밋 변경
- 관련 이슈: ISS-20261012-005의 Ask/Act 페이지 수집과 구분한다.
- 다음 작업: 유지된 Act 분석 Chrome의 최종 응답 timeout 별도 확인

## 증상과 확인 범위

사용자 화면에서 수동 “페이지 데이터 읽기” 버튼을 누르면 INTERNAL_FAILURE가
표시되고 재클릭 시 새 표시가 없었다. 패널의 미등록 오류 코드가 INTERNAL_FAILURE로
표시되며 동일 실패의 반복 표시를 생략하는 코드를 확인했다. 권한 필요 응답을
sendRuntime이 예외로 던져 수동 권한 창에 도달하지 못하는 별도 문제도 확인했다.
스크린샷의 최초 탐색 실패 원인은 확정하지 않았다.

## 처리

사용자 요청으로 기능을 제거했다. 버튼·객체 선택·권한·진행 polling·결과 UI와
COLLECTION_DISCOVER/READ_START/READ_NEXT/READ_CANCEL/READ_STATE의 전용
handler·등록·전용 unit을 삭제한다. 공용 collection discovery·reader·orchestrator와
Ask/Act 분석 및 Component 도구의 권한·취소·문서 결속은 유지한다.

기존 수동 Chrome 검사는 UI 부재와 폐기된 메시지 INVALID_ARGUMENT 거부 검사로
전환한다. Ask/Act 분석 Chrome 검사는 수동 읽기를 이용한 사전 권한 설정 대신
실제 분석 대화의 요청 한정 권한 승인으로 실행한다. 과거 증거는 당시 revision의
이력으로 보존한다. 일반 오류 UI 변경이나 최초 실패의 원인 수정은 이 제거에 포함하지 않는다.

## 검증

- typecheck·lint·module boundaries PASS.
- 공용 수집·reader·Component·Ask/Act 분석 관련 unit 7파일/47개 PASS.
- 버전 유지 빌드·package validation PASS, 0.1.108 유지.
- Chrome for Testing: test:chrome-collection에서 버튼 부재와 폐기된 7개 메시지 거부 PASS.
- 유지된 Ask/Act 분석 Chrome: Ask는 실제 요청 한정 권한 승인 후 완료.
  Act도 권한 창과 승인을 진행했으나 최종 fixture 응답 대기 20초 timeout으로
  전체 suite FAIL. 원인을 이 제거로 확정하지 않으며 이후 행렬은 미실행이다.
  삭제 자체의 Chrome acceptance는 통과했으나 공유 경로 전체의 runtime 회귀가
  남아 검증 중으로 유지한다.
- 사용자 설치 갱신·원래 사이트·실제 Provider·배포는 미검증.

## 이력

- 2026-10-12: 사용자 화면 확인 후 요청에 따라 수동 기능 제거. 기존 ISS-20261012-005의
  snapshot 항목별 수집·진행 표시 변경은 보존했다.
