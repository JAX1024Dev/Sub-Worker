import { env, exports } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';

describe('configured 3x-ui subscription', () => {
  it('returns a complete sing-box configuration', async () => {
    expect(env.LIVE_TEST_SUBSCRIPTION_ID).toBeTypeOf('string');

    const response = await exports.default.fetch(
      new Request(`https://worker.example.test/v1/sing-box/linux/${env.LIVE_TEST_SUBSCRIPTION_ID}`),
    );
    const config: unknown = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(config).toMatchObject({
      dns: { final: 'dns-global' },
      route: { final: 'proxy' },
    });
  });
});
