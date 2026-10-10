# Browser Act S20 — 전체 도구 루프의 live 검증과 호환성

> 개발·검증 이력이다. 본문의 계획·상태는 기록 당시 범위이며 현재 동작은
> [코드 탐색 안내](../source-guide.md)와 해당 revision의 실행 결과로 확인한다.

## 상태와 진입 조건

**Completed (Browser-local qualification) — 2026-10-10.** 의존성: S15/PAH-9와 S16~S19의 연결 기능·단계별 증거.
기준은 [34번 설계](https://github.com/heungtae/ewap-browser/blob/bf5b15e32837f56da18828aa049bd582279354fd/docs/34-page-act-context-harness-design.md)의 10~12·16절이다.
앞 단계에서도 live 검증을 수행하며, 이 Sprint는 이를 전체 요청과 오류 경로로 종합한다.

[구현·검증·실패 이력](../evidence/s20-qualification-2026-10-10.md)을 기준으로 닫았다.
기본 OpenRouter 실패와 OpenAI의 표본 검증을 구분하며 전체 live 안정성·배포 준비 완료는 주장하지 않는다.

## 목표와 경계

최초 요청→도구 선택→자료 탐색→질문/계획→승인→실행→관찰→목표 판단을 실제
Provider와 Chrome에서 증명한다. Browser-local, 통제 Provider, live reasoning, Platform
통합과 출시/배포의 증거를 각각 기록한다. 이 Sprint가 자동 배포 권한을 부여하지 않는다.

## 구현·검증 카드와 순서

| 카드   | 산출물                                                           | 종료 조건                                                                      |
| ------ | ---------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| S20-C1 | registry/capability/schema/parser/executor/결과의 지원 행렬      | 모든 callable 도구의 실제 연결을 확인. 함수명 문자열만 있는 기능은 미지원 처리 |
| S20-C2 | 미사용 페이지·label/DOM/script/component 변형 holdout            | request case ID나 정해진 도구 응답으로 자연어 선택을 대체하지 않음             |
| S20-C3 | 실제 Provider/model별 script→workflow/component→plan→action 경로 | offered schema·call ID·result·후속 turn·승인·DOM/API/goal evidence 연결        |
| S20-C4 | Stop/navigation/timeout/restart/budget/동의 거부 fault matrix    | 취소 소유권·stale 승인·UNKNOWN·INCOMPLETE·재개 경계 확인                       |
| S20-C5 | 안전한 diagnostic/export·storage·provider·Ask 회귀               | 민감 원문 유출 없음. 기존 기록 읽기·mode별 권한·지원 transport 유지            |
| S20-C6 | 완료 판정·미지원 목록·rollback·artifact 기록                     | 결과와 한계를 문서에 연결. 미검증 범위와 배포 준비 상태를 실제 증거로 표시     |

## 필수 종합 시나리오

| ID     | 요청/조건                                        | 확인할 결과                                                               |
| ------ | ------------------------------------------------ | ------------------------------------------------------------------------- |
| S20-R1 | 명확한 입력값 / 값 미제공 / 여러 대상·정정       | 모델 판단에 따른 자동 입력 또는 질문. UI의 재입력 강제 없음               |
| S20-R2 | UI만으로 충분 / script 위치 미상·여러 chunk      | 불필요한 읽기 생략 또는 목록→검색→부분 읽기·동의·결과 continuation        |
| S20-R3 | script의 함수가 등록 API와 대응 / 실행 수단 없음 | 승인된 지원 수단 선택 또는 미지원 설명. 임의 함수 호출 없음               |
| S20-R4 | saved/Profile/generated의 적합·무관·불완전 후보  | 원본·조건·분기 보존, LLM 검토·선택 후 재검토·계획 차이 표시               |
| S20-R5 | virtual grid/chart/canvas와 부분·전체 읽기       | 채널 선택·EOF/coverage·복구·시각 추정 한계                                |
| S20-R6 | 다단계·Page API·navigation·비동기 결과           | 마지막 실행 이후 관찰과 모델 목표 판단. action/goal 의미 구분             |
| S20-R7 | 동의 거부·민감값·지시문 혼입·계약 오류           | 안전한 오류 반환과 다음 판단. 자료의 지시문을 운영 지침으로 사용하지 않음 |
| S20-R8 | Stop·worker restart·문서 변경·budget 소진        | 중복/미승인 mutation 없음. UNKNOWN/INCOMPLETE와 재개 가능 범위 보존       |

## 완료 조건과 증거 기록

다음 live Provider 테스트의 기본 Provider·모델·인증은
[live Provider 테스트 설정](../test.md#live-provider-기본-설정)을 따른다.
사용자가 별도로 변경하지 않으면 OpenRouter의 `nvidia/nemotron-3.5-lightning:free`와
실행 환경의 `OPENROUTER_API_KEY`를 사용한다. S16 실행 명령은 script 도구 경로만
검증하므로 이 Sprint의 전체 시나리오 완료 증거로 대체하지 않는다.

- 각 시나리오의 총 실행 수·성공/실패·재시도·미검증 범위를 보고한다. 반복 수와 시간/
  읽기 budget은 측정 계획에 먼저 기록하고 원하는 결과만 골라 PASS로 만들지 않는다.
- provider/plugin/model/prompt/tool schema/code/build revision, Chrome 환경, 최초 도구
  목록과 후속 call/result, 실제 UI/API/typed verifier/LLM 목표 판단을 안전한 evidence로 연결한다.
- controlled fixture PASS를 live reasoning PASS로 대체하지 않는다. 미실행 live 범위는
  미검증으로 유지하고 전체 live 완료로 표시하지 않는다.
- typecheck/lint, 버전 보존 build·package/boundary 검사와 변경 범위의 계약/unit·Chrome
  회귀를 수행한다. 성능·지원 한계와 이전 경로 rollback 조건을 함께 기록한다.
- 공유 계약 변경이 없다면 그 이유를, 있다면 workspace→producer/consumer→통합·migration
  검증을 기록한다. Browser fixture로 실제 Enterprise 활성화를 주장하지 않는다.
- Sprint 목록·단계별 evidence·현재 구현 설명을 새 근거에 맞춰 연결하고 과거 기록은 보존한다.

## 관련 문서

- [전체 PAH 계획](https://github.com/heungtae/ewap-browser/blob/bf5b15e32837f56da18828aa049bd582279354fd/docs/sprint-page-act-context-harness-plan.md)
- [S15 / PAH-9](s15-pah-9-llm-input-value-binding.md)
- [S16 Script 탐색](s16-page-script-tool-loop.md)
- [S17 계획·실행 피드백](s17-act-plan-execution-feedback.md)
- [S18 Workflow 자료](s18-workflow-resource-tools.md)
- [S19 Component 자료](s19-component-data-tools.md)
