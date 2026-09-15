import { access } from 'node:fs/promises';

import { clientTypes } from '../src/domain/canonical-node.js';
import { parseStrictJson } from '../src/sources/remote-config/strict-json.js';
import { bundleCommit, requireCompleteManifest, type ConfigChannel } from './channel-manifests.js';
import { channelManifestPath, readChannelManifest } from './channel-manifest-files.js';
import { assertCommitAvailable, readCommittedBundle } from './git-config-bundles.js';

async function exists(channel: ConfigChannel): Promise<boolean> {
  try {
    await access(channelManifestPath(channel));
    return true;
  } catch {
    return false;
  }
}

let checked = 0;
for (const channel of ['staging', 'production'] as const) {
  if (!(await exists(channel))) continue;
  const manifest = requireCompleteManifest(
    parseStrictJson(await readChannelManifest(channel)),
    channel,
  );
  for (const clientType of clientTypes) {
    const profile = manifest.profiles[clientType];
    const commit = assertCommitAvailable(bundleCommit(profile, clientType));
    const rebuilt = await createHash(readCommittedBundle(commit, clientType));
    if (rebuilt !== profile.sha256) {
      throw new Error(`${channel} ${clientType} bundle digest does not match its Git object.`);
    }
  }
  checked += 1;
}

console.log(
  checked === 0
    ? 'No channel manifests are published yet.'
    : `Validated ${String(checked)} channel manifest(s) against committed bundles.`,
);

async function createHash(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
