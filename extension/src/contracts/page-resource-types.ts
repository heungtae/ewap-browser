export type PageResourceMetadata = {
  resource_id: string;
  revision: string;
  kind: "page_description" | "inline_script" | "external_script";
  byte_length: number | null;
  readable: boolean;
};
export type PageResourceInventory = {
  document_epoch: string;
  revision: string;
  items: PageResourceMetadata[];
  total_count: number;
  truncated: boolean;
};
