import { isDeepStrictEqual } from 'node:util';

import type { ClientType } from '../src/domain/canonical-node.js';
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

const failures: ClientType[] = [];
for (const [clientType, bundle] of bundles) {
  const legacy = composeSingBoxConfig(
    [fakeCanonicalNode],
    clientType,
    clientType === 'ios' ? { iosRoutingMode: 'tun-dual-stack' } : {},
  );
  const current = composeVerifiedSingBoxConfig(
    [fakeCanonicalNode],
    parseRemoteConfigBundle(bundle, clientType),
    'test-cache',
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
    !isDeepStrictEqual(current.inbounds, legacy.inbounds) ||
    !isDeepStrictEqual(current.route.auto_detect_interface, legacy.route.auto_detect_interface) ||
    !isDeepStrictEqual(current.route.override_android_vpn, legacy.route.override_android_vpn) ||
    !required.every((tag) => selectorTags.has(tag)) ||
    current.route.final !== '🚀 节点选择' ||
    current.experimental?.cache_file.cache_id !== 'test-cache'
  ) {
    failures.push(clientType);
  }
}

if (failures.length > 0) {
  throw new Error(
    `Remote bundles violate platform or service routing invariants: ${failures.join(', ')}.`,
  );
}
console.log('All remote bundles preserve platform invariants and provide service selectors.');
