# 요구사항 추적성

이 표는 설계 요구가 구현·검증·release gate에서 누락되지 않도록 하는 구현 기준이다. `Verified (local)`은 저장소 내 재현 증적을 뜻하며 production GO 승인과 같지 않다.

| ID | 요구사항 | 설계 기준 | 구현 Sprint | 필수 검증 증적 | 상태 |
|---|---|---|---|---|---|
| RQ-01 | AX tree와 stable `ref_id`를 primary target으로 사용 | 상세 설계 8~9 | S3 | fixture/E2E + fallback usage review | Verified (local) |
| RQ-02 | LLM은 제안만 하고 결정적 코드가 authorization | 상세 설계 5.1, AGENTS | S1,S2 | policy bypass/direct invocation test | Verified (local) |
| RQ-03 | COMPANY_TOOLS만 모델에 노출 | 상세 설계 20, AGENTS | S1 | tool snapshot and registry test | Verified (local) |
| RQ-04 | ASK는 read-only | 상세 설계 6.1 | S1 | ASK mutation denial test | Verified (local) |
| RQ-05 | ACT는 enterprise allowlisted origin만 | 상세 설계 11 | S1 | external-origin denial test | Verified (local) |
| RQ-06 | R2 confirmation, R3 hard deny | 상세 설계 10,13 | S2 | confirmation/R3 test | Verified (local) |
| RQ-07 | 모든 mutation은 verifier; UNKNOWN retry 금지 | 상세 설계 22, AGENTS | S3 | verifier/UNKNOWN E2E | Verified (local) |
| RQ-08 | secret/raw page text가 log에 남지 않음 | 상세 설계 15,16,29 | S4 | redaction/negative audit test | Verified (local) |
| RQ-09 | minimum MV3 permission 및 단일 company provider | 상세 설계 4,7 | S1 | manifest/provider snapshots | Verified (local) |
| RQ-10 | CDP lifecycle이 Stop/종료에 detach | 상세 설계 42 | S5,S6 | lifecycle E2E | Pending live environment |
| RQ-11 | hostile page 및 malformed call fail closed | 상세 설계 12,27,30 | S6 | security regression suite | Verified (local) |
| RQ-12 | profile resolution은 LLM 없이 deterministic | 상세 설계 48~58 | S7 | resolver tests/review | Verified (local) |
| RQ-13 | unknown profile ACT deny 및 tool revoke | 상세 설계 55,59,60 | S7 | transition/outage E2E | Verified (local fail-closed) |
| RQ-14 | authoritative MCP failure에서 model guess 금지 | 상세 설계 56,64 | S7 | binding failure tests | Verified (local fail-closed) |
| RQ-15 | model quality와 browser correctness를 분리 평가 | 상세 설계 7.4,30.4 | S8 | versioned evaluation report | Local contract qualified; live evaluation pending |

## 유지 방법

- 새 요구사항은 ID를 추가하고 설계 기준, Sprint, 검증 증적을 같은 변경에 기입한다.
- 요구사항을 폐기하거나 완화할 때는 ADR 번호와 risk owner 승인을 남긴다.
- `Done` 상태는 해당 Sprint의 증적 링크가 `sprint-status.md`에 존재할 때만 사용할 수 있다.
