import { describe, expect, it, vi } from 'vitest';

import iosBundle from '../../example/sing-box/published/ios.bundle.json';
import { generateSubscription } from '../../src/application/generate-subscription';
import { fakeCanonicalNode } from '../fixtures/fake-node';

const commit = 'a'.repeat(40);
const manifestUrl =
  'https://raw.githubusercontent.com/JAX1024Dev/Sub-Worker/main/example/sing-box/channels/staging.json';
const bundleUrl = `https://raw.githubusercontent.com/JAX1024Dev/Sub-Worker/${commit}/example/sing-box/published/ios.bundle.json`;

function encodeSubscription(...links: string[]): string {
  return btoa(links.join('\n'));
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function createConfigFetcher(): Promise<ReturnType<typeof vi.fn<typeof fetch>>> {
  const bundleText = JSON.stringify(iosBundle);
  const manifest = {
    schema_version: 1,
    channel: 'staging',
    profiles: {
      ios: { bundle_url: bundleUrl, sha256: await sha256(bundleText) },
    },
  };
  return vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(
      new Response(JSON.stringify(manifest), {
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    .mockResolvedValueOnce(
      new Response(bundleText, { headers: { 'Content-Type': 'application/json' } }),
    );
}

describe('generateSubscription', () => {
  it('keeps compatible nodes while ignoring unsupported links', async () => {
    const compatible =
      `vless://${fakeCanonicalNode.uuid}@${fakeCanonicalNode.server}:${String(fakeCanonicalNode.serverPort)}` +
      `?type=tcp&security=reality&pbk=${fakeCanonicalNode.reality.publicKey}` +
      `&sni=${fakeCanonicalNode.reality.serverName}#Example`;
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response(encodeSubscription('trojan://secret@example.invalid:443', compatible)),
      );
    const configFetcher = await createConfigFetcher();

    const result = await generateSubscription({
      baseUrl: 'https://subscription.example.invalid/mainsub/',
      clientType: 'ios',
      manifestUrl,
      subscriptionId: 'example-id',
      configFetcher,
      fetcher,
    });

    expect(result.config.outbounds.filter((outbound) => outbound.type === 'vless')).toHaveLength(1);
    expect(result.configuration.channel).toBe('staging');
    expect(result.configuration.bundleSha256).toMatch(/^[0-9a-f]{64}$/u);
    expect(configFetcher).toHaveBeenCalledTimes(2);
  });

  it('fails when the subscription has no compatible nodes', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(encodeSubscription('trojan://secret@example.invalid:443')));
    const configFetcher = vi.fn<typeof fetch>();

    await expect(
      generateSubscription({
        baseUrl: 'https://subscription.example.invalid/mainsub/',
        clientType: 'linux',
        manifestUrl,
        subscriptionId: 'example-id',
        configFetcher,
        fetcher,
      }),
    ).rejects.toMatchObject({ code: 'NO_COMPATIBLE_NODES' });
    expect(configFetcher).not.toHaveBeenCalled();
  });

  it('fails closed when the remote configuration source is unavailable', async () => {
    const compatible =
      `vless://${fakeCanonicalNode.uuid}@${fakeCanonicalNode.server}:${String(fakeCanonicalNode.serverPort)}` +
      `?type=tcp&security=reality&pbk=${fakeCanonicalNode.reality.publicKey}` +
      `&sni=${fakeCanonicalNode.reality.serverName}#Example`;
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(encodeSubscription(compatible)));
    const configFetcher = vi.fn<typeof fetch>().mockRejectedValue(new Error('network detail'));

    await expect(
      generateSubscription({
        baseUrl: 'https://subscription.example.invalid/mainsub/',
        clientType: 'ios',
        manifestUrl,
        subscriptionId: 'example-id',
        configFetcher,
        fetcher,
      }),
    ).rejects.toMatchObject({ code: 'CONFIG_SOURCE_UNAVAILABLE' });
  });

  it('does not contact GitHub when the subscription request fails', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 404 }));
    const configFetcher = vi.fn<typeof fetch>();

    await expect(
      generateSubscription({
        baseUrl: 'https://subscription.example.invalid/mainsub/',
        clientType: 'ios',
        manifestUrl,
        subscriptionId: 'missing-id',
        configFetcher,
        fetcher,
      }),
    ).rejects.toMatchObject({ code: 'SUBSCRIPTION_NOT_FOUND' });
    expect(configFetcher).not.toHaveBeenCalled();
  });
});
