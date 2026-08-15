# 03. Chrome MV3 확장 설계

## 1. 디렉터리와 모듈

```text
extension/
  manifest.json
  service-worker/        # coordinator, policy adapter, run state, audit sink
  content/               # AX collector, ref registry, deterministic DOM executor, verifier
  sidepanel/             # request, mode, confirmation, status, audit summary
  contracts/             # runtime messages, tool schemas, policy result schemas
  security/              # redaction, origin matcher, intent digest, input validators
```

런타임 모듈은 의존성 방향을 `UI/content → service worker → contracts/security`로 유지한다. content와 UI는 서로 직접 호출하지 않는다. 외부 HTTP와 Native Messaging은 service worker 또는 전용 native client adapter만 수행한다.

## 2. 최소 Manifest V3 원칙

- `manifest_version: 3`, service worker, side panel만 선언한다.
- 권한은 구현된 기능에 필요한 `storage`, `sidePanel`, `tabs`, `scripting`, `activeTab`, `nativeMessaging`으로 시작하고 릴리스마다 snapshot 검토한다.
- host permission은 company origin allowlist와 localhost bridge/SSO가 필요한 경우로만 한정한다. `<all_urls>`는 허용하지 않는다.
- remotely hosted code, `unsafe-eval`, broad `externally_connectable`, persistent background page는 금지한다.
- content script injection은 허용 origin에서 사용자 작업 또는 조정자의 최소 권한 요청과 함께 수행한다.

최종 권한은 구현 스파이크 뒤 threat review에서 확정한다. 사용하지 않는 권한은 즉시 manifest와 테스트에서 제거한다.

## 3. Managed Storage 계약

정책 키는 배포자가 제공하고 UI는 read-only로 표시한다. 사용자가 쓸 수 있는 `storage.local`에는 UI preference와 비민감 run state만 둔다.

```json
{
  "config_version": 1,
  "deployment_id": "company-prod",
  "allowed_origins": ["https://app.company.example"],
  "bridge": {
    "native_host_name": "com.company.company_web_agent",
    "wire_api": "chat",
    "request_headers": {"X-AI-Hub-Tenant": "company"}
  },
  "profiles": {"resolver_url": "https://mcp.company.example/page-profiles"},
  "audit": {"local_retention_days": 7}
}
```

이 JSON은 예시다. `request_headers`에는 API key·Bearer token·cookie를 넣지 않는다. 모든 key는 allowlist schema로 검증하고 알 수 없는 key 또는 config version은 fail closed 한다.

## 4. AX/ref_id 계약

각 snapshot에는 `document_epoch`, `frame_id`, stable `ref_id`, semantic role/name/state, 제한된 relation만 포함한다. text/value는 기본 redaction 규칙을 통과해야 한다. `ref_id`는 페이지 간·navigation 간 재사용할 수 없다.

DOM executor는 단일 action을 받고, target의 connected/visible/enabled/role/label을 preflight한다. 실행 뒤 observer 또는 재수집 AX state로 기대 결과를 확인한다. click은 navigation을 성공으로 간주하지 않고 profile/tool별 기대 결과가 있어야 한다.

## 5. 런타임 메시지

메시지는 `kind`, `schema_version`, `run_id`, `tab_id`, `document_epoch`, typed payload를 포함한다. 허용 종류는 `START_ASK`, `START_ACT`, `CONFIRM`, `CANCEL`, `CONTENT_SNAPSHOT`, `EXECUTE_ACTION`, `VERIFY_RESULT`, `PANEL_STATE`, `NATIVE_LLM_REQUEST`로 한정한다. sender context·tab·frame·run 상태가 맞지 않으면 거부한다.

웹 페이지와의 `postMessage`, external messaging, 임의 action string dispatch는 제공하지 않는다.

## 6. 장애 처리

- service worker 재시작: durable run summary만 복구하고, mutation run은 취소로 끝낸다.
- native host/bridge 단절: 모델 요청을 실패로 종료하며 재전송하지 않는다.
- profile/MCP 실패: Ask에서는 오류를 표시하고, Act business tool은 거부한다.
- content script 단절 또는 navigation: ref registry를 폐기하고 pending confirmation/action을 무효화한다.
