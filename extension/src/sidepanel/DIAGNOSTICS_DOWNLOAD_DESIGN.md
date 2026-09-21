# 진단 다운로드 기능 개선 설계서

## 개요

기존 "진단 JSON 다운로드" 기능을 "진단 다운로드"로 변경하고, Chrome 익스텐션 권한 내에서 허용되는 모든 진단 데이터를 수집하여 단일 파일로 다운로드하도록 개선한다.

## 현재 상태 분석

### 기존 구현 (diagnostics-view.ts:139-193)

- `#diagnostics-export` 버튼 클릭 시 현재 요청의 진단 기록만 JSON으로 내보냄
- 파일명: `contextpilot-trace-${id}.json`
- 포함 내용: schema_version, extension_version, request_id, panel_failure_code, panel_messages, storage_failed, records, dropped_count
- 크기 제한: 1MiB

### 수집 가능한 데이터 소스

1. **실행 진단 로그** (ExecutionDiagnostics)
   - `executionDiagnostics.list()`로 요청별 레코드 조회 가능
   - 전체 레코드 조회 시 request_id 없이 전체 반환 필요

2. **LLM 메모리/채팅 세션** (TabChatSessionStore)
   - `chatEvents.snapshot()`로 전체 세션 스냅샷 조회 가능
   - 탭별 스레드, 이벤트, 페이지 스코프 포함

3. **화면 로드 값** (Content Script)
   - `documentEpoch`, `pageScopeEpoch`, `observedPageUrl`
   - 워크플로우 선언, 스크립트 정보
   - 바운드된 요소 레퍼런스

4. **페이지 구조 메타데이터**
   - HTML/script 원문은 digest와 바이트 수로만 표현
   - URL·title·referrer는 형태/길이/존재 여부만 표현
   - Content Script에서 계산하되 원문은 Service Worker나 ZIP에 전달하지 않음

## 설계 방안

### 1. UI 변경

- 버튼 텍스트: "진단 다운로드" (index.html:817)
- 툴팁/상태 메시지 업데이트

### 2. 데이터 수집 아키텍처

#### Service Worker 측 (새로운 핸들러 추가)

```
DIAGNOSTICS_COLLECT_ALL 메시지 처리:
1. 실행 진단 전체 로그 수집 (ExecutionDiagnostics)
2. 채팅 세션 전체 스냅샷 수집 (TabChatSessionStore)
3. Content Script에 페이지 데이터 요청 전송
4. 응답 취합 후 패널로 반환
```

#### Content Script 측 (새로운 핸들러 추가)

```
CONTENT_DIAGNOSTICS_SUMMARY 메시지 처리:
1. HTML/script의 digest와 크기·종류별 수량 계산
2. URL의 query/fragment/path-segment 형태와 title 길이만 계산
3. 문서 구조·workflow 상태 코드만 수집
4. 원문·입력값·URL·script source 없이 응답 반환
```

### 3. 메시지 프로토콜

#### 패널 → Service Worker

```typescript
{
  schema_version: 1,
  kind: "DIAGNOSTICS_COLLECT_ALL",
  request_id?: string  // 특정 요청만 수집할 경우
}
```

#### Service Worker → Content Script

```typescript
{
  schema_version: 1,
  kind: "CONTENT_COLLECT_PAGE_DATA",
  tab_id: number
}
```

#### Service Worker → 패널 응답

```typescript
{
  schema_version: 1,
  kind: "DIAGNOSTICS_COLLECT_ALL_RESULT",
  data: {
    diagnostics: {
      records: DiagnosticRecord[],
      dropped_count: number,
      level: DiagnosticsLevel,
      storage_failed: boolean,
      worker_instance_id: string
    },
    chat_session: ChatSessionSnapshot,
    page_data: {
      html: string,
      scripts: Array<{src?: string, inline?: string}>,
      metadata: {
        url: string,
        title: string,
        referrer: string,
        document_epoch: string,
        page_scope_epoch: string
      },
      workflow: {
        declaration: unknown,
        scripts: Array<{src?: string, inline?: string}>,
        recorded_steps: RecordedWorkflowStep[]
      }
    },
    extension_version: string,
    collected_at: number
  }
}
```

### 4. 크기 관리 전략

- Chrome 익스텐션 다운로드 제한: 실질적 제한 없음 (blob URL 사용)
- 하지만 메모리/성능 고려하여 각 섹션별 크기 제한:
  - HTML: 최대 5MB (절단 후 안내)
  - 스크립트: 최대 2MB
  - 진단 로그: 기존 2000개 레코드 제한 유지
  - 채팅 세션: 기존 1MB 세션 제한 유지
- 전체 압축 시 10MB 이하 권장

### 5. 파일명 규칙

```
contextpilot-diagnostics-${timestamp}-${requestId || 'all'}.json
```

예: `contextpilot-diagnostics-20260920-143022-abc123.json`

### 6. 보안/프라이버시 고려사항

- ZIP에는 chat/action 원문, provider 비밀값·custom-header 값·endpoint URL, 페이지 HTML/script/URL/title/referrer를 포함하지 않는다.
- API key는 존재 여부만 기록하며, custom header는 개수만 기록한다.
- 페이지·대화의 민감값은 부분 마스킹 대신 원문 수집 경계에서 제외한다.
- 기업 환경: 관리 정책에 따라 수집 제한 가능성 고려

## 구현 계획

### Phase 1: Service Worker 핸들러 추가

- `runtime-core-handlers.ts` 또는 새 파일에 `DIAGNOSTICS_COLLECT_ALL` 핸들러 구현
- `executionDiagnostics` 전체 레코드 조회 메서드 추가
- `chatEvents.snapshot()` 호출
- Content Script 메시지 전송 및 응답 대기

### Phase 2: Content Script 핸들러 추가

- `entry.ts`에 `CONTENT_COLLECT_PAGE_DATA` 리스너 추가
- 페이지 데이터 수집 로직 구현
- 민감 정보 마스킹 처리

### Phase 3: 패널 UI 연동

- `diagnostics-view.ts`에서 새로운 메시지 호출
- 다운로드 로직 수정 (통합 데이터 사용)
- 버튼 텍스트 변경 (HTML)

### Phase 4: 테스트 및 검증

- 크기 제한 테스트
- 다양한 페이지에서 동작 확인
- 권한 경계 확인

## 변경 파일 목록

1. `extension/src/sidepanel/index.html` - 버튼 텍스트 변경
2. `extension/src/sidepanel/diagnostics-view.ts` - 다운로드 로직 수정
3. `extension/src/service-worker/runtime-core-handlers.ts` - 새 메시지 핸들러 추가
4. `extension/src/content/entry.ts` - 페이지 데이터 수집 핸들러 추가
5. `extension/src/contracts/diagnostic-types.ts` - 새 메시지 타입 정의 (필요시)

## 비고

- 기존 `DIAGNOSTICS_LIST` 메시지는 유지 (실시간 스트리밍용)
- 새 기능은 "전체 다운로드" 용도로만 사용
- 패널에서 요청 ID 없이 호출 시 전체 데이터 수집
