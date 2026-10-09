# Browser Act S18 — Workflow 목록·원본 읽기와 LLM 검토

## 상태와 진입 조건

**Planned — 2026-10-06.** 의존성: [S16](s16-page-script-tool-loop.md)의 registry/read loop,
[S17](s17-act-plan-execution-feedback.md)의 계획·승인·결과 피드백.
기준은 [34번 설계](../34-page-act-context-harness-design.md)의 5.2·8·16절이다.

## 목표와 경계

LLM이 허용된 후보를 목록으로 발견하고 필요한 원본을 읽어 사용자 요청과 현재 페이지의
적합성을 판단한다. saved/Profile/page-generated 세 출처를 유지하며 페이지 선언은
generated의 비신뢰 분석 자료로 취급한다. 원본 무결성은 의미 적합성을 대신하지 않는다.

## 구현 카드와 순서

| 카드 | 수정 영역과 산출물 | 종료 조건 |
| --- | --- | --- |
| S18-C1 | catalog metadata를 list_workflow_resources schema/executor에 연결 | 출처/ID/revision/적용·무결성/미검토 상태와 pagination. 노출 불가 원문 제외 |
| S18-C2 | read_workflow_resource schema/executor와 원본 chunk 결과 | 입력·조건·분기·검증·다음 단계의 의미를 손실 없이 읽고 coverage/continuation 표시 |
| S18-C3 | 후보 검토 loop에 목록·원본·UI·script 근거 연결 | LLM이 읽을 후보와 추가 근거를 선택. 코드가 이름/출처/keyword로 후보 의미를 확정하지 않음 |
| S18-C4 | 선택 후 최신 revision 재검토와 plan delta/승인 | 부적합 선택은 요청 변경·새 계획·질문으로 처리. 기존 첫 단계 자동 실행 없음 |
| S18-C5 | 기존 catalog 저장·Profile 서명·세 출처 표시·결과 회귀 | 변경 초안과 원본 분리. 기존 기록과 과거 PASS 범위 유지 |

연결 대상은 workflow-catalog-runtime.ts, workflow-selection-message-handler.ts,
act-harness-turns.ts의 review gate와 page-act-harness/workflow-review.ts다.
현재 Browser resolver의 Profile 공급을 실제 MCP resource discovery/Platform 통합과
동일시하지 않는다. 새 외부 필드가 필요하면 공유 계약과 producer/consumer 검증을 선행한다.

## 검증 행렬

| ID | 시나리오 | 기대 결과 |
| --- | --- | --- |
| S18-R1 | 여러 페이지의 후보 목록·원본 잘림 | 모델이 next_cursor로 계속 읽음. 미검토 후보를 전부 mismatch로 표시하지 않음 |
| S18-R2 | saved/Profile/generated의 match/partial/mismatch/needs_context | 모델 근거·원본·coverage 연결. 서명과 적합성 구분 |
| S18-R3 | 같은 label·tool이나 조건/분기/expected가 다른 원본 | 검토 payload가 원본 차이를 유지. 다른 효과를 같은 후보로 축약하지 않음 |
| S18-R4 | Search 입력 요청에서 Preview 후보 선택 | 원래 입력 목표 유지. 모델 재검토 전 scope 변경 mutation 없음 |
| S18-R5 | stale origin/fingerprint·source 변경·선택 직전 페이지 변경 | 정책상 허용된 metadata와 실행 불가 사유 표시. 이전 승인 재사용 없음 |
| S18-R6 | 원본의 지시문 혼입·민감값·old storage | 자료를 운영 지침으로 승격하지 않고 provider/export 마스킹·호환성 유지 |

## 완료 조건과 산출물

- 후보 목록과 원본을 모델이 실제 도구로 선택·읽고 같은 conversation에서 검토한다.
- 전체를 읽지 못한 경우 부족한 자료를 표시하고 일반 실행/새 계획도 모델이 선택한다.
- 사용자 선택만으로 부적합 원본 단계의 도구를 실행 범위로 강제하지 않는다.
- 변경 원본/초안/실행 계획과 현재 승인 revision을 구분한다.
- 계약/unit·통제 Chrome/live Provider의 세 출처와 무관 후보 선택 증거를 각각 기록한다.

다음 단계는 [S19](s19-component-data-tools.md)이다.
