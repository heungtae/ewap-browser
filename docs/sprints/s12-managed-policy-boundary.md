# S12 — Browser 로컬 managed policy 경계 (Completed)

## 완료 범위

현행 Browser의 선택적 `chrome.storage.managed` 설정과 Act proposal PDP
호환 경로를 fail-closed로 제한한다. managed policy 키가 **없는** Community
프로필은 기존 로컬 권한 경로를 사용한다.

| 카드 | 종료 조건 | 판정 |
| --- | --- | --- |
| S12-B1 managed 설정 | 존재하는 손상 값, 저장소 API 부재·읽기 실패·비정상 결과를 Community로 낮추지 않고 차단 | Completed |
| S12-B2 PDP 응답 | HTTPS endpoint, identity 세 필드, 쿠키 없는 no-store POST, 8 KiB 이하 closed JSON의 ALLOW/DENY/outage 처리 | Completed |
| S12-B3 미구현 권한 거부 | PDP의 `managed_auto: true`와 `approval_token`을 수락하지 않음 | Completed |
| S12-B4 로컬 교집합 | Act에서 PDP ALLOW 뒤에도 저장된 deny·plan scope·capability/host gate를 항상 실행 | Completed |

[검증 증거](../evidence/s12-closure-2026-09-27.md)에 단위 검증과 실제
Chrome S8 권한 회귀를 기록한다. managed storage/PDP 연결 자체의 Chrome
E2E나 운영 PDP의 인증 보증을 주장하지 않는다.

## 범위 경계

이 `Completed`는 Browser 로컬의 기존 Act policy 접점에 한정된다.
managed identity 문자열은 인증된 SSO/OIDC 주체가 아니다. 조직 RBAC,
Platform EnterprisePolicy resource, READ/WRITE risk mapping, 중앙
approval 단회 소비, `managed-auto`, Ask/Business MCP를 포함한 모든 dispatch의
PDP 적용, 운영 PDP 배포·장애 검증은 구현·검증하지 않았다. 이 항목들은
현재 S12 완료 조건에서 삭제했으며 별도 Platform 계약과 배포 판정이 필요하다.
과거 [진단 ZIP S12-C1~C6](s12-diagnostics-download-bundle.md)은 다른
Browser 계획으로 현재 S12 판정에 포함되지 않는다.
