# 03. Chrome MV3 확장 설계

## 1. 디렉터리와 모듈

```text
extension/
  manifest.json
  service-worker/        # coordinator, policy adapter, run state, audit sink
  content/               # semantic projection collector, ref registry, deterministic DOM executor, verifier
  sidepanel/             # request, mode, confirmation, status, audit summary
  contracts/             # runtime messages, tool schemas, policy result schemas
  security/              # redaction, origin matcher, intent digest, input validators
```

런타임 모듈은 의존성 방향을 `UI/content → service worker → contracts/security`로 유지한다. content와 UI는 서로 직접 호출하지 않는다. 외부 HTTP와 Native Messaging은 service worker 또는 전용 native client adapter만 수행한다.

## 2. 최소 Manifest V3 원칙

- `manifest_version: 3`, service worker, side panel만 선언한다.
- 권한은 구현된 기능에 필요한 `storage`, `sidePanel`, `tabs`, `scripting`, `activeTab`, `nativeMessaging`으로 시작하고 릴리스마다 snapshot 검토한다.
- host permission은 release artifact의 `permission_origins`에 고정한다. policy의 page read, resolver, LLM egress origin은 이 집합의 부분집합이어야 하며 `<all_urls>`는 허용하지 않는다.
- remotely hosted code, `unsafe-eval`, broad `externally_connectable`, persistent background page는 금지한다.
- content script injection은 `permission_origins`에서만 수행한다. 새 host pattern, resolver 또는 MCP endpoint는 managed policy 변경만으로 추가할 수 없고, manifest·정책 bundle·compatibility matrix를 포함한 extension update로 배포한다. `activeTab`은 사용자의 명시적 gesture로 현재 탭을 일회성 읽는 development/support flow에만 사용할 수 있으며 Act 또는 자동 주입의 권한 확대 수단이 아니다.

최소 지원 Chrome은 `MessageSender.documentId`와 `documentLifecycle`을 제공하는 106 이상으로 고정한다. 최종 권한은 구현 스파이크 뒤 threat review에서 확정한다. 사용하지 않는 권한은 즉시 manifest와 테스트에서 제거한다.

## 3. Managed Storage 계약

정책 키는 배포자가 제공하고 UI는 read-only로 표시한다. `storage.local`에는 UI preference, redacted audit와 terminal run summary만 둘 수 있으며 active/transient run, value slot 또는 Profile body는 두지 않는다.

```json
{
  "config_version": 1,
  "deployment_id": "company-prod",
  "permission_origins": ["https://app.company.example", "https://mcp.company.example"],
  "page_read_origins": ["https://app.company.example"],
  "profile_resolver_origins": ["https://mcp.company.example"],
  "llm_egress_origins": ["https://app.company.example"],
  "bridge": {
    "native_host_name": "com.company.company_web_agent",
    "wire_api": "chat"
  },
  "profiles": {"resolver_url": "https://mcp.company.example/page-profiles"},
  "audit": {"local_retention_days": 7}
}
```

이 JSON은 예시다. bridge endpoint, static header, credential과 profile trust key는 여기에 넣지 않으며 Host/bridge 관리자 ACL 구성과 release artifact가 각각 소유한다. 모든 key는 allowlist schema로 검증하고 알 수 없는 key, config version 또는 `permission_origins` 밖 origin은 fail closed 한다. build-time manifest permission snapshot은 이 policy bundle과 정확히 일치함을 검사한다.

service worker bootstrap의 첫 비동기 작업은 `chrome.storage.managed.setAccessLevel({accessLevel: "TRUSTED_CONTEXTS"})`와 `chrome.storage.local.setAccessLevel({accessLevel: "TRUSTED_CONTEXTS"})`이다. 두 Promise가 모두 성공하기 전에는 content 등록, preview, Ask/Act와 audit write를 받지 않는다. 실패·미지원·worker 재시작 중 미완료 상태는 `STORAGE_BOUNDARY_UNAVAILABLE`로 fail closed 한다. transient run/value/profile state는 worker memory 또는 기본적으로 content script에 비노출인 `storage.session`만 사용하며 `storage.session`도 `setAccessLevel`로 `TRUSTED_CONTEXTS`를 명시한다. content script는 어떤 storage area도 직접 읽지 않는다.

## 4. Semantic projection/ref_id와 model_ref 계약

