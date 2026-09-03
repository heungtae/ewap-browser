# 15. Bounded CDP Adapter 계약

## Enterprise Web AI Platform 정렬 (2026-08-31)

이 계약은 Enterprise Browser Runtime에서도 그대로 **local hard guard**로
승격한다.

-   Enterprise PDP의 ALLOW는 closed CDP allowlist, sensitive target
    block, stale binding, preflight, detach/quarantine, verifier를
    우회할 수 없다.
-   Profile은 execution path나 CDP method를 지정하지 않는다. Profile
    action은 semantic target/risk/verifier만 선언한다.
-   WRITE/PRIVILEGED/CRITICAL에서 dispatch 후 결과가 확정되지 않으면
    `UNKNOWN`이며 자동 재시도하지 않는다.
-   Runtime Evidence는 `dom|bounded_cdp` execution path와
    stage/outcome/reason만 기록하며 node/ref/coordinate/value는 기록하지
    않는다.

## 1. 결정

  항목            값
  --------------- ------------------------------
  설계 결정       Adopted
  구현 상태       Planned, S2
  권한            `debugger`, 사내 host 범위
  제품 CDP 수준   Level 2 bounded adapter
  Offscreen       provider localhost/PNA proxy

제품은 WebBrain의 전체 CDP 실행 플랫폼을 도입하지 않고 Level 2 bounded
CDP adapter를 사용한다. 목적은 일반 DOM executor로 만들 수 없는 trusted
mouse·keyboard·text input을 승인된 사내 UI에 전달하는 것이다.

이 결정은 다음 경계를 유지한다.

-   semantic projection과 모델 target은 계속 `model_ref`를 사용한다.
-   content script가 `document_epoch`, `ref_id`, visibility,
    sensitivity와 action preflight의 권위자다.
-   service worker가 permission, risk, confirmation, execution path, CDP
    lifecycle과 verifier를 소유한다.
-   모델, provider plugin, 페이지와 site adapter는 raw CDP surface를 볼
    수 없다.
-   provider localhost/PNA POST는 Offscreen document proxy에서 수행한다.
    Offscreen은 provider network 경계에만 사용하며 CDP lifecycle이나
    페이지 자동화 권한을 확장하지 않는다.

## 2. 적용 범위

기본 실행 경로는 DOM executor다. tool registry가 해당 primitive에
`bounded_cdp`를 허용하고 content preflight가 synthetic DOM dispatch로
신뢰성 있게 실행할 수 없음을 dispatch 전에 판정한 경우에만 CDP 경로를
사용한다.

초기 지원 범위:

-   `click_by_ref`의 left-button trusted click
-   `press_key_by_ref`의 closed allowlist key
-   `set_text_by_ref`의 focus와 trusted text insertion
-   실행 직전 scroll, box와 hit-test 확인

초기 제외 범위:

-   arbitrary JavaScript와 `Runtime.evaluate`
-   console, Log와 Network 진단
-   `Target.setAutoAttach`, child target와 cross-origin OOPIF 자동화
-   screenshot과 vision 입력
-   file picker와 upload
-   closed shadow DOM discovery
-   download, navigation과 network write를 CDP로 직접 실행
-   model 또는 page가 지정하는 selector, node ID, 좌표와 CDP method

실UI E2E harness는 제품 외부에서 더 넓은 remote-debugging CDP를 사용할
수 있다. 해당 harness 권한은 product allowlist를 확장하지 않는다.

S6의 screenshot/zoom은 이 mutation adapter를 확장하지 않고 별도 typed
`vision_read` adapter로 구현한다. vision 결과는 semantic target,
coordinate 또는 mutation authority를 만들지 않는다.

## 3. Closed command allowlist

  ----------------------------------------------------------------------------
  Domain    허용 command                  제한
  --------- ----------------------------- ------------------------------------
  `DOM`     `enable`, `disable`           현재 action session에서만 사용

  `DOM`     `getDocument`,                extension이 생성한 action token
            `querySelectorAll`            selector만 허용

  `DOM`     `scrollIntoViewIfNeeded`,     유일하게 해석된 bound node만 허용
            `getBoxModel`                 

  `DOM`     `getNodeForLocation`,         hit test와 bound-token 재확인에만
            `getAttributes`, `focus`      사용

  `Input`   `dispatchMouseEvent`          left button, click count 1, 검증된
                                          box 내부 point만 허용

  `Input`   `dispatchKeyEvent`            tool registry의 closed key enum만
                                          허용

  `Input`   `insertText`                  현재 action의 ephemeral
                                          user-supplied value만 허용
  ----------------------------------------------------------------------------

