import { describe, expect, it } from 'vitest';

import androidBundle from '../../example/sing-box/published/android.bundle.json';
import iosBundle from '../../example/sing-box/published/ios.bundle.json';
import linuxBundle from '../../example/sing-box/published/linux.bundle.json';
import macosBundle from '../../example/sing-box/published/macos.bundle.json';
import windowsBundle from '../../example/sing-box/published/windows.bundle.json';
import {
  bundleCommit,
  createChannelManifest,
  promoteStagingManifest,
  validateFullCommit,
} from '../../scripts/channel-manifests';
import type { ClientType } from '../../src/domain/canonical-node';

const commit = 'a'.repeat(40);
const bundleSources: Record<ClientType, unknown> = {
  ios: iosBundle,
  macos: macosBundle,
  android: androidBundle,
  windows: windowsBundle,
  linux: linuxBundle,
};

function encodeJson(value: unknown): Uint8Array<ArrayBuffer> {
  const encoded = new TextEncoder().encode(JSON.stringify(value));
  const copy = new Uint8Array(encoded.byteLength);
  copy.set(encoded);
  return copy;
}

function readBundle(commitValue: string, clientType: ClientType): Promise<Uint8Array<ArrayBuffer>> {
  expect(commitValue).toBe(commit);
  return Promise.resolve(encodeJson(bundleSources[clientType]));
}

describe('channel manifest publication', () => {
  it('builds a complete manifest pinned to one immutable commit', async () => {
    const manifest = await createChannelManifest('staging', commit, readBundle);

    expect(Object.keys(manifest.profiles)).toEqual(['ios', 'macos', 'android', 'windows', 'linux']);
    for (const [clientType, profile] of Object.entries(manifest.profiles) as Array<
      [ClientType, (typeof manifest.profiles)[ClientType]]
    >) {
      expect(bundleCommit(profile, clientType)).toBe(commit);
      expect(profile.sha256).toMatch(/^[0-9a-f]{64}$/u);
    }
  });

  it('promotes exactly the staging profiles without rebuilding', async () => {
    const staging = await createChannelManifest('staging', commit, readBundle);
    const production = promoteStagingManifest(structuredClone(staging));

    expect(production.channel).toBe('production');
    expect(production.profiles).toEqual(staging.profiles);
  });

  it.each(['main', 'A'.repeat(40), 'a'.repeat(39), `${'a'.repeat(40)}?ref=main`])(
    'rejects a non-immutable commit value %s',
    (value) => {
      expect(() => validateFullCommit(value)).toThrow(/40-character lowercase/u);
    },
  );

  it('rejects a bundle whose platform does not match its profile', async () => {
    const wrongBundle = (): Promise<Uint8Array<ArrayBuffer>> =>
      Promise.resolve(encodeJson(iosBundle));

    await expect(createChannelManifest('staging', commit, wrongBundle)).rejects.toMatchObject({
      code: 'CONFIG_SOURCE_INVALID',
    });
  });

  it('rejects promotion from a non-staging manifest', async () => {
    const production = await createChannelManifest('production', commit, readBundle);

    expect(() => promoteStagingManifest(production)).toThrow(/Expected a staging/u);
  });
});
