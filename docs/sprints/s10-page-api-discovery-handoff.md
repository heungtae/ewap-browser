# S10 — Page API 실행·Discovery 검증 및 Adapter Handoff

## 목표

문서 27·29의 Page API 실행과 Discovery 경계를 실제 unpacked Chrome fixture에서
검증하고, Discovery 후보를 실행 권한으로 승격하지 않으면서 reviewed bundled
adapter로 인계할 수 있는 상태를 완성한다.

## 선행 조건

- 문서 27의 자동 검증과 fixture adapter 구현이 유지된다.
- 문서 29의 fixed scanner, document-bound controller, redacted ephemeral result가
  현재 코드에 존재한다.

## 구현 범위

1. Page API 승인→MAIN dispatch→독립 UI postcondition의 실제 Chrome fixture 검증
2. API-01~14 negative/positive matrix와 기존 DOM/CDP 회귀 검증
3. Discovery D-01~D-08의 unpacked Chrome 검증 및 stale/Stop/worker restart 처리
4. Profile Builder 전용 Discovery surface와 `REQUIRES_ADAPTER_REVIEW` 표시 분리
5. Discovery 결과를 callable tool, action proposal, Provider context로 전달하지 않는 경계 검증
6. reviewed read-only Page API adapter의 `page_api_read` 등록 계약과 bounded 결과 검증
7. exact origin/path/version, document/page scope, closed argument/result schema 검증

## 구현 카드

| 카드   | 산출물                     | 종료 조건                                                   |
| ------ | -------------------------- | ----------------------------------------------------------- |
| S10-C1 | Page API Chrome fixture    | 승인부터 VERIFIED/UNKNOWN까지 실제 trace와 UI evidence      |
| S10-C2 | Page API security matrix   | API-01~14 및 기존 경로 회귀 통과                            |
| S10-C3 | Discovery Chrome fixture   | D-01~D-08, redaction, truncation, stale 폐기 증거           |
| S10-C4 | Profile Builder handoff    | 후보는 review-needed로만 표시되고 실행 경로에 유입되지 않음 |
| S10-C5 | read-only adapter contract | `page_api_read`의 binding, cap, schema, no-retry 검증       |

## 구현 상태 (2026-09-23)

- S10-C3의 통제 Chrome runner를 추가했다. 실제 Side Panel에서 fixed MAIN
  scanner를 실행해 public-function/inline-endpoint hint가 redacted label로만
  반환되는지, raw root/function/endpoint/source text가 Panel 응답에 없는지,
  oversized inline script가 `truncated=true`가 되는지를 확인한다.
- Discovery 시작은 worker의 in-memory document 등록이 비어 있을 때 current
  content document만 재등록한다. 재등록 뒤에도 document/page scope가 맞지
  않으면 `PAGE_SCOPE_STALE`로 종료하며 다른 tab/frame을 찾거나 재결속하지
  않는다.
- 이 runner는 Discovery만 검증한다. 후보를 invoke/data-read authority로
  승격하지 않으며 `page_api_read` adapter, Profile Builder surface, 실제 사이트
  검증은 여전히 미구현이다.

## 완료 조건

- API-01~14와 D-01~D-09의 자동·통제 Chrome 증거가 상태 원장에 연결된다.
- raw function path, URL, script, token, page object, return object가 Provider·storage·diagnostics·export에 없다.
- adapter 없는 후보는 호출되지 않고 `REQUIRES_ADAPTER_REVIEW`로 종료된다.
- 실제 사이트 API 지원, remote code, arbitrary invocation은 범위에 포함하지 않는다.

## 참고 문서

- [27. Page API 실행 설계](../27-page-api-execution-design.md)
- [29. Page API Discovery 설계](../29-page-api-discovery-design.md)
