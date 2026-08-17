# S4 — Provider Plugin Settings와 Local Network

선언형 plugin import/enable/disable/remove, provider instance 선택과 version lifecycle, secret 없는 import/export, loopback 및 private-network opt-in, timeout·TLS·response validation과 diagnostics를 구현한다. diagnostics는 product CDP의 `Network.*`, `Log.*`, screenshot과 page source를 활성화하지 않는다.

완료 조건: plugin lifecycle과 incompatible version 차단, localhost와 사설망 fixture 연결, 잘못된 manifest/URL/header/response schema 거부, export secret 제외, diagnostics가 bounded CDP allowlist를 확장하거나 CDP/page data를 저장하지 않음을 검증한다.
