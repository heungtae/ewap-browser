export type MaskReport = {
  masked: boolean;
  fields: Array<{ path: string; reason: string; count: number }>;
  truncated: boolean;
};
