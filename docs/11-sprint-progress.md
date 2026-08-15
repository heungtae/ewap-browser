# 11. Sprint 진행 현황

## 사용 방법

이 문서는 실제 진행 상태의 단일 기준이다. 상태는 `Planned`, `In progress`, `Blocked`, `Completed`만 사용한다. `Completed`에는 반드시 검증 명령 결과와 Git commit hash가 있어야 한다. 설계·계획 문서를 작성한 것만으로 개발 Sprint가 완료되지는 않는다.

Sprint를 시작할 때 owner, 시작일, 범위, branch를 채운다. 종료할 때 실제 명령, 결과, test count, 예외/보류, commit hash를 채운다. 실패한 검증은 삭제하지 않고 `Blocked` 사유에 남긴다.

## 현재 상태

기준일: 2026-08-15. S0~S5 구현 작업이 진행 중이다. 현재 작업 트리에는 아직 Sprint별 독립 commit hash가 없으므로 어느 Sprint도 `Completed`로 표시하지 않는다. 아래 증적은 2026-08-15 로컬 실행 결과이며, 운영 입력·Windows VM·승인 증적을 로컬 테스트 성공으로 대체하지 않는다. S4/S5 live/pilot 종료 조건은 외부 운영 입력이 제공될 때까지 `Blocked`다.

| Sprint | 상태        | 독립 설계                                                                  | 선행          | 검증 증적                                                                     | Commit | 다음 조치                                                           |
| ------ | ----------- | -------------------------------------------------------------------------- | ------------- | ----------------------------------------------------------------------------- | ------ | ------------------------------------------------------------------- |
| S0     | In progress | [로컬 개발·시험 기반](sprints/s0-local-development-foundation.md)          | -             | Node 22, pnpm 9, typecheck/lint/build, MV3 artifact 생성, Chrome for Testing service worker·Side Panel runtime smoke 확인 | - | clean-checkout 재현 및 Sprint별 commit 필요 |
| S1     | In progress | [semantic projection preview](sprints/s1-semantic-projection-preview.md)   | S0            | sender/document 계약, redacted projection, closed snapshot validator, Chrome for Testing controlled-origin preview E2E (password exclude, dynamic DOM ref revocation, navigation epoch 교체, worker restart 재등록) | - | clean checkout 재현 및 Sprint별 commit 필요 |
| S2     | In progress | [결정적 mutation 기반](sprints/s2-deterministic-mutation-foundation.md)    | S1            | policy, slot/digest, primitive, audit, value slot의 validate/one-time consume 단위·fixture 검사, Chrome controlled-origin R1 text/select/checkbox state transition, no-op 및 stale target value delivery 거부 | - | occluded/remaining negative Chrome 증적, Sprint별 commit 필요 |
| S3     | In progress | [R2 확인·중단·종료 상태](sprints/s3-r2-confirmation-and-terminal-state.md) | S2            | confirmation store, R2 token atomic consume, mutation coordinator terminal state, Stop/cancel value·confirmation cleanup 단위 검사, local fixture session binding R2 checkbox confirmation·one-time reuse 거부 Chrome 검사 | - | production Host binding과 all-primitive R2 verifier Chrome E2E, Sprint별 commit 필요 |
| S4     | Blocked | [Native Host·AI Hub 경계](sprints/s4-native-host-and-ai-hub-boundary.md)   | S3, 운영 계약 | .NET 8 Host build, persistent two-frame Native Messaging no-config smoke, duplicate ID/raw `ref_id` whitelist-schema port-close, NativeClient response correlation/cancel/raw model-ref reject | - | AI Hub owner의 ACL bridge/SSO/broker/allowed extension 운영 계약 및 Windows 통합 환경 필요 |
| S5     | Blocked | [Profile/MCP·managed pilot](sprints/s5-profile-mcp-and-managed-pilot.md)   | S4, 승인      | fingerprint golden, browser WebCrypto ES256 JWS, replay CAS, package/host/policy compatibility 검사, malformed resolver endpoint/unknown Profile claim/extra MCP result field fail-closed 검사 | - | key ring/MCP Registry/managed Windows VM/rollback rehearsal 및 Security/IAM/AI Hub/Endpoint/Data owner 승인 필요; NO-GO 유지 |

