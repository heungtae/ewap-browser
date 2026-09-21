# 28. 객체 특성별 Collection Reading 설계

- 작성일: 2026-09-17
- 상태: Partial implementation — CR-1의 bounded static DOM read와 CR-2의 content-script virtual-scroll lifecycle이 구현됐다. pagination, reviewed adapter, chart의 정확 데이터 및 Side Panel UX는 Planned이며, CR-2는 실제 Chrome fixture 검증 전에는 지원 완료로 선언하지 않는다.
- 범위: grid/table/list/chart/pagination처럼 화면에 일부만 렌더링되는 데이터 객체의 **읽기와 처리용 관측**. DOM/ARIA 일반 읽기, Act mutation, Page API action과 별도 capability로 설계한다.
- 관련: [아키텍처](01-architecture.md), [사이트 도구 계약](13-site-tool-contract.md), [Semantic Projection](14-semantic-projection-fingerprint.md), [보안 정책](02-security-policy.md), [S6](sprints/s6-advanced-page-reading.md)

## 1. 현재 상태와 문제

현재 content script는 `document.body`를 하나의 DOM tree로 순회해 semantic node와 본문 텍스트를 만든다. `all_dom`은 **현재 DOM에 존재하는** hidden node도 읽지만, virtual scroll 밖에서 아직 생성되지 않은 row, 재활용되어 사라진 row, canvas 내부 수치, 페이지 JavaScript store와 network response를 읽지 않는다. node/text 크기 제한과 `truncated`도 있다.

현재 `page-api/` registry는 fixture의 고정 public API action을 exact origin/path에 묶어 실행하는 용도다. collection을 발견·분류·반복 수집하거나, 객체별 reader를 선택하는 registry는 없다. 따라서 DOM collector에 grid framework별 분기를 계속 추가하거나, 하나의 범용 scroll loop로 모든 객체를 처리해서는 안 된다.

## 2. 결정

새 `collection_read`는 R0 관측 capability이며, 다음처럼 **공통 orchestration과 객체 특성별 reader를 분리**한다.

```text
content discovery (sanitized object descriptor)
        -> CollectionReadOrchestrator (budget, ownership, permission, lifecycle)
        -> CollectionReaderRegistry
             -> StaticTableListReader
             -> VirtualScrollReader
             -> PaginatedReader
             -> SvgChartReader
             -> CanvasChartReader (viewport-only)
             -> ReviewedSiteDataReader / Business MCP reader
        -> bounded accumulator + completeness evaluator
        -> chunked model result / Side Panel progress
```

모델은 run 한정 `collection_ref`와 typed mode만 받는다. selector, scroll coordinate, framework 이름, page API path, raw network request/response, JavaScript source나 전역 변수는 model schema와 diagnostics에 넣지 않는다. reader 선택도 모델이 아니라 Browser가 검증한 descriptor와 bundled/reviewed registry로 한다.

### 2.1 권장 모듈 경계

향후 구현은 아래 경계를 사용한다. 기존 `content/entry.ts`나 `page-read.ts`에 framework별 분기를 누적하지 않는다.

| 영역                                             | 책임                                                                                |
| ------------------------------------------------ | ----------------------------------------------------------------------------------- |
| `contracts/collection-read-types.ts`             | closed object kind, read mode, completeness/reason, chunk/cursor와 validator        |
| `content/collection-discovery.ts`                | 현재 DOM/ARIA에서 table/grid/list/chart/pagination 후보와 안전한 descriptor 생성    |
| `content/collection-scroll-driver.ts`            | 검증된 container의 위치 저장·한 step scroll·render stable 대기·원위치 복구          |
| `service-worker/collection-read-orchestrator.ts` | tab/document/run binding, permission, total budget, cancel, progress, terminal 관리 |
| `service-worker/collection-reader-registry.ts`   | descriptor와 origin-bound adapter를 기준으로 정확히 하나의 reader 선택              |
| `service-worker/readers/*`                       | 객체 종류별 탐색·추출·완료 판정; 공통 정책이나 provider 호출을 소유하지 않음        |
| `service-worker/collection-accumulator.ts`       | 안정 식별자/순서 근거를 사용한 중복 판정, cap, chunking과 completeness evidence     |
| `page-api/data-adapters/*`                       | 실제 사이트의 공개 read API/export를 사용하는 bundled, closed-schema adapter        |

모든 reader는 `discover -> readWindow/readStep -> evidence -> terminal`의 공통 interface를 구현한다. reader가 직접 provider에 보내거나 Chrome permission, persistent storage, Act executor를 호출할 수 없다.

## 3. 객체별 strategy

