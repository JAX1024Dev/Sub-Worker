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
    expect(config.inbounds[0]).toMatchObject({ type: 'tun' });
    if (
      !isRecord(config.inbounds[0]) ||
      !isUnknownArray(config.inbounds[0].route_exclude_address)
    ) {
      throw new Error('Expected explicit iOS route exclusions.');
    }
    expect(config.inbounds[0].route_exclude_address).toContain('2402:4e00::/32');
    expect(config.inbounds[0].route_exclude_address).toContain('2402:840::/32');
    expect(config.inbounds[0].route_exclude_address).toContain('2409:8000::/20');
    expect(config.inbounds[0]).not.toHaveProperty('route_exclude_address_set');

    const nodeOutbounds = config.outbounds.filter(
      (outbound): outbound is Record<string, unknown> =>
        isRecord(outbound) && outbound.type === 'vless',
    );
    expect(nodeOutbounds.length).toBeGreaterThan(0);
    for (const outbound of nodeOutbounds) {
      expect(outbound.packet_encoding).toBe('xudp');
      expect(outbound).not.toHaveProperty('network');
    }
  });
});
