export const pageSnapshotParts = [
  "document",
  "nodes",
  "workflow",
  "visible_text",
  "article_text",
] as const;
export type PageSnapshotPart = (typeof pageSnapshotParts)[number];
export const pageSnapshotPartLabels: Record<PageSnapshotPart, string> = {
  document: "페이지 문서 정보를 수집하는 중입니다.",
  nodes: "페이지 요소와 상태를 수집하는 중입니다.",
  workflow: "페이지 Workflow 선언을 수집하는 중입니다.",
  visible_text: "페이지 본문 텍스트를 수집하는 중입니다.",
  article_text: "페이지 기사 텍스트를 수집하는 중입니다.",
};
