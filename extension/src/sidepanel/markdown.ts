export type InlineMarkdown =
  | { type: "text"; text: string }
  | { type: "strong"; text: string };

export type MarkdownBlock =
  | { type: "heading"; level: 1 | 2 | 3; content: InlineMarkdown[] }
  | { type: "paragraph"; lines: InlineMarkdown[][] }
  | { type: "list"; items: InlineMarkdown[][] };

const inlineMarkdown = (text: string): InlineMarkdown[] => {
  const segments: InlineMarkdown[] = [];
  const expression = /\*\*([^*]+)\*\*/g;
  let cursor = 0;
  for (const match of text.matchAll(expression)) {
    const index = match.index ?? 0;
    if (index > cursor)
      segments.push({ type: "text", text: text.slice(cursor, index) });
    segments.push({ type: "strong", text: match[1] ?? "" });
    cursor = index + match[0].length;
  }
  if (cursor < text.length || segments.length === 0)
    segments.push({ type: "text", text: text.slice(cursor) });
  return segments;
};

export const parseMarkdown = (source: string): MarkdownBlock[] => {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const blocks: MarkdownBlock[] = [];
  for (let index = 0; index < lines.length; ) {
    const line = lines[index] ?? "";
    if (!line.trim()) {
      index += 1;
      continue;
    }
    const heading = /^(#{1,3})\s+(.+)$/.exec(line);
    const headingMarks = heading?.[1];
    const headingText = heading?.[2];
    if (headingMarks && headingText !== undefined) {
      blocks.push({
        type: "heading",
        level: headingMarks.length as 1 | 2 | 3,
        content: inlineMarkdown(headingText),
      });
      index += 1;
      continue;
    }
    const item = /^\s*[-*+]\s+(.+)$/.exec(line);
    if (item?.[1] !== undefined) {
      const items: InlineMarkdown[][] = [];
      while (index < lines.length) {
        const next = /^\s*[-*+]\s+(.+)$/.exec(lines[index] ?? "");
        if (!next) break;
        items.push(inlineMarkdown(next[1] ?? ""));
        index += 1;
      }
      blocks.push({ type: "list", items });
      continue;
    }
    const paragraph: InlineMarkdown[][] = [];
    while (index < lines.length) {
      const next = lines[index] ?? "";
      if (
        !next.trim() ||
        /^(#{1,3})\s+/.test(next) ||
        /^\s*[-*+]\s+/.test(next)
      )
        break;
      paragraph.push(inlineMarkdown(next));
      index += 1;
    }
    blocks.push({ type: "paragraph", lines: paragraph });
  }
  return blocks;
};

const appendInline = (
  document: Document,
  parent: HTMLElement,
  content: InlineMarkdown[],
): void => {
  for (const segment of content) {
    if (segment.type === "strong") {
      const strong = document.createElement("strong");
      strong.textContent = segment.text;
      parent.append(strong);
    } else parent.append(document.createTextNode(segment.text));
  }
};

export const renderMarkdown = (element: HTMLElement, source: string): void => {
  const document = element.ownerDocument;
  const fragment = document.createDocumentFragment();
  for (const block of parseMarkdown(source)) {
    if (block.type === "heading") {
      const heading = document.createElement(`h${block.level}`);
      appendInline(document, heading, block.content);
      fragment.append(heading);
      continue;
    }
    if (block.type === "list") {
      const list = document.createElement("ul");
      for (const item of block.items) {
        const listItem = document.createElement("li");
        appendInline(document, listItem, item);
        list.append(listItem);
      }
      fragment.append(list);
      continue;
    }
    const paragraph = document.createElement("p");
    for (const [index, line] of block.lines.entries()) {
      if (index > 0) paragraph.append(document.createElement("br"));
      appendInline(document, paragraph, line);
    }
    fragment.append(paragraph);
  }
  element.replaceChildren(fragment);
};
