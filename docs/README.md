# ContextPilot 문서 안내

현재 동작의 SSOT는 [구현 코드](../extension/src), [런타임 계약](../extension/src/contracts),
[manifest](../extension/manifest.json)와 설정이다. 구현을 확인할 때는
[코드 탐색 안내](source-guide.md)에서 실제 진입점·schema·executor를 따라간다.
[테스트](../extension/tests)는 실행 가능한 검증이고, [증거](evidence/README.md)는
기록된 revision·환경·시나리오의 결과다.

## 사용하는 문서

| 목적                                | 문서                                                                                                                        |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| 기능의 실제 구현 위치               | [코드 탐색 안내](source-guide.md)                                                                                           |
| 로컬 설치·업데이트·복구             | [Community 설치](community-installation.md)                                                                                 |
| 개발·통제 Chrome·live Provider 검증 | [테스트 실행 가이드](test.md)                                                                                               |
| 로컬 예제 실행                      | [Accessible items 데모](accessible-items-demo.md), [Collection Reading 데모](../examples/collection-reading-demo/README.md) |
| 예제별 요청과 재현                  | [요청 메시지](../examples/example-request-messages.md), [Chrome 요청 테스트](../examples/chrome-request-tests.md)           |
| 진단 추적 확인                      | [메서드 실행 진단](reference/method-execution-diagnostics.md)                                                               |
| 실행 결과와 미검증 범위             | [검증 증거](evidence/README.md)                                                                                             |
| 개발 이력·배포 후속 작업            | [Sprint 목록](sprints/README.md), [진행 기록](sprint-progress.md)                                                           |
| 교차 저장소 계약 후속 과제          | [Platform 정렬 backlog](platform-alignment.md)                                                                              |
| 외부 제품 비교 배경                 | [비규범 참고자료](references/README.md)                                                                                     |

## 문서 유지 기준

구현 동작·도구 목록·TypeScript 계약을 설계서에 복제하지 않는다. 모듈이 이동하면
코드 안내의 링크를 갱신하고, 동작을 바꾸면 해당 테스트와 필요한 실행 증거를 갱신한다.
새 문서는 설치·운영·검증에 필요한 설명이나 구현 전 남은 작업을 담을 때 추가한다.
미구현 작업은 backlog로 표시하고 현재 지원으로 소개하지 않는다.

Sprint와 날짜가 붙은 검증 기록은 당시 상태를 보존한다. 과거 PASS는 현재 revision의
실행 결과가 아니며, 통제 fixture·live Provider·Platform 통합·실제 배포는 각각의
증거 범위로 읽는다. 완료 여부를 확인할 때는 코드와 해당 범위의 실행 결과를 함께 본다.

중복 설계·구현 인벤토리·과거 실행 계획은 작업 트리에서 제거했다. 과거 기록이
참조하는 설계는 삭제 전 Git revision으로 연결하며 `git show REVISION:PATH`로도
확인할 수 있다. Git 이력이 과거 설계를 보관하므로 별도 archive 사본을 만들지 않는다.
