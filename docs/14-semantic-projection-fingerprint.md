# 14. Semantic Projection Fingerprint 계약

## 1. 목적과 적용 범위

`semantic-projection-fp-v1`은 Page Profile을 결정적으로 선택하기 위한 값 없는 페이지 구조 fingerprint다. 이 값은 모델 입력, 페이지 요약, 사용자 표시 또는 감사 식별자로 사용하지 않는다. fingerprint는 exact `page_read_origins` gate를 통과한 top-level document의 `frame_id=0` projection에서만 만든다. 차단 origin, child frame 단독 snapshot, 등록되지 않은 `document_epoch`, 크기 제한을 넘긴 snapshot에서는 fingerprint를 만들거나 resolver를 호출하지 않는다.

동일한 화면 구조에서 업무 record, 입력값, 현재 checked/selected/expanded/disabled 상태 또는 opaque ref만 바뀌면 같은 fingerprint가 나와야 한다. 반대로 role, 구조적 state capability, 포함 node 순서·관계 또는 고정 label category가 바뀌면 다른 fingerprint가 나와야 한다.

## 2. Canonical input schema

canonical input은 아래 closed schema와 정확히 같아야 한다. `nodes`는 0~500개다. 모든 key는 필수이며 unknown key, 부동소수점, `-0`, 범위 밖 ordinal과 schema에 없는 enum은 `INVALID_ARGUMENT`이다.

```ts
type FingerprintLabelCategory =
  | "approve" | "cancel" | "close" | "continue" | "create"
  | "delete" | "edit" | "filter" | "navigate" | "reject"
  | "save" | "search" | "select" | "submit" | "toggle"
  | "other" | "none";

type FingerprintStateCapabilities = {
  checkable: boolean;
  expandable: boolean;
  required: boolean;
  selectable: boolean;
};

type FingerprintNode = {
  label_category: FingerprintLabelCategory;
  label_ordinal: number | null;
  ordinal: number;
  parent_ordinal: number | null;
  role: "button" | "checkbox" | "combobox" | "heading" | "link" |
        "option" | "radio" | "textbox" | "listbox" | "tab" | "menuitem" |
        "dialog" | "alert" | "status" | "navigation" | "main" | "form";
  state_capabilities: FingerprintStateCapabilities;
};

type SemanticProjectionFingerprintV1 = {
  alg: "semantic-projection-fp-v1";
  nodes: FingerprintNode[];
  origin_class: "allowlisted-enterprise-origin";
};
```

`origin_class`는 raw origin의 변환 결과가 아니라 exact page-read gate 통과를 나타내는 고정값이다. raw origin과 path는 resolver matcher 입력으로 별도 검증하며 canonical input에 넣지 않는다. `document_epoch`, `frame_id`, accessible name, `ref_id`, `model_ref`, DOM ID, selector, value와 좌표도 canonical input에 없다.

## 3. Projection에서 canonical input으로 변환

다음 순서를 바꾸지 않는다.

1. S1 semantic projection collector와 동일한 redaction·sensitive-node 제외·지원 role·visible 규칙을 적용한다. 지원하지 않는 role과 `visible=false` node는 fingerprint node에도 넣지 않는다.
2. top-level document의 포함 node를 DOM preorder로 정렬하고, 필터링된 배열의 index를 0부터 연속된 `ordinal`로 부여한다. DOM 전체 node index나 `ref_id` 생성 순서를 사용하지 않는다.
3. `parent_ordinal`은 포함 node 중 가장 가까운 semantic ancestor의 ordinal이다. 없으면 `null`이며, 값이 있으면 preorder 특성상 현재 `ordinal`보다 작아야 한다. `label_ordinal`은 같은 top-level frame에서 명시적으로 연결되고 포함 배열에도 존재하는 label relation target의 ordinal이며, 그 외에는 `null`이다. relation이 자기 자신을 가리키거나 배열 밖 ordinal을 가리키면 snapshot을 거부한다.
4. 현재 field/UI 상태값은 canonical input에 넣지 않고 구조적 capability만 만든다. `checkable`은 role이 `checkbox` 또는 `radio`이면 `true`, `selectable`은 role이 `option` 또는 `tab`이면 `true`다. `expandable`은 projection의 `expanded` key가 boolean으로 존재하면 실제 값과 무관하게 `true`다. `required`는 projection의 `required`가 명시적으로 `true`일 때만 `true`다. 그 밖에는 각각 `false`이며 key를 생략하지 않는다. 실제 `checked`, `selected`, `expanded`, `disabled`, `enabled`, `visible` 값은 hash하지 않는다.
5. redaction된 accessible name을 4절에 따라 `label_category` 하나로 바꾼 뒤 raw name을 버린다. label category 계산 전 이미 sensitive-node 제외 대상이면 `other`로 낮추지 않고 node 전체를 제외한다.
6. 위 schema의 새 object를 생성한다. `SemanticSnapshot` object에서 key를 삭제하는 방식이나 임의 object spread는 금지한다.

동일 DOM에서 raw name이 달라도 둘 다 같은 category로 분류되면 fingerprint는 같을 수 있다. 이는 record별 텍스트가 profile identity가 되는 것을 막기 위한 의도된 동작이다.

## 4. Label category 정규화

label 분류는 모델이나 locale API를 사용하지 않는 순수 함수다. redaction된 accessible name에 다음 처리를 순서대로 적용한다.

