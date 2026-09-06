# 13. 사이트 도구 및 모델 계약

## MCP: AS-IS와 Target 구분 (2026-09-06)

현재 `call_page_business_tool`은 signed Profile의 closed business_mcp binding에서 tool_id enum을 만들고 직접 HTTPS POST한다. 표준 MCP discovery/streaming client나 enterprise Gateway admission은 구현되어 있지 않다. 고정 allow-list를 없애는 설계로 바꾸지 않는다.

Target은 `Platform Registry discovery/health → approved catalog/overlay → frozen release → Browser verified binding → current identity/PDP/tool allow-list → Gateway → enterprise server`다. discovery caller와 catalog owner는 Platform Worker이며 Browser는 관리자 API를 호출하지 않는다. PROD는 Gateway 필수, DEV/TEST/STAGE direct는 승인된 환경별 예외와 동등한 auth/trust/policy/audit/revoke 검증이 있을 때만 허용하는 목표다.

공유 PageProfile.mcpServers의 id/name/url/transport/tools와 현재 server_id/endpoint/tool_id/arguments의 차이는 [22번](22-page-profile-provider-design.md)에 mapping을 기록한다. Platform logical serverRef-only source와 공유 inline endpoint schema의 충돌은 [C03](platform-alignment.md)이며 이번 문서로 해결하거나 API를 바꾸지 않는다.

현재 executor는 tool_id membership과 해당 tool의 closed argument schema를 검사하고 결과 schema/크기를 검증한다. Target은 조직 policy의 allowedTools/allowedMcpServers, Profile 선택, approved catalog와 Browser 지원 집합의 교집합을 실행 allow-list로 삼고 explicit deny를 우선한다. endpoint/credential/JWS/nonces/digest는 model catalog에 포함하지 않는다. MCP result는 항상 untrusted data다.

현재 Ask는 최초 Profile/JWS/page digest를 재사용하며 매 business call 직전 fresh snapshot/expiry/revoke/PDP 검사를 하지 않는다. catalog_checksum/server_release_id/environment는 현재 binding validator가 거부하는 field다. MCP_* Platform 오류 정규화, freshness와 governed auth는 Planned이며 현재 BUSINESS_MCP_* 코드와 구분한다.

## 1. 모델에 제공하는 도구

모델은 현재 run의 아래 도구만 호출할 수 있다.

  -----------------------------------------------------------------------------------
  도구                         입력                             결과
  ---------------------------- -------------------------------- ---------------------
  `read_semantic_projection`   없음                             redacted 현재
                                                                snapshot

  `read_page`                  tab, scope, depth, parent        visible/hidden 계층형
                               `model_ref`, max chars           tree

  `get_page_text`              tab, max chars                   main/article 중심
                                                                visible text

  `find`                       tab, query, scope, limit         visibility가 표시된
                                                                model refs

  `screenshot`                 tab                              current viewport
                                                                image

  `zoom`                       tab, capture region              cropped/normalized
                                                                image

  `tabs_context`               없음                             current active tab
                                                                metadata

  `read_batch`                 최대 8개 read-only action        순서가 보존된 item
                                                                results

  `update_plan`                exact domains, high-level steps  사용자 plan review

  `call_page_business_tool`    Profile 허용 `tool_id`, 문자열   검증된 Business MCP
                               argument                         read result

  `find_by_ref`                `model_ref`                      target semantic state

  `click_by_ref`               `model_ref`                      실행 결과

  `set_text_by_ref`            `model_ref`                      값 입력 대기 또는
                                                                결과

  `select_option_by_ref`       `model_ref`                      값 입력 대기 또는
                                                                결과

  `set_checked_by_ref`         `model_ref`, boolean             실행 결과

  `press_key_by_ref`           `model_ref`, allowlisted key     실행 결과

  `navigate`                   observed HTTP(S) link의          navigation/verifier
                               `model_ref`                      결과
  -----------------------------------------------------------------------------------

`call_page_business_tool`은 서명된 현재 Profile의 binding에 있는
`tool_id`만 enum으로 노출한다. endpoint, result key, value kind, Profile
JWS, request/run nonce와 page digest는 모델 입력이 아니며 service
worker가 binding한다. 결과는 untrusted data로만 다음 모델 turn에
전달한다.

모델은 `navigate`에서 현재 snapshot의 opaque `model_ref`만 지정할 수
있다. Service Worker와 content script가 dispatch 직전에 observed HTTP(S)
anchor인지 다시 확인하고, external origin 이동도 Side Panel의 명시적
승인과 navigation permission을 거친다. HTTP header, provider ID, API
key, raw selector, raw `ref_id`, CDP method/node/session
ID/좌표/execution path, URL userinfo/query/fragment, page credential과
user identity를 받거나 지정할 수 없다.

