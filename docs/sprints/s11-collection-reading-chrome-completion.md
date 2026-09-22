# S11 — Collection Reading Chrome 완결

## 목표

문서 28의 object-specific collection reader를 실제 Chrome Side Panel 경로에서
검증하고, static/virtual/pagination/SVG/canvas의 지원 범위를 coverage와 함께
정직하게 표시한다.

## 선행 조건

- CR-1~CR-5 reader, lifecycle, Side Panel discover/start/stop UX가 유지된다.
- S10의 document/page scope binding과 read-only adapter 경계가 확정된다.

## 구현 범위

1. headed Chrome for Testing virtual-grid fixture의 full read/Stop/restore 검증
2. DOM recycling, duplicate label, EOF/total evidence와 `complete|partial` 판정
3. infinite loading, timeout, navigation, worker restart의 단일 terminal 처리
4. static table/list cap 및 chunk/cursor/byte limit 회귀 검증
5. reviewed API/export/Business MCP reader의 origin/schema/cursor 정책 검증
6. SVG accessible-data와 canvas `viewport_only` 한계 검증
7. pagination은 reviewed transition만 허용하고 generic next-click fallback을 차단
8. 수집 결과의 sensitive redaction과 diagnostics/export/storage 비노출 검증

## 구현 카드

| 카드 | 산출물 | 종료 조건 |
| --- | --- | --- |
| S11-C1 | Chrome virtual-grid runner | full-read, progress, Stop, restore evidence |
| S11-C2 | completeness evaluator | EOF/total/identity 근거 없는 complete 판정 0건 |
| S11-C3 | failure/recovery matrix | timeout/navigation/restart 뒤 재스크롤·재시도 0건 |
| S11-C4 | adapter/pagination readers | reviewed route만 실행, unsupported는 fail-closed |
| S11-C5 | visual/negative controls | SVG 보수 read, canvas viewport-only, exact-data false claim 0건 |
| S11-C6 | data boundary verification | credential, token, raw selector/scroll/API response 비노출 |

## 완료 조건

- 통제된 Chrome fixture에서 full-read와 원위치 복구 증거가 남는다.
- `partial`, `viewport_only`, `unavailable`을 `complete`로 표현하지 않는다.
- 전체 데이터 분석을 위한 자연어 Ask/Act 연결은 S13의 별도 완료 조건으로 남긴다.

## 참고 문서

- [28. Collection Reading 설계](../28-collection-reading-strategy-design.md)
