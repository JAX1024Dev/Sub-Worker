import type { ClientType } from '../src/domain/canonical-node.js';
import { clientTypes } from '../src/domain/canonical-node.js';
import { parseStrictJson } from '../src/sources/remote-config/strict-json.js';
import type { ChannelManifest, ChannelProfile } from '../src/sources/remote-config/types.js';
import {
  parseChannelManifest,
  parseRemoteConfigBundle,
} from '../src/sources/remote-config/validator.js';

export type ConfigChannel = ChannelManifest['channel'];

export interface CompleteChannelManifest extends ChannelManifest {
  profiles: Record<ClientType, ChannelProfile>;
}

export type ReadCommittedBundle = (
  commit: string,
  clientType: ClientType,
) => Uint8Array<ArrayBuffer> | Promise<Uint8Array<ArrayBuffer>>;

const fullCommitPattern = /^[0-9a-f]{40}$/u;
const bundleUrlPattern =
  /^https:\/\/raw\.githubusercontent\.com\/JAX1024Dev\/Sub-Worker\/([0-9a-f]{40})\/example\/sing-box\/published\/(ios|macos|android|windows|linux)\.bundle\.json$/u;

export function validateFullCommit(commit: string): string {
  if (!fullCommitPattern.test(commit)) {
    throw new Error('Bundle commit must be a full 40-character lowercase Git commit SHA.');
  }
  return commit;
}

async function sha256Hex(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function createProfile(
  commit: string,
  clientType: ClientType,
  readBundle: ReadCommittedBundle,
): Promise<ChannelProfile> {
  const bytes = await readBundle(commit, clientType);
  parseRemoteConfigBundle(parseStrictJson(bytes), clientType);
  return {
    bundle_url:
      `https://raw.githubusercontent.com/JAX1024Dev/Sub-Worker/${commit}` +
      `/example/sing-box/published/${clientType}.bundle.json`,
    sha256: await sha256Hex(bytes),
  };
}

export async function createChannelManifest(
  channel: ConfigChannel,
  commitValue: string,
  readBundle: ReadCommittedBundle,
): Promise<CompleteChannelManifest> {
  const commit = validateFullCommit(commitValue);
  const [ios, macos, android, windows, linux] = await Promise.all([
    createProfile(commit, 'ios', readBundle),
    createProfile(commit, 'macos', readBundle),
    createProfile(commit, 'android', readBundle),
    createProfile(commit, 'windows', readBundle),
    createProfile(commit, 'linux', readBundle),
  ]);
  return {
    schema_version: 1,
    channel,
    profiles: { ios, macos, android, windows, linux },
  };
}

export function requireCompleteManifest(
  value: unknown,
  expectedChannel: ConfigChannel,
): CompleteChannelManifest {
  const manifest = parseChannelManifest(value);
  if (manifest.channel !== expectedChannel) {
    throw new Error(`Expected a ${expectedChannel} channel manifest.`);
  }
  for (const clientType of clientTypes) {
    if (manifest.profiles[clientType] === undefined) {
      throw new Error(`Channel manifest is missing the ${clientType} profile.`);
    }
  }

  return {
    schema_version: 1,
    channel: manifest.channel,
    profiles: {
      ios: manifest.profiles.ios as ChannelProfile,
      macos: manifest.profiles.macos as ChannelProfile,
      android: manifest.profiles.android as ChannelProfile,
      windows: manifest.profiles.windows as ChannelProfile,
      linux: manifest.profiles.linux as ChannelProfile,
    },
  };
}

export function promoteStagingManifest(value: unknown): CompleteChannelManifest {
  const staging = requireCompleteManifest(value, 'staging');
  return { ...staging, channel: 'production' };
}

export function bundleCommit(profile: ChannelProfile, clientType: ClientType): string {
  const match = bundleUrlPattern.exec(profile.bundle_url);
  if (match?.[2] !== clientType || match[1] === undefined) {
    throw new Error(`Channel profile ${clientType} has an invalid bundle URL.`);
  }
  return match[1];
}
