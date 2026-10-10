# S12 — 진단 다운로드 ZIP

> 개발·검증 이력이다. 본문의 계획·상태는 기록 당시 범위이며 현재 동작은
> [코드 탐색 안내](../source-guide.md)와 해당 revision의 실행 결과로 확인한다.

> 이 문서는 과거 Browser 진단 ZIP의 S12-C1~C6 계획이다. 현재 Sprint 원장의
> S12는 [Browser 로컬 managed policy 경계](s12-managed-policy-boundary.md)이며,
> 이 카드의 미검증 항목을 S12 `Completed` 근거로 사용하지 않는다.

## 완료 상태 (2026-10-01)

**Completed — Browser S12-C1~C6.** 계약·보안 보완과 실제 Chrome ZIP 증거는
[완료 증거](../evidence/diagnostics-zip-closure-2026-10-01.md)를 따른다.
Enterprise S12 managed policy와 별도 항목이다. 실제 OS 다운로드 디렉터리,
Windows 및 live provider 검증은 이 종료 범위에 포함하지 않는다.

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

- [30. 진단 다운로드 ZIP 설계](https://github.com/heungtae/ewap-browser/blob/bf5b15e32837f56da18828aa049bd582279354fd/docs/30-diagnostics-download-design.md)
