# 반도체 데모 사이트

`examples/semiconductor-demo/`은 ContextPilot의 현재 페이지 Ask와 단계별 Act를 사람이 직접 확인하기 위한 완전 가상 사이트다. 실제 기업·공정·수율 데이터나 provider credential을 사용하지 않는다.

## 실행

1. extension을 build해 `dist-extension/`을 만든다.
2. `pnpm demo:semiconductor`으로 local demo server를 실행한다.
3. 기존 Chrome profile에서 `http://127.0.0.1:8443/`을 연다. extension 코드를 바꿨다면 `chrome://extensions`에서 ContextPilot을 새로고침하고 페이지도 새로고침한다.

Windows에서는 `scripts/run-semiconductor-demo.ps1`으로 전용 Chrome profile과 함께 실행할 수도 있다.

`index.html`은 정보 전용 Ask 검증 페이지다. `trend-analysis.html`은 `제품군 → 공정 노드 → 생산 캠퍼스 → 분석 기간 → 수율 추세 분석 실행` 순서를 강제한다. 제출은 navigation 없이 SVG 차트, 접근 가능한 status 문구와 `data-trend-state="complete"`를 갱신한다.

## Act 경계

Act chat은 정확한 demo HTTPS origin과 분석 path에서만 proposal 도구를 받는다. 모델은 한 번에 하나의 `propose_select_option` 또는 `propose_click`만 제안한다. Side Panel은 target과 제안 값을 표시하고 사용자가 승인해야 실행한다. `type`과 `click` 권한은 현재 HTTPS host 기준으로 별도 확인하며, 이번 작업만 허용은 Act session이 끝날 때 제거된다.

모델에는 raw `ref_id`, selector, CDP 정보, action token과 credential을 주지 않는다. 모델의 option 값은 untrusted proposal이며, content script가 현재 select option과 대상의 visible/enabled 상태를 다시 확인한다.

## 수동 확인 문장

- 정보 페이지에서: `2nm GAA를 준비 중인 제품군과 생산 캠퍼스를 알려줘.`
- 분석 페이지 Ask에서: `권장 검증 시나리오는 무엇인가요?`
- 분석 페이지 실행에서: `AI 가속기, 2nm GAA, 평택 Campus 3, 최근 12주 조건으로 수율 추세를 분석해줘.`

각 제안을 승인하고 필요한 권한을 허용한 뒤, 최종 status가 `추세 차트 생성 완료`로 시작하고 페이지 URL이 그대로인지 확인한다.
