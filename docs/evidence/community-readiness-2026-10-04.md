# Community 기능 마무리 — 2026-10-04

## 판정과 기준

C01/C02: Linux controlled fixture 범위 Completed. C03: Linux 로컬 unpacked
ZIP 후보 검증만 Partial. C04: Planned, 공개 업로드/스토어 배포 미실행.
대외 출시 승인이나 Windows 지원 완료를 뜻하지 않는다.

기준 HEAD `ddfbcb92929267ea8c24ff8305aa66e5be19ae59` 위의 미커밋 변경을
검증했다. Linux 6.8.0-146-generic x86_64, Node v20.19.6,
Chrome for Testing 147.0.7727.15. HTTPS fixture의 자체 서명 인증서만
격리 profile에서 허용했으며 운영 credential과 운영 사이트는 사용하지 않았다.

## 변경

- 배포 manifest 이름을 `ContextPilot`으로 확정하고 빌드로 0.1.87 → 0.1.88.
- `test:chrome-community` 추가: 기존 S7 fixture/승인 검증을 재사용한다.
  실행 전후 managed storage와 local Platform 설정이 빈 상태인지 검사한다.
  Resolver/business 호출 0건, Provider 4건으로 Ask와 페이지 기반 Act 성공,
  실행 검토·권한·사용자 입력값 gate, password 비노출·입력값 비보존 및
  debugger detach를 확인했다. Platform/EWAP 제품 계정은 설정하지 않았다.
- S8/S9 Settings 검증이 DOM 등장 직후 스크립트 로딩 전에 submit하던 race를
  수정했다. 비동기 Settings 상태 초기화를 기다린 후 동일 검증을 수행한다.
- Chrome extension/preview 명령에 Node 20 WebSocket 활성화 옵션을 추가했다.
- 설치·지원 기능·제한·같은 확장 경로에서의 update/rollback 안내를 추가했다.

Browser business runtime와 공유 계약은 변경하지 않았다. Platform 구현 및
Workspace 계약/integration 테스트는 해당 변경이 없어 이번에 실행하지 않았다.
기존 사용자 문서 변경과 Enterprise Planned 상태는 유지했다.

## 실행 검증

| 검증 | 결과 |
| --- | --- |
| typecheck, lint, build, validate:package/test:release | exit 0 |
| unit / fixture / source E2E | 453 / 1 / 1 테스트 통과 |
| module boundaries | 238 TypeScript 파일 통과 |
| 실제 Chrome S1~S8 | 모두 exit 0; Ask/Act, Provider, Settings, 권한·Stop·read/Vision·복구 |
| 실제 Chrome S9 | exit 0; 0.1.87 → 0.1.88 → 0.1.87, 같은 profile/확장 ID, mode/deny 보존, fresh session |
| 실제 Chrome S10/discovery/S11 | 모두 exit 0; Page API gate/UNKNOWN/Stop/restart/privacy, signed MCP fixture |
| 실제 Chrome S14 | exit 0; 로컬 Workflow verified/stale/incomparable, select/start 재검증 |
| 실제 Chrome collection / analysis-data | exit 0; 1,000 rows/Stop/restore, Ask/Act 수집·scope·privacy·재시작 |
| 실제 Chrome diagnostics ZIP | exit 0; CRC/hash/redaction, 오류·navigation·worker restart |
| 실제 Chrome community / extension / preview | 모두 exit 0 |
| package:local 두 번 생성 | SHA-256 동일; 14개 파일 |
| git diff --check | exit 0 |

처음 S9의 `S8_ACK_NOT_ENFORCED`는 Settings 준비 대기를 수정한 뒤 재실행해
통과했다. 처음 Chrome extension의 `WebSocket is not defined`는 Node 20 옵션
보완 후 extension/preview 모두 재실행해 통과했다. 로그 위치는 일시적인
`/tmp/community-{standalone,s9,chrome-regression,chrome-extra,chrome-ui,lint}.log`다.
원시 prompt/페이지/secret을 증거 문서에 복사하지 않았다.

## Artifact

| 항목 | 값 |
| --- | --- |
| ZIP | `dist/contextpilot-0.1.88.zip` (git ignore 대상) |
| ZIP SHA-256 | `1903ef8ba003ae8c973b0e4a0cb930f43f01bbeefe43018248abed23fdcc95d6` |
| manifest SHA-256 | `aedfffd817c89e64f4fbc590fc99deee089004bc81068228f9d987568915ac43` |
| Service Worker SHA-256 | `ed419f18a1cc21b3abd99041dbf2ef5d7b518d86e33904d00e76c538f6929155` |

권한은 기존 `storage/sidePanel/activeTab/tabs/scripting/debugger/offscreen`,
필수 HTTPS host, 선택 HTTP 및 all_urls 그대로다. package 검증은 source와
artifact의 version/권한 일치, 금지 key/env/source-map 파일과 symlink를 검사한다.

## 남은 출시 경계

Windows clean-profile, 스토어 설치/업데이트, 실제 credential 보존,
다른 schema 간 Settings migration, 외부 live Provider와 운영 사이트,
배포 채널 공개 업로드/다운로드 설치 증거 및 named release 판정은 미실행이다.
Native host/Enterprise 운영 배포도 이번 Community 검증에 포함하지 않는다.
Linux의 unpacked ZIP candidate 기능 마무리와 대외 배포 완료를 구분한다.

[설치 안내](../community-installation.md),
[후속 상태](../sprints/community-release-enterprise-followup.md)를 따른다.
