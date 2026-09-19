export type DataAdapterResultSchema = {
  records: readonly {
    index: number;
    cells: readonly string[];
    row_id?: string;
    aria_row_index?: number;
    aria_pos_in_set?: number;
    aria_set_size?: number;
  }[];
  cursor?: string;
  has_more: boolean;
  total?: number;
  eof: boolean;
};

export interface DataAdapter {
  readonly adapter_id: string;
  readonly version: number;
  readonly origins: readonly string[];
  matchesDescriptor(descriptor: {
    object_kind: string;
    container_xpath: string;
    aria_attributes: Readonly<Record<string, string>>;
    roles: readonly string[];
  }): boolean;
  readWindow(
    descriptor: {
      collection_ref: string;
      object_kind: string;
      container_xpath: string;
      container_rect: { x: number; y: number; width: number; height: number };
      estimated_total?: number;
      aria_attributes: Readonly<Record<string, string>>;
    },
    cursor?: string,
  ): Promise<{
    records: readonly {
      index: number;
      cells: readonly string[];
      row_id?: string;
      aria_row_index?: number;
      aria_pos_in_set?: number;
      aria_set_size?: number;
    }[];
    cursor?: string;
    has_more: boolean;
    total?: number;
    eof: boolean;
  }>;
  readonly resultSchema: DataAdapterResultSchema;
}

export class DataAdapterRegistry {
  private readonly adapters: DataAdapter[] = [];

  public register(adapter: DataAdapter): void {
    this.adapters.push(adapter);
  }

  public find(descriptor: {
    object_kind: string;
    container_xpath: string;
    aria_attributes: Readonly<Record<string, string>>;
    roles: readonly string[];
    origin: string;
  }): DataAdapter | undefined {
    const origin = new URL(descriptor.origin).origin;
    return this.adapters.find(
      (adapter) =>
        adapter.origins.some((o) => new URL(o).origin === origin) &&
        adapter.matchesDescriptor(descriptor),
    );
  }
}

export const dataAdapterRegistry = new DataAdapterRegistry();
