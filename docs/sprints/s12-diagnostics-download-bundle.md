# S12 — 진단 다운로드 ZIP

## 목표

현재 구현된 진단 ZIP 경로를 문서 30의 계약과 대조해 남은 차이를 닫고, 오류
카드와 Side Panel의 동일한 redacted ZIP 경로를 실제 Chrome에서 증명한다.

## 선행 조건

- request lifecycle, execution diagnostics, chat session 기록의 closed schema가
  유지된다.
- 문서 27~29 및 S13의 새 단계/코드가 diagnostics allowlist에 반영될 수 있다.

## 구현 범위

1. 현재 `DIAGNOSTICS_BUNDLE_EXPORT`와 문서 30 section schema의 차이 inventory·정렬
2. Service Worker의 request/execution/LLM metadata allowlist와 independent failure 점검
3. `CONTENT_DIAGNOSTICS_SUMMARY`의 구조·수량·digest 및 문서 계약 일치 검증
4. 기존 ZIP writer, manifest/sha256/README, 오류 카드/하단 버튼 공통 경로 보강
5. request ID 없음, `REQUEST_NOT_FOUND`, navigation, worker restart 상태 증거 보강
6. API key, custom header, provider URL, page URL/title, prompt/response, action value,
   selector, function path, raw page/script/return data의 export 차단

## 구현 카드

| 카드 | 산출물 | 종료 조건 |
| --- | --- | --- |
| S12-C1 | contract gap inventory | 현재 코드와 문서 30의 message/section 차이 0건 |
| S12-C2 | metadata allowlist audit | request/trace/LLM/page 결과가 allowlist로만 수집됨 |
| S12-C3 | content summary alignment | 원문 없는 구조·수량·digest와 section failure code |
| S12-C4 | ZIP/UI path hardening | 두 UI 진입점이 동일 ZIP 생성 경로 사용 |
| S12-C5 | security/regression suite | 정상·provider 실패·navigation·restart·missing ID fixture |
| S12-C6 | Chrome evidence | static-table 25x6과 민감 원문 비노출 증거 |

## 완료 조건

- 현재 ZIP central directory, 파일명, JSON, manifest hash 검증과 문서 30 계약 대조가 통과한다.
- 섹션 하나의 실패가 전체 export를 원문 fallback 없이 중단시키지 않는다.
- 진단 ZIP 자체가 Provider·서버로 전송되지 않는다.

## 참고 문서

- [30. 진단 다운로드 ZIP 설계](../30-diagnostics-download-design.md)
