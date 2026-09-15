import type { ClientType } from '../../domain/canonical-node';
import { ServiceError } from '../../domain/errors';

const allowedOrigin = 'https://raw.githubusercontent.com';
const allowedOwner = 'JAX1024Dev';
const allowedRepository = 'Sub-Worker';
const commitShaPattern = /^[0-9a-f]{40}$/u;

function parseApprovedUrl(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch (error) {
    throw new ServiceError('CONFIG_SOURCE_INVALID', 'Remote configuration URL is invalid.', {
      cause: error,
    });
  }

  if (
    url.origin !== allowedOrigin ||
    url.username !== '' ||
    url.password !== '' ||
    url.search !== '' ||
    url.hash !== '' ||
    url.pathname.includes('%')
  ) {
    throw new ServiceError('CONFIG_SOURCE_INVALID', 'Remote configuration URL is not approved.');
  }
  const segments = splitPath(url);
  if (url.pathname !== `/${segments.join('/')}`) {
    throw new ServiceError('CONFIG_SOURCE_INVALID', 'Remote configuration URL is not canonical.');
  }
  return url;
}

function splitPath(url: URL): string[] {
  return url.pathname.split('/').filter((segment) => segment !== '');
}

export function validateManifestUrl(value: string): URL {
  const url = parseApprovedUrl(value);
  const segments = splitPath(url);
  const valid =
    segments.length === 7 &&
    segments[0] === allowedOwner &&
    segments[1] === allowedRepository &&
    segments[2] === 'main' &&
    segments[3] === 'example' &&
    segments[4] === 'sing-box' &&
    segments[5] === 'channels' &&
    (segments[6] === 'staging.json' || segments[6] === 'production.json');

  if (!valid) {
    throw new ServiceError('CONFIG_SOURCE_INVALID', 'Manifest URL is outside the approved path.');
  }
  return url;
}

export function validateBundleUrl(value: string, clientType: ClientType): URL {
  const url = parseApprovedUrl(value);
  const segments = splitPath(url);
  const valid =
    segments.length === 7 &&
    segments[0] === allowedOwner &&
    segments[1] === allowedRepository &&
    commitShaPattern.test(segments[2] ?? '') &&
    segments[3] === 'example' &&
    segments[4] === 'sing-box' &&
    segments[5] === 'published' &&
    segments[6] === `${clientType}.bundle.json`;

  if (!valid) {
    throw new ServiceError('CONFIG_SOURCE_INVALID', 'Bundle URL is outside the approved path.');
  }
  return url;
}
