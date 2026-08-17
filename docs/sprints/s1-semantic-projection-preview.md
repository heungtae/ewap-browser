# S1 — Semantic Projection과 Ask

content script의 document registration, semantic projection, stale ref 폐기, `model_ref` 변환과 Ask Side Panel을 구현한다. S1 projection에는 CDP node/selector/coordinate/debugger state를 추가하지 않으며 CDP attach를 수행하지 않는다.

완료 조건: 실제 Chrome에서 labelled control, navigation, dynamic replacement, worker restart와 Ask request를 검증한다.
