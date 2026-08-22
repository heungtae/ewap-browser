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

### 반도체 데모 Act proposal

내장 반도체 데모의 정확한 HTTPS origin과 `trend-analysis.html`에서만 Act chat은 아래 proposal 도구를 추가로 받는다. proposal은 실행이 아니며, Side Panel의 매 단계 사용자 승인이 필요하다.

| 도구                    | 입력                          | 실행 전 검증                                                 |
| ----------------------- | ----------------------------- | ------------------------------------------------------------ |
| `propose_select_option` | 현재 `model_ref`, option text | 허용된 demo combobox, visible/enabled 상태, 실제 option 존재 |
| `propose_click`         | 현재 `model_ref`              | 정확한 `수율 추세 분석 실행` button, visible/enabled 상태    |

Service Worker는 proposal ID만 Side Panel에 전달한다. 승인 message는 raw ref나 option value를 다시 받지 않으며, proposal은 한 번만 실행할 수 있다. 선택 후에는 새 projection과 새 run-scoped model ref를 사용해 다음 단계를 제안한다.

## 2. site adapter와 WebMCP

site adapter는 확장에 포함된 코드 또는 사용자가 Settings에서 설치한 closed JSON schema여야 한다. adapter는 도구 설명과 preflight 힌트만 제공하며 권한을 부여하지 않는다. site adapter와 페이지는 CDP method, selector, 좌표 또는 `bounded_cdp` 선택을 선언할 수 없다. core tool registry만 primitive별 CDP 허용 여부를 소유하고 service worker가 preflight 결과로 실행 경로를 결정한다. 페이지가 등록한 WebMCP tool도 `click` capability와 매 호출 confirmation을 통과해야 하며 raw CDP로 변환하지 않는다.

## 3. 결과 계약

provider response의 tool name, JSON schema, `model_ref`, permission mode와 enum 값은 현재 run registry와 정확히 일치해야 한다. provider plugin은 tool을 추가하거나 schema를 완화할 수 없다. unknown tool, extra field, CDP-shaped field, 다른 run ref, stale document는 거부한다. action result에는 `VERIFIED`, `FAILED`, `UNKNOWN`, `CANCELLED`만 사용한다. `CDP_UNAVAILABLE`, `CDP_CONFLICT`, `CDP_COMMAND_NOT_ALLOWED`, `CDP_CLEANUP_FAILED`는 outcome이 아니라 redacted reason/health code다.
