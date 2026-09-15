import { createChannelManifest } from './channel-manifests.js';
import { writeChannelManifest } from './channel-manifest-files.js';
import { assertCommitAvailable, readCommittedBundle } from './git-config-bundles.js';

const commitArgument = process.argv[2];
if (commitArgument === undefined || process.argv.length !== 3) {
  throw new Error('Usage: pnpm config:publish:staging -- <40-character-bundle-commit>');
}

const commit = assertCommitAvailable(commitArgument);
const manifest = await createChannelManifest('staging', commit, readCommittedBundle);
await writeChannelManifest('staging', manifest);
console.log(`Published staging manifest for bundle commit ${commit}.`);
