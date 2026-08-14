# 검증 및 Release Evidence 매트릭스

## Sprint 공통 게이트

| 항목 | 필수 시점 | 증적 |
|---|---|---|
| build/lint/unit | code 변경이 있는 모든 Sprint | CI run 또는 재현 명령 결과 |
| browser extension fixture/E2E | browser behavior 또는 UI 변경 Sprint | fixture 목록, E2E report/video/log link |
| tool exposure snapshot | tool/provider/mode/profile 변경 Sprint | reviewed snapshot diff |
| manifest permission snapshot | manifest/host permission 변경 Sprint | reviewed snapshot diff |
| documentation/traceability | 모든 Sprint 종료 | 변경 문서 link |
| security review | S1, S2, S4, S6, S7, S8 | reviewer record and residual-risk record |

## 요구사항별 검증 수준

| 영역 | Unit | Fixture/E2E | Security/Evaluation | Release blocker |
|---|---|---|---|---|
| provider/config/permissions | config precedence, endpoint policy | extension load | network/tool/manifest snapshots | unapproved provider or permission |
| mode/origin/tools | mode and allowlist policy | direct invocation paths | prompt injection/bypass | unauthorized mutation path |
| form mutation | schema and verifier | controlled input/select/combobox | stale ref/UNKNOWN no retry | unverified mutation success |
| risk/confirmation | R0~R3 classifier | approve/deny UI flow | R2 bypass/R3 execution | bypass or R3 execution |
| audit/redaction | redactor/schema | lifecycle event emission | secret/raw-content negative tests | any secret leak |
| lifecycle/resilience | detach/timeout state | Stop/navigation/SPA | malformed calls/CDP conflict | attach leak or fail-open |
| Page Profile MCP | schema/cache/resolver | profile transition | unknown/outage/binding failure | profile-scoped tool leak |
| Qwen/vLLM | tool argument contract | representative browser tasks | safety evaluation and drift comparison | thresholds below release minimum |

## AI evaluation record requirements

S8 평가 보고서는 최소한 다음을 기록한다.

- model ID, serving configuration, endpoint class, tool schema/context template version
- dataset/fixture version과 data sanitization confirmation
- tool selection accuracy, invalid argument rate, task completion rate
- unsafe action without confirmation, R3 execution, secret leakage, UNKNOWN retry counts
- 이전 승인 model 대비 regression 여부와 release decision

## Release 종료 조건

1. `sprint-status.md`의 S0~S8이 모두 `Done`이다.
2. 모든 RQ 항목이 검증 증적과 연결돼 있다.
3. high/critical finding은 0건이며, medium 이하 residual risk는 owner와 expiry를 포함해 기록돼 있다.
4. tool/permission/provider/profile snapshots가 승인된 기준과 일치한다.
5. SBOM, OSS license 검토, deployment/rollback rehearsal, monitoring/runbook 검토가 완료됐다.
