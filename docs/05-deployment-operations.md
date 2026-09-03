# 05. 배포 및 운영

## Enterprise Web AI Platform 정렬 (2026-08-31)

배포 모델을 Community와 Enterprise로 분리한다.

  -------------------------------------------------------------------------------
  영역                    Community / Local       Enterprise
  ----------------------- ----------------------- -------------------------------
  Extension               사용자 설치/업데이트    Managed Chrome
                                                  force-install/update/rollback

  Identity                Chrome/local user       Enterprise SSO +
                          context                 organization/user/role/device

  Profile                 local/sample profile    central Profile Registry +
                                                  signed immutable release

  MCP                     local/direct registered MCP Registry/Gateway +
                          endpoint                auth/trust/environment binding

  Policy                  local capability×host   PDP/RBAC/approval + local hard
                                                  guard

  Audit                   redacted local audit    central enterprise audit +
                                                  local redaction boundary

  Deployment              workstation             on-prem/air-gapped 포함
  -------------------------------------------------------------------------------

Production profile은 signature 검증 실패/키 revoke/정책 불일치 시
활성화하지 않는다. Enterprise write path에서 PDP 또는 required trust
dependency가 unavailable이면 fail-closed한다.

## 1. 지원 환경

Browser Runtime은 Windows/Linux Chrome MV3 확장으로 배포한다.
Community에서는 사용자가 직접 설치·업데이트할 수 있고, Enterprise에서는
Managed Chrome force-install/update/rollback, managed configuration,
SSO/RBAC/Policy/Profile/MCP/Audit Control Plane을 지원한다.

## 2. 배포 구성

  ------------------------------------------------------------------------
  구성                     소유자              저장·배포 위치
  ------------------------ ------------------- ---------------------------
  확장 설치와 업데이트     로컬 사용자         Chrome extension UI 또는
                                               서명 package

  bundled provider adapter extension release   extension package

  declarative provider     로컬 사용자         Settings에서 manifest 파일
  plugin                                       import

  provider URL/model/API   로컬 사용자         `chrome.storage.local`
  key/header                                   

  사이트 권한              로컬 사용자         Side Panel/Settings

  브라우저 로그인          로컬 사용자와 대상  현재 Chrome session
                           웹사이트            
  ------------------------------------------------------------------------

## 3. 설치와 업데이트

1.  Chrome에 서명된 확장을 설치한다. 설치 화면의 `debugger` 권한은
    bounded trusted-input adapter에만 사용하며 WebBrain 전체 CDP
    기능이나 임의 page script 실행을 제공하지 않는다.
2.  필요한 provider plugin을 선택하거나 선언형 manifest를 Settings에서
    설치한다.
3.  사용자는 provider instance에 endpoint, model, API key/header를
    입력한다.
4.  연결 시험을 실행하고 Side Panel에서 Ask를 시작한다.
5.  Act는 capability × host 권한 카드와 결과적 행동 확인을 거친다.

업데이트는 extension package, browser permission/CDP command allowlist
snapshot, provider plugin API와 settings schema version을 함께 관리한다.
bundled adapter는 extension과 함께 업데이트한다. 선언형 plugin은
사용자가 새 manifest를 명시적으로 import할 때만 갱신한다. provider
설정에 알 수 없는 field가 있거나 plugin major version이 호환되지 않으면
해당 provider를 비활성화하고 다시 저장하도록 요청한다. CDP allowlist
또는 manifest permission 증가는 일반 plugin update와 분리해 release
review와 사용자 재승인을 요구한다.

## 4. 운영 상태

Side Panel은 `READY`, `PROVIDER_PLUGIN_NOT_FOUND`,
`PROVIDER_PLUGIN_INCOMPATIBLE`, `PROVIDER_PLUGIN_FAILED`,
`PROVIDER_NOT_CONFIGURED`, `PROVIDER_AUTH_FAILED`,
`PROVIDER_UNAVAILABLE`, `PERMISSION_REQUIRED`, `CONFIRMATION_REQUIRED`,
`CDP_UNAVAILABLE`, `CDP_CONFLICT`, `CDP_COMMAND_NOT_ALLOWED`,
`CDP_CLEANUP_FAILED`, `STOPPED`, `UNKNOWN`을 표시한다.
`CDP_CLEANUP_FAILED` tab은 cleanup 또는 tab close가 확인될 때까지 다음
Act를 차단한다. 지원 수집물은 extension version, plugin ID/version,
provider label, host, execution stage, reason code, timestamp로 제한하며
API key·header 값·page content·prompt·selector·좌표·ref/node ID와 action
value는 포함하지 않는다.
