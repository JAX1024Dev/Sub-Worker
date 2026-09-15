import { describe, expect, it } from 'vitest';

import { validateBundleUrl, validateManifestUrl } from '../../src/sources/remote-config/url-policy';

const commit = 'a'.repeat(40);

describe('remote configuration URL policy', () => {
  it('accepts only approved channel manifests', () => {
    expect(
      validateManifestUrl(
        'https://raw.githubusercontent.com/JAX1024Dev/Sub-Worker/main/example/sing-box/channels/staging.json',
      ).pathname,
    ).toContain('/channels/staging.json');
    expect(
      validateManifestUrl(
        'https://raw.githubusercontent.com/JAX1024Dev/Sub-Worker/main/example/sing-box/channels/production.json',
      ).pathname,
    ).toContain('/channels/production.json');
  });

  it.each([
    'http://raw.githubusercontent.com/JAX1024Dev/Sub-Worker/main/example/sing-box/channels/staging.json',
    'https://github.com/JAX1024Dev/Sub-Worker/main/example/sing-box/channels/staging.json',
    'https://raw.githubusercontent.com/other/Sub-Worker/main/example/sing-box/channels/staging.json',
    'https://raw.githubusercontent.com/JAX1024Dev/Sub-Worker/dev/example/sing-box/channels/staging.json',
    'https://raw.githubusercontent.com/JAX1024Dev/Sub-Worker/main/example/sing-box/channels/staging.json?token=secret',
    'https://raw.githubusercontent.com/JAX1024Dev/Sub-Worker/main/example/sing-box/channels%2fstaging.json',
    'https://raw.githubusercontent.com/JAX1024Dev/Sub-Worker/main/example//sing-box/channels/staging.json',
  ])('rejects an unapproved manifest URL: %s', (url) => {
    expect(() => validateManifestUrl(url)).toThrow(
      expect.objectContaining({ code: 'CONFIG_SOURCE_INVALID' }),
    );
  });

  it('accepts an immutable platform bundle URL', () => {
    const url = `https://raw.githubusercontent.com/JAX1024Dev/Sub-Worker/${commit}/example/sing-box/published/ios.bundle.json`;
    expect(validateBundleUrl(url, 'ios').pathname).toContain(`/${commit}/`);
  });

  it.each([
    `https://raw.githubusercontent.com/JAX1024Dev/Sub-Worker/main/example/sing-box/published/ios.bundle.json`,
    `https://raw.githubusercontent.com/JAX1024Dev/Sub-Worker/${commit}/example/sing-box/published/macos.bundle.json`,
    `https://raw.githubusercontent.com/JAX1024Dev/Sub-Worker/${'A'.repeat(40)}/example/sing-box/published/ios.bundle.json`,
  ])('rejects a mutable, mismatched, or malformed bundle URL: %s', (url) => {
    expect(() => validateBundleUrl(url, 'ios')).toThrow(
      expect.objectContaining({ code: 'CONFIG_SOURCE_INVALID' }),
    );
  });
});
