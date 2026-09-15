import { createChannelManifest, parseBundleCommitArguments } from './channel-manifests.js';
import { writeChannelManifest } from './channel-manifest-files.js';
import { assertCommitAvailable, readCommittedBundle } from './git-config-bundles.js';

const commit = assertCommitAvailable(parseBundleCommitArguments(process.argv.slice(2)));
const manifest = await createChannelManifest('staging', commit, readCommittedBundle);
await writeChannelManifest('staging', manifest);
console.log(`Published staging manifest for bundle commit ${commit}.`);
