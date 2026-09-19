# 29. Page API Discovery 설계

- 작성일: 2026-09-19
- 상태: Planned
- 구현 인계 대상: TBD
- 범위: Browser 로컬 구현. `page-api/` 레지스트리와 연계되는 Discovery 기능의 설계만 정의한다.
- 관련: [페이지 내부 함수·공개 API 실행 설계](27-page-api-execution-design.md), [Page Profile 배포·신뢰·MCP 설계](22-page-profile-provider-design.md), [객체 특성별 Collection Reading 설계](28-collection-reading-strategy-design.md)

## 1. 목표와 현재 상태

[27-page-api-execution-design.md](27-page-api-execution-design.md)는 번들 어댑터를 통한 **실행(Invocation)**을 다룬다. 이 문서는 실행 대상 API를 **발견(Discovery)**하고 Page Profile에 등록하기 위한 설계를 정의한다.

현재 구현:
- `extension/src/page-api/` 레지스트리와 fixture 어댑터가 존재한다 (doc 27 참조)
- 어댑터는 정적 origin 매칭과 고정 property 접근으로 probe/invoke 수행
- 자동 전역 객체 열거, 임의 함수 경로 해석, 모델 생성 코드 실행은 지원하지 않음

v1 Discovery 목표:
- Profile Builder UI에서 현재 페이지의 공개 **JavaScript 함수** 후보를 탐색·표시
- Profile Builder UI에서 현재 페이지가 사용하는 **REST API 호출 패턴**을 정적 분석으로 탐색·표시
- 사용자가 선택한 후보를 테스트하고 Page Profile에 등록
- 발견된 후보는 번들 어댑터 등록을 위한 **입력 자료**로만 사용 (자동 등록하지 않음)

지원하지 않는 것:
- ES Module private scope 직접 접근
- Closure 내부 private object 강제 탐색
- React Fiber/Angular/Vue 내부 상태 자동 추출
- DevTools Protocol instrumentation
- 임의 `eval()`/`new Function()` 실행
- 동적 코드 생성/난독화된 코드의 완전한 분석

## 2. Discovery 경계

```text
사용자 트리거 (Profile Builder)
       |
       v
Window Global Scan + Selected Element Scan
       |
       +-- MAIN world에서 chrome.scripting.executeScript로 수행
       +-- Object.getOwnPropertyDescriptor 기반 안전한 속성 검사
       +-- 재귀 깊이/속성 수/실행 시간 제한
       v
API Candidate List (메타데이터만, 실행하지 않음)
       |
       +-- Profile Builder UI에 표시
       +-- 사용자 선택 → Test → Register
       v
Page Profile (bundled adapter 등록을 위한 설계 시 입력)
```

Service Worker가 권한, 정책, 실행 generation을 소유한다. MAIN world는 페이지가 수정 가능한 환경이므로 신뢰하지 않는다. Discovery 중 어떤 함수도 **자동 호출하지 않는다**.

## 3. Chrome Extension 구성

### 3.1 Manifest 권한 (기존 doc 27과 동일)

```json
{
  "manifest_version": 3,
  "permissions": ["scripting", "activeTab", "storage"],
  "host_permissions": ["https://*.company.com/*"],
  "background": { "service_worker": "background.js" },
  "side_panel": { "default_path": "sidepanel.html" }
}
```

`scripting` 권한은 이미 doc 27 구현에 포함되어 있다.

### 3.2 사용자 설정

```typescript
interface PageApiDiscoverySettings {
  enabled: boolean;
  discoveryEnabled: boolean;
  allowSelectedElementInspection: boolean;
  maxDiscoveryDepth: number;        // 기본 3
  maxPropertiesPerObject: number;   // 기본 200
  maxDiscoveredApis: number;        // 기본 500
  timeBudgetMs: number;             // 기본 300
}
```

권장 UI:
```text
Page API Discovery
[✓] Enable Discovery
[✓] Inspect selected DOM element objects
Discovery Depth        [ 3 ]
Maximum APIs           [ 500 ]
Time Budget (ms)       [ 300 ]
```

## 4. Discovery Source

1차 구현은 다음 세 가지 소스를 대상으로 한다.

```
1. window global scope (own properties + 제한적 nested) → JavaScript 함수 발견
2. selected DOM element (attached JS objects) → JavaScript 함수 발견
3. page script static analysis → REST API 호출 패턴 발견
```

향후 확장 (Page Script에서 추가 활용 가능):
```
4. Known framework globals (AG Grid, Chart.js 등 어댑터 연계)
5. Application-specific adapter hints
6. Page Profile hint paths
7. Network request observation (runtime) → REST API 엔드포인트 확인
8. WebSocket/SSE 연결 → 실시간 데이터 스트림 엔드포인트
9. Event Listener 분석 → 페이지가 수신하는 커스텀 이벤트/메시지
10. Storage 패턴 분석 → LocalStorage/SessionStorage/IndexedDB 키·스키마
11. Service Worker / Web Worker 등록 → 백그라운드 작업·푸시 엔드포인트
12. Custom Elements / Shadow DOM → 웹 컴포넌트 퍼블릭 API
13. Performance Marks/Measures → 성능 측정 포인트·비즈니스 메트릭
14. MutationObserver/IntersectionObserver 타겟 → DOM 변경·가시성 감시 지점
15. Feature Flags / Config 객체 → 런타임 설정·토글 상태
16. Analytics/Tracing 호출 → 사용자 플로우·비즈니스 이벤트 명세
17. Error Boundary / Error Handler → 에러 리포팅 엔드포인트·스키마
18. CSP / Meta 태그 → 보안 정책·리소스 힌트
19. Internationalization (i18n) 키·메시지 → 다국어 리소스
20. Source Map / TypeScript 타입 → 타입 정보·컴포넌트 Props (가용 시)
```

### 4.1 Discovery 유형별 분류

| 소스 | 발견 대상 | 실행 방식 | 용도 |
|------|----------|-----------|------|
| Window Global | JS 함수 (`window.api.getData()`) | MAIN world에서 직접 호출 (doc 27) | 페이지 내부 상태/로직 접근 |
| Selected Element | Attached JS 객체 함수 | MAIN world에서 직접 호출 (doc 27) | Grid/Chart 컴포넌트 제어 |
| **Script Analysis** | **REST API 패턴 (`fetch('/api/...')`)** | **Extension에서 직접 HTTP 호출** | **백엔드 데이터 직접 조회** |
| **WebSocket/SSE** | **WS/WSS 엔드포인트, 메시지 포맷** | **Extension에서 직접 연결** | **실시간 데이터 구독·푸시 수신** |
| **Event Listeners** | **커스텀 이벤트 타입, 핸들러** | **MAIN world에서 dispatchEvent** | **페이지 내부 이벤트 버스 트리거** |
| **Storage Patterns** | **Storage 키, 값 스키마, 인덱스** | **Extension에서 직접 읽기/쓰기** | **클라이언트 사이드 상태 직접 접근** |
| **Custom Elements** | **Web Component 메서드/프로퍼티/이벤트** | **MAIN world에서 요소 직접 조작** | **Shadow DOM 캡슐화된 API 접근** |
| **Feature Flags** | **플래그 키, 값, 타입** | **Extension에서 직접 읽기** | **런타임 설정·A/B 테스트 상태 확인** |

REST API Discovery는 페이지 JavaScript 함수를 거치지 않고 **Extension이 직접 백엔드 API를 호출**할 수 있게 한다. 이는 페이지 함수가 없는 경우에도 백엔드 데이터를 가져올 수 있는 경로를 제공한다.

## 5. Window Global Discovery

### 5.1 기본 흐름

```javascript
// MAIN world에서 실행
function scanWindow() {
  const visited = new WeakSet();
  const candidates = [];
  const config = { maxDepth: 3, maxProps: 200, maxApis: 500 };
  
  function discover(obj, path, depth) {
    if (!obj || typeof obj !== 'object') return;
    if (visited.has(obj)) return;
    if (depth > config.maxDepth) return;
    visited.add(obj);
    
    const props = Object.getOwnPropertyNames(obj);
    for (const key of props.slice(0, config.maxProps)) {
      let descriptor;
      try {
        descriptor = Object.getOwnPropertyDescriptor(obj, key);
      } catch { continue; }
      if (!descriptor) continue;
      
      const fullPath = `${path}.${key}`;
      
      if (typeof descriptor.value === 'function') {
        candidates.push(buildCandidate(fullPath, descriptor.value, depth));
      } else if (isCandidateObject(descriptor.value)) {
        discover(descriptor.value, fullPath, depth + 1);
      }
    }
  }
  
  discover(window, 'window', 0);
  return candidates.slice(0, config.maxApis);
}
```

### 5.2 Getter 실행 금지

직접 접근(`obj[key]`)은 getter를 실행할 수 있으므로 `Object.getOwnPropertyDescriptor`를 먼저 사용한다.

### 5.3 탐색 제외 Object

```javascript
function shouldSkipObject(value) {
  if (!value) return true;
  if (value === window) return false; // window 자체는 진입점
  if (value instanceof Node) return true;
  if (value instanceof Document) return true;
  if (value instanceof Window) return true;
  return false;
}
```

이름 기반 제외 리스트:
```
document, location, history, navigator, performance,
localStorage, sessionStorage, frames, parent, top, self,
console, crypto, indexedDB, caches, customElements
```

### 5.4 Browser Built-in Filtering

두 가지 방식을 함께 사용한다.

**Known Built-in Set** (Extension 번들에 포함):
```typescript
const BUILTIN_GLOBALS = new Set([
  'window', 'document', 'location', 'navigator', 'history',
  'fetch', 'alert', 'confirm', 'prompt', 'setTimeout',
  'setInterval', 'clearTimeout', 'clearInterval', 'requestAnimationFrame',
  'cancelAnimationFrame', 'queueMicrotask', 'structuredClone',
  'Atomics', 'SharedArrayBuffer', 'WebAssembly'
]);
```