각 snapshot에는 `document_epoch`, `frame_id`, document 범위의 `ref_id`, DOM에서 계산한 semantic role/name/state, 제한된 relation만 포함한다. role은 유효한 ARIA role 또는 결정적 native element mapping을 사용하고, name은 accessible-name 계산 결과를 길이 제한·redaction한 값이며, state는 `disabled`, `checked`, `selected`, `expanded`, `required`만 허용한다. `ref_id`는 `frame_id + document_epoch + DOM node identity`를 registry 안에서 opaque token으로 매핑하며 DOM mutation으로 target identity/role/name이 바뀌면 폐기한다. text/value는 기본 redaction 규칙을 통과해야 한다. `ref_id`는 페이지 간·navigation 간 재사용할 수 없다.

실제 Chrome에서 수집하지 않는 항목은 browser AX node ID, computed accessibility tree, closed shadow DOM, cross-origin frame 내부 DOM, screenshot/coordinate, raw HTML/CSS와 모든 input value다. fixture는 이 제한을 흉내 내는 것이 아니라 Chrome E2E가 수집 가능한 위 필드를 assertion한다.

content script는 document start에 `document_epoch`를 한 번 생성해 최소 payload의 `DOCUMENT_REGISTER` 메시지로 service worker에 등록한다. 권한 근거는 payload의 tab/frame 값이 아니라 Chrome이 제공한 `sender.tab.id`, `sender.frameId`, `sender.documentId`, `sender.documentLifecycle`이다. service worker는 lifecycle이 `active`인 top/허용 frame만 채택하고 내부 `(tab, frame, documentId) → document_epoch` binding을 만든다. content가 주장한 tab/frame/document ID, prerender/frozen/cached document, 같은 tab/frame의 경쟁 old document, 등록 전 start와 navigation 뒤 늦은 snapshot은 거부한다. worker 재시작 뒤 content script가 같은 epoch를 보내더라도 현재 active sender documentId에 다시 결속하기 전에는 run을 시작하지 않는다. run coordinator는 epoch나 document identity를 생성·교체하지 않는다.

모델 요청 직전에 service worker는 snapshot의 각 내부 `ref_id`와 관계 ref를 같은 run의 crypto-random `model_ref`로 치환한다. `model_ref`는 snapshot과 proposal schema에만 존재하고, Host/LLM 응답의 proposal target은 정확히 하나의 현재 매핑으로만 해석할 수 있다. 알 수 없거나 이미 소비된 `model_ref`, 다른 run의 mapping, raw `ref_id`가 포함된 Host/LLM payload는 거부한다. mapping은 terminal transition, navigation, profile 변경, worker 재시작에 즉시 폐기하며 audit에 기록하지 않는다.

DOM executor는 단일 action을 받고, target의 connected/visible/enabled/role/label을 preflight한다. 실행 뒤 observer 또는 재수집 semantic projection state로 기대 결과를 확인한다. click은 navigation을 성공으로 간주하지 않고 profile/tool별 기대 결과가 있어야 한다.

## 5. 런타임 메시지

run-bound 메시지는 `kind`, `schema_version`, `run_id`, `tab_id`, `frame_id`, `document_epoch`, typed payload를 포함한다. 허용 종류는 `START_PREVIEW`, `START_ASK`, `START_ACT`, `SUBMIT_ACTION_VALUE`, `CONFIRM`, `CANCEL`, `CONTENT_SNAPSHOT`, `EXECUTE_ACTION`, `VERIFY_RESULT`, `PANEL_STATE`, `NATIVE_LLM_REQUEST`로 한정한다. 별도 초기 등록 메시지 `DOCUMENT_REGISTER`는 `run_id` 없이 content script만 보낼 수 있으며 payload에는 document epoch만 둔다. service worker는 payload metadata가 아니라 authoritative sender tab/frame/documentId/lifecycle과 현재 active document를 검증한다. sender context·등록 document binding·run 상태가 맞지 않으면 거부한다.

value tool은 model proposal과 target preflight 뒤 service worker가 만든 run/target/tool 한정 `value_slot_id`로만 `PANEL_STATE/AWAITING_VALUE → SUBMIT_ACTION_VALUE → EXECUTE_ACTION` 순서를 진행한다. raw value는 마지막 두 extension-internal message의 allowlisted payload에만 존재하고 `ActionIntent`, model/Host message, storage, audit에는 존재하지 않는다. slot은 TTL 5분 이내이며 한 번 consume하거나 terminal/navigation/profile-change/worker-restart가 되면 value reference와 함께 폐기한다. exact schema와 digest는 [12의 value slot 계약](12-low-cost-agent-implementation-spec.md)을 따른다.

