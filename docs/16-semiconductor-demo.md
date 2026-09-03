# 반도체 데모 사이트

## Enterprise Web AI Platform 데모 정렬 (2026-08-31)

이 가상 사이트를 Community Runtime 데모뿐 아니라 Enterprise 차이를
보여주는 4단계 demo fixture로 사용한다.

1.  Semantic Projection만으로 일반 read/page-derived action을 시연한다.
2.  Signed semiconductor Page Profile을 추가해
    Equipment/Product/Process/Trend 같은 business meaning과 verifier를
    시연한다.
3.  `equipment-mcp` 같은 가상 MCP Server를 Registry에 등록하고
    discovery + capability filtering으로 off-page business context를
    시연한다.
4.  페이지의 accessible name/구조를 변경해 Change Detector → Impact
    Analyzer → revalidation 흐름을 시연한다.

실제 기업/설비 데이터, credential, destructive equipment control은
데모에 포함하지 않는다.

`examples/semiconductor-demo/`은 ContextPilot의 현재 페이지 Ask와 단계별
Act를 사람이 직접 확인하기 위한 완전 가상 사이트다. 실제 기업·공정·수율
데이터나 provider credential을 사용하지 않는다.

## 실행

1.  extension을 build해 `dist-extension/`을 만든다.
2.  `pnpm demo:semiconductor`으로 local demo server를 실행한다.
3.  기존 Chrome profile에서 `http://127.0.0.1:8443/`을 연다. extension
    코드를 바꿨다면 `chrome://extensions`에서 ContextPilot을
    새로고침하고 페이지도 새로고침한다.

Windows에서는 `scripts/run-semiconductor-demo.ps1`으로 전용 Chrome
profile과 함께 실행할 수도 있다.

`index.html`과 `trend-analysis.html`은 현재 페이지 Ask와 동적으로 바뀌는
semantic projection을 사람이 확인하는 완전 가상 사이트다. 확장
프로그램에는 이 사이트의 origin, path, 링크명, option 값 또는 실행 전용
adapter를 넣지 않는다. 분석 화면은
`제품군 → 공정 노드 → 생산 캠퍼스 → 분석 기간 → 수율 추세 분석 실행`
순서를 강제하고, 제출은 navigation 없이 SVG 차트, 접근 가능한 status
문구와 `data-trend-state="complete"`를 갱신한다.

## Act 경계

Profile이 없더라도 이 example의 visible/enabled UI는 일반 page-derived
Act discovery의 후보가 된다. 현재 페이지 snapshot이 SSoT이며, Profile은
snapshot만으로 알 수 없는 action/verifier 정보를 보완해야 할 때만
사용한다. Side Panel은 각 target과 제안 값을 표시하고 사용자가 승인해야
하며, 권한은 현재 origin 기준으로 별도 확인한다.

모델에는 raw `ref_id`, selector, CDP 정보, action token과 credential을
주지 않는다. 모델의 option 값은 untrusted proposal이며, content script가
현재 select option과 대상의 visible/enabled 상태를 다시 확인한다.

## 수동 확인 문장

-   정보 페이지에서:
    `2nm GAA를 준비 중인 제품군과 생산 캠퍼스를 알려줘.`
-   정보 페이지 Act에서: `수율 분석 센터로 이동해.`
-   분석 페이지 Ask에서: `권장 검증 시나리오는 무엇인가요?`
-   분석 페이지 실행에서:
    `AI 가속기, 2nm GAA, 평택 Campus 3, 최근 12주 조건으로 수율 추세를 분석해줘.`

각 제안을 승인하고 필요한 권한을 허용한 뒤, 최종 status가
`추세 차트 생성 완료`로 시작하고 페이지 URL이 그대로인지 확인한다.
