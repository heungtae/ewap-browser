# 문서 요청 전체 Chrome 테스트

`example-request-messages.md`의 36개 요청을 그대로 Side Panel에 입력한다.
문서에서 문구·순서를 읽으며 Accessible 20개와 Ask 16개의 개수 또는 문구가
달라지면 매핑을 갱신하기 전까지 실패한다. 중복 Preview 요청도 준비 상태가 다른
독립 케이스다.

```bash
# 필요할 때 소스와 Chrome 로딩용 산출물을 동기화한다. 버전은 올리지 않는다.
./node_modules/.bin/tsc -p tsconfig.build.json
node scripts/build-extension.mjs

CHROME_FOR_TESTING_BIN=/path/to/chrome \
EXAMPLE_REQUEST_REPORT_DIR=/tmp/contextpilot-example-requests \
xvfb-run -a npm run test:chrome-example-requests
```

Chrome의 실제 Side Panel, 확장 Service Worker, 페이지 content script와 승인·권한·값
입력 UI를 사용한다. 임시 Chrome 프로필과 로컬 HTTPS 서버는 종료 시 삭제한다.
예제 HTML은 저장소 파일을 그대로 제공하며 기존 localhost 서버 실행은 필요 없다.
기존 프로필과 기존 데모 서버에는 접근하지 않는다. URL은 격리된 HTTPS fixture로
대체하므로 localhost origin 자체의 호환성 시험은 별도다.

Provider는 외부 모델 대신 로컬 통제 응답을 사용한다. 조작은 실제 projection의
opaque ref와 제공된 도구를 이용한다. Ask 응답은 실제 수집 context를 표시한다.
실제 LLM의 한국어 이해·추론 정확성까지 검증하는 테스트는 아니다.

- 입력·선택·체크·workflow·메뉴·dialog·링크: 실제 페이지 변화 확인
- 비활성·권한 거부·password: 실행 차단과 민감값 배제 확인
- Collection: 수집/전달 개수, coverage, 잘림, 명시적 대상 선택, 스크롤 복구 확인
- Chart: 보조 테이블의 12개월과 헤더 1행 구분. 직접 차트 요청은 읽기 불가 또는 선택 요구 확인
- Pagination/Mixed: 전체를 수집하지 못했는데 complete로 표시하면 실패
- Page API 설명: projection이 제공되고 API 함수/getter 호출 없이 답변하는지 확인

`accessible.json`, `reading.json`, `summary.json`에 각 요청, 전후 상태, 실제
Provider 입력 context, 오류를 기록한다. 하나라도 실패하거나 누락되면 종료 코드 1이다.
실패를 예상 결과로 바꾸지 말고 실제 지원 여부 또는 구현 결함으로 조사한다.
공개 예제 데이터를 사용하는 테스트이며 실제 고객 페이지로 대체하지 않는다.
