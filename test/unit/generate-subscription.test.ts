import { describe, expect, it, vi } from 'vitest';

import { generateSubscription } from '../../src/application/generate-subscription';
import { fakeCanonicalNode } from '../fixtures/fake-node';

function encodeSubscription(...links: string[]): string {
  return btoa(links.join('\n'));
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

    const result = await generateSubscription({
      baseUrl: 'https://subscription.example.invalid/mainsub/',
      clientType: 'ios',
      subscriptionId: 'example-id',
      fetcher,
    });

    expect(result.config.outbounds.filter((outbound) => outbound.type === 'vless')).toHaveLength(1);
  });

  it('fails when the subscription has no compatible nodes', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(encodeSubscription('trojan://secret@example.invalid:443')));

    await expect(
      generateSubscription({
        baseUrl: 'https://subscription.example.invalid/mainsub/',
        clientType: 'linux',
        subscriptionId: 'example-id',
        fetcher,
      }),
    ).rejects.toMatchObject({ code: 'NO_COMPATIBLE_NODES' });
  });
});
