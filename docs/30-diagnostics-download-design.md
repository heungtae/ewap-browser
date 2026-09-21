# 진단 다운로드 ZIP 설계

## 목적

오류 카드와 Side Panel의 `진단 다운로드`는 단일 `contextpilot-trace-*.json` 대신 GitHub Issue에 첨부할 수 있는 `contextpilot-diagnostics-<timestamp>-<request-id>.zip`을 생성한다. 개발자는 이 ZIP만으로 다음을 판별할 수 있어야 한다.

- 어떤 요청과 실행 단계에서 실패했는가
- 패널/Service Worker/페이지 문서 수명주기가 어떻게 변했는가
- LLM 호출이 시작되었는가, 응답 본문 대기/도구/검증 중 어디에서 멈췄는가
- 현재 페이지가 어떤 구조(표, 목록, 폼, 스크립트 수, 문서 epoch)를 가졌는가
- 기록이 없거나 저장을 읽을 수 없는 경우 그 이유가 무엇인가

## 범위

- 버튼 표기는 모두 `진단 다운로드`로 통일한다.
- ZIP은 브라우저에서 생성하며 서버나 LLM으로 전송하지 않는다.
- 하나의 ZIP에는 오류 카드가 가리킨 request ID의 기록과 같은 탭의 페이지/대화 정보를 넣는다. request ID가 없는 패널 오류도 ZIP을 생성한다.
- trace 레벨은 각 lifecycle event의 application-style `message`를 보존한다. message는 처리한 runtime message 종류, 단계 전환, provider/tool/검증 결과를 사람이 읽을 수 있게 설명한다.
- 진단은 구조·수량·digest·상태 코드만 수집한다. API key/custom-header 값/provider URL, 페이지 URL/title/referrer/HTML/script 원문, 프롬프트·모델 응답·action 값은 ZIP에 넣지 않는다.

## ZIP 구성

| 파일                   | 내용                                                                                            |
| ---------------------- | ----------------------------------------------------------------------------------------------- |
| `manifest.json`        | 스키마, 확장 버전, 생성 시각, request ID, 파일별 바이트 수/sha256                               |
| `execution-trace.json` | 실행 이벤트, sequence, 단계, elapsed, outcome, code, reason, dropped count                      |
| `request.json`         | mode, 상태/단계 전이, 시작/마지막 진행 시각, dispatch 여부, prompt 길이/digest                  |
| `llm-processing.json`  | 마스킹된 provider 구성, provider 단계별 시작/종료/경과, tool 종류/결과 코드                     |
| `llm-memory.json`      | 탭 스레드의 이벤트 순서, 단계, 길이, tool 종류, outcome/code 등 비밀값 없는 메타데이터          |
| `page-load.json`       | document/page-scope 정보, ready state, 문서 구조, 로드 상태, 표/목록/폼/입력/버튼/스크립트 정보 |
| `page-artifacts.json`  | HTML/JS digest와 script type별 개수, external/inline 분포, 잘림 여부                            |
| `page-data.json`       | URL 형태·title 길이·referrer 존재 여부 등 원문 없는 페이지 메타데이터                           |
| `panel-failures.json`  | 패널이 표시한 오류 코드와 표시 메시지, 요청 상태 조회 실패 코드                                 |
| `README.txt`           | 각 파일 해석 방법, 누락 사유, 재현 절차 입력 양식                                               |

`page-load.json`은 “Static table / rows=25 / columns=6 / scripts=…”처럼 구조와 수량을 제공한다. 이를 통해 fixture 종류, 페이지 교체, virtualized DOM 여부, 수집 한도 도달 여부를 판단한다.

`execution-trace.json`의 모든 record에는 log4j2 등의 일반 애플리케이션 로그와 같은 필수 `message` 문자열이 있다. 예를 들어 `Processed stage.started at stage CONTACTING_PROVIDER`는 어느 runtime event를 처리했으며 어느 단계에서 발생했는지 바로 보여 준다.

## 수집 흐름

```text
오류 카드 또는 Side Panel
  -> DIAGNOSTICS_BUNDLE_EXPORT { request_id? }
Service Worker
  -> request/ExecutionDiagnostics/ChatSession/Provider 정보 수집
  -> 현재 바운드 탭에 CONTENT_DIAGNOSTICS_SUMMARY 요청
Content Script
  -> 현재 문서의 구조·digest·수량 메타데이터 수집
Service Worker
  -> 섹션별 독립 결과 및 수집 실패 코드 반환
Side Panel
  -> JSON 파일들 + README를 ZIP(STORE 또는 deflate)으로 생성/다운로드
```

