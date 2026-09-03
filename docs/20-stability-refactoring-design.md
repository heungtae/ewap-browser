# 20. 안정성 중심 구조 리팩터링 설계

## Enterprise Web AI Platform 정렬 (2026-08-31)

리팩터링 목표 구조에 Enterprise port를 명시적으로 추가한다.

``` text
Browser Application Core
  -> ProfileResolverPort
  -> McpRegistryPort
  -> EnterprisePolicyPort
  -> RuntimeEvidencePort
  -> ManagedConfigPort
  -> Chrome/DOM/CDP/Storage/Provider platform adapters
```

도메인 core는 endpoint/auth/KMS/Chrome API 구현을 직접 import하지
않는다. Community adapter와 Enterprise adapter가 같은 core contract를
구현하도록 하며 local hard guard는 공통 core에 남긴다.
Profile/MCP/Policy 장애를 UI convenience layer에서 우회하는
compatibility path는 만들지 않는다.

## 목표

ContextPilot의 외부 Chrome runtime 계약, storage schema, provider 설정과
permission/CDP 보안 경계는 바꾸지 않는다. 대신 Chrome API, DOM, storage,
network 같은 부작용을 얇은 adapter 뒤에 두고, 도메인 로직을 작은 모듈과
명시적인 application state로 분리한다.

작성 코드의 최대 크기는 199 물리 라인이다. 빈 줄과 주석도 라인 수에
포함한다. `dist`, `dist-extension`, 의존성, 문서와 외부 reference는
대상에서 제외한다. 예외 목록은 두지 않는다.

## 현재 위험과 기준선

2026-08-23 인벤토리에는 17개의 200라인 이상 작성 코드 파일이 있다. 가장
큰 위험은 Service Worker `entry.ts`가 message listener, port, storage,
Ask, Act, CDP, fixture 실행을 동시에 소유하는 점이다. Content, Side
Panel, Settings도 DOM listener와 상태와 business flow가 한 파일에 섞여
있다.

변경 전 기준선으로 TypeScript typecheck, ESLint, Prettier, unit test
118개가 통과한다. 이 환경에는 `pnpm` 실행기가 없으므로 로컬
`node_modules/.bin` 명령으로 같은 검증을 수행할 수 있다.

## 목표 구조

``` text
entry point (wiring only)
  -> application / typed message router
       -> domain service / pure validator or reducer
            -> platform port (Chrome, DOM, storage, fetch)
```

-   Service Worker는 `WorkerApplication`이 transient state를 소유하고,
    sender authorization과 closed message validation 뒤에 domain
    handler를 호출한다. Ask, Act, page context, chat persistence,
    provider/settings, preview fixture는 서로 다른 handler group으로
    둔다.
-   Content script는 projection, ref lifecycle, bounded CDP target, R1
    execution handler를 분리한다. `entry.ts`는 application 생성과
    listener 연결만 한다.
-   Side Panel과 Settings는 DOM view/controller, runtime client, form별
    action을 분리한다. HTML 안의 CSS는 별도 asset으로 옮긴다.
-   Provider, Profile, ChatEvent, state 및 CDP는 public facade를
    유지하면서 parsing/validation, pure state transition, platform
    transport를 분리한다.

도메인 모듈은 entry point를 import하지 않으며 source import graph에
cycle이 없어야 한다. entry point는 composition root 외의 reusable API를
export하지 않는다.

## 보존해야 할 계약

-   Runtime message의 kind, payload/response shape, exact-key validation
    순서, sender 검사와 error code는 바꾸지 않는다.
-   `chrome.storage.local/session` key와 ChatEvent, provider 설정,
    semantic snapshot schema에는 migration을 추가하지 않는다.
-   Ask의 redaction, 최대 세 tool turn, stream sequence/resync와 worker
    restart recovery를 유지한다.
-   Act의 target binding, permission/preflight/confirmation 순서,
    dispatch 뒤 재시도 금지, CDP detach/quarantine을 유지한다.

## 적용 순서와 검증

1.  현재 runtime message와 UI 흐름을 characterisation test로 고정한다.
2.  contract/provider/state 같은 leaf module을 먼저 분리한다.
3.  Content와 UI entry point를 분리한다.
4.  Service Worker를 message domain별 handler로 이동한다.
5.  E2E script, test file, demo CSS를 분리한 뒤 size/boundary gate를
    전체 검증에 연결한다.

각 단계는 기능 변경 없이 독립 커밋으로 만든다. 매 단계마다 typecheck,
lint, unit/fixture test, build/package를 실행하며, 마지막에는 Chrome
extension, preview, native-host, release smoke를 실행한다. Chrome for
Testing이 없는 환경에서는 해당 한계를 별도로 기록하고 통과로 대체하지
않는다.