**Candidate Scoring** (Application API 확률):
```text
window.gridApi, window.chartManager, window.app           +5
window.application, window.__APP__, window.get*Data       +3~4
browser native prototype, DOM object, standard Web API    -10
```

최종 결과는 confidence로 저장:
```typescript
interface DiscoveredPageApi {
  id: string;                      // "get-grid-row-count"
  path: string;                    // "window.gridApi.getDisplayedRowCount"
  ownerPath: string;               // "window.gridApi"
  name: string;                    // "getDisplayedRowCount"
  arity: number;
  async: boolean;
  source: 'window' | 'selected-element';
  depth: number;
  confidence: 'low' | 'medium' | 'high';
  verified: boolean;
}
```

## 6. Selected Element API Discovery

Profile Builder에서 사용자가 Grid/Chart 요소 선택 시 해당 DOM Element에 attached object 탐색.

```javascript
function scanElement(selector) {
  const element = document.querySelector(selector);
  if (!element) return [];
  
  const candidates = [];
  const props = Object.getOwnPropertyNames(element);
  
  for (const key of props) {
    let descriptor;
    try {
      descriptor = Object.getOwnPropertyDescriptor(element, key);
    } catch { continue; }
    if (!descriptor || typeof descriptor.value !== 'object') continue;
    
    // gridApi, __gridInstance, chart, controller, viewModel, component 등
    if (isLikelyApiObject(key, descriptor.value)) {
      candidates.push({
        path: `element.${key}`,
        ownerPath: `element.${key}`,
        name: key,
        source: 'selected-element',
        depth: 1
      });
      // nested scan 수행
      discoverNested(descriptor.value, `element.${key}`, 1, candidates);
    }
  }
  return candidates;
}
```

발견 가능한 attached object 패턴:
```
gridApi, __gridInstance, _grid, agGrid
chart, chartInstance, __chart__, _echarts, _highcharts
controller, viewModel, vm, component, __vue__, _reactRoot
```

## 7. REST API Discovery (Script Static Analysis)

페이지에 포함된 JavaScript 소스 코드를 정적 분석하여 REST API 호출 패턴을 발견한다. 함수를 실행하지 않고 소스 코드만 분석한다.

### 7.1 분석 대상 스크립트

```javascript
// MAIN world에서 실행 - 페이지의 모든 script 소스 수집
function collectScriptSources() {
  const scripts = [];
  
  // Inline scripts
  for (const script of document.scripts) {
    if (script.src) {
      // External script - fetch 필요 (CORS 허용 시)
      scripts.push({ type: 'external', src: script.src, content: null });
    } else if (script.textContent) {
      scripts.push({ type: 'inline', src: null, content: script.textContent });
    }
  }
  
  // Module scripts (type="module")
  for (const script of document.querySelectorAll('script[type="module"]')) {
    if (script.src) {
      scripts.push({ type: 'module-external', src: script.src, content: null });
    } else if (script.textContent) {
      scripts.push({ type: 'module-inline', src: null, content: script.textContent });
    }
  }
  
  return scripts;
}
```

> **주의**: External script 내용은 CORS 정책상 직접 읽기 어려울 수 있다. 인라인 스크립트와 소스맵이 있는 경우에 주로 분석 가능.

### 7.2 REST API 패턴 탐지

소스 코드에서 다음 패턴을 검색:

