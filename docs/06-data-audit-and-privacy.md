# 06. 데이터, 감사 및 개인정보 경계

## 1. 데이터 최소화

모델에 보내는 페이지 정보는 목적을 수행할 수 있는 최소 DOM semantic projection 정보와 현재 run에만 유효한 `model_ref`다. `model_ref`는 opaque target correlation 용도이며 terminal 시 폐기하고 audit에는 넣지 않는다. 원문 DOM, HTML, CSS, screenshot, 좌표, raw ref_id, ref/model-ref 매핑, input value, password/OTP/MFA, cookie, token, Authorization header를 기본 전송·저장·로그 대상에서 제외한다.

semantic projection fingerprint는 Page Profile 해결에만 쓰며 [14의 `semantic-projection-fp-v1`](14-semantic-projection-fingerprint.md) closed canonical input만 허용한다. fingerprint object는 raw snapshot에서 key를 지우는 방식이 아니라 allowlist field로 새로 만들며, raw accessible name은 고정 label category를 계산한 뒤 버린다. visible node membership은 구조 identity로 반영하지만 visibility 값 자체는 field로 넣지 않는다. field value, raw label 원문, origin/path, document epoch, ref_id, model_ref, coordinate는 canonical JSON·hash·audit에 포함하지 않는다.

사용자가 Act에서 입력하는 protected value는 모델 proposal과 target preflight 뒤에만 수집한다. raw value는 Side Panel, service worker와 해당 content script 사이의 현재 run transient memory/Chrome 내부 IPC에만 존재하며, value slot·digest·raw value는 Host, bridge, LLM, persistent storage, audit, telemetry, error detail로 보내지 않는다. JavaScript string의 물리적 overwrite를 보장한다고 주장하지 않고 terminal/navigation/Stop/worker restart/TTL에 retained reference가 남지 않음을 검증한다.

## 2. 저장소별 허용 데이터

| 저장소 | 허용 | 금지 |
|---|---|---|
| 확장 `storage.local` | mode, non-secret preference, terminal run summary, redacted audit | active/transient run, prompt, completion, page text, action value, Profile body, credential |
| 확장 `storage.session`/worker memory | active run의 opaque ID·binding·slot·verified Profile reference | raw page/value의 persistence, content-script access |
| Managed Storage | origin·도구·risk·resolver 식별자 등 정책 key | 모든 header 이름/값, 장기 비밀, cookie, 사용자 assertion |
| Native Host durable store | Profile replay high-water mark와 OS 보호 metadata | Profile body, page text, ref/model ref, identity, assertion |
| Native Host memory | 현재 요청과 짧은 수명 assertion | 디스크 토큰 cache, raw 로그 |
| Business MCP run memory | 현재 run의 허용된 authoritative field value | profile JWS/subject token/value/provenance의 persistent cache, audit, telemetry |
| bridge 운영 로그 | request ID, route, status, duration, redacted error code | HTTP body, header value, token, streamed content |
| AI Hub | AI Hub 보존 정책에 필요한 최소 데이터 | 확장이 독자적으로 결정하지 않음 |

service worker는 bootstrap에서 `storage.managed`, `storage.local`, `storage.session`을 모두 `TRUSTED_CONTEXTS`로 제한한다. 접근 수준 잠금과 확인이 성공하기 전에는 run과 audit 처리를 시작하지 않는다. content script의 storage API 직접 접근은 모듈 경계와 실제 Chrome E2E 양쪽에서 실패해야 한다.

## 3. 감사 이벤트 계약

각 event는 JSON schema로 allowlist한다.

```json
{
  "event_id": "uuid",
  "occurred_at": "RFC3339",
  "run_id": "opaque-id",
  "deployment_id": "opaque-id",
  "event_type": "action_preflight|confirmation|action_outcome|policy_denied|transport_failure",
  "tool": "set_text_by_ref",
  "mode": "act",
  "origin_class": "allowlisted-enterprise-origin",
  "risk": "R1",
  "outcome": "allowed|denied|verified|failed|unknown|cancelled",
  "reason_code": "TARGET_STALE"
}
```

`event_type`, `tool`, `mode`, `risk`, `outcome`, `reason_code`는 enum이다. 모든 자유 텍스트, DOM identifier, ref_id, target label 원문, action argument, URL path/query, user identity, 모델 출력은 허용하지 않는다.

`get_authoritative_field`와 page-allowlisted `agentic-read` audit은 profile ID/version, server ID, tool ID, field ID(해당 시)와 결과 code만 추가할 수 있다. Business MCP `subject_token`, JWS, assertion, value, provenance 원문은 어떤 audit event에도 허용하지 않는다. profile가 명시하고 Host data-owner allowlist가 허용한 value만 현재 run에서 모델 또는 Side Panel로 전달할 수 있다. 상세 계약은 [13-page-profile-and-business-mcp-contract.md](13-page-profile-and-business-mcp-contract.md)를 따른다.

## 4. Redaction과 보존

- audit serializer는 schema allowlist 방식으로 작성한다. object를 복사한 뒤 몇 개 key를 지우는 blacklist 방식은 금지한다.
- 로그 함수는 structured event만 수락한다. 문자열 보간 기반 요청/응답 로그는 금지한다.
- 기본 로컬 보존 기간은 Managed policy로 설정한 최대 7일이며, 만료 task는 사용자가 아닌 확장 시작 시 결정적으로 정리한다. scheduler 기능을 제공하지 않는다.
- 운영자가 중앙 수집을 추가하려면 data owner, retention, access control, export/delete, DLP 검토를 담은 별도 ADR이 필요하다.

## 5. 사용자 고지

설치 전 포털과 Side Panel에는 다음을 간단히 고지한다.

1. 회사 Windows SSO 주체가 AI Hub 요청 권한에 사용된다.
2. Ask는 읽기 전용이고 Act는 회사 허용 사이트에서만 작동한다.
3. 특정 변경은 별도 확인이 필요하고 파괴적 행동은 수행하지 않는다.
4. 최소 작업 메타데이터가 회사 정책에 따라 감사될 수 있다.

고지는 data collection의 권한 상승이나 비밀값 수집의 근거가 되지 않는다.
