import type { CanonicalNode, IgnoredNodeReason } from '../domain/canonical-node';
import { containsControlCharacters, stripControlCharacters } from '../security/text';

export type NodeParseResult =
  { node: CanonicalNode; ok: true } | { ok: false; reason: IgnoredNodeReason };

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const publicKeyPattern = /^[A-Za-z0-9_-]{43}$/;
const shortIdPattern = /^(?:[0-9a-fA-F]{2}){1,8}$/;
const allowedFingerprints = new Set([
  '360',
  'android',
  'chrome',
  'edge',
  'firefox',
  'ios',
  'qq',
  'random',
  'randomized',
  'safari',
]);

function hasAmbiguousParameters(url: URL): boolean {
  return ['encryption', 'flow', 'fp', 'pbk', 'security', 'sid', 'sni', 'type'].some(
    (key) => url.searchParams.getAll(key).length > 1,
  );
}

function parseName(url: URL, sourceIndex: number): string | undefined {
  if (url.hash === '') {
    return `node-${String(sourceIndex + 1)}`;
  }

  try {
    const name = stripControlCharacters(decodeURIComponent(url.hash.slice(1))).trim();
    return name === '' ? `node-${String(sourceIndex + 1)}` : name.slice(0, 80);
  } catch {
    return undefined;
  }
}

function isValidServerName(value: string): boolean {
  return (
    value.length > 0 &&
    value.length <= 253 &&
    !containsControlCharacters(value) &&
    !value.split('').some((character) => /\s/.test(character))
  );
}

export function parseVlessRealityLink(link: string, sourceIndex: number): NodeParseResult {
  let url: URL;
  try {
    url = new URL(link);
  } catch {
    return { ok: false, reason: 'INVALID_VLESS_URL' };
  }

  if (url.protocol !== 'vless:') {
    return { ok: false, reason: 'UNSUPPORTED_PROTOCOL' };
  }
  if (
    url.password !== '' ||
    (url.pathname !== '' && url.pathname !== '/') ||
    hasAmbiguousParameters(url)
  ) {
    return { ok: false, reason: 'INVALID_VLESS_URL' };
  }

  const network = url.searchParams.get('type') ?? 'tcp';
  if (network !== 'tcp') {
    return { ok: false, reason: 'UNSUPPORTED_TRANSPORT' };
  }
  if (url.searchParams.get('security') !== 'reality') {
    return { ok: false, reason: 'UNSUPPORTED_SECURITY' };
  }

  const encryption = url.searchParams.get('encryption');
  const flow = url.searchParams.get('flow');
  if (encryption !== null && encryption !== 'none') {
    return { ok: false, reason: 'UNSUPPORTED_SECURITY' };
  }
  if (flow !== null && flow !== '' && flow !== 'xtls-rprx-vision') {
    return { ok: false, reason: 'UNSUPPORTED_FLOW' };
  }

  const name = parseName(url, sourceIndex);
  const port = Number(url.port);
  const publicKey = url.searchParams.get('pbk') ?? '';
  const serverName = url.searchParams.get('sni') ?? '';
  const shortId = url.searchParams.get('sid');
  const fingerprint = url.searchParams.get('fp');
  const server = url.hostname.replace(/^\[|\]$/g, '');

  if (
    name === undefined ||
    !uuidPattern.test(url.username) ||
    server === '' ||
    !Number.isInteger(port) ||
    port < 1 ||
    port > 65_535 ||
    !publicKeyPattern.test(publicKey) ||
    !isValidServerName(serverName) ||
    (shortId !== null && shortId !== '' && !shortIdPattern.test(shortId)) ||
    (fingerprint !== null && !allowedFingerprints.has(fingerprint))
  ) {
    return { ok: false, reason: 'MISSING_REQUIRED_FIELD' };
  }

  return {
    ok: true,
    node: {
      sourceId: 'three-x-ui',
      sourceIndex,
      protocol: 'vless',
      name,
      server,
      serverPort: port,
      uuid: url.username.toLowerCase(),
      network: 'tcp',
      ...(flow === 'xtls-rprx-vision' ? { flow } : {}),
      reality: {
        publicKey,
        serverName,
        ...(shortId === null || shortId === '' ? {} : { shortId }),
        ...(fingerprint === null ? {} : { fingerprint }),
      },
      warnings: [],
    },
  };
}
