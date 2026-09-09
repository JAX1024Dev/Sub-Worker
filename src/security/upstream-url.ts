import { ServiceError } from '../domain/errors';
import { validateSubscriptionId } from './subscription-input';

const forbiddenHostnames = new Set(['localhost', 'localhost.localdomain']);

function isForbiddenIpv4(hostname: string): boolean {
  const octets = hostname.split('.').map(Number);
  if (
    octets.length !== 4 ||
    octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)
  ) {
    return false;
  }

  const [first = -1, second = -1] = octets;
  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168) ||
    (first === 198 && (second === 18 || second === 19)) ||
    first >= 224
  );
}

function isForbiddenIpv6(hostname: string): boolean {
  const normalized = hostname.replace(/^\[|\]$/g, '').toLowerCase();
  return (
    normalized === '::' ||
    normalized === '::1' ||
    normalized.startsWith('::ffff:') ||
    normalized.startsWith('fc') ||
    normalized.startsWith('fd') ||
    /^fe[89ab]/.test(normalized) ||
    normalized.startsWith('ff')
  );
}

export function parseSubscriptionBaseUrl(value: string): URL {
  let url: URL;

  try {
    url = new URL(value);
  } catch (error) {
    throw new ServiceError('INVALID_BASE_URL', 'Subscription base URL is invalid.', {
      cause: error,
    });
  }

  const hostname = url.hostname.toLowerCase();
  if (
    url.protocol !== 'https:' ||
    url.username !== '' ||
    url.password !== '' ||
    url.search !== '' ||
    url.hash !== '' ||
    !url.pathname.endsWith('/') ||
    hostname === '' ||
    forbiddenHostnames.has(hostname) ||
    hostname.endsWith('.localhost') ||
    isForbiddenIpv4(hostname) ||
    isForbiddenIpv6(hostname)
  ) {
    throw new ServiceError(
      'INVALID_BASE_URL',
      'Subscription base URL does not satisfy the upstream policy.',
    );
  }

  return url;
}

export function buildSubscriptionUrl(baseUrl: string, subscriptionId: string): URL {
  const url = parseSubscriptionBaseUrl(baseUrl);
  const id = validateSubscriptionId(subscriptionId);
  url.pathname += encodeURIComponent(id);
  return url;
}