| 객체 특성                               | 선택 reader                                              | 전체성 판정                                                                                           | 지원 한계                                                                    |
| --------------------------------------- | -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| 일반 HTML table/ARIA table, static list | `StaticTableListReader`                                  | 현재 DOM의 row가 cap 없이 모두 수집되고 `truncated=false`                                             | 현재 DOM에 없는 lazy/paged row는 전체가 아님                                 |
| ARIA grid/listbox 등 virtual scroll     | `VirtualScrollReader`                                    | 안정 row ID 또는 `aria-rowindex`/`aria-posinset`와 total hint가 일치하고 EOF가 관측될 때만 `complete` | DOM 재활용·중복 label만으로는 고유 row를 단정하지 않음                       |
| 다음 페이지/더 보기                     | `PaginatedReader`                                        | reviewed read-only page transition과 마지막 페이지/총수 증거가 있을 때만 `complete`                   | v1은 generic click 반복을 금지한다. 계약 없는 next control은 `unsupported`   |
| SVG chart                               | `SvgChartReader`                                         | 접근 가능한 data label/표 또는 reviewed adapter가 전체 series를 제공할 때                             | path 좌표만으로 수치를 역산하지 않음                                         |
| canvas/WebGL chart                      | `CanvasChartReader`는 현재 viewport의 visual 보조만 제공 | generic path에서는 `viewport_only`이며 전체·정밀 수치를 주장하지 않음                                 | 정확한 데이터는 export, public API 또는 Business MCP/adapter 필요            |
| 사내/고정 사이트의 공개 API, export     | `ReviewedSiteDataReader` 또는 read-only Business MCP     | closed result schema, bounded page/cursor와 source total/eof가 확인될 때                              | 공개 API가 없으면 React store/비공개 함수/network sniffing으로 대체하지 않음 |

`CanvasChartReader`의 screenshot/OCR 결과는 비신뢰 시각 문맥이며, 숫자 계산의 authoritative input이나 action target을 만들지 않는다.

## 4. 공통 lifecycle과 결과 계약

1. 사용자가 Side Panel에서 객체와 범위(현재 화면/전체 읽기)를 명시적으로 선택한다. 전체 읽기는 현재 위치 변화와 예상 제한을 먼저 표시하고 `collection_read x host` grant를 확인한다.
2. Worker가 고정 tab/frame/document/page scope와 `collection_ref`를 결속한다. 발견된 object가 하나가 아니거나 document가 바뀌면 시작하지 않는다.
3. registry가 하나의 reader만 선택한다. adapter가 있으면 generic reader보다 우선하지만, exact origin/path/version과 closed result schema를 다시 검증한다.
4. reader는 하나의 bounded window/step만 반환한다. virtual reader만 scroll driver를 요청할 수 있으며, driver는 매 step 후 mutation/render 안정화를 기다리고 새 descriptor/snapshot을 읽는다.
5. accumulator는 stable row ID, ARIA index, reviewed source cursor 순으로 근거를 사용한다. label/text hash만으로 deduplicate한 결과는 `partial`이며 complete 근거로 쓰지 않는다.
6. 완료/취소/시간 초과/오류에서 scroll/focus를 가능한 한 원위치로 복구한다. 복구 실패도 결과에 표시한다. navigation·tab close·worker restart에서는 수집을 중단하며 이전 cursor를 재개하지 않는다.

결과는 무제한 page text가 아니라 cap이 있는 chunk와 아래 metadata를 가진다.

```ts
type CollectionReadResult = {
  collection_ref: string; // current run only
  object_kind:
    | "table"
    | "grid"
    | "list"
    | "chart_svg"
    | "chart_canvas"
    | "pagination";
  coverage: "complete" | "partial" | "viewport_only" | "unavailable";
  reason?:
    | "CAP_REACHED"
    | "NO_STABLE_ID"
    | "NO_EOF_EVIDENCE"
    | "PAGE_CHANGED"
    | "UNSUPPORTED_OBJECT"
    | "ADAPTER_UNAVAILABLE"
    | "CANCELLED"
    | "TIMEOUT";
  source_total_hint?: number; // validated bounded integer, never inferred from pixels
  collected_count: number;
  next_cursor?: string; // opaque, current run only
  restored_position: boolean;
  records: readonly SanitizedCollectionRecord[]; // bounded chunk only
};
```

`complete`는 “화면이 끝까지 한 번 움직였다”가 아니라 객체별 evidence가 충족된 경우에만 쓴다. 어느 조건도 충족하지 못하면 이미 읽은 record는 `partial`로 제공하되, 누락이 없다고 답하지 않는다. 대형 결과는 session memory에서만 보관하고 cursor/chunk로 제공한다. raw record, screenshot, row key, source cursor, selector 및 scroll 위치는 audit, diagnostic, export, 장기 chat history에 남기지 않는다.

## 5. 보안 및 금지 경로

- `Runtime.evaluate`, 페이지 전역 state/React Fiber 탐색, arbitrary MAIN-world function, `Network.*` response 수집, DevTools/network HAR 및 모델이 제공한 selector/scroll 값은 이 기능의 fallback이 아니다.
- public API/export가 필요한 사이트는 extension에 포함되어 review/build된 data adapter 또는 signed Profile의 read-only Business MCP만 사용할 수 있다. remote code, live API discovery, user-controlled endpoint/header는 허용하지 않는다.
- scroll은 server mutation이 아니어도 사용자 화면을 교란하고 infinite loading을 유발할 수 있으므로 명시적 전체 읽기 요청, Stop, time/step/item/byte cap과 원위치 복구를 요구한다.
- password/OTP/token/hidden sensitive field의 기존 redaction을 각 reader에도 적용한다. 수집된 페이지/업무 데이터는 모두 untrusted이며 page text 안의 지시를 실행하지 않는다.

