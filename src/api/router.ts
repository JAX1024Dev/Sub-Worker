import {
  generateSubscription,
  type GenerateSubscriptionOptions,
  type GeneratedSubscription,
} from '../application/generate-subscription';
import { ServiceError, type ServiceErrorCode } from '../domain/errors';
import { parseClientType, validateSubscriptionId } from '../security/subscription-input';
import type { SubscriptionMetadata } from '../sources/three-x-ui/subscription-document';

const commonHeaders = {
  'Cache-Control': 'private, no-store',
  'Content-Type': 'application/json; charset=utf-8',
  'X-Content-Type-Options': 'nosniff',
} as const;

const metadataHeaders: ReadonlyArray<readonly [keyof SubscriptionMetadata, string]> = [
  ['announce', 'Announce'],
  ['profileTitle', 'Profile-Title'],
  ['profileUpdateInterval', 'Profile-Update-Interval'],
  ['profileWebPageUrl', 'Profile-Web-Page-Url'],
  ['subscriptionUserinfo', 'Subscription-Userinfo'],
  ['supportUrl', 'Support-Url'],
];

type GenerateSubscription = (
  options: GenerateSubscriptionOptions,
) => Promise<GeneratedSubscription>;

function jsonResponse(body: unknown, status = 200, extraHeaders?: HeadersInit): Response {
  const headers = new Headers(commonHeaders);
  if (extraHeaders) {
    new Headers(extraHeaders).forEach((value, key) => {
      headers.set(key, value);
    });
  }
  return new Response(JSON.stringify(body, undefined, 2), { headers, status });
}

function errorResponse(
  code: string,
  message: string,
  status: number,
  requestId: string,
  extraHeaders?: HeadersInit,
): Response {
  const headers = new Headers(extraHeaders);
  headers.set('X-Request-Id', requestId);
  return jsonResponse({ error: { code, message, requestId } }, status, headers);
}

function serviceErrorStatus(code: ServiceErrorCode): number {
  switch (code) {
    case 'CONFIG_COMPOSITION_FAILED':
    case 'CONFIG_INTEGRITY_FAILED':
    case 'CONFIG_PROFILE_NOT_FOUND':
    case 'CONFIG_SOURCE_INVALID':
    case 'CONFIG_SOURCE_UNAVAILABLE':
    case 'INVALID_BASE_URL':
    case 'INVALID_SUBSCRIPTION':
    case 'UPSTREAM_ERROR':
    case 'UPSTREAM_REDIRECT':
    case 'UPSTREAM_RESPONSE_TOO_LARGE':
      return 502;
    case 'INVALID_SUBSCRIPTION_ID':
      return 400;
    case 'NO_COMPATIBLE_NODES':
      return 422;
    case 'SUBSCRIPTION_NOT_FOUND':
      return 404;
    case 'UPSTREAM_TIMEOUT':
      return 504;
  }
}

function publicErrorMessage(code: ServiceErrorCode): string {
  switch (code) {
    case 'CONFIG_COMPOSITION_FAILED':
    case 'CONFIG_INTEGRITY_FAILED':
    case 'CONFIG_PROFILE_NOT_FOUND':
    case 'CONFIG_SOURCE_INVALID':
    case 'CONFIG_SOURCE_UNAVAILABLE':
      return 'Configuration source is unavailable.';
    case 'INVALID_SUBSCRIPTION_ID':
      return 'Subscription ID is invalid.';
    case 'NO_COMPATIBLE_NODES':
      return 'No compatible nodes are available.';
    case 'SUBSCRIPTION_NOT_FOUND':
      return 'Subscription is unavailable.';
    case 'UPSTREAM_TIMEOUT':
      return 'Subscription upstream timed out.';
    case 'INVALID_BASE_URL':
    case 'INVALID_SUBSCRIPTION':
    case 'UPSTREAM_ERROR':
    case 'UPSTREAM_REDIRECT':
    case 'UPSTREAM_RESPONSE_TOO_LARGE':
      return 'Subscription upstream response is invalid.';
  }
}

function successHeaders(
  clientType: string,
  requestId: string,
  metadata: SubscriptionMetadata,
): Headers {
  const headers = new Headers({
    'Content-Disposition': `attachment; filename="sing-box-${clientType}.json"`,
    'X-Request-Id': requestId,
  });
  for (const [property, header] of metadataHeaders) {
    const value = metadata[property];
    if (value !== undefined) {
      headers.set(header, value);
    }
  }
  return headers;
}

export async function handleRequest(
  request: Request,
  env: Pick<Cloudflare.Env, 'SING_BOX_CONFIG_MANIFEST_URL' | 'THREE_X_UI_SUB_BASE_URL'>,
  generator: GenerateSubscription = generateSubscription,
): Promise<Response> {
  const requestId = crypto.randomUUID();

  if (request.method !== 'GET') {
    return errorResponse('METHOD_NOT_ALLOWED', 'Only GET requests are supported.', 405, requestId, {
      Allow: 'GET',
    });
  }

  const url = new URL(request.url);
  if (url.pathname === '/health') {
    return jsonResponse({ service: 'sub-worker', status: 'ok' }, 200, {
      'X-Request-Id': requestId,
    });
  }
  if (!url.pathname.startsWith('/v1/sing-box/')) {
    return errorResponse('NOT_FOUND', 'Route not found.', 404, requestId);
  }

  const segments = url.pathname.split('/');
  if (segments.length !== 5 || url.search !== '') {
    return errorResponse(
      'INVALID_REQUEST',
      'Subscription request path is invalid.',
      400,
      requestId,
    );
  }

  let clientTypeValue: string;
  let subscriptionId: string;
  try {
    clientTypeValue = decodeURIComponent(segments[3] ?? '');
    subscriptionId = decodeURIComponent(segments[4] ?? '');
  } catch {
    return errorResponse(
      'INVALID_REQUEST',
      'Subscription request path is invalid.',
      400,
      requestId,
    );
  }

  const clientType = parseClientType(clientTypeValue);
  if (clientType === undefined) {
    return errorResponse('INVALID_CLIENT_TYPE', 'Client type is not supported.', 400, requestId);
  }

  try {
    validateSubscriptionId(subscriptionId);
    const result = await generator({
      baseUrl: env.THREE_X_UI_SUB_BASE_URL,
      clientType,
      manifestUrl: env.SING_BOX_CONFIG_MANIFEST_URL,
      subscriptionId,
    });
    return jsonResponse(result.config, 200, successHeaders(clientType, requestId, result.metadata));
  } catch (error) {
    if (error instanceof ServiceError) {
      return errorResponse(
        error.code,
        publicErrorMessage(error.code),
        serviceErrorStatus(error.code),
        requestId,
      );
    }

    console.error(JSON.stringify({ code: 'INTERNAL_ERROR', requestId }));
    return errorResponse('INTERNAL_ERROR', 'An internal error occurred.', 500, requestId);
  }
}