1. Unicode NFKC로 정규화한다.
2. U+0009~U+000D와 U+00A0을 U+0020으로 바꾸고 연속 U+0020을 하나로 합친 뒤 양끝 U+0020을 제거한다.
3. NFKC 이후 ASCII `A`~`Z`만 `a`~`z`로 바꾼다. locale-sensitive lowercasing은 사용하지 않는다.
4. 끝의 U+002E(`.`), U+0021(`!`), U+003F(`?`), U+003A(`:`), U+003B(`;`), U+2026(`…`) 연속 구간을 제거하고 다시 양끝 U+0020을 제거한다.
5. 결과 전체가 아래 alias 중 하나와 정확히 일치하면 해당 category를 사용한다. substring, stemming, fuzzy match와 번역은 금지한다. 빈 문자열은 `none`, 그 밖의 문자열은 `other`다.

| category | exact normalized aliases |
|---|---|
| `approve` | `approve`, `승인` |
| `cancel` | `cancel`, `취소` |
| `close` | `close`, `닫기` |
| `continue` | `continue`, `next`, `계속`, `다음` |
| `create` | `add`, `create`, `new`, `생성`, `새로 만들기`, `추가` |
| `delete` | `delete`, `remove`, `삭제`, `제거` |
| `edit` | `edit`, `수정`, `편집` |
| `filter` | `filter`, `필터` |
| `navigate` | `back`, `home`, `menu`, `previous`, `뒤로`, `메뉴`, `이전`, `홈` |
| `reject` | `deny`, `reject`, `거부`, `반려` |
| `save` | `save`, `save changes`, `변경 사항 저장`, `저장` |
| `search` | `find`, `search`, `검색`, `찾기` |
| `select` | `choose`, `select`, `선택` |
| `submit` | `apply`, `send`, `submit`, `신청`, `적용`, `전송`, `제출` |
| `toggle` | `collapse`, `expand`, `toggle`, `접기`, `펼치기` |

Profile의 mutation capability가 선언하는 `label_categories`에는 `other`와 `none`을 허용하지 않는다. 이 두 값은 fingerprint 구조 안정화에만 사용하며 임의 label의 행동 권한을 넓히지 않는다.

## 5. 직렬화와 hash

1. 2절 object를 RFC 8785 JSON Canonicalization Scheme으로 직렬화한다.
2. canonical JSON의 UTF-8 bytes만 hash 입력으로 사용한다. BOM, trailing newline, algorithm prefix 또는 length prefix를 추가하지 않는다.
3. SHA-256의 32-byte 결과를 RFC 4648 URL-safe base64로 인코딩하고 `=` padding을 제거한다. 결과는 정확히 43 ASCII characters다.
4. resolver request와 signed Profile의 `alg`와 fingerprint 문자열은 byte-for-byte 비교한다. 알 수 없는 algorithm, 길이·alphabet 오류 또는 mismatch는 `PROFILE_UNAVAILABLE`로 fail closed 하고 이전 Profile, pending confirmation, action과 page-selected tool을 폐기한다.

다음 canonical JSON은 v1 golden vector다. 줄바꿈 없이 정확히 665 UTF-8 bytes다.

```json
{"alg":"semantic-projection-fp-v1","nodes":[{"label_category":"other","label_ordinal":null,"ordinal":0,"parent_ordinal":null,"role":"main","state_capabilities":{"checkable":false,"expandable":false,"required":false,"selectable":false}},{"label_category":"other","label_ordinal":null,"ordinal":1,"parent_ordinal":0,"role":"textbox","state_capabilities":{"checkable":false,"expandable":false,"required":true,"selectable":false}},{"label_category":"save","label_ordinal":null,"ordinal":2,"parent_ordinal":0,"role":"button","state_capabilities":{"checkable":false,"expandable":false,"required":false,"selectable":false}}],"origin_class":"allowlisted-enterprise-origin"}
```

예상 fingerprint는 다음과 같다.

```text
hZ-9mp5UG9qpRc0_nh7yIYYW5WYDkALXQ1XUeqSQuus
```

## 6. 호환성과 필수 검증

canonical schema, node filtering/order, state 변환, alias 표, 정규화 또는 hash encoding 중 하나라도 바꾸면 기존 `semantic-projection-fp-v1`의 의미를 수정하지 않고 새 algorithm version을 추가해야 한다. extension, resolver, Profile signer, Native Host와 compatibility matrix가 새 version을 함께 지원하기 전에는 활성화하지 않는다.

구현은 최소한 다음을 자동 검증한다.

- golden canonical JSON의 byte length와 fingerprint가 5절 값과 정확히 일치한다.
- object key 삽입 순서가 달라도 같은 RFC 8785 bytes와 hash가 나온다.
- input value, 현재 checked/selected/expanded/disabled/enabled/visible, raw label 원문, `document_epoch`, `ref_id`, `model_ref`와 URL record ID 변경은 hash에 들어가지 않는다.
- `Save`, `SAVE!`, `저장`은 `save`; 빈 name은 `none`; 사전에 없는 name은 `other`다.
- preorder, role, state capability, parent/label relation 또는 category가 달라지면 hash가 달라진다.
- relation ordinal과 `null`을 서로 같은 값으로 취급하지 않는다.
- blocked origin, child-frame-only, oversize, unsupported enum, invalid relation과 unknown key 입력은 fingerprint 생성 전에 거부된다.
- 같은 페이지의 서로 다른 record fixture는 같은 hash를, major SPA semantic 변화 fixture는 다른 hash와 Profile/tool 폐기를 만든다.
