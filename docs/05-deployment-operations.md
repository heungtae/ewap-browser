# 05. 배포 및 운영

## 1. 지원 환경

WebBrain은 Chrome MV3 확장으로 Windows와 Linux에서 배포한다. 조직은 관리 Chrome 정책으로 설치·업데이트할 수 있고, 사용자는 Chrome 확장 설치 방식으로 직접 설치할 수 있다.

## 2. 배포 구성

| 구성                              | 사용자 설정         | 관리 배포 설정                                        |
| --------------------------------- | ------------------- | ----------------------------------------------------- |
| 확장 설치와 업데이트 URL          | Chrome extension UI | Chrome enterprise policy 또는 endpoint manager        |
| provider URL/model/API key/header | Settings            | 조직이 사전 구성한 extension profile 또는 사용자 입력 |
| 사이트 권한                       | Side Panel/Settings | 초기 extension profile                                |
| 브라우저 로그인                   | 웹사이트 UI         | 해당 웹사이트의 기존 정책                             |

## 3. 설치와 업데이트

1. Chrome에 서명된 확장을 설치한다.
2. 사용자는 Settings에서 local OpenAI-compatible provider와 header를 설정하거나 제공된 profile을 가져온다.
3. 연결 시험을 실행하고 Side Panel에서 Ask를 시작한다.
4. Act는 capability × host 권한 카드와 결과적 행동 확인을 거친다.

업데이트는 extension package와 settings schema version을 함께 관리한다. provider 설정에 알 수 없는 field가 있으면 해당 provider를 비활성화하고 사용자에게 다시 저장하도록 요청한다.

## 4. 운영 상태

Side Panel은 `READY`, `PROVIDER_NOT_CONFIGURED`, `PROVIDER_AUTH_FAILED`, `PROVIDER_UNAVAILABLE`, `PERMISSION_REQUIRED`, `CONFIRMATION_REQUIRED`, `STOPPED`, `UNKNOWN`을 표시한다. 지원 수집물은 extension version, provider label, host, reason code, timestamp로 제한하며 API key·header 값·page content·prompt는 포함하지 않는다.