method 이름과 parameter는 typed builder가 만든다. raw JSON command,
unknown field, 다른 domain, negative/out-of-viewport coordinate,
right/middle button, arbitrary modifier와 반복 count는
`CDP_COMMAND_NOT_ALLOWED`로 dispatch 전에 거부한다.

allowlist 확장은 architecture, security policy, 이 문서, S2 negative
test와 manifest permission snapshot을 같은 변경에서 갱신해야 한다.

## 4. Target binding과 preflight

CDP action binding은 다음 값을 포함한다.

``` ts
type BoundedCdpAction = {
  runId: string;
  actionId: string;
  tabId: number;
  frameId: number;
  documentId: string;
  documentEpoch: string;
  refId: string;
  tool: "click_by_ref" | "press_key_by_ref" | "set_text_by_ref";
  risk: "R1" | "R2";
  confirmationDigest?: string;
  actionToken: string;
};
```

`actionToken`은 extension이 생성한 128-bit 이상 무작위 일회용 값이며
model/provider/audit/storage에 기록하지 않는다. content script는 현재
`ref_id`의 element를 다시 확인하고 클릭의 경우
`document.elementFromPoint`가 반환한 target 또는 그 descendant를
token으로 표시한다.

service worker는 permission/confirmation 완료 후 closed
`PREPARE_BOUNDED_CDP_TARGET` message로 current binding과 token을
전달한다. content script는 extension service-worker sender와 exact
tab/frame/document를 확인한 뒤에만 marker를 만든다.
`CLEAR_BOUNDED_CDP_TARGET`은 동일 binding의 token만 제거한다. 이 두
message는 model tool schema와 Side Panel API에 존재하지 않는다.

adapter는 다음 순서로 target을 확인한다.

1.  sender tab/frame/document와 action binding이 일치한다.
2.  sender에서 확정한 exact origin이 `permission_origins`와 capability ×
    host grant에 포함되고 restricted/loopback/IP/file URL이 아니다.
3.  `documentEpoch`, role, name, state와 DOM identity가 preflight
    snapshot과 일치한다.
4.  password, OTP, token, secret와 sensitive autocomplete 대상이 아니다.
5.  target은 connected, visible, enabled이고 content preflight에서
    occluded가 아니다.
6.  token selector가 정확히 한 node를 반환한다.
7.  box가 유효하고 hit-test node의 token이 current action과 일치한다.
8.  dispatch 직전에 document와 permission/confirmation binding이 아직
    유효하다.

하나라도 실패하면 `TARGET_NOT_ACTIONABLE` 또는 `TARGET_STALE`로 종료하며
CDP input을 보내지 않는다. 페이지가 token을 복제하거나 이동하면 유일성
검사가 실패한다. token은 모든 terminal path의 content-script
`finally`에서 제거한다.

## 5. 실행과 fallback

``` text
tool proposal
  → model_ref/ref_id 해석
  → capability × host와 risk 확인
  → R2 confirmation
  → content preflight
  → DOM 또는 bounded CDP 경로를 dispatch 전에 확정
  → CDP attach와 target revalidation
  → trusted input 한 건
  → semantic/navigation verifier
  → detach
```

DOM executor가 dispatch 전에 `trusted_input_required`를 반환하고 tool
definition이 bounded CDP를 허용하는 경우에는 CDP 경로로 전환할 수 있다.
DOM event 또는 CDP input 중 하나라도 전송된 뒤에는 다른 경로로
fallback하거나 자동 재시도하지 않는다.

verification 결과는 기존 `VERIFIED`, `FAILED`, `UNKNOWN`, `CANCELLED`만
사용한다. input 전송 뒤 target 변화가 확정되지 않으면 `UNKNOWN`이며 같은
action을 자동 반복하지 않는다.

