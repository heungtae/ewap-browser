import assert from 'node:assert/strict';

globalThis.chrome = {
  storage: {
    managed: {
      async get() {
        return {
          companyAgent: {
            provider: { baseUrl: 'https://ai.company.net/v1', model: 'Qwen3.5-32B-Instruct' },
            allowedOrigins: ['https://eda.company.net'],
          },
        };
      },
    },
    local: { async get() { return {}; }, async set() {} },
  },
};

const { ProviderManager } = await import('../../src/chrome/src/providers/manager.js');
const manager = new ProviderManager();
await manager.load();
assert.equal(manager.activeProviderId, 'company-vllm');
assert.deepEqual(Object.keys(manager.getAll()), ['company-vllm']);
assert.equal(manager.getActive().config.baseUrl, 'https://ai.company.net/v1');
await assert.rejects(() => manager.setActive('openai'));
await assert.rejects(() => manager.updateProvider('company-vllm', { baseUrl: 'https://outside.example/v1' }));
console.log('company provider policy tests passed');
