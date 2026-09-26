# S10 — Browser 로컬 Page Profile 수락 (Completed)

## 완료 범위

현행 Browser `schema_version: 1` compact ES256 JWS Profile의 검증과
로컬 replay 보호를 닫는다. 현재 page origin/path, nonce, page digest,
fingerprint, 만료, 서명을 확인한 뒤에만 Profile을 사용한다. 이 Sprint의
`Completed`는 Browser 로컬 수락 경계에 한정된다.

| 카드 | 완료 조건 | 판정 |
| --- | --- | --- |
| S10-P1 Profile claim 검증 | `path_prefix`를 경로 segment로 비교하고 `profile_version`을 안전한 양의 정수로 제한; 잘못된 서명과 불일치 claim 거부 | Completed |
| S10-P2 replay high-water | 해시된 deployment/Profile 식별자, version, definition digest만 저장; Worker 재시작 뒤 하위 version과 동일 version의 다른 정의 거부; 손상된 기록과 저장 실패에서 수락 거부 | Completed |

## 검증

[2026-09-26 S10 증거](../evidence/s10-progress-2026-09-26.md)에 명령과
결과를 기록했다. 326개 unit test, TypeScript build/typecheck,
ESLint/Prettier, module-boundary 검사와 Chrome for Testing 147의 실제
Side Panel·Service Worker 재시작 경로가 통과했다. Chrome fixture는
Profile version 1→2 수락 후 Worker를 재시작하고 version 1을 거부한다.

## 범위 경계

이 완료 판정은 Workspace `ewap/v1` PageProfile이나 Platform
SignedRelease의 소비를 뜻하지 않는다. release 활성/철회 확인,
`semanticId`의 현재 Semantic Projection binding, Platform trust endpoint는
현행 Browser에 구현되지 않았다. 그 요구는
[Page Profile 배포·신뢰 설계](../22-page-profile-provider-design.md)의 목표
계약으로 남으며 이 S10의 완료 항목이나 검증 주장에 포함하지 않는다.
Community Ask/Act의 Profile 미설정 fallback도 유지한다.

## 관련 문서

- [Sprint 검증 계획](../sprint-verification-plan.md)
- [기존 Page API/Discovery Browser 계획](s10-page-api-discovery-handoff.md)
