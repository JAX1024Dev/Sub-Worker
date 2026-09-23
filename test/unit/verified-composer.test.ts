import { describe, expect, it } from 'vitest';

import androidBundleSource from '../../example/sing-box/published/android.bundle.json';
import iosBundleSource from '../../example/sing-box/published/ios.bundle.json';
import linuxBundleSource from '../../example/sing-box/published/linux.bundle.json';
import macosBundleSource from '../../example/sing-box/published/macos.bundle.json';
import windowsBundleSource from '../../example/sing-box/published/windows.bundle.json';
import type { ClientType } from '../../src/domain/canonical-node';
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

describe('verified sing-box composer', () => {
  it.each(bundleSources)(
    'builds independent service selectors and overseas fallback for %s',
    (clientType, source) => {
      const bundle = parseRemoteConfigBundle(source, clientType);
      const config = composeVerifiedSingBoxConfig([fakeCanonicalNode], bundle, 'test-cache');
      expect(config.outbounds.find((outbound) => outbound.tag === 'uk')).toMatchObject({
        type: 'selector',
        outbounds: ['block'],
        default: 'block',
      });
      expect(config.route.final).toBe('🚀 节点选择');
      expect(config.experimental?.cache_file).toEqual({ enabled: true, cache_id: 'test-cache' });
      expect(config.route.rules).toContainEqual({
        domain_suffix: ['kraken.com', 'krak.app'],
        action: 'route',
        outbound: '💷 Kraken/Krak',
      });
      expect(config.outbounds.find((outbound) => outbound.tag === 'Ⓜ️ 微软')).toMatchObject({
        default: 'direct',
      });
      expect(config.outbounds.find((outbound) => outbound.tag === '🍎 苹果')).toMatchObject({
        default: '🚀 节点选择',
      });
      expect(config.outbounds.find((outbound) => outbound.tag === '🛑 广告拦截')).toMatchObject({
        default: 'block',
      });
      expect(config.outbounds.find((outbound) => outbound.tag === '💷 Kraken/Krak')).toMatchObject({
        default: 'uk',
      });
      for (const tag of [
        '🤖 AI',
        '▶️ YouTube',
        '🎬 流媒体',
        '🔍 谷歌',
        '✈️ Telegram',
        '🍎 苹果',
        'Ⓜ️ 微软',
        '🛑 广告拦截',
      ]) {
        expect(config.outbounds.find((outbound) => outbound.tag === tag)).toMatchObject({
          type: 'selector',
        });
      }
      const routes = config.route.rules;
      const index = (ruleSet: string) =>
        routes.findIndex((rule) => 'rule_set' in rule && rule.rule_set === ruleSet);
      expect(index('ads')).toBeLessThan(index('geosite-cn'));
      expect(index('youtube')).toBeLessThan(index('google'));
      expect(index('microsoft')).toBeLessThan(index('geosite-cn'));
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
    const uk = config.outbounds.find((outbound) => outbound.tag === 'uk');
    expect(uk).toMatchObject({ type: 'selector' });
    if (uk?.type !== 'selector') throw new Error('UK selector missing');
    expect(uk.outbounds).toHaveLength(2);
    expect(uk.outbounds[0]).toMatch(/^UK London \[[0-9a-f]{8}\]$/u);
    expect(uk.outbounds[1]).toMatch(/^🇬🇧 英国 \[[0-9a-f]{8}\]$/u);
    expect(uk.default).toBe(uk.outbounds[0]);
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

    expect(nodeTags[0]).toMatch(/^auto \[[0-9a-f]{8}\]$/u);
    expect(nodeTags[1]).toBe(`${String(nodeTags[0])} (2)`);
    expect(nodeTags[2]).toMatch(/^dns-cn \[[0-9a-f]{8}\]$/u);
    expect(nodeTags[3]).toMatch(/^node \[[0-9a-f]{8}\]$/u);
    expect(new Set(config.outbounds.map((outbound) => outbound.tag)).size).toBe(
      config.outbounds.length,
    );
  });

  it('keeps node choices stable when upstream node order changes', () => {
    const bundle = parseRemoteConfigBundle(iosBundleSource, 'ios');
    const first = {
      ...fakeCanonicalNode,
      name: 'USA',
      uuid: '11111111-1111-4111-8111-111111111111',
    };
    const second = {
      ...fakeCanonicalNode,
      name: 'UK London',
      uuid: '22222222-2222-4222-8222-222222222222',
    };
    const a = composeVerifiedSingBoxConfig([first, second], bundle);
    const b = composeVerifiedSingBoxConfig([second, first], bundle);
    const tags = (config: typeof a) =>
      config.outbounds
        .filter((outbound) => outbound.type === 'vless')
        .map((outbound) => outbound.tag);
    expect(new Set(tags(a))).toEqual(new Set(tags(b)));
    const ai = a.outbounds.find((outbound) => outbound.tag === '🤖 AI');
    expect(ai).toMatchObject({ type: 'selector', default: '🚀 节点选择' });
    if (ai?.type !== 'selector') throw new Error('AI selector missing');
    expect(ai.outbounds).toEqual(expect.arrayContaining(tags(a)));
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
