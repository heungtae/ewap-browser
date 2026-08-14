# S1 — Enterprise Lockdown

## 1. 설계 계획

- **목표:** generic browser agent를 최소 MV3 permission, company vLLM, managed configuration, ASK/ACT 및 COMPANY_TOOLS로 축소한다.
- **선행 조건:** S0 Done.
- **연계 요구사항:** RQ-02, RQ-03, RQ-04, RQ-05, RQ-09.
- **필요 ADR:** ADR-003/004/005/011.
- **불변 조건:** authorization은 LLM 밖의 결정적 코드에 있고, ACT는 allowlisted enterprise origin에서만 가능하다. 금지된 tool/network surface는 비활성화가 아니라 모델·runtime path 양쪽에서 제거/차단을 증명한다.
- **비범위:** 새로운 mutation tool, UX 전면 개편, Page Profile MCP.

## 2. 개발 계획

| 순서 | 작업 | 산출물 | 책임 역할 |
|---|---|---|---|
| 1 | baseline 대비 manifest/host permission 최소안을 설계 | permission decision 및 snapshot diff | Security + Extension |
| 2 | provider catalog을 company OpenAI-compatible vLLM 경로로 제한 | provider configuration contract | AI platform + Extension |
| 3 | managed configuration precedence와 schema를 정의 | config schema/validation rules | Security + Operations |
| 4 | COMPANY_TOOLS와 ASK/ACT tool exposure policy를 만든다 | allowlist and mode matrix | Extension + Security |
| 5 | origin allowlist/navigation recheck를 적용한다 | origin policy and denial behavior | Extension |

## 3. 검증 계획

| 수준 | 검증 항목 | 기대 결과 | 증적 |
|---|---|---|---|
| Unit | config precedence, provider endpoint policy, mode/origin gate | local setting 또는 model call로 policy 우회 불가 | unit report |
| Snapshot | manifest, host permission, model-exposed tool catalog | 승인된 최소 surface와 정확히 일치 | reviewed diffs |
| E2E | ASK mutation attempt, external origin ACT attempt | 둘 다 browser mutation 전 deny | extension E2E |
| Security | disabled tool direct call 및 provider/network regression | arbitrary JS/fetch/download/upload 등 실행 불가 | negative test report |

## 4. 종료 조건과 기록

- [x] permission, provider, tool, origin configuration의 reviewed local snapshot이 있다.
- [x] ASK read-only와 external-origin ACT deny가 독립 테스트로 증명됐다.
- [x] ADR-003/004/005/011과 RQ 추적성을 갱신했다.
- [x] S1 evidence와 local review를 `../sprint-status.md`에 기록했다.
