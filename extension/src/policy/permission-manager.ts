import { fail } from "../security/validation.js";

export const CAPABILITIES = [
  "navigate",
  "click",
  "type",
  "network_write",
  "download",
  "upload",
  "schedule",
] as const;
export type Capability = (typeof CAPABILITIES)[number];
export type PermissionDuration = "once" | "always";
export type PermissionDecision = "once" | "always" | "deny";
export type StoredPermission = {
  capability: Capability;
  host: string;
  action: "allow" | "deny";
  duration: "always";
};

const restrictedSchemes = new Set([
  "chrome:",
  "chrome-extension:",
  "file:",
  "data:",
  "blob:",
]);
const isIp = (host: string): boolean =>
  /^\d{1,3}(?:\.\d{1,3}){3}$/.test(host) || host.includes(":");
export const permissionHost = (rawUrl: string): string => {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return fail("ORIGIN_NOT_ALLOWED");
  }
  const host = url.hostname.toLowerCase();
  if (
    restrictedSchemes.has(url.protocol) ||
    url.protocol !== "https:" ||
    host === "localhost" ||
    host.endsWith(".localhost") ||
    isIp(host) ||
    !host.includes(".")
  )
    return fail("ORIGIN_NOT_ALLOWED");
  return host;
};

export class PermissionManager {
  private persistent: StoredPermission[];
  private readonly once = new Map<string, Set<string>>();

  public constructor(initial: readonly StoredPermission[] = []) {
    this.persistent = initial.map((entry) => this.validateStored(entry));
  }

  public check(
    capability: Capability,
    rawUrl: string,
    runId: string,
  ): "ALLOW" | "DENY" | "REQUIRE_PERMISSION" {
    const host = permissionHost(rawUrl);
    const persistent = this.persistent.find(
      (entry) => entry.capability === capability && entry.host === host,
    );
    if (persistent) return persistent.action === "allow" ? "ALLOW" : "DENY";
    return this.once.get(runId)?.has(this.key(capability, host))
      ? "ALLOW"
      : "REQUIRE_PERMISSION";
  }

  public decide(
    capability: Capability,
    rawUrl: string,
    runId: string,
    decision: PermissionDecision,
  ): void {
    if (!CAPABILITIES.includes(capability)) fail("INVALID_ARGUMENT");
    const host = permissionHost(rawUrl);
    const key = this.key(capability, host);
    if (decision === "once") {
      const grants = this.once.get(runId) ?? new Set<string>();
      grants.add(key);
      this.once.set(runId, grants);
      return;
    }
    const next: StoredPermission = {
      capability,
      host,
      action: decision === "always" ? "allow" : "deny",
      duration: "always",
    };
    this.persistent = [
      ...this.persistent.filter(
        (entry) => this.key(entry.capability, entry.host) !== key,
      ),
      next,
    ];
  }

  public endRun(runId: string): void {
    this.once.delete(runId);
  }

  public revoke(capability?: Capability, host?: string): void {
    this.persistent = this.persistent.filter(
      (entry) =>
        (capability !== undefined && entry.capability !== capability) ||
        (host !== undefined && entry.host !== host),
    );
    if (capability === undefined && host === undefined) this.persistent = [];
  }

  public snapshot(): readonly StoredPermission[] {
    return this.persistent.map((entry) => ({ ...entry }));
  }

  public load(entries: unknown): void {
    if (!Array.isArray(entries)) fail("INVALID_ARGUMENT");
    this.persistent = (entries as unknown[]).map((entry: unknown) => {
      if (typeof entry !== "object" || entry === null || Array.isArray(entry))
        fail("INVALID_ARGUMENT");
      return this.validateStored(entry as StoredPermission);
    });
  }

  private key(capability: Capability, host: string): string {
    return `${capability}\n${host}`;
  }

  private validateStored(entry: StoredPermission): StoredPermission {
    if (
      !CAPABILITIES.includes(entry.capability) ||
      !/^[a-z0-9.-]+$/.test(entry.host) ||
      entry.host === "localhost" ||
      isIp(entry.host) ||
      !["allow", "deny"].includes(entry.action) ||
      entry.duration !== "always"
    )
      return fail("INVALID_ARGUMENT");
    return { ...entry, host: entry.host.toLowerCase() };
  }
}