`read_page`와 `find`의 기본 scope는 `all_dom`이며 hidden node를 모델에
제공한다. hidden result는 read focus에만 사용할 수 있고
click/type/select/check/key target으로 resolve하지 않는다.
screenshot/zoom region도 capture 입력일 뿐 mutation coordinate가 아니다.

현재 `read_batch` 실행기는 `read_page`, `get_page_text`, `find`만 허용한다.
screenshot/zoom, tabs_context와 Business MCP의 batch 지원은 구현되어 있지 않다.
mutation, navigation, file, JavaScript와 nested batch는 schema
validation에서 거부한다.

### 현재 페이지 우선 Act discovery

현재 페이지의 semantic snapshot은 Act discovery의 SSoT다. Profile은 현재
페이지에서 관찰할 수 없는 business action 또는 verifier 정보를 보완하는
추가 계약이며, snapshot을 대체하거나 우선하지 않는다. Service Worker는
매 Act run에서 아래 순서로 tool set을 만든다.

1.  현재 semantic snapshot에서 확인한 visible, enabled, non-sensitive
    interactive element로 page-derived tool set을 먼저 만든다. 모델은
    opaque `model_ref`만 받으며 한 번에 하나의 action만 제안한다.
2.  page-derived safe candidate가 없고, 유효하며 현재
    document/fingerprint와 일치하는 Profile이 있을 때만 Profile action
    definition을 사용한다. 이 definition은 snapshot 만으로 확정할 수
    없는 위험도, effect, 허용 role, option 값 및 semantic verifier를
    보완한다.
3.  Profile 부재는 Ask fallback이나 `PROFILE_UNAVAILABLE`의 사유가
    아니다. page-derived candidate와 보완 가능한 Profile definition이
    모두 없을 때만 해당 Act run을 `PROFILE_UNAVAILABLE`으로 끝낸다.

Page-derived action은 현재 페이지에서 관찰된 UI를 쓰는 좁은 기본 경로다.
link는 현재 snapshot에서 visible/enabled로 확인된 HTTP(S) anchor만, 다른
input control은 실제 role, 상태 및 allowlisted 입력 형태가 실행 직전에
다시 일치할 때만 후보가 된다. 민감한 textbox, password/OTP/autofill
field, hidden/occluded/stale target, selector·좌표·raw URL·JavaScript는
후보가 될 수 없다. server-side effect 또는 의미 있는 postcondition을
snapshot만으로 확인할 수 없는 action은 Profile definition이 필요하다.
external origin 이동은 Profile 대신 별도의 navigation permission과
명시적 승인으로 경계를 유지한다.

모든 proposal은 Side Panel의 명시적 승인, capability permission,
document/ref preflight를 거친다. 승인 message는 raw ref나 사용자 값을
다시 받지 않고, proposal은 한 번만 실행한다. dispatch 뒤에는 재시도하지
않으며 verifier가 결과를 확인하지 못하면 `UNKNOWN` 또는 `FAILED`로
끝낸다.

## 2. site adapter와 WebMCP

site adapter는 확장에 포함된 코드 또는 사용자가 Settings에서 설치한
closed JSON schema여야 한다. adapter는 도구 설명과 preflight 힌트만
제공하며 권한을 부여하지 않는다. site adapter와 페이지는 CDP method,
selector, 좌표 또는 `bounded_cdp` 선택을 선언할 수 없다. core tool
registry만 primitive별 CDP 허용 여부를 소유하고 service worker가
preflight 결과로 실행 경로를 결정한다. 페이지가 등록한 WebMCP tool도
`click` capability와 매 호출 confirmation을 통과해야 하며 raw CDP로
변환하지 않는다.

## 3. 결과 계약

provider response의 tool name, JSON schema, `model_ref`, permission
mode와 enum 값은 현재 run registry와 정확히 일치해야 한다. provider
plugin은 tool을 추가하거나 schema를 완화할 수 없다. unknown tool, extra
field, CDP-shaped field, 다른 run ref, stale document는 거부한다. action
result에는 `VERIFIED`, `FAILED`, `UNKNOWN`, `CANCELLED`만 사용한다.
`CDP_UNAVAILABLE`, `CDP_CONFLICT`, `CDP_COMMAND_NOT_ALLOWED`,
`CDP_CLEANUP_FAILED`는 outcome이 아니라 redacted reason/health code다.
