import { describe, expect, it, vi } from 'vitest';

import iosBundle from '../../example/sing-box/published/ios.bundle.json';
import {
  loadRemoteConfig,
  remoteConfigLimits,
} from '../../src/sources/remote-config/source-adapter';

const commit = 'a'.repeat(40);
const manifestUrl =
  'https://raw.githubusercontent.com/JAX1024Dev/Sub-Worker/main/example/sing-box/channels/staging.json';
const bundleUrl = `https://raw.githubusercontent.com/JAX1024Dev/Sub-Worker/${commit}/example/sing-box/published/ios.bundle.json`;

function jsonResponse(value: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set('Content-Type', 'application/json; charset=utf-8');
  return new Response(JSON.stringify(value), { ...init, headers });
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function validResponses(): Promise<[Response, Response]> {
  const bundleText = JSON.stringify(iosBundle);
  const manifest = {
    schema_version: 1,
    channel: 'staging',
    profiles: {
      ios: { bundle_url: bundleUrl, sha256: await sha256(bundleText) },
    },
  };
  return [
    jsonResponse(manifest),
    new Response(bundleText, { headers: { 'Content-Type': 'text/plain' } }),
  ];
}

describe('remote configuration source adapter', () => {
  it('loads and verifies a manifest and immutable bundle', async () => {
    const [manifestResponse, bundleResponse] = await validResponses();
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(manifestResponse)
      .mockResolvedValueOnce(bundleResponse);

    const loaded = await loadRemoteConfig(manifestUrl, 'ios', fetcher);

    expect(loaded.channel).toBe('staging');
    expect(loaded.bundle.target).toEqual({
      format: 'sing-box',
      version: '1.14.0',
      client_type: 'ios',
    });
    expect(loaded.bundleSha256).toMatch(/^[0-9a-f]{64}$/u);
    expect(fetcher).toHaveBeenCalledTimes(2);
    for (const [url, init] of fetcher.mock.calls) {
      expect(url).toBeInstanceOf(URL);
      expect(init?.redirect).toBe('manual');
      expect(init?.cache).toBe('no-store');
    }
  });

  it('fails when the requested profile is absent', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({
        schema_version: 1,
        channel: 'staging',
        profiles: {
          macos: {
            bundle_url: `https://raw.githubusercontent.com/JAX1024Dev/Sub-Worker/${commit}/example/sing-box/published/macos.bundle.json`,
            sha256: 'b'.repeat(64),
          },
        },
      }),
    );

    await expect(loadRemoteConfig(manifestUrl, 'ios', fetcher)).rejects.toMatchObject({
      code: 'CONFIG_PROFILE_NOT_FOUND',
    });
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it('rejects a manifest whose declared channel does not match its URL', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({
        schema_version: 1,
        channel: 'production',
        profiles: { ios: { bundle_url: bundleUrl, sha256: 'b'.repeat(64) } },
      }),
    );

    await expect(loadRemoteConfig(manifestUrl, 'ios', fetcher)).rejects.toMatchObject({
      code: 'CONFIG_SOURCE_INVALID',
    });
  });

  it('rejects a bundle with a mismatched digest before parsing it', async () => {
    const manifest = jsonResponse({
      schema_version: 1,
      channel: 'staging',
      profiles: { ios: { bundle_url: bundleUrl, sha256: 'b'.repeat(64) } },
    });
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(manifest)
      .mockResolvedValueOnce(jsonResponse({ invalid: true }));

    await expect(loadRemoteConfig(manifestUrl, 'ios', fetcher)).rejects.toMatchObject({
      code: 'CONFIG_INTEGRITY_FAILED',
    });
  });

  it('rejects unknown bundle fields after digest verification', async () => {
    const invalidBundle = { ...iosBundle, unexpected: true };
    const bundleText = JSON.stringify(invalidBundle);
    const manifest = jsonResponse({
      schema_version: 1,
      channel: 'staging',
      profiles: { ios: { bundle_url: bundleUrl, sha256: await sha256(bundleText) } },
    });
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(manifest)
      .mockResolvedValueOnce(
        new Response(bundleText, { headers: { 'Content-Type': 'application/json' } }),
      );

    await expect(loadRemoteConfig(manifestUrl, 'ios', fetcher)).rejects.toMatchObject({
      code: 'CONFIG_SOURCE_INVALID',
    });
  });

  it.each([
    new Response(null, { status: 302, headers: { Location: 'https://example.invalid/' } }),
    new Response('{}', { headers: { 'Content-Type': 'text/html' } }),
    new Response(new Uint8Array(remoteConfigLimits.manifestBytes + 1), {
      headers: { 'Content-Type': 'application/json' },
    }),
  ])('rejects redirect, content-type, and streamed size violations', async (response) => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response);
    await expect(loadRemoteConfig(manifestUrl, 'ios', fetcher)).rejects.toMatchObject({
      code: 'CONFIG_SOURCE_INVALID',
    });
  });

  it('rejects an oversized declared response without reading it', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response('{}', {
        headers: {
          'Content-Length': String(remoteConfigLimits.manifestBytes + 1),
          'Content-Type': 'application/json',
        },
      }),
    );

    await expect(loadRemoteConfig(manifestUrl, 'ios', fetcher)).rejects.toMatchObject({
      code: 'CONFIG_SOURCE_INVALID',
    });
  });

  it('maps network, timeout, and HTTP failures to source unavailable', async () => {
    const networkFailure = vi.fn<typeof fetch>().mockRejectedValue(new Error('network detail'));
    const timeout = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new DOMException('timed out', 'TimeoutError'));
    const httpFailure = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(null, { status: 503 }));

    await expect(loadRemoteConfig(manifestUrl, 'ios', networkFailure)).rejects.toMatchObject({
      code: 'CONFIG_SOURCE_UNAVAILABLE',
    });
    await expect(loadRemoteConfig(manifestUrl, 'ios', timeout)).rejects.toMatchObject({
      code: 'CONFIG_SOURCE_UNAVAILABLE',
    });
    await expect(loadRemoteConfig(manifestUrl, 'ios', httpFailure)).rejects.toMatchObject({
      code: 'CONFIG_SOURCE_UNAVAILABLE',
    });
  });
});
