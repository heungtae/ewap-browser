# S3 — Local OpenAI-compatible Provider

Settings provider UI, local storage, `chat_completions`/`responses`, API key header 세 방식, 정적 header, 연결 시험과 redacted 오류 처리를 구현한다.

완료 조건: local fixture가 정확한 header·body·취소 동작을 받고 secret이 UI/log에 남지 않음을 검증한다.
