# 13. 사이트 도구 및 모델 계약

## 1. 모델에 제공하는 도구

모델은 현재 run의 아래 도구만 호출할 수 있다.

| 도구                       | 입력                         | 결과                   |
| -------------------------- | ---------------------------- | ---------------------- |
| `read_semantic_projection` | 없음                         | redacted 현재 snapshot |
| `find_by_ref`              | `model_ref`                  | target semantic state  |
| `click_by_ref`             | `model_ref`                  | 실행 결과              |
| `set_text_by_ref`          | `model_ref`                  | 값 입력 대기 또는 결과 |
| `select_option_by_ref`     | `model_ref`                  | 값 입력 대기 또는 결과 |
| `set_checked_by_ref`       | `model_ref`, boolean         | 실행 결과              |
| `press_key_by_ref`         | `model_ref`, allowlisted key | 실행 결과              |

모델은 URL, HTTP header, provider ID, API key, raw selector, raw `ref_id`, page credential, user identity를 받거나 지정할 수 없다.

## 2. site adapter와 WebMCP

site adapter는 확장에 포함된 코드 또는 사용자가 Settings에서 설치한 closed JSON schema여야 한다. adapter는 도구 설명과 preflight 힌트만 제공하며 권한을 부여하지 않는다. 페이지가 등록한 WebMCP tool도 `click` capability와 매 호출 confirmation을 통과해야 한다.

## 3. 결과 계약

provider response의 tool name, JSON schema, `model_ref`, enum 값은 현재 run registry와 정확히 일치해야 한다. unknown tool, extra field, 다른 run ref, stale document는 거부한다. action result에는 `VERIFIED`, `FAILED`, `UNKNOWN`, `CANCELLED`만 사용한다.
