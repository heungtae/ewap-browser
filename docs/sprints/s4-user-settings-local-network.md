# S4 — Provider Plugin Settings와 Local Network

선언형 plugin import/enable/disable/remove, provider instance 선택과 version lifecycle, API key·정적 header의 password input/write-only 갱신, secret 없는 import/export, loopback 및 private-network opt-in, timeout·TLS·response validation과 diagnostics를 구현한다. Page Profile이 선언한 Business MCP binding은 HTTPS와 signed Profile 범위 안에서만 호출하고, endpoint·tool·result schema를 사용자나 모델이 임의 확장할 수 없게 한다. provider secret은 local Chrome profile의 `chrome.storage.local`에만 저장하며 제품 계정, Cloud Sync, plugin store, prompt, audit와 diagnostics로 복제하지 않는다. plugin disable/remove 때 연결된 provider를 비활성화하되 secret 자동 삭제 여부는 사용자가 결정한다. diagnostics는 product CDP의 `Network.*`, `Log.*`, screenshot과 page source를 활성화하지 않는다.

완료 조건: plugin lifecycle과 incompatible version 차단, localhost와 사설망 fixture 연결, 잘못된 manifest/URL/header/response schema 거부, Profile-bound MCP의 HTTPS·closed result 검증, redacted read model과 secret write 경로 분리, export·audit·diagnostics·prompt·plugin host에서 API key/header 값 제외, sync/token/account endpoint 부재를 검증한다. plugin 제거와 provider secret 삭제 선택을 분리하고 diagnostics가 bounded CDP allowlist를 확장하거나 CDP/page data를 저장하지 않음을 확인한다.

## 종료 재검증 행렬 (2026-09-25)

현재 31·33번의 Browser Settings/Ask/Act 경로에서 검증한다. 운영 회사
Provider/Business MCP, 제품 계정, Cloud Sync와 외부 출시는 범위가 아니다.

1. Settings는 API key·정적 header 값을 읽어 화면에 다시 채우지 않는다.
   secret 입력은 빈 password field이고 저장된 값의 존재만 표시한다. 같은
   plugin·endpoint·인증 방식에서 빈 입력은 core가 기존 값을 보존한다.
   endpoint 또는 인증 방식 변경 시 기존 secret을 다른 대상으로 이월하지
   않는다. Provider 목록·export·진단·plugin 저장소에는 값이 없다.
2. 선언형 plugin manifest는 `chrome.storage.local`의 secret 없는 별도
   key에 저장하고 worker 재시작 후 closed schema로 다시 읽는다. 설치,
   enable/disable, active provider 선택, 제거와 연결된 provider secret
   보존·삭제를 Settings와 실제 Chrome에서 검증한다. bundled adapter는
   제거하거나 runtime manifest로 덮어쓸 수 없다.
3. `http:`는 localhost/loopback과 사용자가 명시적으로 opt-in한 RFC1918
   IPv4 literal만 허용한다. 임의 DNS 이름·public IP·userinfo·query·fragment는
   거부한다. 실제 Chrome HTTP host permission은 Settings의 사용자
   gesture에서 해당 host pattern으로 요청하고, 전송 직전에도 재확인한다.
   Offscreen은 worker의 bounded request만 받아 redirect를 거부한다.
4. timeout·TLS/브라우저 네트워크 오류·response content-type/schema와
   stream Stop을 안전한 reason/status로 확인한다. Business MCP는 서명된
   Profile binding의 HTTPS endpoint/tool/result schema만 사용하고
   `credentials: omit`, redirect 거부, 짧은 deadline을 유지한다.
5. 진단·audit·prompt·plugin host에서 Provider secret과 page/CDP 원문이
   배제되는지 음성 검사한다. S2 mutation CDP allowlist를 변경하지 않는다.

Chrome fixture와 단위 검사의 관측·미검증 범위를 증거 문서에 구분해 남긴 뒤
`Completed`로 판정한다.

Headless Chrome의 권한 팝업에서 사람이 허용 버튼을 누르는 동작은 자동 종료
조건에서 제외한다. Settings의 사용자 클릭이 권한 요청을 시작하는지, 권한 전
전송이 차단되는지, 격리 Chrome profile에 대상 host permission을 부여한 뒤
loopback·사설망 요청이 실제 전송되는지를 각각 검증한다. 이 대체 검증의
범위와 미관측 팝업 동작은 S4 증거에 기록한다.
