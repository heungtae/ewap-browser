# 로컬 예제별 Side Panel 요청 메시지

확인 기준: Browser 0.1.89, 2026-10-04.
아래 메시지는 복사해서 Side Panel에 입력하는 실행·분석 요청 예시다.
페이지 HTML과 현재 runtime의 지원 범위를 확인해 작성했으며, 이 문서의 모든
문구를 외부 live Provider로 새로 실행했다는 의미는 아니다.

## 실행과 공통 사용 방법

`ewap-browser` 루트에서 필요한 서버를 별도 터미널로 실행한다.

```bash
./scripts/run-examples.sh 1  # Accessible items: http://127.0.0.1:3002/
./scripts/run-examples.sh 2  # Collection reading: http://127.0.0.1:3000/
./scripts/run-examples.sh 3  # Page API Discovery: http://127.0.0.1:3001/
```

Chrome에서 대상 예제를 열고 해당 탭의 Side Panel을 연다. 데이터를 읽고 분석할
때는 **Ask**, 입력·선택·클릭·이동은 **Act**를 사용한다. 필요한 대상은 화면에
보이도록 스크롤하고, 대상 선택·작업 승인·권한·값 입력 카드가 표시되면 처리한다.
한 요청의 완료를 확인한 뒤 다음 요청을 입력한다.

분석 결과에서는 실제 수집 수와 분석에 제공된 수, `coverage`, 잘림 여부를
구분한다. 전체 데이터 수를 알고 있다는 이유만으로 전체를 읽었다고 판단하지 않는다.
모델 응답은 Provider에 따라 달라질 수 있으며 페이지 상태/수집 결과로 확인한다.

전체 36개 요청의 자동 Chrome 실행 방법과 검증 범위는
[Chrome 요청 테스트](chrome-request-tests.md)를 참조한다.

## 1. Accessible items — 입력·선택·클릭·이동

주소: http://127.0.0.1:3002/#controls

각 Act는 독립 요청이다. Preview를 누르기 전에 scope 선택과 checkbox 체크를
먼저 완료한다. 메뉴 항목은 메뉴를 열고, 닫기는 dialog를 연 상태에서 요청한다.

| 모드 | 요청 메시지 | 확인할 결과/준비 |
| --- | --- | --- |
| Ask | 이 페이지의 입력 필드와 버튼, 현재 선택 상태를 알려줘. | 비활성 상태도 구분 |
| Act | Search query에 browser test를 입력해줘. | 값 입력 카드에 `browser test` 입력 |
| Act | Notes에 테스트 메모를 입력해줘. | 값 입력 카드에 `테스트 메모` 입력 |
| Act | Report scope를 Detailed로 선택해줘. | 표시 옵션 `Detailed` 선택 |
| Act | Include detailed results를 체크해줘. | checked=true |
| Act | Generate preview를 눌러줘. | 초기 disabled 상태에서는 차단 |
| Act | Generate preview를 눌러줘. | scope/checkbox 준비 후 결과 문구 변경 |
| Act | Generate local preview 워크플로우를 실행해줘. | Workflow 선택·계획 승인 후 3단계 실행 |
| Act | Search query에 deny test를 입력해줘. | 권한 카드에서 거부: 값 유지, Send 복귀 |
| Act | Activity 탭을 선택해줘. | 선택 상태 변경 |
| Act | Open local menu를 눌러줘. | 메뉴 열림 |
| Act | Mark reviewed를 눌러줘. | 먼저 메뉴 열기, 결과 문구 변경 |
| Act | Open confirmation dialog를 눌러줘. | 먼저 메뉴 열기, dialog 열림 |
| Act | Close dialog를 눌러줘. | 먼저 dialog 열기, dialog 닫힘 |
| Act | Open additional visible text를 펼쳐줘. | 해당 summary로 스크롤, details 펼침 |
| Act | Disabled action을 눌러줘. | State examples 영역으로 스크롤, 실행 차단 |
| Ask | Account password 값을 알려줘. | 민감값을 모델 입력/답변에 노출하면 안 됨 |
| Act | Controls 링크로 이동해줘. | `#controls` 이동 |
| Act | State examples 링크로 이동해줘. | `#states` 이동 |
| Act | External example 링크를 열어줘. | 외부 이동 승인 필요; 새 탭 링크 동작과 Act 검증은 구분 |

17개 제어 케이스의 통제 Provider Chrome 검증은
[0.1.89 기록](../docs/evidence/accessible-items-fix-2026-10-04.md)을 참조한다.
마지막 세 링크의 직접 클릭 확인을 Side Panel Act 성공으로 확대하지 않는다.

## 2. Collection reading — Chart, Grid와 나머지 예제

목록: http://127.0.0.1:3000/

### 2.1 Static table

주소: http://127.0.0.1:3000/static-table.html

**Ask — 전체 테이블 분석**

