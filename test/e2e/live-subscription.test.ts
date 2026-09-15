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
      dns: { final: 'dns-global', strategy: 'prefer_ipv4' },
      route: { final: 'proxy', auto_detect_interface: true },
    });

    if (
      !isRecord(config) ||
      !isRecord(config.dns) ||
      !isUnknownArray(config.dns.rules) ||
      !isUnknownArray(config.outbounds) ||
      !isUnknownArray(config.inbounds)
    ) {
      throw new Error('Expected DNS rules, inbounds and outbounds arrays.');
    }
    if (!isRecord(config.route) || !isUnknownArray(config.route.rules)) {
      throw new Error('Expected a route rules array.');
    }

    expect(config.dns.rules).not.toContainEqual(
      expect.objectContaining({ query_type: ['AAAA'], action: 'reject' }),
    );
    expect(config.route.rules).toContainEqual({ action: 'resolve' });
    expect(config.route.rules).not.toContainEqual(
      expect.objectContaining({ ip_version: 6, outbound: 'proxy' }),
    );
    expect(config.inbounds[0]).toMatchObject({
      type: 'tun',
      address: ['172.19.0.1/30', 'fdfe:dcba:9876::1/126'],
    });
    expect(config.inbounds[0]).not.toHaveProperty('route_exclude_address_set');
    expect(config.inbounds[0]).not.toHaveProperty('route_exclude_address');

    const nodeOutbounds = config.outbounds.filter(
      (outbound): outbound is Record<string, unknown> =>
        isRecord(outbound) && outbound.type === 'vless',
    );
    expect(nodeOutbounds.length).toBeGreaterThan(0);
    for (const outbound of nodeOutbounds) {
      expect(outbound.packet_encoding).toBe('xudp');
      expect(outbound).not.toHaveProperty('network');
    }
    expect(config.outbounds).toContainEqual(
      expect.objectContaining({ type: 'direct', tag: 'direct', network_strategy: 'hybrid' }),
    );
  });
});
