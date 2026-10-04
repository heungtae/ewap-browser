# Chrome 요청 테스트 실행 결과

2026-10-04, Browser 0.1.90 산출물, 실제 Chrome와 Side Panel, 로컬 통제 Provider.

총 36/36개 실행: **36개 통과, 0개 실패**.
테스트 종료 코드 0. 외부 live Provider 추론이나 localhost origin 호환성 검증은 포함하지 않는다.
전체 단위 테스트 478개, 타입 검사, 컴파일, 패키지 검증과 메서드 계측 검증도 통과했다.

[실행 방법](chrome-request-tests.md), [원본 요청](example-request-messages.md).
원시 결과: `/tmp/contextpilot-example-requests-fixed/summary.json`.

## 기존 실패 5개 수정과 재검증

수정 전 31개 통과/5개 실패에서 수정 후 36개 모두 통과했다.

- 2.1.2: '정리'도 분석 의도로 인식하여 조건 분석 요청에 테이블 데이터를 전달한다.
- 2.3.1: 데이터 종류와 분석 표현 사이의 32자 제한을 제거하여 긴 Category/Status 요청도 수집한다. 서로 다른 문장의 표현을 합쳐 읽기 요청으로 판단하지 않는다.
- 2.7.1, 2.7.2: Recent orders의 전체 수 표시보다 적게 읽은 경우 coverage=partial, reason=NO_EOF_EVIDENCE. 헤더 포함 실제 수집은 6개 레코드다.
- 2.7.3: Feature requests의 전체 15항목 중 5개 수집을 coverage=partial, reason=NO_EOF_EVIDENCE로 구분한다.

`collection-read-orchestrator.ts`의 정적 읽기는 DOM 행 수와 descriptor의 전체 수
힌트 중 큰 값을 보존하고, 수집 수가 이보다 작으면 complete로 판정하지 않는다.
수집 cap에 걸린 경우의 기존 CAP_REACHED 사유는 유지한다.

Page API 설명의 두 번째 요청은 설명 페이지 안의 공개 DOM 테이블을 읽었다.
페이지 API 함수/getter 호출은 0이며, 이 읽기는 API 실행과 구분한다.
공유 계약과 Platform 구현은 변경하지 않았으며 Platform/교차 저장소 통합 테스트는 실행하지 않았다.

## 요청별 결과

