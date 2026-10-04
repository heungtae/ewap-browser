# Chrome 요청 테스트 실행 결과

2026-10-04, Browser 0.1.90 산출물, 실제 Chrome와 Side Panel, 로컬 통제 Provider.

총 36/36개 실행: **31개 통과, 5개 실패**.
테스트 종료 코드 1. 외부 live Provider 추론이나 localhost origin 호환성 검증은 포함하지 않는다.

[실행 방법](chrome-request-tests.md), [원본 요청](example-request-messages.md).
원시 결과: `/tmp/contextpilot-example-requests-complete/summary.json`.

## 확인된 실패

- 2.1.2: 특정 조건의 테이블 읽기 요청에 bounded analysis context가 전달되지 않음.
- 2.3.1: Category/Status별 Grid 분석 요청에 bounded analysis context가 전달되지 않음.
- 2.7.1, 2.7.2: 전체 20행 표시의 Recent orders에서 헤더 포함 6개 레코드만 읽었지만 coverage=complete.
- 2.7.3: 전체 15항목 표시의 Feature requests에서 5개만 읽었지만 coverage=complete.

원인 근거: `analysis-data-acquisition.ts`의 분석 의도 판별은 분석/요약 등의 키워드와
데이터 종류 사이 32자 범위에 의존한다. '정리' 문구와 긴 Category/Status 요청이
수집 단계로 진입하지 않는다. `collection-read-orchestrator.ts`의 정적 읽기 경로는
truncated 여부로 complete를 결정하며 별도 논리적 전체 수보다 적게 읽은 상황을
반영하지 않는다. 이번 변경은 테스트이며 해당 runtime 동작을 수정하지 않았다.

Page API 설명의 두 번째 요청은 설명 페이지 안의 공개 DOM 테이블을 읽었다.
페이지 API 함수/getter 호출은 0이며, 이 읽기는 API 실행과 구분한다.

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
| 2.1.2 | 이 페이지의 테이블에서 Status가 Active인 계정의 Name과 Role을 정리해줘. 실제로 읽은 데이터 범위도 알려줘.                                                       | FAIL |
| 2.2.1 | 이 페이지의 목록 데이터를 읽고 작업 제목과 현재 상태를 요약해줘. 읽은 항목 수와 전체 항목 수를 구분해서 알려줘.                                                 | PASS |
| 2.3.1 | 이 페이지의 그리드 데이터를 읽고 Category별 항목 수와 Status별 항목 수를 분석해줘. 실제 수집 수, 전체 행 수, 분석에 제공된 행 수와 잘림 여부를 구분해서 알려줘. | FAIL |
| 2.3.2 | 이 페이지의 그리드 데이터를 분석해줘. 실제로 몇 행을 읽었는지와 전체를 읽었다는 근거를 알려줘. 일부만 읽었다면 그 범위 안에서 요약해줘.                         | PASS |
| 2.4.1 | 이 페이지의 테이블 데이터를 읽고 월별 Revenue와 Growth를 분석해줘. Revenue가 가장 높은 월과 가장 낮은 월을 알려줘. 실제로 읽은 월 수와 데이터 범위도 표시해줘.  | PASS |
| 2.4.2 | 이 페이지의 차트 데이터 전체를 분석해줘. 차트 자체에서 수치를 읽을 수 없다면 그 제한을 알려줘.                                                                  | PASS |
| 2.5.1 | 이 페이지의 테이블 데이터를 읽고 월별 Revenue와 Growth를 분석해줘. Revenue가 가장 높은 월과 가장 낮은 월, 읽은 데이터 행 수를 알려줘.                           | PASS |
| 2.5.2 | 이 페이지의 차트에서 전체 월별 수치를 읽고 분석해줘. 읽을 수 없는 수치는 추정하지 말고 지원 범위를 알려줘.                                                      | PASS |
| 2.6.1 | 이 페이지의 테이블 전체 데이터를 읽고 Department별 인원 수를 분석해줘. 현재 페이지만 읽을 수 있다면 그 제한과 실제로 읽은 행 수를 명시해줘.                     | PASS |
| 2.7.1 | 이 페이지의 데이터를 분석해서 요약해줘. 여러 데이터 대상이 있으면 먼저 내가 분석 대상을 선택할 수 있게 해줘.                                                    | FAIL |
| 2.7.2 | 이 페이지의 테이블 데이터를 읽고 주문 금액과 Status를 요약해줘. 여러 테이블이 있으면 분석 대상을 먼저 확인해줘.                                                 | FAIL |
| 2.7.3 | 이 페이지의 목록 데이터를 읽고 기능 요청 내용을 요약해줘. 실제로 읽은 항목 수와 전체 수로 표시된 값을 구분해줘.                                                 | FAIL |
| 2.8.1 | 이 페이지의 그리드 데이터를 읽고 행 수와 각 열의 내용을 요약해줘. 실제로 수집한 범위와 잘림 여부를 알려줘.                                                      | PASS |
| 3.1   | 이 페이지가 안내하는 Page API 탐색 대상과 제외 대상을 설명해줘. 공개 함수 후보 발견과 실제 함수 호출의 차이도 구분해줘.                                         | PASS |
| 3.2   | 이 페이지에 표시된 API 탐색의 기대 결과와 경계 확인 조작을 요약해줘.                                                                                            | PASS |
