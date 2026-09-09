import { describe, expect, it, vi } from 'vitest';

import { fetchSubscription } from '../../src/sources/three-x-ui/source-adapter';
import { subscriptionLimits } from '../../src/sources/three-x-ui/subscription-decoder';

const fakeLink =
  'vless://01234567-89ab-cdef-0123-456789abcdef@node.example.invalid:443?type=tcp&security=reality&pbk=abcdefghijklmnopqrstuvwxyzABCDEFGH123456789&sni=www.example.com';

describe('3x-ui source adapter', () => {
  it('fetches once without redirects and returns decoded links', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(btoa(fakeLink), {
        headers: {
          'Profile-Title': 'Example subscription',
          'Set-Cookie': 'must-not-be-forwarded=true',
        },
      }),
    );

    const document = await fetchSubscription(
      'https://subscription.example.invalid/mainsub/',
      'example-id',
      fetcher,
    );

    expect(document).toEqual({
      links: [fakeLink],
      metadata: { profileTitle: 'Example subscription' },
    });
    expect(fetcher).toHaveBeenCalledOnce();
    const [url, init] = fetcher.mock.calls[0] ?? [];
    expect(url).toBeInstanceOf(URL);
    if (!(url instanceof URL)) {
      throw new TypeError('Expected the source adapter to call fetch with a URL.');
    }
    expect(url.pathname).toBe('/mainsub/example-id');
    expect(init?.redirect).toBe('manual');
  });

  it('maps rejected IDs without consuming their body', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 404 }));

    await expect(
      fetchSubscription('https://subscription.example.invalid/mainsub/', 'missing-id', fetcher),
    ).rejects.toMatchObject({ code: 'SUBSCRIPTION_NOT_FOUND' });
  });

  it('rejects redirects', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response(null, { headers: { Location: 'https://other.invalid/' }, status: 302 }),
      );

    await expect(
      fetchSubscription('https://subscription.example.invalid/mainsub/', 'example-id', fetcher),
    ).rejects.toMatchObject({ code: 'UPSTREAM_REDIRECT' });
  });

  it('maps upstream server and network failures', async () => {
    const serverFailure = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(null, { status: 503 }));
    const networkFailure = vi.fn<typeof fetch>().mockRejectedValue(new Error('network detail'));

    await expect(
      fetchSubscription(
        'https://subscription.example.invalid/mainsub/',
        'example-id',
        serverFailure,
      ),
    ).rejects.toMatchObject({ code: 'UPSTREAM_ERROR' });
    await expect(
      fetchSubscription(
        'https://subscription.example.invalid/mainsub/',
        'example-id',
        networkFailure,
      ),
    ).rejects.toMatchObject({ code: 'UPSTREAM_ERROR' });
  });

  it('maps timeout failures separately', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new DOMException('timed out', 'TimeoutError'));

    await expect(
      fetchSubscription('https://subscription.example.invalid/mainsub/', 'example-id', fetcher),
    ).rejects.toMatchObject({ code: 'UPSTREAM_TIMEOUT' });
  });

  it('rejects oversized declared and streamed bodies', async () => {
    const declared = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(fakeLink, {
        headers: { 'Content-Length': String(subscriptionLimits.encodedBytes + 1) },
      }),
    );
    const streamed = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(new Uint8Array(subscriptionLimits.encodedBytes + 1)));

    await expect(
      fetchSubscription('https://subscription.example.invalid/mainsub/', 'example-id', declared),
    ).rejects.toMatchObject({ code: 'UPSTREAM_RESPONSE_TOO_LARGE' });
    await expect(
      fetchSubscription('https://subscription.example.invalid/mainsub/', 'example-id', streamed),
    ).rejects.toMatchObject({ code: 'UPSTREAM_RESPONSE_TOO_LARGE' });
  });

  it('drops metadata outside the allowlist and values over the length limit', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(fakeLink, {
        headers: {
          'Profile-Title': 'x'.repeat(1025),
          'Support-Url': 'https://support.example.invalid/',
          'Set-Cookie': 'secret=value',
        },
      }),
    );

    const document = await fetchSubscription(
      'https://subscription.example.invalid/mainsub/',
      'example-id',
      fetcher,
    );

    expect(document.metadata).toEqual({ supportUrl: 'https://support.example.invalid/' });
  });
});
