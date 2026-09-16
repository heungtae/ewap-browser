# Variant 항목 선택 실패

0.1.58 Chrome trace에서 Variant 열기는 COMPLETION_VERIFIED로 끝났고, 후속 모델 응답 후 항목 실행은 UNSUPPORTED_COMPLETION으로 거절됐다.

실제 열린 목록을 확인하면 항목은 anchor 요소이며 ARIA role은 menuitem이다. 기존 projection은 link 역할에만 navigation metadata를 부여해 이를 일반 클릭으로 제안했고, 선택 상태 predicate가 없어 실행 전에 차단됐다.

수정: HTTP(S) anchor menuitem에 기존 origin boolean metadata를 부여하고 navigate 후보로 제공한다. 일반 click 후보에서는 제외한다. content 실행은 실제 anchor, 유효한 목적지, 현재 ref와 문서를 다시 확인한다. 기존 목적지 및 새 snapshot 검증 후 session을 종료한다. 주소나 DOM은 진단에 보관하지 않는다.

이 변경은 Variant와 같은 링크 메뉴를 지원한다. 링크가 아닌 임의 커스텀 콤보박스 전체를 지원한다는 의미는 아니다.

검증: snapshot 계약 및 도구 선택 회귀 테스트를 추가했다. 실제 provider를 통한 선택 완료는 별도 확인이 필요하다.