```javascript
const REST_API_PATTERNS = [
  // fetch API
  /fetch\s*\(\s*['"`]([^'"`]+)['"`]/g,
  /fetch\s*\(\s*([a-zA-Z_$][\w$]*)\s*\)/g,  // 변수 참조
  
  // axios
  /axios\.(get|post|put|patch|delete|request)\s*\(\s*['"`]([^'"`]+)['"`]/g,
  /axios\s*\(\s*\{[^}]*url\s*:\s*['"`]([^'"`]+)['"`]/g,
  
  // XMLHttpRequest
  /new\s+XMLHttpRequest\s*\(\s*\)/g,
  /\.open\s*\(\s*['"`](GET|POST|PUT|PATCH|DELETE)['"`]\s*,\s*['"`]([^'"`]+)['"`]/g,
  
  // jQuery
  /\$\.(get|post|ajax|getJSON)\s*\(\s*['"`]([^'"`]+)['"`]/g,
  
  // GraphQL
  /fetch\s*\(\s*['"`]([^'"`]*graphql[^'"`]*)['"`]/gi,
  /axios\.(post)\s*\(\s*['"`]([^'"`]*graphql[^'"`]*)['"`]/gi,
  
  // 공통 URL 패턴 (상대/절대 경로)
  /['"`](\/api\/[^'"`]+)['"`]/g,
  /['"`](https?:\/\/[^'"`]+\/api\/[^'"`]+)['"`]/g,
];
```

### 7.3 탐지된 REST API 후보 모델

```typescript
interface DiscoveredRestApi {
  id: string;                           // "get-equipment-list"
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  urlPattern: string;                   // "/api/equipments" or "https://api.company.com/v1/equipments"
  urlTemplate?: string;                 // "/api/equipments/{id}" (파라미터화된 템플릿)
  
  // 요청 정보 (소스 코드에서 추론)
  requestHeaders?: Record<string, string>;  // Content-Type, Authorization 등
  requestBodySchema?: unknown;              // JSON 스키마 추정
  queryParams?: string[];                   // URL에서 추출된 쿼리 파라미터
  pathParams?: string[];                    // URL 템플릿에서 추출된 경로 파라미터
  
  // 응답 정보 (소스 코드에서 추론)
  responseType?: 'json' | 'text' | 'blob' | 'arraybuffer';
  responseSchema?: unknown;                 // 처리 코드에서 추론
  
  // 소스 위치
  source: 'inline-script' | 'external-script' | 'module-script';
  scriptUrl?: string;                       // external script URL
  lineNumber?: number;
  columnNumber?: number;
  surroundingCode?: string;                 // 컨텍스트 (50자 내외)
  
  // 클라이언트 라이브러리
  clientLibrary: 'fetch' | 'axios' | 'xhr' | 'jquery' | 'graphql' | 'unknown';
  
  // 신뢰도
  confidence: 'low' | 'medium' | 'high';
  
  // 인증 필요 여부 추정
  requiresAuth: boolean;
  
  // CORS 가능 여부 (origin 비교)
  corsLikely: boolean;
}
```

### 7.4 파라미터 추출 휴리스틱

소스 코드에서 파라미터 사용 패턴 분석:

```javascript
// 예: fetch(`/api/equipments/${equipId}?status=${status}`)
function extractUrlTemplate(urlString, surroundingCode) {
  // 템플릿 리터럴에서 변수 치환 부분 추출
  const template = urlString
    .replace(/\$\{([^}]+)\}/g, '{$1}')  // ${var} → {var}
    .replace(/'\s*\+\s*([a-zA-Z_$][\w$]*)\s*\+\s*'/g, '{$1}'); // ' + var + ' → {var}
  
  // 주변 코드에서 변수 할당/정의 찾기
  const paramNames = extractParameterNames(surroundingCode, template);
  
  return { template, paramNames };
}

// 예: body: JSON.stringify({ equipId, name })
function extractRequestBody(code) {
  // JSON.stringify 인자, 객체 리터럴 등에서 필드 추출
}
```

### 7.5 인증/헤더 추론

```javascript
function inferAuthAndHeaders(code, url) {
  const headers = {};
  let requiresAuth = false;
  
  // Authorization 헤더 패턴
  if (code.includes('Authorization') || code.includes('Bearer')) {
    headers['Authorization'] = 'Bearer <token>';
    requiresAuth = true;
  }
  
  // Content-Type
  if (code.includes('application/json')) {
    headers['Content-Type'] = 'application/json';
  } else if (code.includes('form-data') || code.includes('FormData')) {
    headers['Content-Type'] = 'multipart/form-data';
  }
  
  // Custom headers
  const headerMatches = code.match(/headers\s*:\s*\{[^}]+\}/g);
  if (headerMatches) {
    // 파싱하여 헤더 추출
  }
  
  // 쿠키 기반 인증 (withCredentials)
  if (code.includes('withCredentials') || code.includes('credentials:')) {
    requiresAuth = true;
  }
  
  return { headers, requiresAuth };
}
```

### 7.6 CORS 가능성 판단

```javascript
function assessCorsLikely(url, pageOrigin) {
  try {
    const apiUrl = new URL(url, pageOrigin);
    // Same-origin
    if (apiUrl.origin === pageOrigin) return true;
    
    // Cross-origin but likely CORS enabled (common patterns)
    if (apiUrl.pathname.startsWith('/api/')) return true;
    if (apiUrl.hostname.includes('api.')) return true;
    
    return false; // Unknown
  } catch {
    return false;
  }
}
```

### 7.7 Extension에서 REST API 직접 호출

발견된 REST API는 Extension의 `fetch`를 사용해 직접 호출:

```typescript
// Extension side (Service Worker 또는 Offscreen Document)
async function invokeRestApi(restApi: DiscoveredRestApi, args: Record<string, unknown>) {
  // 1. URL 템플릿에 파라미터 바인딩
  const url = bindUrlTemplate(restApi.urlTemplate || restApi.urlPattern, args);
  
  // 2. 요청 옵션 구성
  const options: RequestInit = {
    method: restApi.method,
    headers: {
      'Content-Type': 'application/json',
      ...restApi.requestHeaders,
    },
    credentials: restApi.requiresAuth ? 'include' : 'same-origin',
  };
  
  // 3. Body 구성 (POST/PUT/PATCH)
  if (['POST', 'PUT', 'PATCH'].includes(restApi.method)) {
    options.body = JSON.stringify(buildRequestBody(restApi, args));
  }
  
  // 4. 호출 (Service Worker에서 fetch 사용)
  const response = await fetch(url, options);
  
  // 5. 응답 정규화 (doc 27의 normalizeValue와 유사)
  return normalizeRestResponse(response, restApi.responseType);
}
```

> **보안 고려사항**:
> - Extension의 `host_permissions`에 API origin이 포함되어야 함
> - 사용자 세션 쿠키가 자동 포함되므로(`credentials: 'include'`) 별도 토큰 관리 불필요
> - 민감한 API는 Profile에서 `mode: "action"`, `sideEffect: "data-modification"`으로 표시
> - CORS 차단 시 Offscreen Document 또는 Background 페이지에서 프록시 필요

### 7.8 REST API Discovery 실행 프로토콜

```typescript
async function discoverRestApis(tabId: number): Promise<DiscoveredRestApi[]> {
  // 1. MAIN world에서 스크립트 소스 수집
  const scriptSources = await chrome.scripting.executeScript({
    target: { tabId },
    world: 'MAIN',
    func: collectScriptSources
  });
  
  // 2. Extension side에서 정적 분석 수행 (MAIN world 불필요)
  const allSources = scriptSources[0]?.result ?? [];
  const candidates = [];
  
  for (const script of allSources) {
    if (script.content) {
      const apis = analyzeScriptContent(script.content, script.src);
      candidates.push(...apis);
    }
    // External script는 별도 fetch 필요 (CORS 허용 시)
  }
  
  // 3. 중복 제거 및 정렬
  return deduplicateAndRank(candidates);
}
```

## 8. 추가 Discovery 소스 상세 (향후 확장)

### 8.1 WebSocket / SSE Discovery

실시간 데이터 스트림 엔드포인트 발견:

```javascript
// MAIN world에서 실행
function scanWebSockets() {
  const candidates = [];
  
  // 1. 전역 WebSocket 인스턴스 스캔 (window에 노출된 경우)
  const props = Object.getOwnPropertyNames(window);
  for (const key of props) {
    try {
      const desc = Object.getOwnPropertyDescriptor(window, key);
      if (desc?.value instanceof WebSocket) {
        candidates.push({
          kind: 'websocket',
          id: `ws-${key}`,
          path: `window.${key}`,
          url: desc.value.url,
          protocol: desc.value.protocol,
          readyState: desc.value.readyState,
          extensions: desc.value.extensions,
          source: 'window',
          confidence: 'high'
        });
      }
    } catch { }
  }
  
  // 2. 스크립트 소스에서 WebSocket 생성 패턴 분석
  // new WebSocket('wss://...'), new EventSource('/sse/...')
  
  // 3. 라이브러리 래퍼 탐지 (Socket.io, SignalR, SockJS 등)
  const libPatterns = {
    'socket.io': /io\s*\(\s*['"`]([^'"`]+)['"`]/,
    'signalr': /HubConnectionBuilder.*?\.withUrl\s*\(\s*['"`]([^'"`]+)['"`]/,
    'sockjs': /new\s+SockJS\s*\(\s*['"`]([^'"`]+)['"`]/
  };
  
  return candidates;
}
```

**WebSocket 후보 모델**:
```typescript
interface DiscoveredWebSocket {
  kind: 'websocket' | 'sse';
  id: string;
  url: string;                    // wss://api.example.com/stream
  protocol?: string;              // WebSocket subprotocol
  library?: 'socket.io' | 'signalr' | 'sockjs' | 'native' | 'unknown';
  messageFormat?: 'json' | 'protobuf' | 'text' | 'binary';
  // 정적 분석으로 추론 가능한 것들
  eventHandlers?: string[];       // onmessage, onopen, onclose 등
  reconnectionLogic?: boolean;    // 재연결 로직 존재 여부
  authentication?: 'cookie' | 'token' | 'query-param' | 'unknown';
}
```

**Extension에서 활용**: Offscreen Document에서 WebSocket 연결 유지, 실시간 데이터 수신 후 Extension 저장소에 캐싱, LLM이 구독 요청 시 캐시된 최신 데이터 제공.

---

### 8.2 Event Listener Discovery

페이지가 수신하는 커스텀 이벤트/메시지 발견:

```javascript
function scanEventListeners() {
  const candidates = [];
  
  // 1. window/document/element에 등록된 이벤트 리스너 열거
  // getEventListeners()는 DevTools만 가능하므로 정적 분석으로 대체
  
  // 2. addEventListener 패턴 스캔
  const eventPatterns = [
    /addEventListener\s*\(\s*['"`]([^'"`]+)['"`]/g,
    /\.on([a-z]+)\s*=/g,  // onclick, onmessage 등
    /dispatchEvent\s*\(\s*new\s+(CustomEvent|Event)\s*\(\s*['"`]([^'"`]+)['"`]/g
  ];
  
  // 3. 커스텀 이벤트 버스 패턴 (EventEmitter, Mitt, EventBus 등)
  const busPatterns = {
    'eventemitter': /\.(on|emit|once|off)\s*\(\s*['"`]([^'"`]+)['"`]/g,
    'mitt': /mitt\s*\(\s*\)\.?\.(on|emit)\s*\(\s*['"`]([^'"`]+)['"`]/g,
    'custom': /EventBus\.(on|emit|subscribe|publish)\s*\(\s*['"`]([^'"`]+)['"`]/g
  };
  
  // 4. postMessage 패턴 (cross-origin 통신)
  const postMessagePatterns = [
    /postMessage\s*\(\s*([^,]+)\s*,\s*['"`]([^'"`]+)['"`]/g,
    /window\.addEventListener\s*\(\s*['"`]message['"`]\s*,\s*([^)]+)\)/g
  ];
  
  return candidates;
}
```

**Event 후보 모델**:
```typescript
interface DiscoveredEvent {
  kind: 'custom-event' | 'message-event' | 'event-bus';
  id: string;                     // "equipment-status-changed"
  eventName: string;
  target: 'window' | 'document' | 'element' | 'event-bus';
  elementSelector?: string;       // element 대상 시
  payloadSchema?: unknown;        // 이벤트 detail/data 스키마 추론
  direction: 'listen' | 'dispatch' | 'both';
  source: 'static-analysis' | 'runtime-observation';
  confidence: 'low' | 'medium' | 'high';
}
```

**Extension에서 활용**: `dispatchEvent`로 페이지 내부 이벤트 버스에 이벤트 발송, 페이지 상태 변경 트리거, 워크플로우 단계 간 연계.

---

### 8.3 Storage Pattern Discovery

클라이언트 사이드 스토리지 키·스키마 발견:

```javascript
function scanStoragePatterns() {
  const candidates = [];
  
  // 1. LocalStorage/SessionStorage 키 패턴 분석
  // 정적 분석: localStorage.getItem('key'), setItem('key', ...) 패턴
  const storagePatterns = [
    /localStorage\.(getItem|setItem|removeItem|key)\s*\(\s*['"`]([^'"`]+)['"`]/g,
    /sessionStorage\.(getItem|setItem|removeItem|key)\s*\(\s*['"`]([^'"`]+)['"`]/g
  ];
  
  // 2. IndexedDB 패턴 (openDB, transaction, objectStore)
  const idbPatterns = [
    /indexedDB\.open\s*\(\s*['"`]([^'"`]+)['"`]/g,
    /openDB\s*\(\s*['"`]([^'"`]+)['"`]/g,  // idb 라이브러리
    /createObjectStore\s*\(\s*['"`]([^'"`]+)['"`]/g
  ];
  
  // 3. 쿠키 패턴 (document.cookie 읽기/쓰기)
  const cookiePatterns = [
    /document\.cookie\s*=/g,
    /document\.cookie\s*;/g
  ];
  
  // 4. 런타임에서 실제 키 열거 (사용자 승인 시)
  // MAIN world에서 실행: Object.keys(localStorage) 등
  
  return candidates;
}
```

**Storage 후보 모델**:
```typescript
interface DiscoveredStorage {
  kind: 'localStorage' | 'sessionStorage' | 'indexedDB' | 'cookie';
  id: string;
  keyPattern: string;             // "user.preferences.*", "cache.api.*"
  keyExamples?: string[];         // 실제 발견된 키 예시
  valueSchema?: unknown;          // 값 구조 추론 (JSON 파싱 시도)
  estimatedSize?: number;         // 대략적 크기
  accessPattern: 'read' | 'write' | 'readwrite';
  ttl?: number;                   // 만료 시간 (쿠키, 일부 라이브러리)
  encryption?: boolean;           // 암호화 여부 추정
}
```

**Extension에서 활용**: 스토리지 직접 읽기/쓰기로 페이지 상태 동기화, 캐시 무효화, 사용자 설정 백업/복원.

---

### 8.4 Custom Element / Shadow DOM Discovery

웹 컴포넌트 퍼블릭 API 발견:

```javascript
function scanCustomElements() {
  const candidates = [];
  
  // 1. 커스텀 엘리먼트 레지스트리 확인
  const definedElements = customElements.getRegistry ? 
    Array.from(customElements.getRegistry().keys()) :
    [];  // 표준 API 없음, 폴백 필요
  
  // 2. 문서 내 커스텀 엘리먼트 인스턴스 스캔
  const allElements = document.querySelectorAll('*');
  for (const el of allElements) {
    if (el.tagName.includes('-')) {  // 커스텀 엘리먼트 명명 규칙
      const tagName = el.tagName.toLowerCase();
      
      // 3. 퍼블릭 메서드/프로퍼티/이벤트 발견
      const props = Object.getOwnPropertyNames(el);
      for (const prop of props) {
        try {
          const desc = Object.getOwnPropertyDescriptor(el, prop);
          if (!desc) continue;
          
          if (typeof desc.value === 'function') {
            candidates.push({
              kind: 'custom-element-method',
              elementTag: tagName,
              methodName: prop,
              element: el
            });
          } else if (desc.get || desc.set) {
            candidates.push({
              kind: 'custom-element-property',
              elementTag: tagName,
              propertyName: prop,
              readable: !!desc.get,
              writable: !!desc.set
            });
          }
        } catch { }
      }
      
      // 4. Shadow DOM 내부 슬롯/라이트 DOM 구조 분석
      if (el.shadowRoot) {
        // open shadow root만 접근 가능
        analyzeShadowDOM(el.shadowRoot, tagName, candidates);
      }
    }
  }
  
  return candidates;
}
```

**Custom Element 후보 모델**:
```typescript
interface DiscoveredCustomElement {
  kind: 'custom-element';
  id: string;                     // "my-grid"
  tagName: string;                // "my-grid"
  methods: Array<{
    name: string;
    arity: number;
    async: boolean;
  }>;
  properties: Array<{
    name: string;
    readable: boolean;
    writable: boolean;
    type?: string;
  }>;
  events: Array<{
    name: string;
    detailSchema?: unknown;
  }>;
  slots: string[];                // Shadow DOM 슬롯 이름
  cssParts: string[];             // ::part() 노출된 파트
  formAssociated: boolean;        // form 연계 여부
  shadowRootMode: 'open' | 'closed' | 'none';
}
```

**Extension에서 활용**: Shadow DOM 내부 요소 직접 조작, 커스텀 엘리먼트 메서드 호출, 폼 데이터 추출/설정.

---

### 8.5 Feature Flag / Config Object Discovery

런타임 설정·토글 상태 발견:

```javascript
function scanFeatureFlags() {
  const candidates = [];
  
  // 1. 알려진 플래그 객체 패턴
  const flagPatterns = [
    'featureFlags', 'flags', 'config', 'configuration',
    'settings', 'options', 'featureToggles', 'experiments',
    'AB_TEST', 'abTest', 'rollout'
  ];
  
  for (const pattern of flagPatterns) {
    // window, 전역 객체에서 검색
    discoverObject(window, pattern, 0, candidates);
  }
  
  // 2. 런타임 평가 플래그 패턴
  // if (flags.newUI) { ... } → flags.newUI 키 발견
  
  // 3. 원격 설정 서비스 패턴 (LaunchDarkly, ConfigCat, Unleash 등)
  const remoteConfigPatterns = {
    'launchdarkly': /LDClient|launchdarkly/i,
    'configcat': /configcat/i,
    'unleash': /unleash/i,
    'split': /split\.io|SplitFactory/i
  };
  
  return candidates;
}
```

**Feature Flag 후보 모델**:
```typescript
interface DiscoveredFeatureFlag {
  kind: 'feature-flag' | 'config';
  id: string;                     // "new-dashboard-ui"
  key: string;                    // "flags.newDashboardUI"
  type: 'boolean' | 'string' | 'number' | 'json' | 'unknown';
  currentValue: unknown;
  possibleValues?: unknown[];     // 열거형인 경우
  source: 'local-object' | 'remote-config' | 'url-param' | 'cookie';
  targetingRules?: string;        // 타게팅 규칙 요약 (문자열로)
  lastUpdated?: string;           // 타임스탬프
}
```

**Extension에서 활용**: 현재 활성화된 기능 확인, A/B 테스트 변형 식별, 조건부 워크플로우 분기.

---

### 8.6 Analytics / Tracing Call Discovery

사용자 플로우·비즈니스 이벤트 명세 발견:

```javascript
function scanAnalyticsCalls() {
  const candidates = [];
  
  // 1. 주요 분석 라이브러리 패턴
  const analyticsPatterns = {
    'google-analytics': /gtag\s*\(\s*['"`]event['"`]\s*,\s*['"`]([^'"`]+)['"`]/g,
    'ga4': /gtag\s*\(\s*['"`]event['"`]/g,
    'mixpanel': /mixpanel\.track\s*\(\s*['"`]([^'"`]+)['"`]/g,
    'amplitude': /amplitude\.track\s*\(\s*['"`]([^'"`]+)['"`]/g,
    'segment': /analytics\.track\s*\(\s*['"`]([^'"`]+)['"`]/g,
    'rudderstack': /rudderanalytics\.track\s*\(\s*['"`]([^'"`]+)['"`]/g,
    'sentry': /Sentry\.captureMessage|Sentry\.addBreadcrumb/g,
    'datadog': /DD_RUM\.addAction|DATADOG_RUM\.addAction/g,
    'custom': /track(?:Event)?\s*\(\s*['"`]([^'"`]+)['"`]/gi
  };
  
  // 2. 이벤트 속성/프로퍼티 스키마 추출
  // track('event_name', { prop1: value, prop2: value })
  
  // 3. 페이지 뷰/스크린 뷰 패턴
  const pageViewPatterns = [
    /gtag\s*\(\s*['"`]config['"`]/g,
    /analytics\.page\s*\(\s*['"`]([^'"`]+)['"`]/g
  ];
  
  return candidates;
}
```

**Analytics 후보 모델**:
```typescript
interface DiscoveredAnalyticsEvent {
  kind: 'analytics-event';
  id: string;                     // "equipment_viewed"
  eventName: string;
  provider: 'ga4' | 'mixpanel' | 'amplitude' | 'segment' | 'custom' | 'unknown';
  properties: Array<{
    name: string;
    type: string;
    required: boolean;
    exampleValues?: unknown[];
  }>;
  triggerLocation?: string;       // 소스 코드 위치
  businessContext?: string;       // 비즈니스 의미 (LLM 추정)
}
```

**Extension에서 활용**: 사용자 행동 퍼널 분석, 워크플로우 완료 조건 정의, 비즈니스 KPI 측정 포인트 자동 식별.

---

### 8.7 Performance Marks/Measures Discovery

성능 측정 포인트·비즈니스 메트릭 발견:

```javascript
function scanPerformanceMarks() {
  const candidates = [];
  
  // 1. performance.mark/measure 호출 패턴
  const perfPatterns = [
    /performance\.mark\s*\(\s*['"`]([^'"`]+)['"`]/g,
    /performance\.measure\s*\(\s*['"`]([^'"`]+)['"`]/g,
    /performance\.now\s*\(\s*\)/g
  ];
  
  // 2. Web Vitals 라이브러리 패턴
  const webVitalsPatterns = {
    'web-vitals': /onCLS|onFID|onLCP|onFCP|onTTFB/g,
    'custom': /performance\.observer|PerformanceObserver/g
  };
  
  // 3. 비즈니스 타이밍 마크 (사용자 정의)
  // performance.mark('api-start'), performance.mark('api-end')
  // performance.measure('api-duration', 'api-start', 'api-end')
  
  return candidates;
}
```

**Performance 후보 모델**:
```typescript
interface DiscoveredPerformanceMark {
  kind: 'performance-mark' | 'performance-measure' | 'web-vital';
  id: string;
  name: string;                   // "api-fetch-duration"
  type: 'mark' | 'measure' | 'vital';
  startMark?: string;
  endMark?: string;
  duration?: number;              // measure인 경우
  metadata?: Record<string, unknown>;  // detail 속성
  businessMeaning?: string;       // "장비 목록 조회 API 소요 시간"
}
```

**Extension에서 활용**: API 호출 성능 모니터링, SLA 준수 확인, 느린 연산 자동 감지·알림.

---

### 8.8 Source Map / TypeScript Type Discovery (가용 시)

타입 정보·컴포넌트 Props 발견:

```javascript
async function scanSourceMaps() {
  const candidates = [];
  
  // 1. 소스맵 URL 발견 (script 태그 sourceMappingURL 주석)
  const scripts = document.scripts;
  for (const script of scripts) {
    const sourceMapUrl = extractSourceMapUrl(script);
    if (sourceMapUrl) {
      try {
        const response = await fetch(sourceMapUrl);
        const sourceMap = await response.json();
        // sourceMap.sources, sourceMap.sourcesContent 분석
        // TypeScript 컴파일 시 .d.ts 정보 포함 여부 확인
      } catch { }
    }
  }
  
  // 2. 개발 빌드에서만 가용 (프로덕션에서 제거되는 경우 많음)
  // 3. 타입 정보가 있는 경우 컴포넌트 Props, 함수 시그니처 추출 가능
  
  return candidates;
}
```

**Type 후보 모델**:
```typescript
interface DiscoveredTypeInfo {
  kind: 'typescript-type';
  id: string;
  symbolName: string;             // "EquipmentGridProps"
  type: 'interface' | 'type' | 'function';
  definition: string;             // TypeScript 정의 문자열
  sourceFile: string;
  lineNumber: number;
  // React 컴포넌트인 경우
  componentProps?: Array<{
    name: string;
    type: string;
    required: boolean;
    description?: string;
  }>;
}
```

> **제한사항**: 프로덕션 빌드에서는 소스맵/타입 정보가 대부분 제거됨. 개발/스테이징 환경에서만 활용 가능.

---

## 9. Function Metadata 수집

함수 실행 없이 다음 메타데이터만 수집:

```typescript
interface FunctionMetadata {
  path: string;
  name: string;
  arity: number;                    // fn.length
  async: boolean;                   // constructor.name === 'AsyncFunction'
  constructorName: string | null;   // fn.constructor?.name
  isNative: boolean;                // fn.toString().includes('[native code]')
  enumerable: boolean;
  configurable: boolean;
}
```

## 11. Discovery 실행 프로토콜

### 11.1 Extension Side 호출

```typescript
async function discoverWindowApis(tabId: number): Promise<DiscoveredPageApi[]> {
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    world: 'MAIN',
    func: scanWindow
  });
  return results[0]?.result ?? [];
}

async function discoverElementApis(
  tabId: number,
  selector: string
): Promise<DiscoveredPageApi[]> {
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    world: 'MAIN',
    func: scanElement,
    args: [selector]
  });
  return results[0]?.result ?? [];
}
```

### 11.2 성능 제한

```text
Window scan:           <= 300 ms 목표
Nested scan:           depth <= 3
Maximum APIs:          <= 500
Max props/obj:         <= 200
Script analysis:       <= 500 KB per script
WebSocket scan:        <= 100 ms
Event listener scan:   <= 100 ms
Storage scan:          <= 100 ms
Custom element scan:   <= 200 ms
Feature flag scan:     <= 50 ms
Analytics scan:        <= 100 ms
Performance scan:      <= 50 ms
Source map scan:       개발/스테이징만, 선택적
```

대규모 object 발견 시 `TRUNCATED` 플래그 반환.

### 11.3 Discovery Result Cache

같은 페이지에서 반복 탐색 방지:

```typescript
interface DiscoveryCacheEntry {
  origin: string;                    // "https://eda.company.com"
  profileId: string;                 // "equipment-monitor"
  pathPattern: string;               // URL pathname pattern
  fingerprint: string;               // page fingerprint hash
  discoveredAt: string;              // ISO timestamp
  candidates: DiscoveredPageApi[];
}
```

Cache Key: `origin + profileId + fingerprint`

## 12. Page Fingerprint

SPA 업데이트/애플리케이션 변경 감지용:

```
- URL pattern (pathname prefix)
- document.title
- script src list hash
- application version global (window.APP_VERSION 등)
- known root element attributes
```

API 목록이 급격히 변경되면 Profile Change Detector에 전달 (doc 27 Phase 4 연계).

## 13. Profile Builder UI 연계

### 13.1 화면 구성

```text
Page Profile Builder
---------------------------------------------------
Page: Equipment Monitor
URL: https://eda.company.com/equipment/...
---------------------------------------------------
Page API Discovery
[ Scan All ]  [ Scan Window APIs ]  [ Inspect Element ]  [ Scan REST APIs ]
---------------------------------------------------
Discovered APIs

[JAVASCRIPT FUNCTIONS]
✓ window.gridApi.getDisplayedRowCount()
  kind: js-function  |  arity: 0  |  confidence: HIGH  |  verified: NO
? window.gridApi.getDisplayedRowAtIndex(index)
  kind: js-function  |  arity: 1  |  confidence: HIGH  |  verified: NO
? window.chartManager.getSeriesData(seriesId)
  kind: js-function  |  arity: 1  |  confidence: MEDIUM |  verified: NO

[REST APIs]
✓ GET /api/equipments
  kind: rest-api  |  client: fetch  |  auth: YES  |  CORS: YES  |  verified: NO
? POST /api/equipments/{id}/action
  kind: rest-api  |  client: axios  |  auth: YES  |  CORS: YES  |  verified: NO
? GET /api/charts/series/{seriesId}/data
  kind: rest-api  |  client: fetch  |  auth: YES  |  CORS: YES  |  verified: NO
---------------------------------------------------
[ Test Selected ]    [ Add to Profile ]    [ Ignore ]
---------------------------------------------------
```

REST API는 별도 탭 또는 섹션으로 구분하여 표시하며, 호출 시 Extension이 직접 HTTP 요청을 보냄을 명확히 안내한다.

### 13.2 API Test Flow

```text
Discovery → Candidate API → User selects "Test"
    |
    +-- JavaScript Function?
    |       |
    |       +-- argument required? → User enters values
    |       |
    |       v
    |   Invocation (doc 27의 invokePageApi 사용 - MAIN world)
    |
    +-- REST API?
    |       |
    |       +-- path/query/body params required? → User enters values
    |       |
    |       v
    |   Extension 직접 HTTP 호출 (Service Worker/Offscreen)
    |
    v
Result preview (정규화된 값)
    |
    v
Register into Page Profile
```

REST API 테스트 시 Extension의 `host_permissions`에 대상 origin이 포함되어 있는지 확인하고, CORS 이슈 시 Offscreen Document 사용을 안내한다.

### 13.3 API Verification 상태

```typescript
type ApiVerificationStatus =
  | 'DISCOVERED'   // Discovery만 완료
  | 'TESTED'       // Test 실행 완료
  | 'VERIFIED'     // Test 성공, Profile 등록됨
  | 'INVALID';     // Test 실패 또는 경로 변경됨
```

상태 전이:
```
DISCOVERED → TESTED → VERIFIED
                ↘ INVALID
```

## 14. Page Profile Schema 연계

Discovery 결과는 Page Profile의 `pageApis` 설계 시 입력으로 사용 (자동 생성하지 않음).

```yaml
pageApis:
  # JavaScript 함수 기반 API
  - id: get-grid-row-count
    description: "Returns the number of rows currently known by the grid."
    kind: "javascript-function"           # 신규 필드
    path: "window.gridApi.getDisplayedRowCount"
    source: "window"
    args: []
    return:
      type: "number"
    discovered: true
    verified: true
    mode: "read"
    sideEffect: "none"

  # REST API 기반 API (Extension이 직접 호출)
  - id: get-equipment-list
    description: "Fetches equipment list from backend API."
    kind: "rest-api"                      # 신규 필드
    method: "GET"
    urlTemplate: "/api/equipments"
    urlPattern: "/api/equipments"
    requestHeaders:
      Accept: "application/json"
    queryParams:
      - name: "status"
        type: "string"
        required: false
    responseType: "json"
    responseSchema:
      type: "array"
      items:
        type: "object"
        properties:
          id: { type: "string" }
          name: { type: "string" }
          status: { type: "string" }
    corsLikely: true
    requiresAuth: true
    clientLibrary: "fetch"
    discovered: true
    verified: true
    mode: "read"
    sideEffect: "none"

  # POST 예시 (Action API)
  - id: execute-equipment-action
    description: "Executes an action on equipment."
    kind: "rest-api"
    method: "POST"
    urlTemplate: "/api/equipments/{equipId}/action"
    urlPattern: "/api/equipments/{equipId}/action"
    pathParams:
      - name: "equipId"
        type: "string"
        required: true
    requestBodySchema:
      type: "object"
      properties:
        action: { type: "string", enum: ["start", "stop", "restart"] }
        params: { type: "object" }
      required: ["action"]
    requestHeaders:
      Content-Type: "application/json"
    responseType: "json"
    corsLikely: true
    requiresAuth: true
    discovered: true
    verified: false
    mode: "action"
    sideEffect: "data-modification"
```

`kind` 필드로 JavaScript 함수와 REST API를 구분한다. `discovered: true`는 Discovery로 찾았음을 표시, `verified: true`는 Test 통과 후 수동 설정.

### 추가 Discovery 유형 Profile Schema 예시

```yaml
# WebSocket API
- id: subscribe-equipment-status
  description: "Subscribes to real-time equipment status updates."
  kind: "websocket"
  url: "wss://api.company.com/equipment/status"
  protocol: "json"
  library: "socket.io"
  messageFormat: "json"
  authentication: "cookie"
  mode: "read"
  sideEffect: "none"
  discovered: true
  verified: false

# Server-Sent Events
- id: listen-alerts
  description: "Listens for alert notifications via SSE."
  kind: "sse"
  url: "/api/alerts/stream"
  reconnectionLogic: true
  mode: "read"
  sideEffect: "none"
  discovered: true
  verified: false

# Custom Event (dispatchEvent로 트리거)
- id: trigger-equipment-refresh
  description: "Triggers equipment data refresh via custom event."
  kind: "custom-event"
  eventName: "equipment:refresh-requested"
  target: "window"
  direction: "dispatch"
  payloadSchema:
    type: "object"
    properties:
      equipmentIds:
        type: "array"
        items: { type: "string" }
      forceRefresh: { type: "boolean" }
  mode: "action"
  sideEffect: "page-state-change"
  discovered: true
  verified: false

# Storage Direct Access
- id: get-user-preferences
  description: "Reads user preferences from localStorage."
  kind: "localStorage"
  keyPattern: "user.preferences.*"
  accessPattern: "read"
  valueSchema:
    type: "object"
    properties:
      theme: { type: "string", enum: ["light", "dark"] }
      language: { type: "string" }
      timezone: { type: "string" }
  mode: "read"
  sideEffect: "none"
  discovered: true
  verified: true

# Custom Element Method
- id: refresh-grid-data
  description: "Refreshes grid data via custom element method."
  kind: "custom-element"
  tagName: "my-grid"
  methodName: "refresh"
  arity: 0
  async: true
  mode: "action"
  sideEffect: "page-state-change"
  discovered: true
  verified: false

# Feature Flag Check
- id: check-new-ui-enabled
  description: "Checks if new dashboard UI feature flag is enabled."
  kind: "feature-flag"
  key: "flags.newDashboardUI"
  type: "boolean"
  currentValue: true
  source: "local-object"
  mode: "read"
  sideEffect: "none"
  discovered: true
  verified: true

# Analytics Event (참조용, 직접 호출 안 함)
- id: track-equipment-view
  description: "Equipment view tracking event (reference only)."
  kind: "analytics-event"
  eventName: "equipment_viewed"
  provider: "ga4"
  properties:
    - name: "equipId"
      type: "string"
      required: true
    - name: "viewType"
      type: "string"
      required: false
  mode: "read"
  sideEffect: "none"
  discovered: true
  verified: false
  invocationDisabled: true  # Extension에서 직접 호출하지 않음

# Performance Measure (참조용)
- id: measure-api-latency
  description: "API latency performance measure (reference only)."
  kind: "performance-measure"
  name: "api-fetch-duration"
  type: "measure"
  startMark: "api-start"
  endMark: "api-end"
  mode: "read"
  sideEffect: "none"
  discovered: true
  verified: false
  invocationDisabled: true
```

참조용(`invocationDisabled: true`)인 Analytics/Performance 항목은 LLM이 호출하지 않고 컨텍스트 이해용으로만 사용된다.

## 15. LLM Tool Schema

LLM에는 실제 JavaScript path나 REST API URL을 직접 노출하지 않음 (doc 27과 동일).

```json
{
  "name": "invoke_page_api",
  "description": "Invoke an API registered in the current page profile.",
  "parameters": {
    "type": "object",
    "properties": {
      "apiId": { "type": "string" },
      "arguments": { "type": "array" }
    },
    "required": ["apiId"]
  }
}
```

LLM 요청 예 (JavaScript 함수):
```json
{ "apiId": "get-equipment-info", "arguments": ["EQP001"] }
```

LLM 요청 예 (REST API):
```json
{ "apiId": "get-equipment-list", "arguments": [{ "status": "active" }] }
{ "apiId": "execute-equipment-action", "arguments": [{ "equipId": "EQP001", "action": "start" }] }
```

LLM 요청 예 (WebSocket - 구독 시작):
```json
{ "apiId": "subscribe-equipment-status", "arguments": [] }
```

LLM 요청 예 (Custom Event 발송):
```json
{ "apiId": "trigger-equipment-refresh", "arguments": [{ "equipmentIds": ["EQP001", "EQP002"], "forceRefresh": true }] }
```

LLM 요청 예 (Storage 읽기):
```json
{ "apiId": "get-user-preferences", "arguments": [] }
```

LLM 요청 예 (Custom Element 메서드):
```json
{ "apiId": "refresh-grid-data", "arguments": [] }
```

LLM 요청 예 (Feature Flag 확인):
```json
{ "apiId": "check-new-ui-enabled", "arguments": [] }
```

> **참고**: `kind: "analytics-event"`, `"performance-measure"`, `"performance-mark"` 등은 `invocationDisabled: true`로 설정되어 LLM이 호출할 수 없으며, 컨텍스트 이해용으로만 제공된다.

Extension 내부에서 `kind`에 따라 JavaScript 함수 호출(doc 27), REST API 직접 호출, WebSocket 연결, Custom Event 발송, Storage 직접 접근, Custom Element 메서드 호출 등을 분기한다.

## 16. Dynamic Page 변화 대응

doc 27의 재검증(Revalidation) 로직과 연계:

```text
Page loaded → Profile matched → Check registered API paths
    |
    +-- JavaScript 함수: 존재 여부 확인 (함수 실행 안 함)
    +-- REST API: URL 패턴 매칭 + CORS preflight 확인 (선택적)
         |
         +-- exists → AVAILABLE
         +-- CORS 실패 → CORS_BLOCKED (Offscreen Document 필요)
         +-- 404/변경 → STALE (Profile Builder에 경고 표시)
    +-- WebSocket/SSE: 연결 테스트 (ping/pong) → CONNECTED / DISCONNECTED
    +-- Custom Event: window에 이벤트 리스너 존재 확인 → AVAILABLE / MISSING
    +-- Storage: 키 존재 확인 (getItem) → AVAILABLE / MISSING
    +-- Custom Element: 태그 정의 확인 (customElements.get) → AVAILABLE / MISSING
    +-- Feature Flag: 키 존재 및 값 타입 확인 → AVAILABLE / CHANGED
    +-- Analytics/Performance: 참조용이므로 재검증 생략
```

JavaScript 함수는 존재 여부만 확인. REST API는 가벼운 HEAD/OPTIONS 요청으로 엔드포인트 생존 확인 가능 (단, 부작용 없는 GET/HEAD만). WebSocket은 연결 테스트로 생존 확인.

## 17. Read API / Action API 구분

Profile 설계 시 명시:

```yaml
pageApis:
  - id: get-grid-data
    mode: read
    sideEffect: none
  - id: refresh-grid
    mode: action
    sideEffect: page-state-change
  - id: delete-item
    mode: action
    sideEffect: data-deletion
```

권장 정책:
```
READ:          자동 호출 가능 (Ask/Workflow)
ACTION:        Workflow 정책에 따라 호출
SENSITIVE:     별도 사용자 확인 필요
```

## 18. Discovery에서 자동 호출 금지 (강제 규칙)

Discovery 과정에서는 함수 후보를 **절대로 자동 호출하지 않는다**.

```javascript
// 금지
candidateFunction();

// 허용: metadata만 수집
const descriptor = Object.getOwnPropertyDescriptor(obj, key);
const arity = descriptor.value.length;
const isAsync = descriptor.value.constructor.name === 'AsyncFunction';
```

실행은 반드시 별도의 Test 또는 Invocation 단계에서 수행 (doc 27의 invokePageApi 사용).

## 19. API Name Heuristics (LLM 보조용)

LLM이 후보 분류에 참고할 휴리스틱 (자동 결정하지 않음):

Read 계열: `get*`, `find*`, `fetch*`, `read*`, `load*`, `query*`, `list*`, `current*`, `selected*`, `rows*`, `data*`, `info*`

Action 계열: `set*`, `update*`, `delete*`, `remove*`, `save*`, `submit*`, `refresh*`, `execute*`, `run*`, `select*`, `open*`, `close*`

## 20. LLM 활용 범위

LLM은 다음 역할에만 사용:
```
1. API 이름 의미 추정
2. API 설명(description) 생성
3. Argument 의미 추정
4. Read/Action 후보 분류 제안
5. Page Profile 이름 추천
6. 유사 API grouping
```

LLM이 하지 않는 것:
```
- Discovery 시 함수 자동 실행
- 임의 eval/new Function 생성
- 검증되지 않은 destructive API 자동 호출
```

## 21. 기존 기능과의 연계

```text
Accessibility Tree / DOM Interaction
        |
        +-----------------------+
        |                       |
        v                       v
DOM/CDP Execution        Page API Invocation (doc 27)
        |                       |
        +-----------+-----------+
                    |
                    v
               Page API Discovery (본 문서)
                    |
                    v
               Profile Builder UI
                    |
                    v
               Bundled Adapter 등록 (개발자)
```

Virtual Grid/Chart 연계 시 우선순위 (doc 27과 일치):
```
1. Verified Page API (bundled adapter)
2. Framework Adapter (AG Grid, Highcharts 등)
3. Virtual Scroll DOM Extraction
4. Generic Scroll
```

## 22. 구현 모듈 구조 (제안)

```
src/
  page-api/
    discovery/
      window-api-scanner.ts           // MAIN world window scan
      element-api-scanner.ts          // MAIN world element scan
      rest-api-scanner.ts             // Script content 수집 (MAIN world)
      rest-api-analyzer.ts            // 정적 분석 (Extension side, TypeScript)
      websocket-scanner.ts            // NEW: WebSocket/SSE 패턴 (MAIN world)
      event-listener-scanner.ts       // NEW: 이벤트 리스너 패턴 (MAIN world)
      storage-scanner.ts              // NEW: Storage 패턴 (MAIN world)
      custom-element-scanner.ts       // NEW: Custom Element/Shadow DOM (MAIN world)
      feature-flag-scanner.ts         // NEW: Feature Flag/Config (MAIN world)
      analytics-scanner.ts            // NEW: Analytics/Tracing 패턴 (MAIN world)
      performance-scanner.ts          // NEW: Performance Marks/Measures (MAIN world)
      source-map-scanner.ts           // NEW: Source Map/TypeScript (MAIN world, 선택적)
      candidate-filter.ts             // built-in 필터링, scoring
      discovery-controller.ts         // Extension side orchestration
    registry/
      page-api-registry.ts            // 기존 doc 27 구현
      adapter-types.ts                // 기존 doc 27 구현
    profile/
      page-api-profile.ts             // Profile schema 연계
    ui/
      api-discovery-panel.ts          // Profile Builder 패널
      api-test-dialog.ts              // Test 실행 다이얼로그
```

## 24. 핵심 TypeScript Interface

```typescript
// 통합 API 후보 (모든 Discovery 유형)
export type DiscoveredApiCandidate =
  | DiscoveredPageApi
  | DiscoveredRestApi
  | DiscoveredWebSocket
  | DiscoveredEvent
  | DiscoveredStorage
  | DiscoveredCustomElement
  | DiscoveredFeatureFlag
  | DiscoveredAnalyticsEvent
  | DiscoveredPerformanceMark
  | DiscoveredTypeInfo;

// JavaScript 함수 발견 결과
export interface DiscoveredPageApi {
  id: string;
  kind: 'javascript-function';
  path: string;                    // "window.gridApi.getDisplayedRowCount"
  ownerPath: string;               // "window.gridApi"
  name: string;                    // "getDisplayedRowCount"
  arity: number;
  async: boolean;
  source: 'window' | 'selected-element';
  depth: number;
  confidence: 'low' | 'medium' | 'high';
  verified: boolean;
  metadata?: FunctionMetadata;
}

// REST API 발견 결과
export interface DiscoveredRestApi {
  id: string;
  kind: 'rest-api';
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  urlPattern: string;
  urlTemplate?: string;
  requestHeaders?: Record<string, string>;
  requestBodySchema?: unknown;
  queryParams?: string[];
  pathParams?: string[];
  responseType?: 'json' | 'text' | 'blob' | 'arraybuffer';
  responseSchema?: unknown;
  source: 'inline-script' | 'external-script' | 'module-script';
  scriptUrl?: string;
  lineNumber?: number;
  columnNumber?: number;
  surroundingCode?: string;
  clientLibrary: 'fetch' | 'axios' | 'xhr' | 'jquery' | 'graphql' | 'unknown';
  confidence: 'low' | 'medium' | 'high';
  requiresAuth: boolean;
  corsLikely: boolean;
  verified: boolean;
}

// WebSocket / SSE 발견 결과
export interface DiscoveredWebSocket {
  id: string;
  kind: 'websocket' | 'sse';
  url: string;
  protocol?: string;
  library?: 'socket.io' | 'signalr' | 'sockjs' | 'native' | 'unknown';
  messageFormat?: 'json' | 'protobuf' | 'text' | 'binary';
  eventHandlers?: string[];
  reconnectionLogic?: boolean;
  authentication?: 'cookie' | 'token' | 'query-param' | 'unknown';
  confidence: 'low' | 'medium' | 'high';
  verified: boolean;
}

// 이벤트 리스너 발견 결과
export interface DiscoveredEvent {
  id: string;
  kind: 'custom-event' | 'message-event' | 'event-bus';
  eventName: string;
  target: 'window' | 'document' | 'element' | 'event-bus';
  elementSelector?: string;
  payloadSchema?: unknown;
  direction: 'listen' | 'dispatch' | 'both';
  source: 'static-analysis' | 'runtime-observation';
  confidence: 'low' | 'medium' | 'high';
  verified: boolean;
}

// Storage 패턴 발견 결과
export interface DiscoveredStorage {
  id: string;
  kind: 'localStorage' | 'sessionStorage' | 'indexedDB' | 'cookie';
  keyPattern: string;
  keyExamples?: string[];
  valueSchema?: unknown;
  estimatedSize?: number;
  accessPattern: 'read' | 'write' | 'readwrite';
  ttl?: number;
  encryption?: boolean;
  confidence: 'low' | 'medium' | 'high';
  verified: boolean;
}

// Custom Element 발견 결과
export interface DiscoveredCustomElement {
  id: string;
  kind: 'custom-element';
  tagName: string;
  methods: Array<{
    name: string;
    arity: number;
    async: boolean;
  }>;
  properties: Array<{
    name: string;
    readable: boolean;
    writable: boolean;
    type?: string;
  }>;
  events: Array<{
    name: string;
    detailSchema?: unknown;
  }>;
  slots: string[];
  cssParts: string[];
  formAssociated: boolean;
  shadowRootMode: 'open' | 'closed' | 'none';
  confidence: 'low' | 'medium' | 'high';
  verified: boolean;
}

// Feature Flag / Config 발견 결과
export interface DiscoveredFeatureFlag {
  id: string;
  kind: 'feature-flag' | 'config';
  key: string;
  type: 'boolean' | 'string' | 'number' | 'json' | 'unknown';
  currentValue: unknown;
  possibleValues?: unknown[];
  source: 'local-object' | 'remote-config' | 'url-param' | 'cookie';
  targetingRules?: string;
  lastUpdated?: string;
  confidence: 'low' | 'medium' | 'high';
  verified: boolean;
}

// Analytics 이벤트 발견 결과
export interface DiscoveredAnalyticsEvent {
  id: string;
  kind: 'analytics-event';
  eventName: string;
  provider: 'ga4' | 'mixpanel' | 'amplitude' | 'segment' | 'custom' | 'unknown';
  properties: Array<{
    name: string;
    type: string;
    required: boolean;
    exampleValues?: unknown[];
  }>;
  triggerLocation?: string;
  businessContext?: string;
  confidence: 'low' | 'medium' | 'high';
  verified: boolean;
}

// Performance Mark/Measure 발견 결과
export interface DiscoveredPerformanceMark {
  id: string;
  kind: 'performance-mark' | 'performance-measure' | 'web-vital';
  name: string;
  type: 'mark' | 'measure' | 'vital';
  startMark?: string;
  endMark?: string;
  duration?: number;
  metadata?: Record<string, unknown>;
  businessMeaning?: string;
  confidence: 'low' | 'medium' | 'high';
  verified: boolean;
}

// TypeScript 타입 정보 발견 결과
export interface DiscoveredTypeInfo {
  id: string;
  kind: 'typescript-type';
  symbolName: string;
  type: 'interface' | 'type' | 'function';
  definition: string;
  sourceFile: string;
  lineNumber: number;
  componentProps?: Array<{
    name: string;
    type: string;
    required: boolean;
    description?: string;
  }>;
  confidence: 'low' | 'medium' | 'high';
  verified: boolean;
}

export interface FunctionMetadata {
  constructorName: string | null;
  isNative: boolean;
  enumerable: boolean;
  configurable: boolean;
}

export interface DiscoveryConfig {
  maxDepth: number;
  maxPropertiesPerObject: number;
  maxDiscoveredApis: number;
  timeBudgetMs: number;
  enableRestApiDiscovery: boolean;
  maxScriptSizeBytes: number;
  // 추가 Discovery 활성화 플래그
  enableWebSocketDiscovery?: boolean;
  enableEventListenerDiscovery?: boolean;
  enableStorageDiscovery?: boolean;
  enableCustomElementDiscovery?: boolean;
  enableFeatureFlagDiscovery?: boolean;
  enableAnalyticsDiscovery?: boolean;
  enablePerformanceDiscovery?: boolean;
  enableSourceMapDiscovery?: boolean;
}

export interface DiscoveryResult {
  candidates: DiscoveredApiCandidate[];
  counts: {
    javascriptFunction: number;
    restApi: number;
    websocket: number;
    event: number;
    storage: number;
    customElement: number;
    featureFlag: number;
    analyticsEvent: number;
    performanceMark: number;
    typeInfo: number;
  };
  truncated: boolean;
  durationMs: number;
  fingerprint: string;
  scriptsAnalyzed: number;
}
```

## 25. Service API (Extension 내부)

```typescript
interface PageApiDiscoveryService {
  discoverWindowApis(tabId: number): Promise<DiscoveryResult>;
  discoverElementApis(tabId: number, selector: string): Promise<DiscoveryResult>;
  discoverRestApis(tabId: number): Promise<DiscoveryResult>;
  discoverWebSockets(tabId: number): Promise<DiscoveryResult>;
  discoverEventListeners(tabId: number): Promise<DiscoveryResult>;
  discoverStoragePatterns(tabId: number): Promise<DiscoveryResult>;
  discoverCustomElements(tabId: number): Promise<DiscoveryResult>;
  discoverFeatureFlags(tabId: number): Promise<DiscoveryResult>;
  discoverAnalyticsEvents(tabId: number): Promise<DiscoveryResult>;
  discoverPerformanceMarks(tabId: number): Promise<DiscoveryResult>;
  discoverTypeInfo(tabId: number): Promise<DiscoveryResult>;
  discoverAllApis(tabId: number, selector?: string): Promise<DiscoveryResult>;
  getCachedDiscovery(cacheKey: string): DiscoveryResult | null;
  setDiscoveryCache(cacheKey: string, result: DiscoveryResult): void;
  computePageFingerprint(tabId: number): Promise<string>;
}
```

## 26. 개발 단계

### Phase 1 - Window Scan MVP
- window global scan (depth 2)
- function metadata 수집
- built-in 필터링, scoring
- Profile Builder 목록 표시
- 수동 API 등록 흐름

### Phase 2 - Element Discovery
- Element Picker 연계
- selected DOM element properties scan
- attached JS object 발견
- Grid/Chart API 발견 특화

### Phase 3 - REST API Discovery
- Script source 수집 (MAIN world)
- 정적 분석 엔진 (fetch/axios/XHR 패턴)
- URL 템플릿/파라미터 추출
- 인증/헤더/CORS 추론
- REST API Test 및 직접 호출 (Service Worker/Offscreen)
- Profile Builder에 REST API 섹션 추가

### Phase 4 - Extended Discovery Sources (병렬 진행 가능)
- WebSocket/SSE Discovery (Offscreen Document 연계)
- Event Listener Discovery (dispatchEvent 연계)
- Storage Pattern Discovery (직접 읽기/쓰기)
- Custom Element / Shadow DOM Discovery
- Feature Flag / Config Discovery
- Analytics / Tracing Call Discovery
- Performance Marks/Measures Discovery
- Source Map / TypeScript Type Discovery (개발/스테이징 전용)

### Phase 5 - LLM Assisted Profiling
- API semantic 분류 제안
- Argument 설명 생성
- Read/Action 예측
- Page Profile 초안 생성
- 유사 API grouping

### Phase 6 - Change Detection (doc 27 Phase 4 연계)
- API availability check
- Profile drift detection
- 대체 API 제안
- Impact 분석

### Phase 7 - Framework Adapter (doc 27 Phase 5 연계)
- AG Grid Adapter
- Highcharts/ECharts/Plotly Adapter
- React/Angular/Vue Adapter
- Generic Discovery를 기본으로, 프레임워크별 처리는 Adapter로 분리

## 27. 테스트 전략

### Unit Test 대상
```
method resolver (doc 27 공유)
path parser
candidate filter (built-in, scoring)
result normalizer (doc 27 공유)
recursive scanner (depth, circular, limits)
timeout enforcement
rest-api pattern matcher (신규)
url template binder (신규)
parameter extractor (신규)
cors/origin assessor (신규)
websocket pattern matcher (신규)
event listener pattern matcher (신규)
storage pattern matcher (신규)
custom element scanner (신규)
feature flag extractor (신규)
analytics event extractor (신규)
performance mark extractor (신규)
source map parser (신규, 선택적)
```

### Integration Test
테스트 페이지 예:
```html
<script>
window.testApp = {
  getValue() { return 10; },
  async getAsyncValue() { return { value: 20 }; },
  nested: {
    getRows() { return [{ id: 1 }, { id: 2 }]; }
  }
};

// REST API 호출 패턴들
function fetchEquipments() {
  return fetch('/api/equipments?status=active').then(r => r.json());
}

function fetchEquipment(id) {
  return axios.get(`/api/equipments/${id}`);
}

function executeAction(equipId, action) {
  return fetch(`/api/equipments/${equipId}/action`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action }),
    credentials: 'include'
  });
}

// GraphQL 예시
function fetchChartData(seriesId) {
  return fetch('/graphql', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: `query { seriesData(id: "${seriesId}") { points } }`
    })
  });
}

// element attached object
document.getElementById('grid').gridApi = {
  getDisplayedRowCount() { return 100; }
};
</script>
<div id="grid"></div>
```

검증:
```
[JavaScript Functions]
window.testApp.getValue 발견 (confidence: medium)
window.testApp.getAsyncValue 발견 (async: true)
window.testApp.nested.getRows 발견 (depth: 2)
element.gridApi.getDisplayedRowCount 발견 (source: selected-element)

[REST APIs]
GET /api/equipments?status=active 발견 (client: fetch, auth: true, cors: true)
GET /api/equipments/{id} 발견 (client: axios, pathParam: id)
POST /api/equipments/{equipId}/action 발견 (client: fetch, body: {action})
POST /graphql 발견 (client: fetch, graphql: true)

[WebSocket/SSE]
wss://api.example.com/stream 발견 (library: socket.io, messageFormat: json)
/sse/events 발견 (kind: sse, reconnectionLogic: true)

[Event Listeners]
equipment-status-changed 발견 (target: window, direction: listen)
postMessage: equipment-action-result 발견 (target: window, direction: listen)

[Storage Patterns]
localStorage: user.preferences.* 발견 (accessPattern: readwrite, valueSchema: object)
indexedDB: equipment-cache 발견 (objectStore: equipments, indexes: id,status)

[Custom Elements]
<my-grid> 발견 (methods: refresh, selectRow, properties: dataSource, events: row-click)

[Feature Flags]
flags.newDashboardUI 발견 (type: boolean, currentValue: true, source: local-object)

[Analytics Events]
equipment_viewed 발견 (provider: ga4, properties: equipId, viewType)

[Performance Marks]
api-fetch-duration 발견 (type: measure, startMark: api-start, endMark: api-end)
```

### E2E Test (Chrome + Playwright)
```
1. Test Page Open
2. Extension Load
3. Profile Builder Open
4. Window Scan 실행
5. Element Select → Element Scan 실행
6. REST API Scan 실행
7. API Candidate 표시 확인 (JS 함수 + REST API)
8. JS Function Test 실행 → Result preview 확인
9. REST API Test 실행 → Result preview 확인 (Extension 직접 호출)
10. Add to Profile → Profile 저장 확인 (kind 구분 저장)
11. Profile 재로드 후 Invoke 테스트 (JS 함수 + REST API 각각)
```

## 28. 주요 제한사항 (doc 27과 동일)

- ES Module Private Scope: `window`에 노출되지 않으면 접근 불가
- Closure: 외부 참조 없으면 탐색 불가
- Framework Private State: React Fiber, Angular injector, Vue internals는 표준 공개 API 아님. 기본 Discovery에서 강제 접근 안 함. 필요 시 별도 Adapter 설계

### REST API Discovery 추가 제한사항

- **External Script 분석 제한**: CORS 정책상 외부 스크립트(`<script src="...">`) 내용은 직접 읽기 어려움. 인라인 스크립트, 소스맵 공개된 경우만 분석 가능
- **난독화/번들 코드**: Webpack/Rollup 등으로 번들링/난독화된 코드에서 URL 패턴 추출 정확도 저하
- **동적 URL 구성**: 런타임에 결정되는 URL(변수 조합, 조건문, 함수 호출 결과)은 정적 분석으로 완전 추출 불가
- **CORS 차단**: Extension의 `host_permissions`에 API origin 미포함 시 호출 차단. Offscreen Document로 우회 가능하나 복잡도 증가
- **인증 토큰 관리**: 페이지가 독자적 토큰 관리(헤더 직접 설정, 쿠키 아닌 로컬스토리지 토큰 등) 시 Extension에서 자동 전달 어려움
- **GraphQL/타입 안전성**: GraphQL 쿼리는 정적 분석으로 스키마 추출 어려움. 쿼리 문자열만 저장하여 동일하게 재전송하는 방식 권장
- **WebSocket/SSE**: HTTP 기반 REST만 지원. WebSocket, Server-Sent Events는 별도 설계 필요

### 추가 Discovery 소스별 제한사항

- **WebSocket/SSE**: 연결 유지 위해 Offscreen Document 필수. 페이지 기존 연결과 충돌 가능. 메시지 포맷 역직렬화 필요.
- **Event Listeners**: `getEventListeners()` 비표준(DevTools 전용). 정적 분석만 가능. 동적 등록 리스너 탐지 불가.
- **Storage**: IndexedDB 스키마 추출 복잡. 암호화된 값 판별 불가. 쿠키 HttpOnly 플래그 시 읽기 불가.
- **Custom Elements**: Closed Shadow DOM 접근 불가. 폐쇄형 컴포넌트 메서드/프로퍼티 은닉.
- **Feature Flags**: 원격 설정 서비스(LaunchDarkly 등) SDK 내부 상태 접근 불가. 타게팅 규칙 역공학 어려움.
- **Analytics**: 이벤트 속성 스키마 정적 추출 한계. 동적 속성(사용자 ID 등) 고정 불가.
- **Performance**: 비표준 마크 명명 관례 다양. 비즈니스 의미 매핑은 LLM/수동 필요.
- **Source Map/Types**: 프로덕션 빌드에서 대부분 제거. 개발/스테이징 전용. 타입 정보 불완전할 수 있음.

## 29. 권장 페이지 협력 API

페이지 개발자가 EWAP 연계를 위해 노출하면 좋은 패턴:

```javascript
// Read-only data access (JavaScript 함수)
window.appData = {
  getEquipmentList: () => [...],
  getEquipmentInfo: (id) => ({ ... }),
  getCurrentSelection: () => ({ ... })
};

// Grid/Chart 표준 인터페이스 (JavaScript 함수)
window.gridApi = {
  getDisplayedRowCount: () => number,
  getDisplayedRowAtIndex: (index) => RowData,
  getSelectedRows: () => RowData[],
  forEachNode: (callback) => void
};

window.chartManager = {
  getSeriesData: (seriesId) => SeriesData,
  getAllSeries: () => SeriesData[]
};

// Versioning for change detection
window.EWAP_API_VERSION = '1.2.0';
```

### REST API 협력 패턴 (Discovery 정확도 향상)

페이지에서 REST API를 호출할 때 다음 패턴을 따르면 Discovery 정확도 향상:

```javascript
// 1. 상수/변수로 URL 분리 (정적 분석 용이)
const API_BASE = '/api/v1';
const ENDPOINTS = {
  equipments: () => `${API_BASE}/equipments`,
  equipment: (id) => `${API_BASE}/equipments/${id}`,
  equipmentAction: (id) => `${API_BASE}/equipments/${id}/action`,
};

// 2. 일관된 fetch 래퍼 사용 (패턴 매칭 용이)
async function apiGet(url, params = {}) {
  const query = new URLSearchParams(params).toString();
  return fetch(`${url}?${query}`, { credentials: 'include' }).then(r => r.json());
}

async function apiPost(url, body) {
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    credentials: 'include'
  }).then(r => r.json());
}

// 3. 사용 예 - 템플릿 리터럴로 파라미터 명확화
function getEquipments(status) {
  return apiGet(ENDPOINTS.equipments(), { status });
}

function getEquipment(id) {
  return apiGet(ENDPOINTS.equipment(id));
}

function executeAction(id, action) {
  return apiPost(ENDPOINTS.equipmentAction(id), { action });
}

// 4. GraphQL은 쿼리 문자열을 상수로 분리
const GRAPHQL_QUERIES = {
  seriesData: `query SeriesData($id: ID!) { seriesData(id: $id) { points } }`
};

function fetchSeriesData(id) {
  return fetch('/graphql', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: GRAPHQL_QUERIES.seriesData,
      variables: { id }
    })
  }).then(r => r.json());
}
```

이 패턴들을 따르면 Discovery 정확도와 호환성이 크게 향상됨.

---

## 30. 근거

- [Chrome scripting API](https://developer.chrome.com/docs/extensions/reference/api/scripting): MAIN execution world, documentIds 대상 지정
- [Chrome content scripts](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts): isolated world와 MAIN 환경 차이
- [Object.getOwnPropertyDescriptor](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/getOwnPropertyDescriptor): getter 실행 방지
- [WeakSet](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/WeakSet): 객체 중복 방지, 메모리 누수 없음
- [Chrome Offscreen Documents](https://developer.chrome.com/docs/extensions/reference/api/offscreen): CORS 우회 및 백그라운드 HTTP 요청
- [Fetch API](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API): Extension에서 직접 HTTP 호출
- [Content Security Policy](https://developer.mozilla.org/en-US/docs/Web/HTTP/CSP): 스크립트 소스 접근 제약 이해

본 문서는 Discovery 기능만 정의하며, 실제 실행(Invocation)은 [doc 27](27-page-api-execution-design.md)의 bundled adapter 방식(JS 함수) 또는 Extension 직접 HTTP 호출(REST API)을 따른다. Discovery 결과는 Adapter 개발 시 참고 자료로만 사용된다.