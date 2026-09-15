import type { ClientType } from '../../domain/canonical-node';
import { ServiceError } from '../../domain/errors';
import { parseStrictJson } from './strict-json';
import type { RemoteConfigBundle } from './types';
import { validateBundleUrl, validateManifestUrl } from './url-policy';
import { parseChannelManifest, parseRemoteConfigBundle } from './validator';

export const remoteConfigLimits = {
  manifestBytes: 64 * 1024,
  bundleBytes: 512 * 1024,
  timeoutMilliseconds: 5_000,
} as const;

export interface LoadedRemoteConfig {
  bundle: RemoteConfigBundle;
  bundleSha256: string;
  channel: 'staging' | 'production';
}

function sourceError(message: string, options?: ErrorOptions): ServiceError {
  return new ServiceError('CONFIG_SOURCE_UNAVAILABLE', message, options);
}

async function cancelBody(response: Response): Promise<void> {
  try {
    await response.body?.cancel();
  } catch {
    // The response is already being rejected; cancellation is best effort.
  }
}

function validateContentType(response: Response): void {
  const contentType = response.headers.get('Content-Type')?.split(';', 1)[0]?.trim().toLowerCase();
  if (contentType !== 'application/json' && contentType !== 'text/plain') {
    throw new ServiceError(
      'CONFIG_SOURCE_INVALID',
      'Configuration source content type is invalid.',
    );
  }
}

async function readBoundedBody(
  response: Response,
  limit: number,
): Promise<Uint8Array<ArrayBuffer>> {
  const declaredLength = response.headers.get('Content-Length');
  if (declaredLength !== null) {
    const parsedLength = Number(declaredLength);
    if (!Number.isSafeInteger(parsedLength) || parsedLength < 0 || parsedLength > limit) {
      await cancelBody(response);
      throw new ServiceError('CONFIG_SOURCE_INVALID', 'Configuration source is too large.');
    }
  }

  if (response.body === null) {
    throw new ServiceError('CONFIG_SOURCE_INVALID', 'Configuration source body is empty.');
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  let result = await reader.read();

  while (!result.done) {
    const value: unknown = result.value;
    if (!(value instanceof Uint8Array)) {
      try {
        await reader.cancel();
      } catch {
        // The response is already being rejected; cancellation is best effort.
      }
      throw new ServiceError('CONFIG_SOURCE_INVALID', 'Configuration source body is invalid.');
    }
    totalBytes += value.byteLength;
    if (totalBytes > limit) {
      try {
        await reader.cancel();
      } catch {
        // The response is already being rejected; cancellation is best effort.
      }
      throw new ServiceError('CONFIG_SOURCE_INVALID', 'Configuration source is too large.');
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

async function fetchJsonBytes(
  url: URL,
  limit: number,
  fetcher: typeof fetch,
): Promise<Uint8Array<ArrayBuffer>> {
  let response: Response;
  try {
    response = await fetcher(url, {
      cache: 'no-store',
      headers: {
        Accept: 'application/json, text/plain',
        'Cache-Control': 'no-cache',
      },
      redirect: 'manual',
      signal: AbortSignal.timeout(remoteConfigLimits.timeoutMilliseconds),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'TimeoutError') {
      throw sourceError('Configuration source timed out.', { cause: error });
    }
    throw sourceError('Configuration source request failed.', { cause: error });
  }

  if (response.status >= 300 && response.status < 400) {
    await cancelBody(response);
    throw new ServiceError('CONFIG_SOURCE_INVALID', 'Configuration source redirected.');
  }
  if (!response.ok) {
    await cancelBody(response);
    throw sourceError('Configuration source returned an error.');
  }

  try {
    validateContentType(response);
  } catch (error) {
    await cancelBody(response);
    throw error;
  }
  try {
    return await readBoundedBody(response, limit);
  } catch (error) {
    if (error instanceof ServiceError) throw error;
    throw sourceError('Configuration source body could not be read.', { cause: error });
  }
}

async function sha256Hex(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('');
}

export async function loadRemoteConfig(
  manifestUrl: string,
  clientType: ClientType,
  fetcher: typeof fetch = fetch,
): Promise<LoadedRemoteConfig> {
  const approvedManifestUrl = validateManifestUrl(manifestUrl);
  const manifestBytes = await fetchJsonBytes(
    approvedManifestUrl,
    remoteConfigLimits.manifestBytes,
    fetcher,
  );
  const manifest = parseChannelManifest(parseStrictJson(manifestBytes));
  if (!approvedManifestUrl.pathname.endsWith(`/channels/${manifest.channel}.json`)) {
    throw new ServiceError('CONFIG_SOURCE_INVALID', 'Configuration manifest channel is invalid.');
  }
  const profile = manifest.profiles[clientType];
  if (profile === undefined) {
    throw new ServiceError('CONFIG_PROFILE_NOT_FOUND', 'Configuration profile is unavailable.');
  }

  const approvedBundleUrl = validateBundleUrl(profile.bundle_url, clientType);
  const bundleBytes = await fetchJsonBytes(
    approvedBundleUrl,
    remoteConfigLimits.bundleBytes,
    fetcher,
  );
  const actualSha256 = await sha256Hex(bundleBytes);
  if (actualSha256 !== profile.sha256) {
    throw new ServiceError('CONFIG_INTEGRITY_FAILED', 'Configuration bundle digest mismatch.');
  }

  return {
    bundle: parseRemoteConfigBundle(parseStrictJson(bundleBytes), clientType),
    bundleSha256: actualSha256,
    channel: manifest.channel,
  };
}
