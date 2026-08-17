# S3 — LLM Provider Plugin Foundation

closed manifest schema, provider plugin API/registry/host, 내장 `webbrain.openai-compatible` plugin, core HTTP transport, `chat_completions`/`responses`, 기존 API key header 세 방식, 정적 header와 redacted 오류 처리를 구현한다. runtime plugin은 선언형 JSON만 설치하며 executable adapter는 extension build에 포함한다.

완료 조건: manifest·version·migration negative test, plugin isolation, local fixture의 정확한 header/body/stream/cancel, secret 비노출과 plugin disable E2E를 검증한다. plugin manifest/adapter/response의 CDP method, selector, 좌표와 execution-path field는 거부하고 S2 browser authority를 확장하지 않음을 확인한다.
