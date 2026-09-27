# S13 — Browser 로컬 Act evidence (Completed)

## 완료 범위

현행 Browser의 Act proposal policy 접점과 run terminal 접점에서
제한된 감사 metadata를 생성한다. `chrome.storage.managed`의 선택적
`runtime_evidence` HTTPS endpoint가 있으면 전송하고, 없으면 생략한다.

| 카드 | 종료 조건 | 판정 |
| --- | --- | --- |
| S13-B1 closed AuditEvent | `policy`/`terminal`의 허용 필드와 enum·ID·origin을 런타임 검증하고 raw 필드·URL path·알 수 없는 code를 거부 | Completed |
| S13-B2 Act policy correlation | 최초 proposal과 value/confirmation 재개의 ALLOW, DENY, PDP 장애를 구분해 run/capability/risk와 해시된 Profile·workflow ID로 기록 | Completed |
| S13-B3 terminal evidence | Act `VERIFIED`/`FAILED`/`UNKNOWN`/`CANCELLED` 종료를 한 번만 기록하고 UNKNOWN을 유지 | Completed |
| S13-B4 선택적 sink | HTTPS endpoint만 허용하고 쿠키 없는 no-store POST, `SENT`/`SKIPPED`/`FAILED` 상태, 전송 실패 격리·무재시도 | Completed |

[실행 증거](../evidence/s13-closure-2026-09-27.md)는 단위·정적 검사와
실제 Chrome Act 회귀를 구분해 기록한다. Chrome 회귀는 managed sink에
연결한 E2E가 아니다.

## 범위 경계

이 `Completed`는 Browser 로컬 Act의 best-effort evidence 경계다.
Community ALLOW도 policy 이벤트를 만들 수 있으므로 이를 중앙 PDP의
인증된 결정으로 해석하지 않는다. 조직/user 인증, 모든 Ask/MCP/workflow
이벤트 coverage, event ID·receipt·중복 제거·durable queue·retention,
운영 Audit Service의 수신·검색·보존 및 필수 감사 정책의 dispatch admission은
구현·검증하지 않았다. 이 항목들은 현재 S13 완료 조건에서 삭제했으며
공유 계약과 Platform 서비스가 필요하다.

과거 [Ask/Act 분석 수집 S13-C1~C8](s13-ask-act-analysis-data-acquisition.md)은
별도 `In Progress` Browser 작업으로 이 판정에 포함되지 않는다.