웹 페이지와의 `postMessage`, external messaging, 임의 action string dispatch는 제공하지 않는다.

## 6. 장애 처리

- service worker 재시작: durable run summary만 복구하고, mutation run은 취소로 끝낸다.
- native host/bridge 단절: 모델 요청을 실패로 종료하며 재전송하지 않는다.
- profile/MCP transport·검증 실패: Ask에서는 오류를 표시하고, Act business tool은 거부한다. 서명된 `UNKNOWN_PROFILE`은 실패가 아니며 Ask의 basic read-only tool만 남기고 Act와 모든 business tool을 거부한다.
- content script 단절 또는 navigation: ref registry를 폐기하고 pending confirmation/action을 무효화한다.

## 7. Page Profile trust, fingerprint 및 replay cache 계약

resolver request/response schema, JWS claim, tool/verifier 및 authoritative field declaration의 closed schema는 [13-page-profile-and-business-mcp-contract.md](13-page-profile-and-business-mcp-contract.md)를 따른다. 이 문서의 trust/replay 규칙과 13의 API 규칙 중 하나라도 충족하지 않으면 profile은 사용할 수 없다.

- resolver는 HTTPS endpoint이고 response body는 `profile_id`, monotonic `profile_version`, `issued_at`, `expires_at`, origin/path matcher, `fingerprint_alg`, value-free projection fingerprint, tool/verifier declarations를 포함한 JWS(ES256)다. extension release artifact의 key ring만 검증 키를 제공하며 key rotation은 overlap key ID와 compatibility matrix를 포함한 extension update로만 한다.
- extension은 audience=deployment ID, `issued_at` clock skew, 최대 24시간 TTL, 64 KiB response limit, key ID, signature, origin/path/fingerprint match를 모두 검증한다. 만료·미래 발급·unsigned·알 수 없는 key·크기 초과 profile은 거부한다.
- resolver origin은 `permission_origins`에 포함되어야 한다. matcher는 exact origin → longest path prefix → profile ID/version 순으로 결정하며 동률 또는 복수 일치는 deny한다.
- `fingerprint_alg`는 현재 `semantic-projection-fp-v1`만 허용한다. exact canonical schema, top-frame visible node filtering/order, 포함 node의 현재 field/UI 상태를 제외한 state capability, origin class, label category 정규화와 alias 표, RFC 8785 직렬화, SHA-256 unpadded base64url 및 golden vector는 [14-semantic-projection-fingerprint.md](14-semantic-projection-fingerprint.md)를 따른다. visibility membership은 profile identity이므로 toggle 시 hash를 다시 계산하고 이전 tool을 철회한다. raw label, value, URL path/query, ref/model ref는 입력에 없다. 알 수 없는 알고리즘 또는 mismatch는 profile을 거부하고 진행 중 action을 취소한다.
- extension의 빠른 cache는 비권한적이며, replay high-water mark는 Native Host의 관리자 ACL·OS 보호 durable store에 `(deployment_id, profile_id) → (profile_version, signed_definition_digest)` 하나만 저장한다. digest는 13의 JWS-signed 안정 Profile 정의 projection만 포함하고 record별 nonce/context/subject token은 제외한다. Host CAS는 `higher version`이면 advance, `same version + same definition digest`이면 idempotent accept, `same version + different definition digest` 또는 lower version이면 reject한다. matcher/fingerprint/tool 정의 변경도 version 상승이 필요하다. 손상/rollback된 store나 초기 enrollment 뒤 store 소실은 운영 재동기화 전 `PROFILE_UNAVAILABLE`다.
- 새 profile과 durable high-water mark가 모두 성공한 뒤에만 extension cache를 atomic swap 한다. resolver transport 오류에는 동일 active document와 13의 exact page-context binding, matcher/fingerprint/version/JWS digest를 가진 서명 검증·미만료 cache만 사용하며 Host의 idempotent same-version CAS를 다시 통과한다. cache miss·만료·resolver invalid response·cache corruption 시 old profile을 사용하는 action, pending confirmation, ref registry를 즉시 취소한다.