각 섹션은 독립적으로 실패할 수 있다. 한 섹션 실패가 전체 ZIP 생성을 막지 않으며, `manifest.json.sections.<name>.status`에 `collected`, `unavailable`, `truncated`, `failed`와 오류 코드를 남긴다.

## request ID와 페이지 이동 처리

요청 owner는 인증된 Side Panel document와 바운드된 tab이다. 페이지 epoch는 navigation 때 정상적으로 바뀌므로 owner에 포함하지 않는다. 따라서 같은 패널·같은 탭은 이동 뒤에도 상태를 조회할 수 있고, 다른 탭/창/패널 document의 조회는 계속 거부한다.

따라서 `REQUEST_NOT_FOUND` 자체도 `panel-failures.json`에 남고, 이미 저장된 실행 레코드는 가능한 경우 `execution-trace.json`에 함께 남는다.

## LLM 처리 정보

LLM 진단은 탭 스레드의 lifecycle 메타데이터만 기록한다. user/assistant text, tool target/value/summary, action/permission/confirmation의 식별자·사유·값, origin/path는 기록하지 않는다. 또한 다음 처리 정보를 기록한다.

- provider 구성 여부, plugin ID/version, model, wire API, timeout, API key 존재 여부
- `PREPARING_PAGE`, `RESOLVING_PROFILE`, `CONTACTING_PROVIDER`, `PROVIDER_BODY`, `AWAITING_REVIEW`, `DISPATCH`, `VERIFY` 등의 단계 시작/종료/경과 시간
- tool 이름, tool 결과 outcome/code, action 승인/권한/검증 상태
- 프롬프트·응답·도구 원문은 제외하고 필요한 경우 길이만 기록

이는 provider 연결 실패, 본문 idle timeout, 도구 호출 실패, 페이지 이동 후 검증 실패를 구분하기 위한 정보다.

## 페이지 수집 계약

`CONTENT_DIAGNOSTICS_SUMMARY` 응답은 구조 통계와 원문 없는 페이지 형태 정보를 반환한다.

```ts
{
  schema_version: 1,
  document_epoch_digest: string,
  page_scope_epoch_digest: string,
  document: {
    ready_state: "loading" | "interactive" | "complete",
    element_count: number,
    role_counts: Record<string, number>,
    table_count: number,
    table_shape: Array<{ rows: number; columns: number }>,
    list_count: number,
    form_count: number,
    input_counts: Record<string, number>
  },
  artifacts: {
    html: { bytes: number; sha256: string },
    scripts: {
      total: number;
      inline_count: number;
      external_count: number;
      total_bytes: number;
      digests: string[];
    }
  },
  page: {
    url_shape: {
      has_query: boolean,
      has_fragment: boolean,
      path_segment_count: number
    },
    title_length: number,
    referrer_present: boolean
  }
}
```

## 크기와 보존 한도

- ZIP은 허용된 마스킹 후 메타데이터 전체를 저장한다. 브라우저가 ZIP 생성 또는 메모리 할당에 실패하면 해당 섹션을 `failed`로 표시하며 원문으로 대체하지 않는다.
- 실행 trace와 LLM memory의 보존 한도는 해당 저장소가 실제로 보유한 기록의 한도이며, ZIP export에서 추가로 잘라내지 않는다.

## UI 동작

- 오류 카드의 `진단 저장`과 하단 `진단 다운로드`는 동일한 ZIP 생성 경로를 사용한다.
- 완료 메시지에는 파일명과 “GitHub Issue에 첨부”를 표시한다.
- 실패해도 오류 카드는 유지하며, `진단 보기`에서 수집 성공/실패 섹션과 실패 코드를 보여 준다.
- 개발 추적은 별도 설정이며, 켜기 전의 trace 레코드를 소급 생성하지 않는다. ZIP에는 현재 레벨과 trace 미사용 사실을 명시한다.

## 검증 계획

1. ZIP central directory/파일명/JSON 파싱 단위 테스트
2. 오류 카드와 하단 버튼이 동일 ZIP을 생성하는 Side Panel DOM 테스트
3. 정상 실행, provider 실패, 페이지 이동 후 `NAVIGATION_UNVERIFIED`, Worker 재시작, request ID 없는 패널 오류 fixture
4. `localhost:3000/static-table`에서 표 구조(25행/6열), URL/source/script 원문이 없이 digest·수량만 기록되는 Chrome 테스트

## 구현 순서

1. `DIAGNOSTICS_BUNDLE_EXPORT` 계약과 섹션별 closed schema 추가
2. Service Worker의 보존 진단/요청/LLM 대화 요약 수집 추가
3. Content Script의 `CONTENT_DIAGNOSTICS_SUMMARY` 추가
4. Side Panel ZIP writer와 다운로드 UI 연결
5. 위 단위·fixture·Chrome 검증 후 기존 단일 JSON export 제거
