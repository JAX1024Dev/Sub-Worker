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
  it.each(bundleSources)('matches current production behavior for %s', (clientType, source) => {
    const bundle = parseRemoteConfigBundle(source, clientType);

    expect(composeVerifiedSingBoxConfig([fakeCanonicalNode], bundle)).toEqual(
      legacyProductionConfig(clientType),
    );
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