## 6. Attach와 detach lifecycle

attach는 모든 policy와 confirmation 검사 뒤, input 실행 직전에 대상
tab에 대해 수행한다. session은 action-scoped이며 검증이 끝나면
`finally`에서 `DOM.disable`과 detach를 시도한다.

service worker는 attach 전에 `chrome.storage.session`에 secret 없는
`{tabId, runId, actionId, phase: "attaching"}` marker를 저장하고 attach
성공 callback에서 `phase: "attached"`로 바꾼다. 정상 detach 뒤 marker를
제거한다.

worker 시작 시 marker를 복구하되 `attached`라는 저장값만으로 소유권을
단정하지 않는다. exact tab에 allowlisted no-input ownership probe를 보내
현재 extension session이 command를 보낼 수 있는 경우에만 detach한다.
probe가 "not attached"를 반환하면 다른 extension, DevTools 또는 외부
harness를 detach하지 않는다. attach 성공 여부가 불명확하거나 probe
자체가 실패하면 tab을 `CDP_CLEANUP_FAILED`로 격리하고 상태 변경을
계속하지 않는다.

다음 사건은 즉시 dispatch 중단과 cleanup을 요구한다. 단, 이미 dispatch한
closed exact-navigation verifier는 새 문서의 정확한 origin/path를
확인하는 짧은 `VERIFYING_NAVIGATION` 단계만 유지한다. 이 예외는 추가
input, ref 재사용 또는 permission/confirmation 상속을 허용하지 않으며,
mismatch·timeout은 자동 재시도 없이 `UNKNOWN`이다.

-   Stop 또는 run cancellation
-   navigation, frame 교체와 document epoch 변경
-   tab close
-   permission 철회
-   confirmation binding 만료
-   CDP `onDetach`
-   service-worker suspend/restart recovery

attach가 다른 debugger 때문에 실패하면 `CDP_CONFLICT`, 기타 attach
불가면 `CDP_UNAVAILABLE`이다. input 전이면 `FAILED`, input 후 verifier가
결과를 확정하지 못하면 `UNKNOWN`이다.

detach 실패는 `CDP_CLEANUP_FAILED` health state와 redacted audit을
남기고 해당 tab의 다음 Act를 차단한다. bounded cleanup을 다시 수행하거나
tab close/onDetach가 확인될 때까지 DOM fallback으로 상태 변경을 계속하지
않는다.

## 7. 개인정보와 감사

CDP session에서 읽은 node ID, action token, 좌표, box, raw attribute와
ephemeral text는 저장하거나 provider에 보내지 않는다. screenshot,
console, network header/body와 page source는 product CDP가 수집하지
않는다.

감사에는 다음만 기록한다.

-   timestamp, host, run mode, tool과 risk
-   execution path `bounded_cdp`
-   attach/dispatch/verify/detach 단계
-   outcome과 reason code

`ref_id`, `model_ref`, tab ID, node ID, selector, token, 좌표, action
value와 페이지 내용은 기록하지 않는다.

## 8. 필수 negative test

-   raw/unknown CDP method, domain과 parameter 거부
-   model, provider, page와 site adapter의 selector·좌표·execution-path
    주입 거부
-   stale document/ref와 cross-tab/frame binding 거부
-   미승인/restricted origin은 `chrome.debugger.attach` 호출 0
-   duplicated/missing/moved action token과 occluded hit test 거부
-   sensitive field에 대한 focus, key와 text dispatch 거부
-   R2 confirmation 전 attach와 dispatch가 발생하지 않음
-   DOM 또는 CDP dispatch 뒤 fallback·자동 재시도가 발생하지 않음
-   DevTools/다른 debugger attach 충돌 시 fail-closed
-   Stop, navigation, tab close와 정상 terminal 뒤 attached product
    session 0
-   worker restart marker recovery가 product-owned session만 cleanup
-   detach 실패 tab quarantine과 다음 Act 차단
-   CDP data가 prompt, provider, storage, audit와 diagnostics에 포함되지
    않음
-   외부 E2E remote-debugging 권한이 product allowlist에 유입되지 않음
