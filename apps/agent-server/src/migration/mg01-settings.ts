import { SessionSecrets, type SecretStore } from "../settings/service.js";
import {
  captureSettings,
  settingsDigest,
  type Mg01Source,
} from "./mg01-source.js";
import { convertMg01 } from "./mg01-convert.js";
import type { Mg01Persistence } from "./mg01-journal.js";
import type { Mg01Stage } from "./mg01-types.js";
import type { Checkpoint } from "./coordinator.js";
export class Mg01SettingsMigration {
  constructor(
    private readonly journal: Mg01Persistence,
    private readonly source: Mg01Source,
    private readonly profileGuard: string,
    private readonly secrets: SecretStore = new SessionSecrets(),
  ) {
    if (
      !/^[a-f0-9]{64}$/.test(profileGuard) ||
      !["session-only", "os-store"].includes(secrets.mode)
    )
      throw new Error("MG01_CONFIGURATION");
  }
  private async guard(epoch: number) {
    this.journal.assertEpoch(epoch);
    await this.source.assertFrozen(epoch);
  }
  async sourceDigest(epoch: number) {
    await this.guard(epoch);
    return (await captureSettings(this.source, epoch)).digest;
  }
  async stage(
    id: string,
    epoch: number,
    expectedDigest: string,
  ): Promise<Checkpoint> {
    if (
      !/^[A-Za-z0-9_-]{1,128}$/.test(id) ||
      !Number.isSafeInteger(epoch) ||
      epoch < 1
    )
      throw new Error("MG01_IDENTITY");
    await this.guard(epoch);
    const { raw, digest } = await captureSettings(this.source, epoch);
    if (digest !== expectedDigest) throw new Error("SOURCE_CHANGED");
    const old = this.journal.load(this.profileGuard, id);
    if (
      old &&
      (old.epoch !== epoch ||
        old.checkpoint.sourceDigest !== digest ||
        old.conversion.secretMode !== this.secrets.mode)
    )
      throw new Error("MG01_CONFLICT");
    const conversion = await convertMg01(
      raw,
      this.profileGuard,
      this.secrets,
      true,
      () => this.guard(epoch),
    );
    const checkpoint = {
      sourceDigest: digest,
      targetDigest: settingsDigest(conversion),
      sourceCount: conversion.sourceCount,
      copied: conversion.records.length,
      quarantined: conversion.quarantine.length,
    };
    const stage: Mg01Stage = {
      schema: "wca.mg01-stage/v1",
      migrationId: id,
      profileGuard: this.profileGuard,
      epoch,
      conversion,
      checkpoint,
    };
    if (old && settingsDigest(old) !== settingsDigest(stage))
      throw new Error("MG01_CONFLICT");
    if ((await this.sourceDigest(epoch)) !== digest)
      throw new Error("SOURCE_CHANGED");
    await this.guard(epoch);
    this.journal.save(stage);
    if (!(await this.validate(id, epoch, checkpoint)))
      throw new Error("MG01_READBACK");
    return checkpoint;
  }
  async validate(
    id: string,
    epoch: number,
    expected: Checkpoint,
  ): Promise<boolean> {
    await this.guard(epoch);
    const saved = this.journal.load(this.profileGuard, id);
    if (
      !saved ||
      saved.epoch !== epoch ||
      saved.conversion.secretMode !== this.secrets.mode ||
      settingsDigest(saved.checkpoint) !== settingsDigest(expected)
    )
      return false;
    const { raw, digest } = await captureSettings(this.source, epoch);
    if (digest !== saved.checkpoint.sourceDigest) return false;
    try {
      const conversion = await convertMg01(
        raw,
        this.profileGuard,
        this.secrets,
        false,
        () => this.guard(epoch),
      );
      await this.guard(epoch);
      return settingsDigest(conversion) === saved.checkpoint.targetDigest;
    } catch {
      return false;
    }
  }
}
