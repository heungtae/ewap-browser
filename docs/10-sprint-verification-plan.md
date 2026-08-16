# 10. Sprint 검증 계획서

| Sprint | 자동 검증                                      | 수동 증적                         |
| ------ | ---------------------------------------------- | --------------------------------- |
| S0     | install, build, manifest 검사                  | Windows/Linux Chrome load         |
| S1     | projection schema, stale ref                   | 실제 페이지 Ask                   |
| S2     | permission decision, submit guard, Stop        | once/always/deny 카드             |
| S3     | key header 3종, static header, error redaction | local LLM 연결 시험               |
| S4     | settings schema, secret export 제외, timeout   | loopback/private network endpoint |
| S5     | package compatibility, update/rollback         | Windows/Linux install and upgrade |

모든 네트워크 검증은 local fixture 또는 사용자가 제공한 endpoint에서 수행한다. 실제 API key와 header 값은 test log에 남기지 않는다.
