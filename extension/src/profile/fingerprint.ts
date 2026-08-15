import type { Role, SemanticSnapshot } from "../contracts/types.js";
import { canonicalJson, sha256 } from "../security/canonical.js";
import { fail } from "../security/validation.js";
export type LabelCategory =
  | "approve"
  | "cancel"
  | "close"
  | "continue"
  | "create"
  | "delete"
  | "edit"
  | "filter"
  | "navigate"
  | "reject"
  | "save"
  | "search"
  | "select"
  | "submit"
  | "toggle"
  | "other"
  | "none";
type FingerprintNode = {
  label_category: LabelCategory;
  label_ordinal: number | null;
  ordinal: number;
  parent_ordinal: number | null;
  role: Role;
  state_capabilities: {
    checkable: boolean;
    expandable: boolean;
    required: boolean;
    selectable: boolean;
  };
};
export type FingerprintInput = {
  alg: "semantic-projection-fp-v1";
  nodes: FingerprintNode[];
  origin_class: "allowlisted-enterprise-origin";
};
const aliases: Record<Exclude<LabelCategory, "other" | "none">, string[]> = {
  approve: ["approve", "승인"],
  cancel: ["cancel", "취소"],
  close: ["close", "닫기"],
  continue: ["continue", "next", "계속", "다음"],
  create: ["add", "create", "new", "생성", "새로 만들기", "추가"],
  delete: ["delete", "remove", "삭제", "제거"],
  edit: ["edit", "수정", "편집"],
  filter: ["filter", "필터"],
  navigate: ["back", "home", "menu", "previous", "뒤로", "메뉴", "이전", "홈"],
  reject: ["deny", "reject", "거부", "반려"],
  save: ["save", "save changes", "변경 사항 저장", "저장"],
  search: ["find", "search", "검색", "찾기"],
  select: ["choose", "select", "선택"],
  submit: ["apply", "send", "submit", "신청", "적용", "전송", "제출"],
  toggle: ["collapse", "expand", "toggle", "접기", "펼치기"],
};
export const labelCategory = (name: string): LabelCategory => {
  const normalized = name
    .normalize("NFKC")
    .replace(/[\t-\r\u00a0]/g, " ")
    .replace(/ +/g, " ")
    .trim()
    .replace(/[A-Z]/g, (c) => c.toLowerCase())
    .replace(/[.!?:;…]+$/g, "")
    .trim();
  if (!normalized) return "none";
  return (
    (Object.keys(aliases) as Array<keyof typeof aliases>).find((key) =>
      aliases[key].includes(normalized),
    ) ?? "other"
  );
};
export const fingerprintInput = (
  snapshot: SemanticSnapshot,
): FingerprintInput => {
  if (snapshot.frame_id !== 0 || snapshot.nodes.length > 500)
    fail("INVALID_ARGUMENT");
  const nodes = snapshot.nodes.filter((node) => node.visible);
  const ordinals = new Map(
    nodes.map((node, ordinal) => [node.ref_id, ordinal]),
  );
  return {
    alg: "semantic-projection-fp-v1",
    nodes: nodes.map((node, ordinal) => ({
      label_category: labelCategory(node.name),
      label_ordinal: node.label_ref_id
        ? (ordinals.get(node.label_ref_id) ?? null)
        : null,
      ordinal,
      parent_ordinal: node.parent_ref_id
        ? (ordinals.get(node.parent_ref_id) ?? null)
        : null,
      role: node.role,
      state_capabilities: {
        checkable: node.role === "checkbox" || node.role === "radio",
        expandable: typeof node.state.expanded === "boolean",
        required: node.state.required === true,
        selectable: node.role === "option" || node.role === "tab",
      },
    })),
    origin_class: "allowlisted-enterprise-origin",
  };
};
export const semanticFingerprint = (
  snapshot: SemanticSnapshot,
): { canonical: string; fingerprint: string } => {
  const canonical = canonicalJson(fingerprintInput(snapshot));
  return { canonical, fingerprint: sha256(canonical) };
};
