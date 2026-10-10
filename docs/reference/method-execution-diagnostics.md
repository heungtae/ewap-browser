# 메서드별 debug·trace 진단 기록

[계측 대상 선택](../../scripts/method-trace-instrumentation.mjs)의 `isTraceSource`가
허용하는 번들 모듈의 함수·메서드·constructor·getter·callback을 빌드 시 계측한다.
메서드를 추가하면 동일한 계측이 자동 적용된다. 대상·제외 규칙은 코드에서 확인한다.
`dist-extension/method-trace-coverage.json`은 파일·원본 행/열·메서드 종류별 목록이며,
`pnpm check:method-trace`는 실제 entry point의 번들 입력에서 구한 현재 메서드 목록과
빌드 산출물을 비교하고 async/constructor/getter/default callback/optional chaining
동작을 검사한다. 오래된 산출물·누락·추가 항목은 거부한다.

- debug: `method.enter`, `method.exit`, 조건식·판정값을 포함한 `method.branch`, 명시적 route/Provider 결과 `method.decision`.
- trace: `method.input`, `method.result`. 입력과 반환 데이터의 안전한 텍스트·구조를 보존한다.
- error: `method.throw`. 오류 이름·메시지·stack·closed code와 실행 시간을 기록한다. 잡아서 처리한 오류도 `caught_error` 분기에 남는다.
- 공통: 원본 파일·행/열, `call_id`, `parent_call_id`, timestamp, duration 및 확인 가능한 request/tab/run/session binding. 비동기 실행은 호출 시점의 owner를 우선하며 동시 요청의 context를 공유하지 않는다.

`실행 상세`는 JSON으로 최근 200건/realm과 모든 decision을 표시하고,
표시 건수·전체 건수·표시 축약 여부를 명시한다. ZIP의
`execution-trace.json`에는 lifecycle과 별도로
`data.method_trace.worker/panel/content/offscreen`을 담는다. Worker는 요청 또는 tab
binding으로 필터링한다. Panel/Content/Offscreen은 현재 extension document의
기록이며 request와 직접 결속되지 않은 기록도 있으므로 realm·시간·parent call을 함께 읽는다.
Content/Offscreen 조회는 같은 extension의 Worker sender만 허용하고,
응답은 export에서 다시 검증·마스킹한다. 수집 불가 사유는 다른 realm의 수집을 막지 않는다.

민감 필드, 비밀번호·API key·인증 token·cookie·header·입력값·원문 collection
records·실행용 ref/locator·URL·source·이미지는 마스킹한다. 알려진 credential의
다른 필드 재등장, JSON 안의 credential, bearer/JWT, email·일부 개인정보 형식도
마스킹한다. DOM/class instance의 내부 값과 getter는 읽지 않는다. 각 record의
`detail.masking`에는 `masked`, `fields[{path,reason,count}]`, `truncated`를 남긴다.
안전한 질문·답변·tool 이름·route·coverage·failure reason은 길이/digest만으로
대체하지 않는다. 임의의 비정형 문자열 전체를 비밀값으로 자동 판별할 수 있다는 보장은 없다.

새 extension realm의 메서드 추적은 30분간 trace로 시작한다. 개발 추적 설정의
level을 변경하면 같은 level을 각 realm에 전달하며, 낮은 level로 변경하면
상세 기록을 제거한다. debug/trace 기간이 지나면 error 수준으로 낮춘다.
기록은 30분의 메모리 범위이며 Worker/document 재시작 뒤 메서드 상세는 복원하지
않는다(`persistent=false`). 기존 lifecycle 저장·재시작 판정은 유지한다.

메모리와 ZIP 크기는 제한한다. 최근 chronological buffer에 더해 메서드/request별
최근 event를 별도로 유지해 반복 DOM callback이 앞선 원인 정보를 밀어내는 것을
줄인다. `methods`는 호출·완료·오류 횟수와 소요 시간을 집계한다. 전체 호출 상세를
무제한 보관하지 않으며 `dropped_count`, `evicted_method_samples`, `rejected_count`,
`truncated`로 누락·축약을 명시한다. 실행하지 않은 메서드가 실행 로그에 나타난다는
뜻은 아니며, 빌드 계측 목록과 실제 호출 집계는 구분한다.

Act의 `act.intent.route`는 마스킹된 요청, classifier 응답, 선택 route, 판단 이유와
다음 단계를 기록한다. `act.provider.response`는 제공한 tool 이름/개수, 반환
tool 수와 답변을 기록한다. `ANSWER_ONLY_NO_PAGE_ACTION` /
`ANSWER_COMPLETED_NOT_PAGE_MUTATION_VERIFIED`는 tool 호출 없는 답변 종료를
뜻하며 page mutation 성공으로 해석하지 않는다. Ask도 `ask.provider.response`에
읽기 전용 답변/tool turn의 구분을 기록한다.