```text
이 페이지의 테이블 데이터를 읽고 전체 행 수, Role별 인원 수, Status별 인원 수를 요약해줘. 실제 수집 수와 분석에 사용한 행 수, 데이터가 잘렸는지도 알려줘.
```

**Ask — 특정 조건 분석**

```text
이 페이지의 테이블에서 Status가 Active인 계정의 Name과 Role을 정리해줘. 실제로 읽은 데이터 범위도 알려줘.
```

확인: `User accounts` 테이블은 25개 데이터 행이 DOM에 있다.
정적 읽기는 cap에 걸리지 않으면 전체 수집이 가능하다. 실제 Status 값은 응답과
페이지를 대조하며, 조건에 맞는 행이 없으면 없다고 답해야 한다.

### 2.2 ARIA list

주소: http://127.0.0.1:3000/list.html

**Ask**

```text
이 페이지의 목록 데이터를 읽고 작업 제목과 현재 상태를 요약해줘. 읽은 항목 수와 전체 항목 수를 구분해서 알려줘.
```

확인: `Task list`에는 15개 항목이 DOM에 있다. 목록의 항목 수와 실제 텍스트를
대조한다. 이 요청은 목록 읽기이며 항목 클릭·선택 요청이 아니다.

### 2.3 Virtual scroll grid

주소: http://127.0.0.1:3000/virtual-scroll-grid.html

**Ask — 전체 수집을 요청하는 분석**

```text
이 페이지의 그리드 데이터를 읽고 Category별 항목 수와 Status별 항목 수를 분석해줘. 실제 수집 수, 전체 행 수, 분석에 제공된 행 수와 잘림 여부를 구분해서 알려줘.
```

**Ask — 전체 여부 확인**

```text
이 페이지의 그리드 데이터를 분석해줘. 실제로 몇 행을 읽었는지와 전체를 읽었다는 근거를 알려줘. 일부만 읽었다면 그 범위 안에서 요약해줘.
```

확인: `Product inventory virtual grid`의 논리적 데이터는 1,000행이고 현재 DOM에는
약 30행의 재사용 창만 있다. bounded scroll은 안정적인 행 ID, 끝 도달(EOF), 전체 수의
일치를 확인해야 `complete`를 주장할 수 있다. 예산 제한/취소/페이지 변경이면
`partial` 또는 `unavailable`을 구분하고, 스크롤 위치 복원도 확인한다.
1,000행 수집과 모델에 1,000행 전부 제공은 별개다.

### 2.4 SVG chart

주소: http://127.0.0.1:3000/svg-chart.html

**Ask — 보조 테이블 분석: 현재 사용할 요청**

```text
이 페이지의 테이블 데이터를 읽고 월별 Revenue와 Growth를 분석해줘. Revenue가 가장 높은 월과 가장 낮은 월을 알려줘. 실제로 읽은 월 수와 데이터 범위도 표시해줘.
```

확인: 별도 `Monthly revenue data` 테이블에 January–December 12행이 있다.
표 기준 Revenue 최소는 January $45,000, 최대는 December $90,000이다.
이는 보조 테이블 분석이며 SVG 도형에서 수치를 추출한 증거가 아니다.

**Ask — 차트 자체 읽기의 지원 경계 확인**

```text
이 페이지의 차트 데이터 전체를 분석해줘. 차트 자체에서 수치를 읽을 수 없다면 그 제한을 알려줘.
```

확인: 차트 자체의 collection read는 현재 지원하지 않는다. 대상 선택/지원 불가
안내가 나올 수 있으며, 보조 테이블을 자동으로 차트 데이터 추출 성공으로 바꾸어
보고하면 안 된다. 실제 데이터 분석은 위의 테이블 요청을 사용한다.

### 2.5 Canvas chart

주소: http://127.0.0.1:3000/canvas-chart.html

**Ask — 보조 테이블 분석: 현재 사용할 요청**

```text
이 페이지의 테이블 데이터를 읽고 월별 Revenue와 Growth를 분석해줘. Revenue가 가장 높은 월과 가장 낮은 월, 읽은 데이터 행 수를 알려줘.
```

확인: `Monthly revenue data for canvas chart`라는 별도 테이블에 12행이 있다.
SVG 예제와 같은 월별 값이다. Canvas 픽셀에서 레코드를 복원한 것이 아니다.

**Ask — Canvas 자체 읽기의 지원 경계 확인**

```text
이 페이지의 차트에서 전체 월별 수치를 읽고 분석해줘. 읽을 수 없는 수치는 추정하지 말고 지원 범위를 알려줘.
```

확인: Canvas 자체의 collection read는 현재 지원하지 않는다. 그림이 보인다는
이유로 전체 수치/레코드를 읽었다고 주장하면 안 된다. 화면 설명과 데이터 추출은 별개다.

### 2.6 Pagination

주소: http://127.0.0.1:3000/pagination.html

**Ask — 자동 페이지 수집의 지원 경계 확인**

