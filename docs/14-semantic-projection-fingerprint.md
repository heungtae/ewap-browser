# 14. Semantic Projection 계약

## 현재 observation과 Platform 분석 경계 (2026-09-06)

현재 semantic projection은 content script가 DOM/ARIA에서 수집한다. native Chrome Accessibility Tree 또는 CDP Accessibility.* adapter가 구현되었다는 뜻은 아니다. visible/hidden scope는 현재 snapshot의 표현이며 mutation authority는 visible/enabled target으로 제한된다.

[Browser fingerprint](../extension/src/profile/fingerprint.ts)의 `semantic-projection-fp-v1`은 visible node 순서, role, 정규화한 label category, parent/label ordinal과 state capability를 hash한다. accessible name 전체, 모든 현재 상태/visibility/cardinality feature를 그대로 hash하는 알고리즘이 아니다. 예를 들어 Search/Find는 같은 search category가 될 수 있다.

Platform [semantic-v1](../../ewap-platform/docs/aidlc/contracts/change-impact.md)은 별도의 name 정규화, cardinality/visibility/relation 및 scope를 사용한다. 두 fingerprint는 직접 비교하거나 같은 이름으로 바꿀 수 없다. 공유 계약의 algorithm/observation/versioned adapter와 golden vectors는 [C07](platform-alignment.md) 후속 과제다.

Target Browser는 허용된 scope의 sanitized observation과 mismatch/failure만 제공한다. Platform Change Detector가 baseline/diff/classification, Impact Analyzer가 dependency graph/score를 소유한다. incomplete observation/누락 frame/algorithm 차이는 INCOMPARABLE로 처리하며 Browser가 baseline을 갱신하거나 영향 없음으로 판정하지 않는다. `extension/src/studio/*`의 test-only helper는 이 서비스 구현이 아니다.

## 1. snapshot

schema v2 snapshot의 기본 scope는 `all_dom`이다. 현재 문서에서 수집한
visible/hidden semantic element는 다음 값만 포함한다.

-   role
-   redacted accessible name
-   `disabled`, `checked`, `selected`, `expanded`, `required`
-   `visibility: "visible" | "hidden"`과 closed enum `hidden_reason`
-   제한된 label/landmark relation
-   HTTP(S) anchor가 same-origin/cross-origin인지 나타내는 closed
    boolean marker (`same_origin_link` 또는 `cross_origin_link`; URL
    자체는 제외)
-   document-scoped opaque `ref_id`

raw HTML, CSS, script/event handler, current input value,
password/OTP/token value, browser credential, browser AX node ID, URL
query/fragment와 closed shadow DOM은 포함하지 않는다. screenshot은
snapshot field가 아니며 별도 `vision_read` capability의 transient
입력이다.

일반 semantic projection 경로는 JavaScript 원문, AST, 전역 변수, closure,
network response나 실행 권한을 수집하지 않는다. 사용자 동의 기반 workflow 코드 분석은
[21번](21-declarative-act-workflow-design.md)의 별도 경로이며 observation 권한과 혼용하지 않는다. 대신 script가 현재 document에 반영한
DOM·accessibility tree·visible text·role· enabled/state 변화는 다음
projection을 다시 읽을 때 일반 DOM과 동일하게 수집한다. 따라서 동적으로
생성된 링크와 control은 관찰 가능한 상태만 사용해 Ask/Act 후보가 될 수
있지만, script 안에만 있는 비공개 값이나 실행 경로는 모델 입력이 아니다.

bounded CDP adapter 도입 후에도 projection schema는 변하지 않는다. CDP
node ID, target token, selector, 좌표, box, execution path와 debugger
상태는 snapshot과 fingerprint에 포함하지 않는다.

hidden node도 run 한정 `model_ref`를 받을 수 있지만 `read_page`
focus에만 사용할 수 있다. hidden node는 mutation resolver와 DOM/CDP
executor mapping에 등록하지 않는다.

## 2. 안정성

`ref_id`는 `(tab, frame, documentId, documentEpoch, DOM identity)`에만
유효하다. navigation, DOM replacement, visibility/role/name 변화, worker
restart는 해당 ref를 폐기한다. provider에는 run 한정 `model_ref`만
전달한다. hidden node가 visible로 바뀌면 기존 ref를 폐기하고 새
snapshot에서 다시 발급한다.

## 3. 검증

DOM executor는 실행 직전 target이 connected, visible, enabled이고 기대
role/name/state를 갖는지 확인한다. hidden target은 visible 전환을
기다리거나 자동으로 reveal하지 않고 `TARGET_NOT_ACTIONABLE`로 거부한다.
bounded CDP 경로도 같은 `ref_id`와 document identity를 사용하고 dispatch
직전에 token 유일성, node box와 hit test를 추가 확인한다. 실행 후
snapshot 또는 navigation으로 상태 변화가 확인되지 않으면 성공으로
처리하지 않는다.
