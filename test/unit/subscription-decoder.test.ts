import { describe, expect, it } from 'vitest';

import { ServiceError } from '../../src/domain/errors';
import {
  decodeSubscription,
  subscriptionLimits,
} from '../../src/sources/three-x-ui/subscription-decoder';

const encoder = new TextEncoder();
const fakeLink =
  'vless://01234567-89ab-cdef-0123-456789abcdef@node.example.invalid:443?type=tcp&security=reality&pbk=abcdefghijklmnopqrstuvwxyzABCDEFGH123456789&sni=www.example.com#Example';

describe('decodeSubscription', () => {
  it('decodes a Base64 subscription', () => {
    const encoded = btoa(fakeLink);
    expect(decodeSubscription(encoder.encode(encoded)).links).toEqual([fakeLink]);
  });

  it('accepts a plaintext share-link list', () => {
    expect(decodeSubscription(encoder.encode(`${fakeLink}\n${fakeLink}`)).links).toHaveLength(2);
  });

  it('rejects non-subscription content', () => {
    expect(() => decodeSubscription(encoder.encode('<html>not a subscription</html>'))).toThrow(
      ServiceError,
    );
  });

  it('rejects invalid UTF-8', () => {
    expect(() => decodeSubscription(Uint8Array.of(0xc3, 0x28))).toThrow(ServiceError);
  });

  it('rejects excessive node counts and line lengths', () => {
    const tooManyNodes = Array.from({ length: subscriptionLimits.nodes + 1 }, () => fakeLink).join(
      '\n',
    );
    const oversizedLine = `vless://${'a'.repeat(subscriptionLimits.lineBytes)}`;

    expect(() => decodeSubscription(encoder.encode(tooManyNodes))).toThrow(ServiceError);
    expect(() => decodeSubscription(encoder.encode(oversizedLine))).toThrow(ServiceError);
  });

  it('rejects empty and oversized encoded bodies', () => {
    expect(() => decodeSubscription(new Uint8Array())).toThrow(ServiceError);
    expect(() => decodeSubscription(new Uint8Array(subscriptionLimits.encodedBytes + 1))).toThrow(
      ServiceError,
    );
  });
});
