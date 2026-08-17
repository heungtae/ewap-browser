# 07. 검증 및 출시

## 1. 필수 자동 검증

1. TypeScript typecheck, lint, extension build
2. provider manifest closed schema, ID/version/API compatibility, 중복·과대 입력·unknown field 거부
3. plugin request plan 격리와 core transport의 chat/responses wire, API key header 세 방식, 정적 header 중복·제어문자 거부
4. plugin disable/removal/version mismatch와 기존 OpenAI-compatible 설정 migration
5. permission gate의 `(capability, host)` once/always/deny, 철회, navigation 경계
6. secret field redaction과 plugin/provider export의 secret 제외
7. bounded CDP command/parameter closed allowlist와 raw command·selector·좌표·cross-tab 주입 거부
8. Chrome E2E의 projection, stale ref, permission card, confirmation, trusted click/type, verifier와 Stop
9. CDP attach conflict, dispatch 전/후 failure, navigation/tab close/worker restart cleanup, detach leak 0과 cleanup-failed tab 격리
10. 외부 E2E remote-debugging CDP와 product `chrome.debugger` allowlist의 권한 분리

## 2. 수동 검증

- Windows Chrome과 Linux Chrome에서 unpacked 및 package 설치
- 선언형 plugin 설치·선택·disable·remove와 bundled adapter package 검증
- localhost와 사설망 OpenAI-compatible endpoint 연결
- `Authorization`, `api-key`, `x-goog-api-key`와 정적 header가 정확히 전송되는지 local test server로 확인
- plugin이 API key/header를 받지 않고 core transport만 network를 수행하는지 검증
- 웹사이트 로그인, password/OTP 화면, 제출·결제·삭제 화면에서 사용자 승인과 차단 동작 확인
- 사내 staging UI의 controlled input, synthetic click 거부 control과 portal popup에서 DOM 경로와 bounded trusted-input 경로를 구분해 검증
- DevTools가 이미 attach된 tab의 `CDP_CONFLICT`, Stop 직후 product-owned attached session 0과 다른 debugger를 detach하지 않는지 검증

## 3. 출시 기준

릴리스는 extension package, browser manifest permission snapshot, bounded CDP method/parameter allowlist와 detach-leak 결과, provider plugin registry와 API version, bundled adapter 목록, settings schema, provider request contract와 검증 결과를 함께 기록한다. API key·header 값·실제 prompt·페이지 데이터·CDP selector/좌표/node ID는 출시 증적에 포함하지 않는다.
