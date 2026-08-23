# 13. 사이트 도구 및 모델 계약

## 1. 모델에 제공하는 도구

모델은 현재 run의 아래 도구만 호출할 수 있다.

| 도구                       | 입력                                             | 결과                            |
| -------------------------- | ------------------------------------------------ | ------------------------------- |
| `read_semantic_projection` | 없음                                             | redacted 현재 snapshot          |
| `read_page`                | tab, scope, depth, parent `model_ref`, max chars | visible/hidden 계층형 tree      |
| `get_page_text`            | tab, max chars                                   | main/article 중심 visible text  |
| `find`                     | tab, query, scope, limit                         | visibility가 표시된 model refs  |
| `screenshot`               | tab                                              | current viewport image          |
| `zoom`                     | tab, capture region                              | cropped/normalized image        |
| `tabs_context`             | 없음                                             | managed tab group metadata      |
| `read_batch`               | 최대 8개 read-only action                        | 순서가 보존된 item results      |
| `update_plan`              | exact domains, high-level steps                  | 사용자 plan review              |
| `call_page_business_tool`  | Profile 허용 `tool_id`, 문자열 argument          | 검증된 Business MCP read result |
| `find_by_ref`              | `model_ref`                                      | target semantic state           |
| `click_by_ref`             | `model_ref`                                      | 실행 결과                       |
| `set_text_by_ref`          | `model_ref`                                      | 값 입력 대기 또는 결과          |
| `select_option_by_ref`     | `model_ref`                                      | 값 입력 대기 또는 결과          |
| `set_checked_by_ref`       | `model_ref`, boolean                             | 실행 결과                       |
| `press_key_by_ref`         | `model_ref`, allowlisted key                     | 실행 결과                       |
| `navigate`                 | normalized HTTPS URL                             | navigation/verifier 결과        |

`call_page_business_tool`은 서명된 현재 Profile의 binding에 있는 `tool_id`만 enum으로 노출한다. endpoint, result key, value kind, Profile JWS, request/run nonce와 page digest는 모델 입력이 아니며 service worker가 binding한다. 결과는 untrusted data로만 다음 모델 turn에 전달한다.

모델은 `navigate`와 redacted tab context에서 normalized URL의 origin/path만 지정·확인할 수 있다. HTTP header, provider ID, API key, raw selector, raw `ref_id`, CDP method/node/session ID/좌표/execution path, URL userinfo/query/fragment, page credential과 user identity를 받거나 지정할 수 없다.

`read_page`와 `find`의 기본 scope는 `all_dom`이며 hidden node를 모델에 제공한다. hidden result는 read focus에만 사용할 수 있고 click/type/select/check/key target으로 resolve하지 않는다. screenshot/zoom region도 capture 입력일 뿐 mutation coordinate가 아니다.

`read_batch`에는 `read_page`, `get_page_text`, `find`, screenshot/zoom, `tabs_context`와 Profile-bound read-only Business MCP만 들어갈 수 있다. mutation, navigation, file, JavaScript와 nested batch는 schema validation에서 거부한다.

### Profile 우선 Act discovery

Profile은 현재 페이지의 정보를 대체하는 필수 전제가 아니라, 페이지 snapshot만으로
확정할 수 없는 business action의 추가 계약이다. Service Worker는 매 Act run에서 아래
순서로 tool set을 만든다.

1. 유효하고 현재 document/fingerprint와 일치하는 Profile이 있으면 Profile action
   definition만 노출한다. 이 definition은 위험도, effect, 허용 role, option 값 및
   semantic verifier의 authority다.
2. 그런 Profile이 없으면 현재 semantic snapshot에서 확인한 visible, enabled,
   non-sensitive interactive element로 page-derived tool set을 만든다. 모델은 opaque
   `model_ref`만 받으며 한 번에 하나의 action만 제안한다.
3. Profile 부재는 Ask fallback이나 `PROFILE_UNAVAILABLE`의 사유가 아니다. safe
   candidate가 없을 때만 해당 Act run을 `PROFILE_UNAVAILABLE`으로 끝낸다.

Page-derived action은 현재 페이지에서 관찰된 UI를 쓰는 좁은 기본 경로다. link는
현재 snapshot에서 visible/enabled로 확인된 anchor만, 다른 input control은 실제 role,
상태 및 allowlisted 입력 형태가 실행 직전에 다시 일치할 때만 후보가 된다. 민감한
textbox, password/OTP/autofill field, hidden/occluded/stale target, selector·좌표·raw
URL·JavaScript는 후보가 될 수 없다. 외부 origin 이동, server-side effect, 또는
의미 있는 postcondition을 snapshot만으로 확인할 수 없는 action은 Profile definition이
필요하다.

모든 proposal은 Side Panel의 명시적 승인, capability permission, document/ref
preflight를 거친다. 승인 message는 raw ref나 사용자 값을 다시 받지 않고, proposal은
한 번만 실행한다. dispatch 뒤에는 재시도하지 않으며 verifier가 결과를 확인하지
못하면 `UNKNOWN` 또는 `FAILED`로 끝낸다.

## 2. site adapter와 WebMCP

site adapter는 확장에 포함된 코드 또는 사용자가 Settings에서 설치한 closed JSON schema여야 한다. adapter는 도구 설명과 preflight 힌트만 제공하며 권한을 부여하지 않는다. site adapter와 페이지는 CDP method, selector, 좌표 또는 `bounded_cdp` 선택을 선언할 수 없다. core tool registry만 primitive별 CDP 허용 여부를 소유하고 service worker가 preflight 결과로 실행 경로를 결정한다. 페이지가 등록한 WebMCP tool도 `click` capability와 매 호출 confirmation을 통과해야 하며 raw CDP로 변환하지 않는다.

## 3. 결과 계약

provider response의 tool name, JSON schema, `model_ref`, permission mode와 enum 값은 현재 run registry와 정확히 일치해야 한다. provider plugin은 tool을 추가하거나 schema를 완화할 수 없다. unknown tool, extra field, CDP-shaped field, 다른 run ref, stale document는 거부한다. action result에는 `VERIFIED`, `FAILED`, `UNKNOWN`, `CANCELLED`만 사용한다. `CDP_UNAVAILABLE`, `CDP_CONFLICT`, `CDP_COMMAND_NOT_ALLOWED`, `CDP_CLEANUP_FAILED`는 outcome이 아니라 redacted reason/health code다.
