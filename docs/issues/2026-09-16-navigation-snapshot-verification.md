# 이동 후 결과 snapshot 미확인

## 상태

0.1.57에서 동일 실패 재현. 추가 scope 보존 수정 구현 중이며 실제 사이트 성공은 미확인이다.

## 관측 증거

2026-09-16에 `127.0.0.1:9222` Chrome DevTools Protocol로 `ContextPilot` 개발 확장 `0.1.56`의 안전한 실행 trace만 조회했다. URL, DOM, 입력값, provider payload는 조회하거나 저장하지 않았다.

실패 요청은 dispatch 시작 6,321ms 뒤 6,427ms에 `URL_OR_SCOPE_CHANGED`를 기록했다. 따라서 이동 신호와 승인 목적지 일치는 관찰됐다. 그러나 21,564ms에 `UNKNOWN` terminal로 종료될 때까지 `SNAPSHOT_VALIDATED`와 `COMPLETION_VERIFIED`는 없었다. 새 페이지의 등록된 semantic snapshot을 15초 검증 시간 안에 얻지 못한 것이 직접 원인이다.

실패 뒤 현재 탭의 content snapshot 응답은 성공했다. 이 응답만으로 worker의 schema 검증 및 scope 조건 충족까지 입증되지는 않는다. 기존의 receiver 준비 지연 및 scripting 권한 원인 추정은 확정되지 않았고, 권한 부여 후에도 동일하게 실패했다.

0.1.57 재현 trace는 dispatch 6,544ms, 이동 신호 6,952ms, UNKNOWN 22,051ms였다. 코드에서 snapshot마다 DOCUMENT_REGISTER가 page_scope_epoch를 document_epoch로 초기화하는 결함을 확인했다. SPA 전환 후 새 scope가 등록돼도 snapshot 읽기가 그 증거를 지운다. 재등록 시 같은 문서의 scope를 보존하고, content snapshot 요청에서 실제 URL 변경을 확인해 scope를 갱신한다. URL은 content 내부 비교에만 사용하며 진단에 저장하지 않는다.

## 원인

`waitForPageTransition()`은 URL/page scope 변경 뒤 새 document/page scope와 일치하는 비어 있지 않은 semantic snapshot을 요구한다. 이 조건을 deadline까지 만족하지 못하면 navigation은 `UNKNOWN`으로 끝난다.

누락된 content receiver를 복구하는 경로는 `scripting` 권한이 있어야 번들 `js/content.js`를 현재 탭에 주입할 수 있다. 당시 debug profile에서 이 권한은 optional 상태이며 미부여(`false`)라서 그 복구 경로를 사용할 수 없었다.

또한 실행 runtime은 `NAVIGATION_UNVERIFIED`를 반환하지만, `MutationCoordinator.terminal()`이 code를 전달하지 않아 request terminal/diagnostics에 실패 code가 남지 않았다.

## 수정

- `scripting`을 optional 권한에서 필수 권한으로 승격했다. 복구 주입은 기존처럼 현재 탭과 번들 `js/content.js`만 사용한다.
- navigation 결과 검증 실패 시 `NAVIGATION_UNVERIFIED`를 run terminal까지 전달한다.
- mutation terminal이 error code를 `RunCoordinator`에 보존하도록 변경했다.
- navigation snapshot 실패 및 terminal code 보존 단위 테스트를 추가했다.

## 검증 기준

새 `dist-extension`을 로드하고 확장을 reload한 뒤 같은 이동 요청을 재현한다.

- 성공: `URL_OR_SCOPE_CHANGED` 뒤 `SNAPSHOT_VALIDATED`, `COMPLETION_VERIFIED`, `VERIFIED` terminal이 차례로 기록된다.
- 실패: terminal trace에 `NAVIGATION_UNVERIFIED`가 남아야 한다.
- 이동 후 content receiver가 없을 때: 필수 `scripting` 권한으로 번들 content script 복구가 가능해야 한다.

이 변경은 결과가 불명확할 때 자동 재실행하거나 성공으로 추정하지 않는다. deadline 안에 검증할 수 없으면 계속 `UNKNOWN`으로 종료한다.
