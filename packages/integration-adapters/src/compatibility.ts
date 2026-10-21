export const protocols = {
  profile: "company-page-profile+jws",
  workflow: "browser-workflow/v1",
  business: "browser-business-mcp-legacy/v1",
  pdp: "browser-enterprise-policy/v1",
  audit: "browser-audit/v1",
  studio: "browser-studio-validation/v1",
} as const;
export type Consumer = keyof typeof protocols;
export class IntegrationAdapters {
  constructor(
    private ports: Partial<
      Record<Consumer, (original: unknown) => Promise<unknown>>
    >,
  ) {}
  inventory() {
    return Object.entries(protocols).map(([consumer, protocol]) => ({
      consumer,
      protocol,
      available: typeof this.ports[consumer as Consumer] === "function",
      platformConformance: "UNVERIFIED" as const,
    }));
  }
  async invoke(consumer: Consumer, protocol: string, original: unknown) {
    if (!Object.hasOwn(protocols, consumer) || protocols[consumer] !== protocol)
      throw new Error("INTEGRATION_PROTOCOL_INCOMPATIBLE");
    const port = this.ports[consumer];
    if (!port) throw new Error("INTEGRATION_ADAPTER_UNAVAILABLE");
    // Keep original validation, signatures, replay and envelopes in the named adapter.
    return { protocol, original: await port(structuredClone(original)) };
  }
}
