import { env, exports } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isUnknownArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

describe('configured 3x-ui subscription', () => {
  it('returns a complete sing-box configuration', async () => {
    expect(env.LIVE_TEST_SUBSCRIPTION_ID).toBeTypeOf('string');

    const response = await exports.default.fetch(
      new Request(`https://worker.example.test/v1/sing-box/ios/${env.LIVE_TEST_SUBSCRIPTION_ID}`),
    );
    const config: unknown = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(config).toMatchObject({
      dns: { final: 'dns-global', strategy: 'ipv4_only' },
      route: { final: 'proxy' },
    });

    if (!isRecord(config) || !isRecord(config.dns) || !isUnknownArray(config.dns.rules)) {
      throw new Error('Expected a DNS rules array.');
    }
    if (!isRecord(config.route) || !isUnknownArray(config.route.rules)) {
      throw new Error('Expected a route rules array.');
    }

    expect(config.dns.rules).toContainEqual({
      query_type: ['AAAA'],
      action: 'reject',
      no_drop: true,
    });
    expect(config.route.rules).toContainEqual({ action: 'resolve', strategy: 'ipv4_only' });
    expect(config.route.rules).toContainEqual({
      ip_version: 6,
      action: 'route',
      outbound: 'proxy',
    });
  });
});
