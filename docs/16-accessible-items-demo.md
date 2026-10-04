# Accessible items 데모

`examples/accessible-items-demo/`은 Collection Reading과 Page API Discovery에
의존하지 않고, 현재 DOM/ARIA semantic projection과 page-derived Act의 범위를
확인하는 로컬 fixture다. 가짜 공개 API, endpoint-like 문자열, collection/grid/table은
포함하지 않는다.

## 실행

```bash
scripts/run-examples.sh accessible-items-demo
```

기본 주소는 `http://127.0.0.1:3002/`이다. extension 코드를 변경했다면
`dist-extension/`을 다시 build하고 unpacked extension, 대상 페이지, Side Panel을
차례로 새로고침한다.

## 확인 항목

- `all_dom`, `visible_only`, `interactive` read scope에서 heading, link, button,
  textbox, combobox, checkbox, radio, tab, menuitem, dialog/status를 비교한다.
- disabled button, 접힌 `details`, `aria-hidden` subtree는 visibility/state를
  구분해 읽는다. password, OTP, hidden input은 projection에 나타나지 않아야 한다.
- `보고서 범위 → 상세 결과 포함 → 미리보기 생성`의 declaration과 일반 Act 모두
  현재 visible/enabled 상태를 다시 확인해야 한다.
- dialog, tab, menu, status 갱신은 UI 상태만 변경하며 네트워크, storage, navigation,
  페이지 API 호출을 만들지 않는다.

이 fixture의 이름, option 값, 상태 문구는 extension의 allowlist나 adapter 계약이
아니다. 모델에는 raw ref, selector, credential, 민감 입력값을 전달하지 않는다.

## Chrome 자동 회귀 검증

```bash
CHROME_FOR_TESTING_BIN=/path/to/chrome npm run test:chrome-accessible-items
```

새 임시 Chrome profile과 local HTTPS Provider fixture로 17개 케이스를 실행한다.
페이지 HTML은 이 예제 파일을 그대로 사용한다. 전체 성공 시에만 exit 0이다.
Provider fixture는 제공된 semantic model ref/tool enum만 사용하며 외부 모델의
응답 품질은 검증하지 않는다.

실제 demo 서버를 대상으로 확인하려면 `ACCESSIBLE_ITEMS_URL`을
`http://127.0.0.1:3002/#controls`, `CHROME_HEADED`를 `1`로 지정한다. HTTP는
임시 Chrome의 host permission 승인이 필요하다. 이미 HTTP 권한을 승인한
**테스트 전용** profile을 `ACCESSIBLE_ITEMS_TEST_PROFILE`로 지정할 수도 있다.
스크립트는 profile을 새 임시 디렉터리에 복사하고 서비스워커 캐시를 제거해
최신 artifact를 읽는다. 원본 profile에서는 Chrome을 실행하지 않는다.
`ACCESSIBLE_ITEMS_REPORT`로 결과 JSON 파일 경로를 지정할 수 있다.

`summary` 펼침은 해당 위치로 스크롤한 뒤 제안한다. 비활성 버튼은 실행되지
않아야 성공이며, 권한 거부는 값이 변경되지 않고 Panel이 다시 Send 상태로
복귀해야 성공이다. Preview/Mark reviewed에는 `aria-controls="result"`, dialog
열기에는 `aria-controls`/`aria-haspopup="dialog"`, 닫기에는 native dialog form을
사용한다. 페이지 이름에 의존하는 제품 allowlist는 추가하지 않는다.

기존 Profile/Workflow가 label에 포함된 select 옵션 문구 전체를 target 이름으로
사용했다면, 수정된 label 이름(예: `Report scope`)으로 선언을 갱신해야 한다.
이름 매칭을 느슨하게 바꾸지 않으며, 오래된 target은 기존처럼 실패 시 차단한다.
shared `ewap/v1` schema와 저장된 권한의 구조는 변경하지 않는다.
