import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { helloSchema, type Hello } from "@contextpilot/shared/bridge";
export interface Pairing {
  installationId: string;
  profileId: string;
  extensionIds: string[];
  secret: string;
}
export function proof(
  pairing: Pairing,
  nonce: string,
  extensionId: string,
): string {
  return createHmac("sha256", pairing.secret)
    .update(
      JSON.stringify([
        1,
        0,
        pairing.installationId,
        pairing.profileId,
        extensionId,
        nonce,
      ]),
    )
    .digest("hex");
}
export class Handshake {
  readonly nonce = randomBytes(32).toString("hex");
  private used = false;
  constructor(
    private pairing: Pairing,
    private expiresAt: number,
  ) {}
  accept(input: unknown, now: number): Hello {
    if (this.used || now > this.expiresAt) throw new Error("AUTH_EXPIRED");
    this.used = true;
    const hello = helloSchema.parse(input);
    const p = this.pairing;
    if (
      hello.installationId !== p.installationId ||
      hello.profileId !== p.profileId ||
      !p.extensionIds.includes(hello.extensionId) ||
      hello.nonce !== this.nonce ||
      !timingSafeEqual(
        Buffer.from(hello.proof, "hex"),
        Buffer.from(proof(p, this.nonce, hello.extensionId), "hex"),
      )
    )
      throw new Error("AUTH_DENIED");
    return hello;
  }
}
