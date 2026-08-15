# 05. Windows 배포 및 운영

## 1. 배포 모델

기본 모델은 **사내 포털에서 사용자가 설치를 시작하고, 회사 관리 Chrome 정책이 확장·Native Host·읽기 전용 구성을 적용하는 방식**이다. Chrome Web Store는 필수 조건이 아니다. 관리 Chrome에서는 자체 호스팅 확장을 enterprise installation policy로 설치할 수 있다.

포털의 설치 버튼은 서명된 회사 bootstrapper/MSI 또는 조직의 endpoint-management 작업을 시작한다. 설치 과정은 다음을 원자적으로 완료해야 한다.

1. 회사 Chrome 관리/enrollment와 extension installation policy 확인
2. 서명된 extension package 및 HTTPS update manifest 등록
3. Company Agent Host 설치, host manifest 등록, Windows ACL 적용
4. localhost-only `codex-chat-bridge` 서비스/프로세스 설치와 read-only 설정 배치
5. Managed Storage policy와 extension ID를 적용
6. health check 후 Side Panel에서 설치 상태를 표시

사용자가 관리자 권한이나 관리 Chrome 조건을 만족하지 않으면 포털은 설치하지 않고 IT 안내를 제공한다.

## 2. 설치 정책 선택

| 정책 | 사용 시점 | 사용자 제거/중지 |
|---|---|---|
| `normal_installed` | 포털에서 사용자가 설치를 선택하고 비활성화 권한을 허용할 때 | 가능 |
| `force_installed` | 보안·운영상 항상 실행되어야 하는 회사 지정 사용자군 | 불가 |

초기 파일럿은 `normal_installed`를 권장한다. 단, Managed Storage와 Native Host 정책은 어떤 설치 모드에서도 IT가 관리한다. unmanaged Chrome의 로컬 설정 파일 또는 unpacked extension은 지원하지 않는다.

## 3. 구성 소유권

| 구성 | 소유자 | 사용자 변경 | 비고 |
|---|---|---|---|
| 확장 ID/version/update URL | Endpoint/Chrome 운영 | 불가 | HTTPS, 서명 검증 |
| origin allowlist, 도구, risk 정책 | 보안 운영 | 불가 | Managed Storage |
| bridge URL/wire/model/static headers | AI Hub 운영 | 불가 | Native Host/bridge ACL 보호 |
| SSO broker/AI Hub certificate | IAM/AI Hub 운영 | 불가 | rotation과 rollback 필요 |
| Ask/Act 현재 선택, 확인 응답 | 최종 사용자 | 가능 | 정책 범위 안에서만 |
| 비민감 UI preference | 최종 사용자 | 가능 | 보안 판단에 사용 금지 |

## 4. 업데이트와 롤백

- 패키지는 고정 extension ID를 유지하고 자체 HTTPS update manifest에서만 업데이트한다.
- staged ring(개발 → 보안 파일럿 → 제한된 조직 → 전체)과 최소 지원 Chrome version을 둔다.
- extension, Native Host, bridge config는 호환성 매트릭스로 묶어 배포한다.
- emergency rollback은 이전 서명 버전 또는 policy disable로 가능해야 한다.
- config version을 증가시킬 때는 새 schema를 이해하지 못하는 확장이 fail closed 한다.
- 매 릴리스에서 extension package hash, native host hash, policy JSON hash, manifest permission snapshot을 보관한다.

## 5. 운영 상태와 지원

Side Panel은 endpoint 또는 header 값을 표시하지 않고 다음 상태 코드만 보여 준다: `INSTALLED`, `POLICY_MISSING`, `NATIVE_HOST_MISSING`, `BRIDGE_UNREACHABLE`, `SSO_UNAVAILABLE`, `AI_HUB_DENIED`, `PROFILE_UNAVAILABLE`, `STOPPED`.

지원 수집물은 extension version, deployment ID, run ID, timestamp, reason code, redacted audit event ID로 제한한다. 원문 page text, action argument, model prompt/completion, credential, header 값은 티켓에 자동 첨부하지 않는다.
