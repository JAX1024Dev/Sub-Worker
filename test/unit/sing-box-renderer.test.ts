import { describe, expect, it } from 'vitest';

import { generateDns } from '../../src/config/dns/generator';
import { chinaIpv6RouteExcludes } from '../../src/config/rules/geoip-cn-ipv6';
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
      packet_encoding: 'xudp',
      domain_resolver: 'dns-cn',
      tls: {
        enabled: true,
        reality: { enabled: true, short_id: '0123abcd' },
        utls: { enabled: true, fingerprint: 'chrome' },
      },
    });
    expect(nodes[0]).not.toHaveProperty('network');
    expect(nodes[2]).not.toHaveProperty('domain_resolver');
  });

  it('generates the specified encrypted DNS policy', () => {
    expect(generateDns('android').dns).toEqual({
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
    expect(generateDns('android').dns.servers[0]).not.toHaveProperty('detour');
  });

  it('forces IPv4 DNS answers on macOS when the physical network has no IPv6 route', () => {
    const dns = generateDns('macos').dns;
    const rules = generateRules('macos').route.rules;

    expect(dns.strategy).toBe('ipv4_only');
    expect(dns.rules[0]).toEqual({ query_type: ['AAAA'], action: 'reject', no_drop: true });
    expect(rules).toContainEqual({ action: 'resolve', strategy: 'ipv4_only' });
  });

  it('generates the macOS FakeIP dual-stack profile as one coherent policy', () => {
    const config = composeSingBoxConfig([fakeCanonicalNode], 'macos', {
      macosRoutingMode: 'fakeip-dual-stack',
    });
    const [tun] = config.inbounds;
    const direct = config.outbounds.find((outbound) => outbound.type === 'direct');

    expect(tun).toBeDefined();
    expect(tun).not.toHaveProperty('route_exclude_address');
    expect(config.dns.strategy).toBe('prefer_ipv4');
    expect(config.dns.servers[0]).toEqual({
      type: 'fakeip',
      tag: 'dns-fakeip',
      inet4_range: '198.18.0.0/15',
      inet6_range: 'fc00::/18',
    });
    expect(config.dns.rules[0]).toEqual({
      query_type: ['A', 'AAAA'],
      action: 'route',
      server: 'dns-fakeip',
    });
    expect(config.dns.rules).not.toContainEqual({
      query_type: ['AAAA'],
      action: 'reject',
      no_drop: true,
    });
    expect(config.route.rules).toContainEqual({ action: 'resolve' });
    expect(config.route.rules).not.toContainEqual({
      action: 'resolve',
      strategy: 'ipv4_only',
    });
    expect(config.route.rules).not.toContainEqual({
      ip_version: 6,
      action: 'route',
      outbound: 'proxy',
    });
    expect(config.route.auto_detect_interface).toBe(true);
    expect(direct).toMatchObject({ network_strategy: 'hybrid' });
  });

  it('forces IPv4 DNS answers for iOS to avoid unreachable direct IPv6 routes', () => {
    const dns = generateDns('ios').dns;

    expect(dns.strategy).toBe('ipv4_only');
    expect(dns.rules[0]).toEqual({ query_type: ['AAAA'], action: 'reject', no_drop: true });
  });

  it('preserves the R1-R8 route order and uses pinned rule sets', () => {
    const routing = generateRules('android');
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

  it('proxies iOS IPv6 that remains inside the TUN', () => {
    const rules = generateRules('ios').route.rules;

    expect(rules).toContainEqual({
      action: 'resolve',
      strategy: 'ipv4_only',
    });
    expect(rules.slice(0, 5)).toEqual([
      { action: 'sniff' },
      { protocol: 'dns', action: 'hijack-dns' },
      { ip_is_private: true, action: 'route', outbound: 'direct' },
      { ip_version: 6, action: 'route', outbound: 'proxy' },
      { rule_set: 'geosite-cn', action: 'route', outbound: 'direct' },
    ]);
    expect(rules).toContainEqual({
      ip_version: 6,
      action: 'route',
      outbound: 'proxy',
    });
  });

  it('generates the iOS TUN dual-stack profile as one coherent policy', () => {
    const config = composeSingBoxConfig([fakeCanonicalNode], 'ios', {
      iosRoutingMode: 'tun-dual-stack',
    });
    const [tun] = config.inbounds;
    const direct = config.outbounds.find((outbound) => outbound.type === 'direct');

    expect(tun).toBeDefined();
    expect(tun).not.toHaveProperty('route_exclude_address');
    expect(config.dns.strategy).toBe('prefer_ipv4');
    expect(config.dns.rules).not.toContainEqual({
      query_type: ['AAAA'],
      action: 'reject',
      no_drop: true,
    });
    expect(config.route.rules).toContainEqual({ action: 'resolve' });
    expect(config.route.rules).not.toContainEqual({
      action: 'resolve',
      strategy: 'ipv4_only',
    });
    expect(config.route.rules).not.toContainEqual({
      ip_version: 6,
      action: 'route',
      outbound: 'proxy',
    });
    expect(config.route.rules).toContainEqual({
      rule_set: 'geoip-cn',
      action: 'route',
      outbound: 'direct',
    });
    expect(config.route.final).toBe('proxy');
    expect(direct).toMatchObject({ network_strategy: 'hybrid' });
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
      expect(config.route.auto_detect_interface).toBe(true);
      expect(tun.route_exclude_address).toEqual(chinaIpv6RouteExcludes);
      expect(tun.route_exclude_address).toContain('2402:4e00::/32');
      expect(tun.route_exclude_address).toContain('2402:840::/32');
      expect(tun.route_exclude_address).toContain('2409:8000::/20');
      expect(tun).not.toHaveProperty('route_exclude_address_set');
      expect(config.route).not.toHaveProperty('override_android_vpn');
      expect(config.dns.strategy).toBe('ipv4_only');
      expect(config.dns.rules[0]).toEqual({
        query_type: ['AAAA'],
        action: 'reject',
        no_drop: true,
      });
      expect(config.route.rules).toContainEqual({
        action: 'resolve',
        strategy: 'ipv4_only',
      });
      expect(config.route.rules).toContainEqual({
        ip_version: 6,
        action: 'route',
        outbound: 'proxy',
      });
    } else if (clientType === 'macos') {
      expect(tun).not.toHaveProperty('route_exclude_address');
      expect(config.dns.strategy).toBe('ipv4_only');
      expect(config.dns.rules[0]).toEqual({
        query_type: ['AAAA'],
        action: 'reject',
        no_drop: true,
      });
      expect(config.route.rules).toContainEqual({
        action: 'resolve',
        strategy: 'ipv4_only',
      });
      expect(config.route.rules).not.toContainEqual({
        ip_version: 6,
        action: 'route',
        outbound: 'proxy',
      });
    } else {
      expect(tun).not.toHaveProperty('route_exclude_address');
      expect(tun).not.toHaveProperty('route_exclude_address_set');
      expect(config.dns.strategy).toBe('prefer_ipv4');
      expect(config.dns.rules).not.toContainEqual({
        query_type: ['AAAA'],
        action: 'reject',
        no_drop: true,
      });
      expect(config.route.rules).toContainEqual({ action: 'resolve' });
      expect(config.route.rules).not.toContainEqual({
        ip_version: 6,
        action: 'route',
        outbound: 'proxy',
      });
    }

    expect(serialized).not.toContain('download_detour');
    expect(serialized).not.toContain('domain_strategy');
    expect(serialized).not.toContain('"outbound":"dns');
  });
});
