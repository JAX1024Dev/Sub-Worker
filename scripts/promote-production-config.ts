import { promoteStagingManifest } from './channel-manifests.js';
import { readChannelManifest, writeChannelManifest } from './channel-manifest-files.js';
import { parseStrictJson } from '../src/sources/remote-config/strict-json.js';

if (process.argv.length !== 2) {
  throw new Error('Usage: pnpm config:promote:production');
}

const staging = parseStrictJson(await readChannelManifest('staging'));
const production = promoteStagingManifest(staging);
await writeChannelManifest('production', production);
console.log('Promoted the current staging manifest to production without rebuilding bundles.');
