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