### 현재 로컬 실행 증적

- Node: `v22.23.2`, pnpm: `9.15.4`, .NET SDK: `8.0.424` (로컬 검증용)
- `pnpm test`: typecheck, ESLint, Prettier, extension build, unit 38, fixture 1, E2E smoke 1 성공
- `pnpm test:native-host`: .NET 8 Native Host build 성공
- Native Messaging persistent two-frame request: 각 요청의 no-config 응답 `AI_HUB_NOT_CONFIGURED` 확인
- Native Host whitelist schema는 duplicate request ID 및 raw `ref_id` frame에서 port를 닫고, NativeClient는 cancellation 시 pending request를 폐기하며 raw model reference를 전송 전에 거부한다.
- branded Google Chrome 150 headless는 extension load 증거로 사용하지 않는다. Chrome for Testing 152에서는 `dist-extension/js/service-worker.js`와 Side Panel preview control이 DevTools target/Runtime evaluation으로 확인됐다 (`CHROME_FOR_TESTING_BIN=... pnpm test:chrome-extension`).
- Chrome for Testing controlled fixture E2E: content script → service worker → Side Panel `START_PREVIEW`가 `Save` button을 포함하고 password field를 제외한 snapshot을 반환했다. 동적 `Save → Submit` 변경 뒤 old `ref_id`가 새 snapshot에서 재사용되지 않았고, navigation의 새 `document_epoch` 및 worker 종료 뒤 content 재등록도 확인했다 (`CHROME_FOR_TESTING_BIN=... pnpm test:chrome-preview`).
- 같은 Chrome fixture에서 exact development origin의 R1 text/select/checkbox action은 raw value 없는 `START_ACT` 또는 value slot 경로로 시작하고 terminal state transition을 확인했다. checkbox no-op은 `TARGET_NOT_ACTIONABLE`로 거부됐으며, `CANCEL`한 slot의 submit은 `VALUE_BINDING_INVALID`로 거부됐다.
- value slot을 만든 뒤 labelled textbox의 semantic name이 바뀌면 delivery는 `TARGET_STALE`로 거부됐다.
- 별도 fixture checkbox는 local session-binding fake가 발급한 one-time R2 confirmation을 요구했다. `CONFIRM` 뒤에만 state transition이 일어났고 같은 confirmation의 재사용은 `CONFIRMATION_INVALID`로 거부됐다. 이 local test adapter는 Native Host/production R2 enablement가 아니다.
- Resolver malformed endpoint, Profile unknown claim, Business MCP successful-result의 extra field는 모두 fail closed로 거부됐다.
- `pnpm validate:package`, `git diff --check`: 성공

## Sprint 종료 기록 템플릿

각 Sprint 행의 `Completed` 전환 시 아래 블록을 추가한다.

```md
### S<N> 종료 기록

- 범위:
- branch / owner / 기간:
- 실행 명령:
- 결과 및 test count:
- 수동 Chrome/VM 확인:
- 보류 또는 알려진 제한:
- 문서 갱신: 08 / 09 / 10 / 11 중 해당 항목
- Git commit: `<hash> <subject>`
```

## 변경 통제 점검표

- [ ] 현재 Sprint의 설계·계획·검증 섹션을 확인했다.
- [ ] 이전 Sprint가 `Completed`이며 commit hash와 검증 증적이 있다.
- [ ] 새 permission/tool/message/운영 입력의 영향이 문서화됐다.
- [ ] 필수 로컬 검증과 `git diff --check`를 수행했다.
- [ ] 이 Sprint만 포함한 staged diff를 확인했다.
- [ ] commit hash와 다음 Sprint 상태를 이 문서에 반영했다.
