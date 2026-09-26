import { isDeepStrictEqual } from 'node:util';

import { composeSingBoxConfig } from '../src/renderers/sing-box/composer.js';
import { composeVerifiedSingBoxConfig } from '../src/renderers/sing-box/verified-composer.js';
import { parseRemoteConfigBundle } from '../src/sources/remote-config/validator.js';
import { fakeCanonicalNode } from '../test/fixtures/fake-node.js';
import {
  assertPublishedBundlesCurrent,
  buildConfigBundles,
  validateConfigSources,
} from './config-bundles.js';

await validateConfigSources();
const bundles = await buildConfigBundles();
await assertPublishedBundlesCurrent(bundles);

const failures: string[] = [];
for (const [clientType, bundle] of bundles) {
  const verifiedBundle = parseRemoteConfigBundle(bundle, clientType);
  const legacy = composeSingBoxConfig(
    [fakeCanonicalNode],
    clientType,
    clientType === 'ios' ? { iosRoutingMode: 'tun-dual-stack' } : {},
  );
  const current = composeVerifiedSingBoxConfig([fakeCanonicalNode], verifiedBundle, 'test-cache');
  const withUkNode = composeVerifiedSingBoxConfig(
    [fakeCanonicalNode, { ...fakeCanonicalNode, sourceIndex: 1, name: 'UK London' }],
    verifiedBundle,
  );
  const selectors = current.outbounds.filter((outbound) => outbound.type === 'selector');
  const required = [
    '🚀 节点选择',
    '🤖 AI',
    '▶️ YouTube',
    '🎬 流媒体',
    '🔍 谷歌',
    '✈️ Telegram',
    '🍎 苹果',
    'Ⓜ️ 微软',
    '🛑 广告拦截',
    '💷 Kraken/Krak',
  ];
  const selectorTags = new Set(selectors.map((selector) => selector.tag));
  if (
    !isDeepStrictEqual(
      current.inbounds,
      clientType === 'ios'
        ? legacy.inbounds.map((inbound) => ({ ...inbound, stack: 'gvisor' }))
        : legacy.inbounds,
    ) ||
    !isDeepStrictEqual(current.route.auto_detect_interface, legacy.route.auto_detect_interface) ||
    !isDeepStrictEqual(current.route.override_android_vpn, legacy.route.override_android_vpn) ||
    current.log.level !== 'error' ||
    !required.every((tag) => selectorTags.has(tag)) ||
    current.route.final !== '🚀 节点选择' ||
    current.experimental?.cache_file.cache_id !== 'test-cache'
  ) {
    failures.push(`${clientType}: platform or service-group baseline`);
  }

  const global = current.outbounds.find((outbound) => outbound.tag === '🚀 节点选择');
  const krakenWithoutUk = current.outbounds.find((outbound) => outbound.tag === '💷 Kraken/Krak');
  const krakenWithUk = withUkNode.outbounds.find((outbound) => outbound.tag === '💷 Kraken/Krak');
  const routeIndex = (tag: string) =>
    current.route.rules.findIndex((rule) => 'rule_set' in rule && rule.rule_set === tag);
  const krakenRule = current.route.rules.find(
    (rule) => 'domain_suffix' in rule && rule.outbound === '💷 Kraken/Krak',
  );
  const krakenDomains = krakenRule && 'domain_suffix' in krakenRule ? krakenRule.domain_suffix : [];
  if (
    global?.type !== 'selector' ||
    !isDeepStrictEqual(global.outbounds, ['Example node']) ||
    global.default !== 'Example node' ||
    krakenWithoutUk?.type !== 'selector' ||
    !isDeepStrictEqual(krakenWithoutUk.outbounds, ['block', '🚀 节点选择']) ||
    krakenWithoutUk.default !== 'block' ||
    krakenWithUk?.type !== 'selector' ||
    !isDeepStrictEqual(krakenWithUk.outbounds, ['UK London', '🚀 节点选择', 'block']) ||
    krakenWithUk.default !== 'UK London' ||
    current.outbounds.some((outbound) => outbound.tag === 'auto' || outbound.tag === 'uk') ||
    routeIndex('github') < 0 ||
    routeIndex('github') >= routeIndex('microsoft') ||
    !krakenDomains.includes('kraken.zendesk.com')
  ) {
    failures.push(`${clientType}: selector or route-policy invariant`);
  }
}

if (failures.length > 0) {
  throw new Error(
    `Remote bundles violate platform or service routing invariants: ${failures.join('; ')}.`,
  );
}
console.log('All remote bundles preserve platform invariants and provide service selectors.');
