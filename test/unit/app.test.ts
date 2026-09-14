import { exports } from 'cloudflare:workers';
import { describe, expect, it, vi } from 'vitest';

import { handleRequest } from '../../src/api/router';
import type { GenerateSubscriptionOptions } from '../../src/application/generate-subscription';
import { ServiceError, type ServiceErrorCode } from '../../src/domain/errors';
import { composeSingBoxConfig } from '../../src/renderers/sing-box/composer';
import { fakeCanonicalNode } from '../fixtures/fake-node';

describe('worker API', () => {
  it('reports its health', async () => {
    const response = await exports.default.fetch(new Request('https://example.test/health'));

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    await expect(response.json()).resolves.toEqual({ service: 'sub-worker', status: 'ok' });
  });

  it('returns a generated configuration and allowed metadata', async () => {
    const generator = vi.fn((options: GenerateSubscriptionOptions) =>
      Promise.resolve({
        config: composeSingBoxConfig([fakeCanonicalNode], options.clientType),
        metadata: {
          profileTitle: 'Example',
          subscriptionUserinfo: 'upload=1; download=2',
        },
      }),
    );
    const response = await handleRequest(
      new Request('https://example.test/v1/sing-box/linux/example-subscription-id'),
      { THREE_X_UI_SUB_BASE_URL: 'https://subscription.example.invalid/mainsub/' },
      generator,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('profile-title')).toBe('Example');
    expect(response.headers.get('subscription-userinfo')).toBe('upload=1; download=2');
    expect(response.headers.get('content-disposition')).toBe(
      'attachment; filename="sing-box-linux.json"',
    );
    expect(await response.json()).toMatchObject({
      dns: { final: 'dns-global' },
      route: { final: 'proxy' },
    });
    expect(generator).toHaveBeenCalledWith({
      baseUrl: 'https://subscription.example.invalid/mainsub/',
      clientType: 'linux',
      iosRoutingMode: 'native-bypass',
      subscriptionId: 'example-subscription-id',
    });
  });

  it('passes the staging dual-stack mode into iOS generation', async () => {
    const generator = vi.fn((options: GenerateSubscriptionOptions) =>
      Promise.resolve({
        config: composeSingBoxConfig([fakeCanonicalNode], options.clientType, {
          ...(options.iosRoutingMode === undefined
            ? {}
            : { iosRoutingMode: options.iosRoutingMode }),
        }),
        metadata: {},
      }),
    );
    const response = await handleRequest(
      new Request('https://example.test/v1/sing-box/ios/example-subscription-id'),
      {
        THREE_X_UI_SUB_BASE_URL: 'https://subscription.example.invalid/mainsub/',
        IOS_ROUTING_MODE: 'tun-dual-stack',
      },
      generator,
    );

    expect(response.status).toBe(200);
    expect(generator).toHaveBeenCalledWith({
      baseUrl: 'https://subscription.example.invalid/mainsub/',
      clientType: 'ios',
      iosRoutingMode: 'tun-dual-stack',
      subscriptionId: 'example-subscription-id',
    });
  });

  it('rejects unsupported methods', async () => {
    const response = await exports.default.fetch(
      new Request('https://example.test/health', { method: 'POST' }),
    );

    expect(response.status).toBe(405);
    expect(response.headers.get('allow')).toBe('GET');
  });

  it.each([
    '/v1/sing-box/unknown/example-id',
    '/v1/sing-box/linux/invalid%2Fid',
    '/v1/sing-box/linux/invalid%252fid',
    `/v1/sing-box/linux/${'a'.repeat(129)}`,
    '/v1/sing-box/linux/example-id?upstream=https://other.invalid',
  ])('rejects invalid subscription request %s', async (pathname) => {
    const response = await exports.default.fetch(new Request(`https://example.test${pathname}`));

    expect(response.status).toBe(400);
  });

  it('returns 404 for unrelated routes', async () => {
    const response = await exports.default.fetch(new Request('https://example.test/not-found'));

    expect(response.status).toBe(404);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
  });

  it.each<[ServiceErrorCode, number]>([
    ['INVALID_SUBSCRIPTION_ID', 400],
    ['SUBSCRIPTION_NOT_FOUND', 404],
    ['NO_COMPATIBLE_NODES', 422],
    ['INVALID_BASE_URL', 502],
    ['INVALID_SUBSCRIPTION', 502],
    ['UPSTREAM_ERROR', 502],
    ['UPSTREAM_REDIRECT', 502],
    ['UPSTREAM_RESPONSE_TOO_LARGE', 502],
    ['UPSTREAM_TIMEOUT', 504],
  ])('maps %s to HTTP %i without exposing internal details', async (code, status) => {
    const response = await handleRequest(
      new Request('https://example.test/v1/sing-box/linux/example-id'),
      { THREE_X_UI_SUB_BASE_URL: 'https://subscription.example.invalid/mainsub/' },
      () => Promise.reject(new ServiceError(code, 'sensitive-internal-detail')),
    );
    const body = await response.text();

    expect(response.status).toBe(status);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.get('x-request-id')).toBeTruthy();
    expect(body).not.toContain('sensitive-internal-detail');
  });

  it('sanitizes unexpected errors and emits only a structured error code', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const response = await handleRequest(
      new Request('https://example.test/v1/sing-box/linux/example-id'),
      { THREE_X_UI_SUB_BASE_URL: 'https://subscription.example.invalid/mainsub/' },
      () => Promise.reject(new Error('sensitive-internal-detail')),
    );
    const body = await response.text();

    expect(response.status).toBe(500);
    expect(body).not.toContain('sensitive-internal-detail');
    expect(consoleError).toHaveBeenCalledOnce();
    expect(consoleError.mock.calls[0]?.[0]).not.toContain('sensitive-internal-detail');
    consoleError.mockRestore();
  });
});