| 항목  | 요청                                                                                                                                                            | 결과 |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| 1.1   | 이 페이지의 입력 필드와 버튼, 현재 선택 상태를 알려줘.                                                                                                          | PASS |
| 1.2   | Search query에 browser test를 입력해줘.                                                                                                                         | PASS |
| 1.3   | Notes에 테스트 메모를 입력해줘.                                                                                                                                 | PASS |
| 1.4   | Report scope를 Detailed로 선택해줘.                                                                                                                             | PASS |
| 1.5   | Include detailed results를 체크해줘.                                                                                                                            | PASS |
| 1.6   | Generate preview를 눌러줘.                                                                                                                                      | PASS |
| 1.7   | Generate preview를 눌러줘.                                                                                                                                      | PASS |
| 1.8   | Generate local preview 워크플로우를 실행해줘.                                                                                                                   | PASS |
| 1.9   | Search query에 deny test를 입력해줘.                                                                                                                            | PASS |
| 1.10  | Activity 탭을 선택해줘.                                                                                                                                         | PASS |
| 1.11  | Open local menu를 눌러줘.                                                                                                                                       | PASS |
| 1.12  | Mark reviewed를 눌러줘.                                                                                                                                         | PASS |
| 1.13  | Open confirmation dialog를 눌러줘.                                                                                                                              | PASS |
| 1.14  | Close dialog를 눌러줘.                                                                                                                                          | PASS |
| 1.15  | Open additional visible text를 펼쳐줘.                                                                                                                          | PASS |
| 1.16  | Disabled action을 눌러줘.                                                                                                                                       | PASS |
| 1.17  | Account password 값을 알려줘.                                                                                                                                   | PASS |
| 1.18  | Controls 링크로 이동해줘.                                                                                                                                       | PASS |
| 1.19  | State examples 링크로 이동해줘.                                                                                                                                 | PASS |
| 1.20  | External example 링크를 열어줘.                                                                                                                                 | PASS |
| 2.1.1 | 이 페이지의 테이블 데이터를 읽고 전체 행 수, Role별 인원 수, Status별 인원 수를 요약해줘. 실제 수집 수와 분석에 사용한 행 수, 데이터가 잘렸는지도 알려줘.       | PASS |
| 2.1.2 | 이 페이지의 테이블에서 Status가 Active인 계정의 Name과 Role을 정리해줘. 실제로 읽은 데이터 범위도 알려줘.                                                       | PASS |
| 2.2.1 | 이 페이지의 목록 데이터를 읽고 작업 제목과 현재 상태를 요약해줘. 읽은 항목 수와 전체 항목 수를 구분해서 알려줘.                                                 | PASS |
| 2.3.1 | 이 페이지의 그리드 데이터를 읽고 Category별 항목 수와 Status별 항목 수를 분석해줘. 실제 수집 수, 전체 행 수, 분석에 제공된 행 수와 잘림 여부를 구분해서 알려줘. | PASS |
| 2.3.2 | 이 페이지의 그리드 데이터를 분석해줘. 실제로 몇 행을 읽었는지와 전체를 읽었다는 근거를 알려줘. 일부만 읽었다면 그 범위 안에서 요약해줘.                         | PASS |
| 2.4.1 | 이 페이지의 테이블 데이터를 읽고 월별 Revenue와 Growth를 분석해줘. Revenue가 가장 높은 월과 가장 낮은 월을 알려줘. 실제로 읽은 월 수와 데이터 범위도 표시해줘.  | PASS |
| 2.4.2 | 이 페이지의 차트 데이터 전체를 분석해줘. 차트 자체에서 수치를 읽을 수 없다면 그 제한을 알려줘.                                                                  | PASS |
| 2.5.1 | 이 페이지의 테이블 데이터를 읽고 월별 Revenue와 Growth를 분석해줘. Revenue가 가장 높은 월과 가장 낮은 월, 읽은 데이터 행 수를 알려줘.                           | PASS |
| 2.5.2 | 이 페이지의 차트에서 전체 월별 수치를 읽고 분석해줘. 읽을 수 없는 수치는 추정하지 말고 지원 범위를 알려줘.                                                      | PASS |
| 2.6.1 | 이 페이지의 테이블 전체 데이터를 읽고 Department별 인원 수를 분석해줘. 현재 페이지만 읽을 수 있다면 그 제한과 실제로 읽은 행 수를 명시해줘.                     | PASS |
| 2.7.1 | 이 페이지의 데이터를 분석해서 요약해줘. 여러 데이터 대상이 있으면 먼저 내가 분석 대상을 선택할 수 있게 해줘.                                                    | PASS |
| 2.7.2 | 이 페이지의 테이블 데이터를 읽고 주문 금액과 Status를 요약해줘. 여러 테이블이 있으면 분석 대상을 먼저 확인해줘.                                                 | PASS |
| 2.7.3 | 이 페이지의 목록 데이터를 읽고 기능 요청 내용을 요약해줘. 실제로 읽은 항목 수와 전체 수로 표시된 값을 구분해줘.                                                 | PASS |
| 2.8.1 | 이 페이지의 그리드 데이터를 읽고 행 수와 각 열의 내용을 요약해줘. 실제로 수집한 범위와 잘림 여부를 알려줘.                                                      | PASS |
| 3.1   | 이 페이지가 안내하는 Page API 탐색 대상과 제외 대상을 설명해줘. 공개 함수 후보 발견과 실제 함수 호출의 차이도 구분해줘.                                         | PASS |
| 3.2   | 이 페이지에 표시된 API 탐색의 기대 결과와 경계 확인 조작을 요약해줘.                                                                                            | PASS |
