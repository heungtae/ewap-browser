# 07. 검증 및 출시

## 1. 필수 자동 검증

1. TypeScript typecheck, lint, extension build
2. provider request builder의 chat/responses wire, API key header 세 방식, 정적 header 중복·제어문자 거부
3. permission gate의 `(capability, host)` once/always/deny, 철회, navigation 경계
4. secret field redaction과 storage export 제외
5. Chrome E2E의 projection, stale ref, permission card, confirmation, Stop

## 2. 수동 검증

- Windows Chrome과 Linux Chrome에서 unpacked 및 package 설치
- localhost와 사설망 OpenAI-compatible endpoint 연결
- `Authorization`, `api-key`, `x-goog-api-key`와 정적 header가 정확히 전송되는지 local test server로 확인
- 웹사이트 로그인, password/OTP 화면, 제출·결제·삭제 화면에서 사용자 승인과 차단 동작 확인

## 3. 출시 기준

릴리스는 extension package, manifest permission snapshot, settings schema, provider request contract와 검증 결과를 함께 기록한다. API key·header 값·실제 prompt·페이지 데이터는 출시 증적에 포함하지 않는다.
