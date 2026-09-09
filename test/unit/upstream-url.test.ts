import { describe, expect, it } from 'vitest';

import { ServiceError } from '../../src/domain/errors';
import { buildSubscriptionUrl, parseSubscriptionBaseUrl } from '../../src/security/upstream-url';

describe('upstream URL policy', () => {
  it('appends an allowed subscription ID as one path segment', () => {
    expect(
      buildSubscriptionUrl('https://subscription.example.invalid/mainsub/', 'example_id-1').href,
    ).toBe('https://subscription.example.invalid/mainsub/example_id-1');
  });

  it.each([
    'http://subscription.example.invalid/mainsub/',
    'https://localhost/mainsub/',
    'https://127.0.0.1/mainsub/',
    'https://10.0.0.1/mainsub/',
    'https://169.254.169.254/mainsub/',
    'https://[::1]/mainsub/',
    'https://[::ffff:127.0.0.1]/mainsub/',
    'https://[fd00::1]/mainsub/',
    'https://[ff02::1]/mainsub/',
    'https://user:password@subscription.example.invalid/mainsub/',
    'https://subscription.example.invalid/mainsub/?source=other',
    'https://subscription.example.invalid/mainsub/#fragment',
    'https://subscription.example.invalid/mainsub',
  ])('rejects unsafe base URL %s', (value) => {
    expect(() => parseSubscriptionBaseUrl(value)).toThrow(ServiceError);
  });

  it.each(['', '../secret', 'id/another', 'white space', '%252f'])(
    'rejects unsafe ID %s',
    (value) => {
      expect(() =>
        buildSubscriptionUrl('https://subscription.example.invalid/mainsub/', value),
      ).toThrow(ServiceError);
    },
  );
});
