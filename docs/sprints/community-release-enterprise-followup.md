# Community 출시 완료와 Enterprise 후속 Sprint

작성: 2026-10-04. 상태: C01/C02 로컬 검증 완료; C03 Linux 로컬 후보 검증; C04 대외 배포 보류.

## 목표와 순서

Community 기능·출시를 먼저 완료하고, 확정된 계약으로 Enterprise 클라이언트를
개발·선행 배포한 뒤 실제 Platform을 구축하여 운영 연동을 검증한다.
공유 순서와 계약 gate는 [Workspace 계획](../../../ewap-workspace/docs/browser-first-delivery-plan.md)을 따른다.
S0~S14의 기존 완료 범위와 증거는 유지한다. S9는 Linux 로컬 candidate이며
Windows 지원/대외 출시 완료가 아니다. S15는 managed/package 배포 범위를
이 계획의 E07과 연결하고, 실제 Enterprise 연동 완료는 E08로 구분한다.

## Community 후속 Sprint

| Sprint | 상태 | 구현 및 검증 | Exit evidence |
| --- | --- | --- | --- |
| C01 기능 종료 점검 | Completed (Linux controlled fixture) | Ask/Act, Provider/plugin, Settings, 권한, 읽기/분석, Workflow, diagnostics 지원 범위와 현재 동작 점검; blocker 수정 | 현재 커밋의 unit/fixture/E2E와 관련 실제 Chrome 결과, 미지원 항목, blocker 0 |
| C02 독립 실행 | Completed (Linux controlled fixture) | Platform/제품 계정 없이 시작; Resolver/PDP/Audit 미설정 Community 경로; managed 설정 부재와 손상/읽기 실패 구분 | Community 성공 및 Enterprise downgrade/deny 우회/불법 dispatch 0 |
| C03 지원 OS 출시 검증 | Partial (Linux unpacked ZIP) | Windows/Linux clean-profile 설치·update/rollback·Settings migration·restart·secret/deny 보존 | 지원 OS별 Chrome/package digest와 실제 결과; 미검증 OS 출시 보류 |
| C04 Community 배포 | Planned | 배포 채널 확정, release notes·설치/복구 안내, package 업로드와 설치 확인 | named release 판정, 실제 배포 위치 및 다운로드 artifact digest, 설치 증거 |

C01 → C02 → C03 → C04 순서다. Linux 한정 출시는 OS 범위와 제한을 명시하고
Windows 완료를 주장하지 않는다. 외부 live provider/운영 사이트가 아닌 통제 fixture
증거의 범위를 표시한다. 미지원 기능을 완료로 처리하지 않는다.
선택적 signed Profile 기능은 현행 Resolver fixture로 검증할 수 있다.
Enterprise 명세 미확정은 Community 출시 blocker가 아니다.

[2026-10-04 검증 증거](../evidence/community-readiness-2026-10-04.md)와
[Community 설치 안내](../community-installation.md)를 따른다. Windows, 실제 secret
보존, 스토어 설치, 대외 업로드는 미검증이다. C04는 이번 기능 마무리 범위에
포함하지 않으며 공개 배포 완료로 선언하지 않는다.

## Enterprise 후속 Sprint

E01 착수 전 Workspace/Platform/Browser의 resource/version/signature 불일치를
공유 schema·API·vectors·example pack·migration으로 해결해야 한다.
세부 항목은 [platform-alignment C01~C09](../platform-alignment.md#8-contract-gaps)를 따른다.

| Sprint | 상태 | 범위 | 선행 및 완료 조건 |
| --- | --- | --- | --- |
| E01 계약 수용 | Planned | versioned loader, flattened SignedRelease 검증, supported subset, migration | 계약 확정; tamper/key/typ/digest/version/unsupported 거부 |
| E02 인증과 managed admission | Planned | runtime token lifecycle, 조직/환경 binding, managed schema | E01; issuer/audience/expiry/scope 검증, secret 비노출, 손상/장애 차단 |
| E03 배포와 trust | Planned | resolve/artifact, atomic bundle, epoch/revoke/cache/restart/rollback | E01/E02; 60초 revoke 상한, offline write 차단, epoch 후퇴·revoked rollback 거부 |
| E04 Gateway와 PDP | Planned | MCP routing, action/resume 재평가, single-use approval | E03; direct PROD 우회·approval replay·PDP/trust outage dispatch 0 |
| E05 감사와 capture | Planned | 인증된 audit/receipt/deduplication, scoped capture, redaction | E02 및 event/capture 계약; bounded retry, 응답 유실·중복·PII negative 통과 |
| E06 released Workflow | Planned | supported step execution, exact dependency, step evidence, Stop/UNKNOWN | E03/E04/E05; unsupported step 거부, mutation 재실행 0 |
| E07 클라이언트 선행 배포 / S15 | Planned | 실제 Chrome+계약 서버, Community 회귀, managed/package install/update/rollback | E01~E06; 지원 OS matrix 및 artifact evidence; 실제 Platform 완료로 선언하지 않음 |
| E08 실제 Enterprise 통합 | Planned | 실제 SSO/KMS/Gateway/PDP/Audit 및 L5/L6 연동 | Platform U07 통합 및 환경 입력; 실제 release 결속 증거, 운영 G5/G6 이후 활성화 |

E05는 E03/E04와 병행 가능하다. E07 선행 설치 후에도 관리 설정이 요구하는
Enterprise 의존성 실패는 fail closed하고 Community로 자동 downgrade하지 않는다.
실제 Platform이 없으면 E08은 완료할 수 없다.

## 실행과 증거 규칙

각 Sprint 착수 시 변경 파일, 작은 구현 단계, API/schema migration, 테스트,
privacy, rollback, exit evidence를 별도 실행 계획으로 작성한다.
발견한 미완료 기능은 C01 실행 계획에 이름·수정 범위·검증 ID를 기록한다.

Community 기본 검증은 package.json의 typecheck/lint/build/validate:package,
test:unit/test:fixture/test:e2e와 관련 test:chrome-* 명령이다.
collection, analysis-data, diagnostics ZIP, cancellation, local Workflow 회귀를
기능 변경에 맞춰 포함한다. test:release/package:local/test:chrome-s9와 실제 지원
OS의 clean-profile 설치를 확인한다. build가 version/manifest를 변경하므로
실행 전후 diff와 최종 artifact version/digest를 기록한다.

계약 테스트 서버는 Workspace integration 소유이며 synthetic fixture key를 사용한다.
서버 fixture 검증과 실제 Platform 검증은 분리하고, current commit/contract/fixture/
Chrome/OS/managedConfig/artifact digest와 수행한 명령·결과를 증거에 고정한다.
실행되지 않은 검증, 배포, 승인 또는 unavailable 환경은 완료로 기록하지 않는다.
