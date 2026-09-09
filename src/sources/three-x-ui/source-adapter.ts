import { ServiceError } from '../../domain/errors';
import { containsControlCharacters } from '../../security/text';
import { buildSubscriptionUrl } from '../../security/upstream-url';
import { decodeSubscription, subscriptionLimits } from './subscription-decoder';
import type { SubscriptionDocument, SubscriptionMetadata } from './subscription-document';

const metadataHeaders = {
  announce: 'Announce',
  profileTitle: 'Profile-Title',
  profileUpdateInterval: 'Profile-Update-Interval',
  profileWebPageUrl: 'Profile-Web-Page-Url',
  subscriptionUserinfo: 'Subscription-Userinfo',
  supportUrl: 'Support-Url',
} as const;

const upstreamTimeoutMilliseconds = 10_000;

function readMetadata(headers: Headers): SubscriptionMetadata {
  const metadata: SubscriptionMetadata = {};

  for (const [property, header] of Object.entries(metadataHeaders)) {
    const value = headers.get(header);
    if (value !== null && value.length <= 1024 && !containsControlCharacters(value)) {
      metadata[property as keyof SubscriptionMetadata] = value;
    }
  }

  return metadata;
}

async function readBoundedBody(response: Response): Promise<Uint8Array> {
  const declaredLength = response.headers.get('Content-Length');
  if (declaredLength !== null) {
    const parsedLength = Number(declaredLength);
    if (
      !Number.isSafeInteger(parsedLength) ||
      parsedLength < 0 ||
      parsedLength > subscriptionLimits.encodedBytes
    ) {
      throw new ServiceError('UPSTREAM_RESPONSE_TOO_LARGE', 'Subscription response is too large.');
    }
  }

  if (response.body === null) {
    throw new ServiceError('INVALID_SUBSCRIPTION', 'Subscription response is empty.');
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  let result = await reader.read();
  while (!result.done) {
    const value: unknown = result.value;
    if (!(value instanceof Uint8Array)) {
      await reader.cancel();
      throw new ServiceError('INVALID_SUBSCRIPTION', 'Subscription response body is invalid.');
    }

    totalBytes += value.byteLength;
    if (totalBytes > subscriptionLimits.encodedBytes) {
      await reader.cancel();
      throw new ServiceError('UPSTREAM_RESPONSE_TOO_LARGE', 'Subscription response is too large.');
    }
    chunks.push(value);
    result = await reader.read();
  }

  const body = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

export async function fetchSubscription(
  baseUrl: string,
  subscriptionId: string,
  fetcher: typeof fetch = fetch,
): Promise<SubscriptionDocument> {
  const upstreamUrl = buildSubscriptionUrl(baseUrl, subscriptionId);
  let response: Response;

  try {
    response = await fetcher(upstreamUrl, {
      headers: { Accept: 'text/plain, application/octet-stream' },
      redirect: 'manual',
      signal: AbortSignal.timeout(upstreamTimeoutMilliseconds),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'TimeoutError') {
      throw new ServiceError('UPSTREAM_TIMEOUT', 'Subscription upstream timed out.', {
        cause: error,
      });
    }
    throw new ServiceError('UPSTREAM_ERROR', 'Subscription upstream request failed.', {
      cause: error,
    });
  }

  if (response.status === 401 || response.status === 403 || response.status === 404) {
    await response.body?.cancel();
    throw new ServiceError('SUBSCRIPTION_NOT_FOUND', 'Subscription is unavailable.');
  }
  if (response.status >= 300 && response.status < 400) {
    await response.body?.cancel();
    throw new ServiceError('UPSTREAM_REDIRECT', 'Subscription upstream redirected the request.');
  }
  if (!response.ok) {
    await response.body?.cancel();
    throw new ServiceError('UPSTREAM_ERROR', 'Subscription upstream returned an error.');
  }

  const metadata = readMetadata(response.headers);
  return decodeSubscription(await readBoundedBody(response), metadata);
}
