# 14. Semantic Projection 계약

## 1. snapshot

snapshot은 현재 문서에서 수집한 visible interactive element의 다음 값만 포함한다.

- role
- redacted accessible name
- `disabled`, `checked`, `selected`, `expanded`, `required`
- 제한된 label/landmark relation
- document-scoped opaque `ref_id`

raw HTML, CSS, screenshot, input value, password, browser AX node ID, URL query/fragment, closed shadow DOM은 포함하지 않는다.

bounded CDP adapter 도입 후에도 projection schema는 변하지 않는다. CDP node ID, target token, selector, 좌표, box, execution path와 debugger 상태는 snapshot과 fingerprint에 포함하지 않는다.

## 2. 안정성

`ref_id`는 `(tab, frame, documentId, documentEpoch, DOM identity)`에만 유효하다. navigation, DOM replacement, visibility/role/name 변화, worker restart는 해당 ref를 폐기한다. provider에는 run 한정 `model_ref`만 전달한다.

## 3. 검증

DOM executor는 실행 직전 target이 connected, visible, enabled이고 기대 role/name/state를 갖는지 확인한다. bounded CDP 경로도 같은 `ref_id`와 document identity를 사용하고 dispatch 직전에 token 유일성, node box와 hit test를 추가 확인한다. 실행 후 snapshot 또는 navigation으로 상태 변화가 확인되지 않으면 성공으로 처리하지 않는다.
