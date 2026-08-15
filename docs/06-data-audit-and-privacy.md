# 06. 데이터, 감사 및 개인정보 경계

## 1. 데이터 최소화

모델에 보내는 페이지 정보는 목적을 수행할 수 있는 최소 semantic AX 정보다. 원문 DOM, HTML, CSS, screenshot, 좌표, raw ref_id, input value, password/OTP/MFA, cookie, token, Authorization header를 기본 전송·저장·로그 대상에서 제외한다.

AX fingerprint는 Page Profile 해결에만 쓰며 다음을 포함할 수 있다: origin class, semantic role의 빈도/구조, 표준화된 label category, profile-safe landmark 관계. field value, raw label 원문, ref_id, coordinate는 포함하지 않는다.

## 2. 저장소별 허용 데이터

| 저장소 | 허용 | 금지 |
|---|---|---|
| 확장 `storage.local` | mode, non-secret preference, bounded run state, redacted audit | prompt, completion, page text, action value, credential |
| Managed Storage | 정책과 비밀이 아닌 client/deployment 식별 header | 장기 비밀, cookie, 사용자 assertion |
| Native Host memory | 현재 요청과 짧은 수명 assertion | 디스크 토큰 cache, raw 로그 |
| bridge 운영 로그 | request ID, route, status, duration, redacted error code | HTTP body, header value, token, streamed content |
| AI Hub | AI Hub 보존 정책에 필요한 최소 데이터 | 확장이 독자적으로 결정하지 않음 |

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
