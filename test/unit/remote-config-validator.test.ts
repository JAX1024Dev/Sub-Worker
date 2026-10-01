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

  it('accepts only the SSH protocol route and a declared selector', () => {
    const wrongProtocol = structuredClone(iosBundle);
    const sshRule = wrongProtocol.fragments.route.route.rules.find(
      (rule) => 'protocol' in rule && rule.protocol === 'ssh',
    );
    if (sshRule === undefined || !('protocol' in sshRule)) throw new Error('Missing SSH rule');
    sshRule.protocol = 'http';
    expect(() => parseRemoteConfigBundle(wrongProtocol, 'ios')).toThrow(
      expect.objectContaining({ code: 'CONFIG_SOURCE_INVALID' }),
    );

    const missingSelector = structuredClone(iosBundle);
    const missingSelectorRule = missingSelector.fragments.route.route.rules.find(
      (rule) => 'protocol' in rule && rule.protocol === 'ssh',
    );
    if (missingSelectorRule === undefined || !('outbound' in missingSelectorRule)) {
      throw new Error('Missing SSH rule');
    }
    missingSelectorRule.outbound = 'missing-ssh-selector';
    expect(() => parseRemoteConfigBundle(missingSelector, 'ios')).toThrow(
      expect.objectContaining({ code: 'CONFIG_SOURCE_INVALID' }),
    );
  });

  it('rejects a bundle for a different client type', () => {
    expect(() => parseRemoteConfigBundle(iosBundle, 'macos')).toThrow(
      expect.objectContaining({ code: 'CONFIG_SOURCE_INVALID' }),
    );
  });

  it('rejects duplicate service selector tags and unsafe domain-suffix rules', () => {
    const duplicate = structuredClone(iosBundle);
    const selector = duplicate.fragments.outbound_policy.service_selectors[0];
    if (selector === undefined) throw new Error('Missing service selector');
    selector.tag = '🚀 节点选择';
    expect(() => parseRemoteConfigBundle(duplicate, 'ios')).toThrow(
      expect.objectContaining({ code: 'CONFIG_SOURCE_INVALID' }),
    );

    const unsafe = structuredClone(iosBundle);
    const kraken = unsafe.fragments.route.route.rules.find((rule) => 'domain_suffix' in rule);
    if (kraken === undefined || !('domain_suffix' in kraken)) throw new Error('Missing rule');
    kraken.domain_suffix = ['evil.com/redirect'];
    expect(() => parseRemoteConfigBundle(unsafe, 'ios')).toThrow(
      expect.objectContaining({ code: 'CONFIG_SOURCE_INVALID' }),
    );
  });

  it('rejects Tailscale secrets and broken endpoint references', () => {
    const endpoint = iosBundle.fragments.common.endpoints[0];
    if (endpoint === undefined) throw new Error('Missing Tailscale endpoint');
    const secretBundle = {
      ...iosBundle,
      fragments: {
        ...iosBundle.fragments,
        common: {
          ...iosBundle.fragments.common,
          endpoints: [{ ...endpoint, auth_key: 'tskey-auth-secret' }],
        },
      },
    };
    expect(() => parseRemoteConfigBundle(secretBundle, 'ios')).toThrow(
      expect.objectContaining({ code: 'CONFIG_SOURCE_INVALID' }),
    );

    const broken = structuredClone(iosBundle);
    const tailscaleDns = broken.fragments.dns.servers.find((server) => server.type === 'tailscale');
    if (tailscaleDns === undefined || !('endpoint' in tailscaleDns)) {
      throw new Error('Missing Tailscale DNS server');
    }
    tailscaleDns.endpoint = 'missing-endpoint';
    expect(() => parseRemoteConfigBundle(broken, 'ios')).toThrow(
      expect.objectContaining({ code: 'CONFIG_SOURCE_INVALID' }),
    );

    const wrongPreferredDns = structuredClone(iosBundle);
    const preferredRule = wrongPreferredDns.fragments.dns.rules.find(
      (rule) => 'preferred_by' in rule,
    );
    if (preferredRule === undefined || !('preferred_by' in preferredRule)) {
      throw new Error('Missing preferred DNS rule');
    }
    preferredRule.preferred_by = 'dns-cn';
    preferredRule.server = 'dns-cn';
    expect(() => parseRemoteConfigBundle(wrongPreferredDns, 'ios')).toThrow(
      expect.objectContaining({ code: 'CONFIG_SOURCE_INVALID' }),
    );
  });
});