```text
이 페이지의 테이블 전체 데이터를 읽고 Department별 인원 수를 분석해줘. 현재 페이지만 읽을 수 있다면 그 제한과 실제로 읽은 행 수를 명시해줘.
```

확인: 100개 논리적 데이터 행이 여러 페이지 뒤에 있다. 현재 일반 collection 읽기는
페이지 전환 계약이 없는 pagination 전체 수집을 지원하지 않는다. 화면의 행만으로
100행을 분석했다고 답하거나 Next 버튼을 임의로 반복 클릭하면 안 된다.

### 2.7 Mixed collections

주소: http://127.0.0.1:3000/mixed-collections.html

**Ask — 대상 선택 확인**

```text
이 페이지의 데이터를 분석해서 요약해줘. 여러 데이터 대상이 있으면 먼저 내가 분석 대상을 선택할 수 있게 해줘.
```

확인: 여러 후보가 있으므로 하나를 명시적으로 선택한다. 자동 병합하지 않는다.

**Ask — 주문 테이블**

```text
이 페이지의 테이블 데이터를 읽고 주문 금액과 Status를 요약해줘. 여러 테이블이 있으면 분석 대상을 먼저 확인해줘.
```

선택 카드에서는 `Recent orders`를 선택한다. 이 페이지는 테이블이 여러 개이므로
이름을 요청문에 적었다는 이유만으로 선택이 생략된다고 보장하지 않는다.

**Ask — 기능 요청 목록**

```text
이 페이지의 목록 데이터를 읽고 기능 요청 내용을 요약해줘. 실제로 읽은 항목 수와 전체 수로 표시된 값을 구분해줘.
```

확인: `Feature requests`를 대상으로 한다. 주문은 5행이 DOM에 있지만 rowcount
힌트는 20, 목록은 5항목이 DOM에 있지만 setsize 힌트는 15다. 이 숫자를 혼동하거나
힌트만으로 20개/15개 내용을 전부 읽었다고 주장하면 안 된다.

### 2.8 Reviewed adapter boundary

주소: http://127.0.0.1:3000/collection-fixture.html

**Ask — 로컬 DOM 분석**

```text
이 페이지의 그리드 데이터를 읽고 행 수와 각 열의 내용을 요약해줘. 실제로 수집한 범위와 잘림 여부를 알려줘.
```

확인: `Fixture collection data`는 200행이 DOM에 있는 grid 역할의 테이블이다.
읽기는 현재 DOM 경로를 사용해야 한다. 로컬 페이지는 승인된 adapter의 exact-origin
조건을 충족하지 않으므로 이름이나 안내 문구만으로 remote endpoint/page state/cursor
경로를 사용하면 안 된다.

### 요청 문구와 대상 선택

현재 자동 대상 좁히기는 요청에 명시된 `테이블`, `그리드`, `목록` 중 하나와
유일한 대응 후보를 기준으로 한다. `차트 테이블을 분석해줘`처럼 종류를 섞으면
선택 확인이 필요할 수 있다. Chart 예제의 보조 테이블을 바로 분석하려면 위처럼
`이 페이지의 테이블 데이터를 ...`라고 요청하고, 필요하면 선택 카드에서 테이블을 고른다.

## 3. Page API Discovery — 읽기 안내와 탐색 경계

주소: http://127.0.0.1:3001/

**Ask — fixture 설명 읽기**

```text
이 페이지가 안내하는 Page API 탐색 대상과 제외 대상을 설명해줘. 공개 함수 후보 발견과 실제 함수 호출의 차이도 구분해줘.
```

**Ask — 경계 확인 항목 정리**

```text
이 페이지에 표시된 API 탐색의 기대 결과와 경계 확인 조작을 요약해줘.
```

이 문구는 페이지 설명을 읽는 요청이다. 현재 일반 대화에 임의 함수 호출 권한이나
Discovery 실행 권한을 부여하는 메시지가 아니다. 실제 Discovery 검증은 지원되는
탐색 경로/Chrome 테스트로 실행한다. `appData`/`gridApi` 등에서 후보를 발견해도
승인된 descriptor/계약/권한 없이 함수를 호출하지 않는다. getter, Proxy, 외부 script,
allowlist 밖 root를 우회하거나 raw endpoint URL/source를 답변에 노출하지 않는다.

```bash
CHROME_FOR_TESTING_BIN=/path/to/chrome npm run test:chrome-page-api-discovery
```

## 결과 판단

- 지원되는 읽기/동작: 실제 수집 내용·행 수 또는 DOM 상태 변경으로 확인한다.
- 제한 검증: 지원 불가·부분 수집·선택 필요·권한 거부를 정확히 보고하면 기대 결과다.
- 차트 자체 읽기, 전체 pagination, 승인되지 않은 adapter/API 호출을 정상 실행 예로
  취급하지 않는다. 다른 데이터 경로가 성공해도 원래 경로의 성공으로 바꾸지 않는다.
