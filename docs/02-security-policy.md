# 02. 보안 및 행동 정책

## 1. 신뢰 경계

| 입력                            | 처리                                                                                |
| ------------------------------- | ----------------------------------------------------------------------------------- |
| 웹 페이지와 content-script 결과 | 비신뢰 데이터로 schema·길이·형식을 검증하고 모델에 명시적으로 표시                  |
| LLM 텍스트와 tool call          | 비신뢰 제안으로 schema, 현재 run, capability gate를 다시 검증                       |
| 사용자 Settings                 | 사용자가 소유하는 provider·header·권한 설정                                         |
| `chrome.storage.local`          | 사용자 기기 저장소. provider key와 header는 암호화되지 않았다고 가정                |
| 현재 Chrome 로그인 세션         | 웹사이트가 직접 인증한 사용자 세션. 확장은 password·OTP를 읽거나 대신 입력하지 않음 |

## 2. 브라우저 권한과 사용자 승인

확장 manifest는 페이지 읽기와 automation에 필요한 browser permission을 선언한다. 런타임 행동은 manifest 권한만으로 실행하지 않고 capability × host gate를 통과한다.

| capability                       | 예                   |
| -------------------------------- | -------------------- |
| `navigate`                       | 이동, 새 탭          |
| `click`                          | click, submit, Enter |
| `type`                           | 일반 텍스트 입력     |
| `execute_js`                     | page script 실행     |
| `network_write`                  | fetch/research 요청  |
| `download`, `upload`, `schedule` | 파일·예약 작업       |

사용자는 각 `(capability, host)`에 대해 이번 작업 또는 항상 허용을 선택한다. 항상 허용은 `wb_permissions`에 저장하며 Settings에서 개별 또는 전체 철회할 수 있다. 사용자는 필요하면 결과적 행동 질문을 끌 수 있으나, 제출·결제·삭제·외부 공개와 API write는 항상 개별 확인을 요구한다.

## 3. 행동 등급

| 등급 | 예                                    | 처리                                                                        |
| ---- | ------------------------------------- | --------------------------------------------------------------------------- |
| R0   | 읽기, 요약, 요소 찾기                 | capability gate 없음                                                        |
| R1   | 입력, 선택, 일반 click                | capability × host 허용과 preflight                                          |
| R2   | 제출, 생성, 전송, 외부 상태 변경      | R1 + 현재 intent의 명시 확인 + 결과 확인                                    |
| R3   | 결제, 계약 확정, 계정/보안 설정, 삭제 | 기본 거부. 사용자의 명시 작업과 전용 확인 UI가 있을 때만 제한된 도구로 실행 |

## 4. 실행 규칙

1. 모델은 raw selector, arbitrary script, password, OTP, API key를 받거나 만들지 않는다.
2. `ref_id`와 `model_ref`는 현재 document/run에서만 유효하다.
3. password, passcode, token, secret, recovery code, MFA/OTP로 판정된 필드는 읽기·기록·자동 입력을 거부한다.
4. 같은 submit action의 반복 실행은 화면 상태를 다시 읽고 사용자가 재시도를 확인할 때만 허용한다.
5. 페이지가 제공한 WebMCP `readOnly` 표시는 권한 근거가 아니다. 호출마다 capability gate와 명시 확인을 적용한다.
6. 임의 host로의 fetch, explicit URL PDF 읽기, 다운로드는 목적 host에 대한 별도 권한을 요구한다.

## 5. 모델 및 provider 보안

- `base_url`은 사용자가 Settings에서 직접 설정한다. local LLM은 `http://localhost`, loopback 또는 사용자가 허용한 사설망 endpoint를 사용할 수 있다.
- API key와 정적 header는 모델 prompt, tool schema, audit, 오류 UI에 넣지 않는다.
- 요청 header는 API key header와 Settings header 목록으로만 만들며 모델과 웹 페이지가 header·endpoint·model을 변경할 수 없다.
- API key와 provider header를 export·sync·telemetry·page script에 전달하지 않는다.
