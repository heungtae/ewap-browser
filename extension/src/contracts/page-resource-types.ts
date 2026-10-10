export type PageResourceMetadata = {
  resource_id: string;
  revision: string;
  kind: "page_description" | "inline_script" | "external_script" | "component";
  observed_hint?: string;
  byte_length: number | null;
  readable: boolean;
};
export type PageResourceInventory = {
  document_epoch: string;
  revision: string;
  items: PageResourceMetadata[];
  total_count: number;
  truncated: boolean;
  source_truncated?: boolean;
  source_total_count?: number;
};
