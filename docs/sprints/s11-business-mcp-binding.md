# S11 — Browser 로컬 Business MCP binding (Completed)

> 개발·검증 이력이다. 본문의 계획·상태는 기록 당시 범위이며 현재 동작은
> [코드 탐색 안내](../source-guide.md)와 해당 revision의 실행 결과로 확인한다.

## 완료 범위

현행 Browser `schema_version: 1` signed Profile의 `business_mcp`는
proprietary HTTPS POST 호환 계약이다. Browser는 Profile이 지정한
closed tool만 Provider catalog에 넣고, 실행 직전에 현재 page와 Profile
만료를 재검사하며, 응답을 제한된 크기와 schema로 받는다.

| 카드 | 완료 조건 | 판정 |
| --- | --- | --- |
| S11-B1 binding 검증 | Profile 수락 시 HTTPS endpoint의 userinfo/query/fragment를 거부하고, argument `required`와 실제 값은 선언된 own property만 허용 | Completed |
| S11-B2 호출·결과 경계 | 도구 ID와 인자를 실행 시 재검사하고, 응답 본문을 24 KiB로 제한하며 non-OK·schema 불일치를 Provider 데이터로 전달하지 않음 | Completed |
| S11-B3 page/Profile 재검사 | Business MCP dispatch 직전 탭, origin, document, page scope, snapshot digest와 Profile 만료를 확인하고 불일치 시 HTTP 요청 전 거부 | Completed |
| S11-B4 실제 Browser 경로 | signed binding → 모델의 closed catalog → Side Panel Ask → 허용된 Business MCP HTTPS 요청을 Chrome에서 확인하고 endpoint/JWS의 모델 비노출 확인 | Completed |

[검증 증거](../evidence/s11-closure-2026-09-26.md)에 333개 unit test,
TypeScript build/typecheck, lint/format, module-boundary와 Chrome for
Testing 147의 실제 Side Panel 결과를 기록했다. B3의 stale/expiry
음성 판정은 unit test로 검증했다.

## 범위 경계

이 `Completed`는 현행 Profile-bound 호환 경로의 Browser 로컬 판정이다.
Platform MCP Registry의 `tools/list` discovery·health·catalog checksum,
release freeze, 조직 policy/PDP, Gateway, enterprise auth와 철회 조회는
구현하지 않았다. 이 기능들은
[Page Profile·MCP 목표 설계](https://github.com/heungtae/ewap-browser/blob/bf5b15e32837f56da18828aa049bd582279354fd/docs/22-page-profile-provider-design.md)의
별도 계약·서비스 작업으로 남으며 S11 완료 주장에 포함하지 않는다.
기존 [Collection Reading S11-C1~C6](s11-collection-reading-chrome-completion.md)은
과거 Browser 카드명으로, 현재 Sprint 원장의 S11과 별개다.
