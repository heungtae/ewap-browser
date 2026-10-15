import { fail } from "../security/validation.js";
import type { ProviderSettings } from "../settings/provider-settings.js";
export type ModelBinding = Awaited<ReturnType<ProviderSettings["roles"]>> & {
  controller: AbortController;
  decisions: number;
  dispatched: boolean;
  mutationStopped: boolean;
  failed: boolean;
  fingerprints: Set<string>;
  consent: Set<string>;
  invalidate?: () => void;
};
export class ModelBindings {
  private readonly bindings = new Map<AbortSignal, Promise<ModelBinding>>();
  public constructor(private readonly settings: ProviderSettings) {}
  public get(
    signal: AbortSignal,
    invalidate?: () => void,
  ): Promise<ModelBinding> {
    if (signal.aborted) return Promise.reject(new Error("POLICY_DENIED"));
    let pending = this.bindings.get(signal);
    if (!pending) {
      pending = this.settings.roles().then((roles) => {
        const controller = new AbortController();
        const binding: ModelBinding = {
          ...roles,
          controller,
          decisions: 0,
          dispatched: false,
          mutationStopped: false,
          failed: false,
          fingerprints: new Set(),
          consent: new Set(),
          ...(invalidate ? { invalidate } : {}),
        };
        if (signal.aborted) controller.abort();
        else
          signal.addEventListener(
            "abort",
            () => {
              controller.abort();
              this.bindings.delete(signal);
            },
            { once: true },
          );
        return binding;
      });
      this.bindings.set(signal, pending);
      void pending.catch(() => this.bindings.delete(signal));
    }
    if (invalidate)
      void pending
        .then((binding) => {
          binding.invalidate = invalidate;
        })
        .catch(() => undefined);
    return pending;
  }
  public async invalidate(id?: string): Promise<void> {
    await Promise.all(
      [...this.bindings.values()].map(async (pending) => {
        const binding = await pending.catch(() => undefined);
        if (
          binding &&
          (id === undefined ||
            binding.primaryId === id ||
            binding.decisionId === id)
        ) {
          binding.controller.abort();
          binding.invalidate?.();
        }
      }),
    );
  }
  public async invalidateDual(): Promise<void> {
    for (const pending of this.bindings.values()) {
      const binding = await pending.catch(() => undefined);
      if (binding?.decision) {
        binding.controller.abort();
        binding.invalidate?.();
      }
    }
  }
  public async dispatched(signal?: AbortSignal): Promise<void> {
    if (!signal) return;
    const binding = await this.get(signal);
    this.check(binding);
    if (binding.mutationStopped) fail("POLICY_DENIED");
    binding.dispatched = true;
  }
  public check(binding: ModelBinding): void {
    if (binding.controller.signal.aborted) fail("POLICY_DENIED");
  }
}
