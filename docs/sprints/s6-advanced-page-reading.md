# S6 — 현재 페이지 고급 읽기

## 목표와 종료 범위

[33번 Ask 현재 경로](../33-ask-request-execution-current-implementation.md)의
읽기 도구를 현재 Browser build에서 검증한다. 최초 `all_dom` semantic snapshot의
bounded 부분집합으로 `read_page`, `get_page_text`, `find`, `read_batch`를
실행한다. `screenshot`은 정책이 허용한 경우 활성 run 탭의 viewport만
`chrome.tabs.captureVisibleTab`으로 읽고, `zoom`은 같은 run에서 보관한
이미지의 정규화 영역만 자른다. `tabs_context`는 현재 run의 활성 탭
하나만 반환한다.

`activeTab` 선언만으로 Side Panel 실행에 일시 접근권이 생기지는 않는다.
사용자가 Settings에서 선택적으로 `<all_urls>` 전체 사이트 권한을 허용한
경우에만 모델 screenshot을 사용할 수 있다. Chrome API가 이 넓은 권한을
요구하므로 설정에 범위를 명시한다. 별도 HTTP Provider는 이 권한으로
허용되지 않으며 해당 host의 독립적인 허용 기록을 요구한다. 권한이 없거나 회수되면
`VISION_CAPTURE_UNAVAILABLE`로 닫고, 기본 HTTPS host 권한과 HTTP
Provider host의 개별 허용 조건은 유지한다. 권한 회수는 Chrome 확장
프로그램의 사이트 접근 설정에서 수행한다.

S6는 virtualized/paginated 전체 collection 수집이 아니다. 새 DOM read,
scroll, API/export adapter와 복수 source 승인은 [28번 Collection Reading](../28-collection-reading-strategy-design.md)의
S6-R/S13 범위다. 다중 tab group 소유권, CDP `Page.captureScreenshot`,
optional rerank 모델, screenshot card·annotation은 33번의 현재 Ask 경로에
없으므로 이 로컬 종료 조건에서 삭제한다. Vision에는 mutation 좌표 권한이
없으며 기존 CDP mutation allowlist는 변경하지 않는다.

## 현재 Browser 계약

| 카드 | 계약 | 종료 증거 |
| --- | --- | --- |
| S6-C1~C3 | schema v2, 기본 `all_dom`, hidden reason과 ref/focus/depth. content walk 12,000 element·1,500 candidate·1,000 projection node 상한, 모델 snapshot의 read cap | 실제 Chrome hidden/visible/sensitive matrix, closed validator, truncation과 hidden ref의 mutation 거부 |
| S6-C4~C5 | 최초 snapshot의 visible article text와 deterministic role/name find. 결과는 ref·visibility를 표시하고 DOM을 새로 읽지 않음 | article/empty/hidden scope·exact/partial·20개 cap·잘못된 인수 검사 |
| S6-C6 | 정책·현재 active tab 확인 뒤 viewport JPEG; run-scoped transient capture의 normalized zoom, 1.4MB cap | 실제 Chrome capture/zoom tool turn, inactive/disabled/out-of-bounds 거부, 종료 시 release와 진단·저장 비노출 |
| S6-C7 | `tabs_context`가 last-focused window의 run tab 하나만 반환 | title control char 및 URL query/fragment 제거, 다른 active tab이면 거부 |
| S6-C8 | `read_batch`는 snapshot-only `read_page`/`get_page_text`/`find` 1~8개를 입력 순서로 실행 | 모든 item의 closed schema를 먼저 검증, mutation/nested/unknown 거부, 3MB 결과 cap, 취소 신호 검사 |
| S6-C9~C10 | Provider tool result는 `[UNTRUSTED_TOOL_RESULT]`로 전달, timeline은 tool별 순서 유지 | 실제 HTTPS Provider와 Side Panel의 read tool 호출·결과, credential/DOM instruction 음성 검사 |

## 완료 조건

- 현재 적용 가능한 [18번 READ/SEC-READ/FIND/VIS/TAB/BATCH 검증계획](../18-claude-browser-capability-verification-plan.md)을
  위의 33번 snapshot-only·single-tab·`chrome.tabs.captureVisibleTab`
  경계로 재판정하고 수행한 항목과 제외한 항목을 증거에 명시한다.
- 초기 Ask와 `read_page` 기본 scope는 `all_dom`이다. hidden node는
  읽기 결과에 visibility를 갖고 나타날 수 있으나 mutation 대상이 아니다.
- password/OTP/API key 원문, URL userinfo/query/fragment, script/style
  source, cookie/localStorage는 구조화된 projection과 텍스트 tool result에 없다.
  cross-origin frame와 closed shadow root의 내부 DOM을 읽지 않는다.
- 허용된 screenshot은 viewport 픽셀 자체를 Provider에 전송하므로 화면에
  보이는 민감 정보가 이미지에 포함될 수 있다. 이 범위는 선택 권한과
  screenshot policy로 제어한다.
- screenshot과 zoom은 provider tool 결과에만 transient로 사용하며
  storage/audit/diagnostics/export에 이미지·base64를 남기지 않는다.
- 단위·fixture·실제 Chrome 증거를 `docs/evidence/s6-closure-2026-09-25.md`에
  기록하고 `docs/sprint-progress.md`에 판정을 연결한다.
