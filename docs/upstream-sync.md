# Upstream Sync 계획

WebBrain upstream은 보안 patch source이지만 자동 merge source는 아니다. company fork의 최소 권한과 AI-DLC evidence를 유지하기 위해 변경을 하나씩 평가한다.

## 처리 흐름

```text
upstream change -> inventory -> security/license review -> isolated integration -> regression evidence -> accept or reject
```

| upstream 변경 유형 | 기본 처리 |
|---|---|
| security fix | 우선 평가; company policy/permission regression 후 선택적 cherry-pick |
| Chrome compatibility | 영향 분석 후 isolated test |
| generic agent/provider/cloud 기능 | 기본 거절 |
| tool/network/permission 확장 | ADR + security approval 없이는 거절 |
| dependency update | SBOM/license/vulnerability review 후 결정 |

## 기록 항목

각 검토는 upstream commit, 영향 파일, decision, ADR, test evidence, reviewer, company baseline version을 남긴다. S0에서 최초 pin과 inventory를 기록하고 이후 변경은 release Sprint 또는 security hotfix record에 연결한다.
