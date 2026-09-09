import { describe, expect, it } from 'vitest';

import { generateDns } from '../../src/config/dns/generator';
import { generateRules } from '../../src/config/rules/generator';
import { ruleSetSources } from '../../src/config/rules/rule-set-sources';
import { clientTypes } from '../../src/domain/canonical-node';
import { composeSingBoxConfig } from '../../src/renderers/sing-box/composer';
import { generateOutbounds } from '../../src/renderers/sing-box/outbounds';
import { fakeCanonicalNode } from '../fixtures/fake-node';

describe('sing-box renderer', () => {
  it('renders VLESS Reality and protects reserved or duplicate tags', () => {
    const fragment = generateOutbounds([
      { ...fakeCanonicalNode, name: 'proxy' },
      { ...fakeCanonicalNode, sourceIndex: 1, name: 'proxy' },
      { ...fakeCanonicalNode, sourceIndex: 2, name: 'IP node', server: '203.0.113.1' },
    ]);
    const nodes = fragment.outbounds.filter((outbound) => outbound.type === 'vless');

    expect(fragment.nodeTags).toEqual(['proxy (2)', 'proxy (3)', 'IP node']);
    expect(nodes[0]).toMatchObject({
      domain_resolver: 'dns-cn',
      tls: {
        enabled: true,
        reality: { enabled: true, short_id: '0123abcd' },
        utls: { enabled: true, fingerprint: 'chrome' },
      },
    });
    expect(nodes[2]).not.toHaveProperty('domain_resolver');
  });

  it('generates the specified encrypted DNS policy', () => {
    expect(generateDns().dns).toEqual({
      servers: [
        {
          type: 'https',
          tag: 'dns-cn',
          server: '223.5.5.5',
          server_port: 443,
          path: '/dns-query',
          tls: { enabled: true, server_name: 'dns.alidns.com' },
        },
        {
          type: 'https',
          tag: 'dns-global',
          server: '1.1.1.1',
          server_port: 443,
          path: '/dns-query',
          tls: { enabled: true, server_name: 'cloudflare-dns.com' },
          detour: 'proxy',
        },
      ],
      rules: [
        { rule_set: 'geosite-cn', action: 'route', server: 'dns-cn' },
        { action: 'route', server: 'dns-global' },
      ],
      final: 'dns-global',
      strategy: 'prefer_ipv4',
      disable_cache: false,
      optimistic: false,
      timeout: '5s',
    });
    expect(generateDns().dns.servers[0]).not.toHaveProperty('detour');
  });

  it('preserves the R1-R8 route order and uses pinned rule sets', () => {
    const routing = generateRules();
    expect(routing.route.rules).toEqual([
      { action: 'sniff' },
      { protocol: 'dns', action: 'hijack-dns' },
      { ip_is_private: true, action: 'route', outbound: 'direct' },
      { rule_set: 'geosite-cn', action: 'route', outbound: 'direct' },
      { rule_set: 'geosite-non-cn', action: 'route', outbound: 'proxy' },
      { action: 'resolve' },
      { ip_is_private: true, action: 'route', outbound: 'direct' },
      { rule_set: 'geoip-cn', action: 'route', outbound: 'direct' },
    ]);
    expect(
      routing.route.rule_set.every((ruleSet) => ruleSet.http_client === 'rules-via-proxy'),
    ).toBe(true);
    for (const source of Object.values(ruleSetSources)) {
      expect(source.revision).toMatch(/^[0-9a-f]{40}$/);
      expect(source.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(source.url).toContain(source.revision);
    }
  });

  it.each(clientTypes)('composes the %s platform without deprecated fields', (clientType) => {
    const config = composeSingBoxConfig([fakeCanonicalNode], clientType);
    const serialized = JSON.stringify(config);
    const [tun] = config.inbounds;

    if (!tun) {
      throw new Error('Expected a TUN inbound.');
    }

    expect(config.route.final).toBe('proxy');
    expect(config.route.default_domain_resolver).toBe('dns-cn');
    expect(tun).toMatchObject({ type: 'tun', dns_mode: 'hijack' });

    if (clientType === 'linux') {
      expect(tun).toMatchObject({ strict_route: true, auto_redirect: true });
      expect(config.route.auto_detect_interface).toBe(true);
    } else {
      expect(tun).not.toHaveProperty('auto_redirect');
    }
    if (clientType === 'windows') {
      expect(tun.strict_route).toBe(true);
      expect(config.route.auto_detect_interface).toBe(true);
    }
    if (clientType === 'macos') {
      expect(tun).not.toHaveProperty('strict_route');
      expect(config.route.auto_detect_interface).toBe(true);
    }
    if (clientType === 'android') {
      expect(config.route.override_android_vpn).toBe(false);
    }
    if (clientType === 'ios') {
      expect(config.route).not.toHaveProperty('auto_detect_interface');
      expect(config.route).not.toHaveProperty('override_android_vpn');
    }

    expect(serialized).not.toContain('download_detour');
    expect(serialized).not.toContain('domain_strategy');
    expect(serialized).not.toContain('"outbound":"dns');
  });
});
