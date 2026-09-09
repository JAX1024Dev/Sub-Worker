import { ServiceError } from '../../domain/errors';
import type { SubscriptionDocument, SubscriptionMetadata } from './subscription-document';

export const subscriptionLimits = {
  decodedBytes: 1024 * 1024,
  encodedBytes: 1024 * 1024,
  lineBytes: 8192,
  nodes: 500,
} as const;

function decodeUtf8(bytes: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(bytes);
  } catch (error) {
    throw new ServiceError('INVALID_SUBSCRIPTION', 'Subscription is not valid UTF-8.', {
      cause: error,
    });
  }
}

function decodeBase64(value: string): string | undefined {
  const compact = value.replaceAll(/\s/g, '');
  if (compact.length < 4 || compact.length % 4 === 1 || !/^[A-Za-z0-9+/_-]*={0,2}$/.test(compact)) {
    return undefined;
  }

  const unpadded = compact.replace(/=+$/, '').replaceAll('-', '+').replaceAll('_', '/');
  const padded = unpadded.padEnd(Math.ceil(unpadded.length / 4) * 4, '=');

  try {
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    if (bytes.byteLength > subscriptionLimits.decodedBytes) {
      throw new ServiceError('UPSTREAM_RESPONSE_TOO_LARGE', 'Decoded subscription is too large.');
    }
    return decodeUtf8(bytes);
  } catch (error) {
    if (error instanceof ServiceError) {
      throw error;
    }
    return undefined;
  }
}

function splitLinks(value: string): string[] {
  const normalized = value.replace(/^\uFEFF/, '').trim();
  const lines = normalized
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '');

  if (lines.length === 0 || lines.length > subscriptionLimits.nodes) {
    throw new ServiceError('INVALID_SUBSCRIPTION', 'Subscription node count is invalid.');
  }

  for (const line of lines) {
    if (
      new TextEncoder().encode(line).byteLength > subscriptionLimits.lineBytes ||
      !/^[A-Za-z][A-Za-z0-9+.-]*:\/\/[^\s]+$/.test(line)
    ) {
      throw new ServiceError(
        'INVALID_SUBSCRIPTION',
        'Subscription contains an invalid share link.',
      );
    }
  }

  return lines;
}

export function decodeSubscription(
  encodedBody: Uint8Array,
  metadata: SubscriptionMetadata = {},
): SubscriptionDocument {
  if (encodedBody.byteLength === 0 || encodedBody.byteLength > subscriptionLimits.encodedBytes) {
    throw new ServiceError('UPSTREAM_RESPONSE_TOO_LARGE', 'Subscription response size is invalid.');
  }

  const body = decodeUtf8(encodedBody);
  const decoded = decodeBase64(body);
  return { links: splitLinks(decoded ?? body), metadata };
}
