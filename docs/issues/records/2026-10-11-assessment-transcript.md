# ISS-20261011-005 — 거절된 assessment 호출의 tool 결과 누락

상태: 해결 (Browser-local transcript 및 지정 live 표본). 발생일: 2026-10-11.
수정 버전: 0.1.105, 이 기록을 포함하는 commit. 배포 미검증.

S21 OpenAI gpt-6-luna의 notcompleted 사례에서 잘못된 assess_action_result 인수가
거절된 뒤 assistant tool call만 대화 이력에 남았다. 후속 goal 요청은 HTTP 400이었다.
파싱 실패가 tool result 생성 전에 발생했지만 finally가 assistant 메시지를 보존한 것이 원인이다.

assessment-transcript.ts에서 매칭 결과가 없는 call ID에 명시적 FAILED/INVALID_ARGUMENT
결과를 붙인다. mutation 재실행과 잘못된 판단의 성공 처리는 하지 않는다.

완료 조건은 거절된 모든 assistant call ID에 결과가 있고, 후속 provider 요청 형식이
유효한 것이다. assessment-transcript.test.ts와 act-action-assessment.test.ts가 malformed
응답의 원래 call ID 결속을 확인한다. 전체 unit 842개 및 타입/lint 검증이 통과했다.
수정 후 S21 OpenAI의 normal/delayed/replacement/notcompleted/already 5사례를 3회 실행해
15/15 통과했다. 자세한 범위는 [검증 기록](../../evidence/s21-s22-precommit-2026-10-11.md).
모든 provider 및 운영 사이트 성공을 뜻하지 않는다.
