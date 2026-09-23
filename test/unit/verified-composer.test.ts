import { describe, expect, it } from 'vitest';

import androidBundleSource from '../../example/sing-box/published/android.bundle.json';
import iosBundleSource from '../../example/sing-box/published/ios.bundle.json';
import linuxBundleSource from '../../example/sing-box/published/linux.bundle.json';
import macosBundleSource from '../../example/sing-box/published/macos.bundle.json';
import windowsBundleSource from '../../example/sing-box/published/windows.bundle.json';
import type { ClientType } from '../../src/domain/canonical-node';
import { composeSingBoxConfig } from '../../src/renderers/sing-box/composer';
import { composeVerifiedSingBoxConfig } from '../../src/renderers/sing-box/verified-composer';
import { parseRemoteConfigBundle } from '../../src/sources/remote-config/validator';
import { fakeCanonicalNode } from '../fixtures/fake-node';

const bundleSources: Array<readonly [ClientType, unknown]> = [
  ['ios', iosBundleSource],
  ['macos', macosBundleSource],
  ['android', androidBundleSource],
  ['windows', windowsBundleSource],
  ['linux', linuxBundleSource],
];

function legacyProductionConfig(clientType: ClientType) {
  return composeSingBoxConfig(
    [fakeCanonicalNode],
    clientType,
    clientType === 'ios' ? { iosRoutingMode: 'tun-dual-stack' } : {},
  );
}

describe('verified sing-box composer', () => {
  it.each(bundleSources)(
    'preserves baseline behavior outside service routing for %s',
    (clientType, source) => {
      const bundle = parseRemoteConfigBundle(source, clientType);
      const config = composeVerifiedSingBoxConfig([fakeCanonicalNode], bundle);
      const legacy = legacyProductionConfig(clientType);
      expect(config.outbounds.find((outbound) => outbound.tag === 'uk')).toMatchObject({
        type: 'selector',
        outbounds: ['block'],
        default: 'block',
      });
      expect(config.route.rules).toContainEqual({
        domain_suffix: ['kraken.com', 'krak.app'],
        action: 'route',
        outbound: 'uk',
      });
      expect(config.dns.rules).toContainEqual({
        rule_set: 'apple-cn',
        action: 'route',
        server: 'dns-cn',
      });
      expect(config.dns.rules).toContainEqual({
        rule_set: 'microsoft-cn',
        action: 'route',
        server: 'dns-cn',
      });
      const routeTags = config.route.rules.map((rule) =>
        'domain_suffix' in rule ? 'kraken' : 'rule_set' in rule ? rule.rule_set : '',
      );
      expect(routeTags.indexOf('kraken')).toBeLessThan(routeTags.indexOf('geosite-cn'));
      expect(routeTags.indexOf('apple-cn')).toBeLessThan(routeTags.indexOf('apple'));
      expect(routeTags.indexOf('microsoft-cn')).toBeLessThan(routeTags.indexOf('microsoft'));
      config.outbounds = config.outbounds.filter((outbound) => outbound.tag !== 'uk');
      config.route.rules = legacy.route.rules;
      config.route.rule_set = legacy.route.rule_set;
      config.dns.rules = legacy.dns.rules;
      expect(config).toEqual(legacy);
    },
  );

  it('restricts the UK selector to matching node labels and never falls back to generic proxy', () => {
    const bundle = parseRemoteConfigBundle(iosBundleSource, 'ios');
    const config = composeVerifiedSingBoxConfig(
      [
        { ...fakeCanonicalNode, name: 'USA' },
        { ...fakeCanonicalNode, sourceIndex: 1, name: 'UK London' },
        { ...fakeCanonicalNode, sourceIndex: 2, name: '🇬🇧 英国' },
      ],
      bundle,
    );
    expect(config.outbounds.find((outbound) => outbound.tag === 'uk')).toMatchObject({
      type: 'selector',
      outbounds: ['UK London', '🇬🇧 英国'],
      default: 'UK London',
    });
  });

  it('uses bundle-owned logging, urltest, and outbound policy values', () => {
    const source = structuredClone(iosBundleSource);
    source.fragments.common.log.level = 'debug';
    source.fragments.outbound_policy.urltest.url = 'https://example.invalid/health';
    source.fragments.outbound_policy.urltest.interval = '5m';
    source.fragments.outbound_policy.urltest.tolerance = 25;
    const bundle = parseRemoteConfigBundle(source, 'ios');

    const config = composeVerifiedSingBoxConfig([fakeCanonicalNode], bundle);

    expect(config.log.level).toBe('debug');
    expect(config.outbounds.find((outbound) => outbound.type === 'urltest')).toMatchObject({
      url: 'https://example.invalid/health',
      interval: '5m',
      tolerance: 25,
    });
    expect(config.outbounds.find((outbound) => outbound.type === 'direct')).toMatchObject({
      network_strategy: 'hybrid',
    });
  });

  it('allocates stable node tags without colliding with any bundle tag', () => {
    const bundle = parseRemoteConfigBundle(androidBundleSource, 'android');
    const nodes = [
      { ...fakeCanonicalNode, name: 'auto' },
      { ...fakeCanonicalNode, sourceIndex: 1, name: 'auto' },
      { ...fakeCanonicalNode, sourceIndex: 2, name: 'dns-cn' },
      { ...fakeCanonicalNode, sourceIndex: 3, name: '' },
    ];

    const config = composeVerifiedSingBoxConfig(nodes, bundle);
    const nodeTags = config.outbounds
      .filter((outbound) => outbound.type === 'vless')
      .map((outbound) => outbound.tag);

    expect(nodeTags).toEqual(['auto (2)', 'auto (3)', 'dns-cn (2)', 'node-4']);
    expect(new Set(config.outbounds.map((outbound) => outbound.tag)).size).toBe(
      config.outbounds.length,
    );
  });

  it('does not mutate the verified bundle or canonical nodes', () => {
    const bundle = parseRemoteConfigBundle(iosBundleSource, 'ios');
    const nodes = [fakeCanonicalNode];
    const beforeBundle = JSON.stringify(bundle);
    const beforeNodes = JSON.stringify(nodes);

    composeVerifiedSingBoxConfig(nodes, bundle);

    expect(JSON.stringify(bundle)).toBe(beforeBundle);
    expect(JSON.stringify(nodes)).toBe(beforeNodes);
  });

  it('rejects an empty compatible node set with the existing domain error', () => {
    const bundle = parseRemoteConfigBundle(androidBundleSource, 'android');

    expect(() => composeVerifiedSingBoxConfig([], bundle)).toThrow(
      expect.objectContaining({ code: 'NO_COMPATIBLE_NODES' }),
    );
  });
});
