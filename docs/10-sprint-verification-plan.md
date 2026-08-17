# 10. Sprint 검증 계획서

| Sprint | 자동 검증                                                                        | 수동 증적                                                 |
| ------ | -------------------------------------------------------------------------------- | --------------------------------------------------------- |
| S0     | install, build, browser manifest 검사                                            | Windows/Linux Chrome load                                 |
| S1     | projection schema, stale ref                                                     | 실제 페이지 Ask                                           |
| S2     | permission/confirmation, CDP allowlist, target binding, no-retry, detach cleanup | trusted input, conflict, Stop과 session 0                 |
| S3     | plugin schema/registry/isolation, key header 3종, static header, error redaction | 선언형 plugin과 내장 plugin 연결 시험                     |
| S4     | plugin lifecycle, settings migration, secret export 제외, timeout                | plugin install/remove와 loopback/private network endpoint |
| S5     | package/plugin API compatibility, update/rollback                                | Windows/Linux clean profile install and upgrade           |

모든 네트워크 검증은 local fixture 또는 사용자가 제공한 endpoint에서 수행한다. 실제 API key와 header 값은 test log에 남기지 않는다.

S2 Chrome 검증은 product extension의 `chrome.debugger` 경로와 외부 remote-debugging harness를 구분한다. 최소 negative set은 unknown domain/parameter, raw selector/coordinate injection, stale/cross-tab target, duplicated action token, sensitive target, R2 pre-confirmation attach, post-dispatch fallback, competing debugger, navigation/Stop/tab-close/worker-restart detach와 cleanup-failed quarantine이다.
