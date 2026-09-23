import { isDeepStrictEqual } from 'node:util';

import type { ClientType } from '../src/domain/canonical-node.js';
import { composeSingBoxConfig } from '../src/renderers/sing-box/composer.js';
import type { SingBoxConfig } from '../src/renderers/sing-box/types.js';
import { composeVerifiedSingBoxConfig } from '../src/renderers/sing-box/verified-composer.js';
import { parseRemoteConfigBundle } from '../src/sources/remote-config/validator.js';
import { fakeCanonicalNode } from '../test/fixtures/fake-node.js';
import {
  assertPublishedBundlesCurrent,
  buildConfigBundles,
  validateConfigSources,
} from './config-bundles.js';

function legacyConfig(clientType: ClientType): SingBoxConfig {
  return composeSingBoxConfig(
    [fakeCanonicalNode],
    clientType,
    clientType === 'ios' ? { iosRoutingMode: 'tun-dual-stack' } : {},
  );
}

await validateConfigSources();
const bundles = await buildConfigBundles();
await assertPublishedBundlesCurrent(bundles);
const differences: ClientType[] = [];

for (const [clientType, bundle] of bundles) {
  const legacy = legacyConfig(clientType);
  const verifiedBundle = parseRemoteConfigBundle(bundle, clientType);
  const migrated = composeVerifiedSingBoxConfig([fakeCanonicalNode], verifiedBundle);
  const normalized = structuredClone(migrated);
  normalized.outbounds = normalized.outbounds.filter((outbound) => outbound.tag !== 'uk');
  normalized.route.rules = legacy.route.rules;
  normalized.route.rule_set = legacy.route.rule_set;
  normalized.dns.rules = legacy.dns.rules;
  if (
    !isDeepStrictEqual(normalized, legacy) ||
    !migrated.outbounds.some((outbound) => outbound.type === 'selector' && outbound.tag === 'uk') ||
    !migrated.route.rules.some((rule) => 'domain_suffix' in rule && rule.outbound === 'uk')
  ) {
    differences.push(clientType);
  }
}

if (differences.length > 0) {
  throw new Error(
    `Remote bundles differ outside the planned service-routing overlay: ${differences.join(', ')}.`,
  );
}
console.log('All remote bundles preserve baseline behavior outside service routing.');
