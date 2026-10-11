# Variant 항목 선택 실패

## 현재 상태 — 완료

2026-10-11 사용자의 “모두 완료 처리해” 요청에 따라 이슈 추적을 종료했다.
아래의 검증 중·재검증 필요 표현과 미체크 완료 조건은 완료 처리 이전의 이력이다.
실제 사이트·Provider·사용자 설치·배포 및 기존 미확인 조건을 새로 검증했다는 의미는 아니다.
기존 수정·검증 기록은 보존하며, 같은 문제가 재발하면 이 ID를 다시 연다.

0.1.58 Chrome trace에서 Variant 열기는 COMPLETION_VERIFIED로 끝났고, 후속 모델 응답 후 항목 실행은 UNSUPPORTED_COMPLETION으로 거절됐다.

실제 열린 목록을 확인하면 항목은 anchor 요소이며 ARIA role은 menuitem이다. 기존 projection은 link 역할에만 navigation metadata를 부여해 이를 일반 클릭으로 제안했고, 선택 상태 predicate가 없어 실행 전에 차단됐다.

수정: HTTP(S) anchor menuitem에 기존 origin boolean metadata를 부여하고 navigate 후보로 제공한다. 일반 click 후보에서는 제외한다. content 실행은 실제 anchor, 유효한 목적지, 현재 ref와 문서를 다시 확인한다. 기존 목적지 및 새 snapshot 검증 후 session을 종료한다. 주소나 DOM은 진단에 보관하지 않는다.

이 변경은 Variant와 같은 링크 메뉴를 지원한다. 링크가 아닌 임의 커스텀 콤보박스 전체를 지원한다는 의미는 아니다.

검증: snapshot 계약 및 도구 선택 회귀 테스트를 추가했다. 실제 provider를 통한 선택 완료는 별도 확인이 필요하다.

## 2026-10-11 완료 처리 이력

- 상태: 완료 (사용자 요청에 따른 추적 종료).
- 근거: 미확인 범위를 안내한 뒤 사용자가 모든 로컬 이슈의 완료 처리를 명시했다.
- 남은 추적 작업: 없음. 기존 미검증 범위와 실행 증거는 위 이력대로 보존한다.
