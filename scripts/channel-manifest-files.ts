import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { format } from 'prettier';

import type { ConfigChannel } from './channel-manifests.js';

const channelDirectory = resolve(import.meta.dirname, '../example/sing-box/channels');

export function channelManifestPath(channel: ConfigChannel): string {
  return resolve(channelDirectory, `${channel}.json`);
}

export async function readChannelManifest(channel: ConfigChannel): Promise<Uint8Array> {
  return readFile(channelManifestPath(channel));
}

export async function writeChannelManifest(channel: ConfigChannel, value: unknown): Promise<void> {
  await mkdir(channelDirectory, { recursive: true });
  const contents = await format(JSON.stringify(value), { parser: 'json' });
  const target = channelManifestPath(channel);
  const temporary = resolve(channelDirectory, `.${channel}.${String(process.pid)}.tmp`);
  try {
    await writeFile(temporary, contents, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
    await rename(temporary, target);
  } finally {
    await rm(temporary, { force: true });
  }
}