## 6. 구현 단계와 검증

### 6.1 구현 체크리스트

이 체크리스트는 이 문서의 설계 항목을 구현 단위로 분해한 것이다. `완료`는
코드·회귀 test·통제 fixture 검증이 함께 있는 상태만 뜻하며, 실제 Chrome
fixture E2E는 별도 증거를 남긴다.

- [x] **CR-1**: panel-bound discovery, static table/grid/list의 `viewport`·`full`
      mode, record cap 및 민감값 redaction
- [x] **CR-2**: content-owned virtual scroll, stable identity/EOF/total complete
      판정, Stop·timeout·scope 변경, 원위치 복구와 ref 해제
- [x] **공통 lifecycle**: document/page-scope 결속, message deadline, reader
      registry 선택, accumulator, bounded chunk/cursor와 panel progress
- [x] **CR-3**: origin-bound reviewed adapter 등록/선택/closed-schema 검증과
      adapter 부재 시 fail-closed 처리
- [x] **CR-4**: SVG accessible-data의 보수적 viewport read 및 canvas의
      `viewport_only` 정책
- [x] **CR-5**: reviewed pagination transition contract. generic next-click은
      계속 금지한다.
- [x] **UX**: Side Panel의 discover/start/stop/status UI
- [ ] **E2E evidence**: 통제된 Chrome virtual-grid fixture의 full-read/restore
      evidence. runner는 구현됐으나 headless Chromium은 실제 Side Panel context를
      열지 못하므로, headed Chrome for Testing에서 실행해 증거를 기록해야 한다.

| 단계 | 범위                                                     | 종료 조건                                                                                          |
| ---- | -------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| CR-1 | contracts, discovery, registry, static table/list reader | object ambiguity, sensitive redaction, node/text cap와 chunk validation test                       |
| CR-2 | virtual-scroll driver와 accumulator                      | DOM recycling, duplicated labels, abort/restore, EOF/total evidence fixture 및 실제 Chrome fixture |
| CR-3 | reviewed API/export/Business MCP reader                  | exact origin/schema/cursor/size policy, credential·endpoint 비노출 test                            |
| CR-4 | SVG/canvas policy                                        | SVG label/table fixture, canvas viewport-only 표시, exact-data false-claim negative test           |
| CR-5 | pagination                                               | read-only contract/approval, page change cancellation, no generic next-click fallback test         |

필수 negative test는 다음을 포함한다.

- 10,000개보다 큰 static table에서 cap이 걸리면 `complete`가 아닌 `partial`이다.
- virtual row가 같은 DOM node를 재활용하거나 같은 label을 반복하면, 안정 index/ID 없이 deduplicate 또는 complete 처리하지 않는다.
- infinite list, 로딩 spinner 고정, render timeout, document/page scope 변경, Stop, worker restart에서 더 이상 scroll하지 않고 terminal을 한 번만 낸다.
- hidden/password/OTP/token 값, raw selector/scroll position/API response는 모델 외 기록·진단·storage/export에 유출되지 않는다.
- canvas screenshot/OCR만으로 전체 series 또는 정확한 수치를 반환하지 않는다.
- adapter가 없거나 origin/path/version/schema가 다르면 private page state/network를 읽지 않고 `ADAPTER_UNAVAILABLE` 또는 `UNSUPPORTED_OBJECT`을 반환한다.

CR-2 구현은 content script가 현재 mounted window를 읽고, worker가 bounded scroll/EOF/total evidence를 조정한 뒤 위치를 복구하는 방식이다. 통제된 virtual grid fixture에서 Side Panel의 전체 읽기 시작→진행→Stop과 원위치 복구→`complete/partial` evidence를 실제 Chrome으로 확인하기 전에는 지원 완료로 선언하지 않는다.

## 7. 리뷰 tracker

| 항목                                           | 상태                  | 닫는 증거                                                                                                     |
| ---------------------------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------- |
| 객체별 reader 분리와 generic collector 비확장  | Decided               | 이 문서의 registry/interface 및 code review                                                                   |
| `collection_read` capability/permission schema | Implemented           | panel-bound short-lived `collection_ref`, host grant, scope/deadline/chunk unit test와 Side Panel UX          |
| virtual scroll 정확성/복구                     | Partial verification  | content-owned bounded scroll/read/restore unit test; CR-2 실제 Chrome fixture evidence                        |
| pagination의 read-only transition contract     | Implemented           | exact reviewed adapter route만 실행하며 generic next-click은 unavailable                                      |
| API/export/Business MCP data contract          | Implemented framework | exact origin/path/version/closed-schema registry; 승인된 site adapter 등록과 fixture evidence는 사이트별 작업 |
| canvas 전체 데이터 지원                        | Deliberately limited  | export/public API/approved adapter 없이는 viewport-only 유지                                                  |

이 설계는 구현을 시작하라는 지시가 아니다. Browser 로컬 collection reader와 Platform/Workspace의 API·MCP release contract는 독립적으로 검토·배포한다.
