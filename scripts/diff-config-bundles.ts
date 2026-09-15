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
  if (!isDeepStrictEqual(migrated, legacy)) differences.push(clientType);
}

if (differences.length > 0) {
  throw new Error(`Remote bundles differ from the current generator: ${differences.join(', ')}.`);
}
console.log('All remote bundles match the current production generator behavior.');
