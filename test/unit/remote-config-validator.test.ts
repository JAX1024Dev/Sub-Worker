import { describe, expect, it } from 'vitest';

import androidBundle from '../../example/sing-box/published/android.bundle.json';
import iosBundle from '../../example/sing-box/published/ios.bundle.json';
import linuxBundle from '../../example/sing-box/published/linux.bundle.json';
import macosBundle from '../../example/sing-box/published/macos.bundle.json';
import windowsBundle from '../../example/sing-box/published/windows.bundle.json';
import type { ClientType } from '../../src/domain/canonical-node';
import { parseRemoteConfigBundle } from '../../src/sources/remote-config/validator';

const bundles: Array<readonly [ClientType, unknown]> = [
  ['ios', iosBundle],
  ['macos', macosBundle],
  ['android', androidBundle],
  ['windows', windowsBundle],
  ['linux', linuxBundle],
];

describe('remote configuration runtime validator', () => {
  it.each(bundles)('accepts the generated %s bundle', (clientType, bundle) => {
    expect(parseRemoteConfigBundle(bundle, clientType).target.client_type).toBe(clientType);
  });

  it('rejects a missing cross-fragment reference', () => {
    const invalid = structuredClone(iosBundle);
    invalid.fragments.route.route.default_domain_resolver = 'missing-dns';

    expect(() => parseRemoteConfigBundle(invalid, 'ios')).toThrow(
      expect.objectContaining({ code: 'CONFIG_SOURCE_INVALID' }),
    );
  });

  it('rejects a bundle for a different client type', () => {
    expect(() => parseRemoteConfigBundle(iosBundle, 'macos')).toThrow(
      expect.objectContaining({ code: 'CONFIG_SOURCE_INVALID' }),
    );
  });
});
