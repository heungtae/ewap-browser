# ISS-20261012-004 — live 음성 목표 검증의 상태 제한

- 발생/수정: 2026-10-12.
- 상태: 해결 — Browser-local 검증 driver 범위.
- 제품 revision `c0ae91f725074fd6671a8036325929d97817e033`, 확장 `0.1.106`.

## 발생과 원인

OpenAI `gpt-6-luna`의 generic-unchanged에서 label 변경이 확인되지 않아 모델은 goal을
`incomplete`로 반환했다. 기존 `verifyS21Result`는 controlled 모델의 `unknown`만 기대하여
실패했다. 현재 ActCompletion과 goal finalizer는 `incomplete`와 `unknown`을 모두 지원한다.
이 문제는 앞선 ISS-20261012-003의 settlement 문제와 별개다.

## 수정과 수용 조건

live generic-unchanged만 `unknown/incomplete`를 허용한다. controlled는 `unknown`을
유지한다. 변경 1회, typed UNKNOWN receipt, Worker goal 일치와 완료 UI 금지는 유지한다.

- focused 검사: unknown/incomplete 수용; completed·변경 2회·Worker 불일치 거부 PASS.
- 통제 Chrome 전체 9/9 PASS.
- 최초 live 재검증은 HTTP 500으로 실패; 새 격리 profile의 재실행 1/1 PASS.
- live 재실행: 변경 1회, UNKNOWN receipt, goal unknown, 승인 카드 0, visible terminal 확인.
- Prettier와 Node globals 명시 ESLint PASS.

[최초 실패·HTTP 500·재실행 증거](../../evidence/s22-live-openai-2026-10-12.md)를 보존한다.
제품 코드는 변경하지 않았다. Provider 안정성·S22 전체 qualification·배포는 범위 밖이다.
