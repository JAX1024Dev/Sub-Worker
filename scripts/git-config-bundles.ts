import { execFileSync } from 'node:child_process';

import type { ClientType } from '../src/domain/canonical-node.js';
import { remoteConfigLimits } from '../src/sources/remote-config/source-adapter.js';
import { validateFullCommit } from './channel-manifests.js';

function runGit(arguments_: string[]): Buffer {
  return execFileSync('git', arguments_, {
    encoding: 'buffer',
    maxBuffer: remoteConfigLimits.bundleBytes + 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

export function assertCommitAvailable(commitValue: string): string {
  const commit = validateFullCommit(commitValue);
  try {
    runGit(['cat-file', '-e', `${commit}^{commit}`]);
    execFileSync('git', ['merge-base', '--is-ancestor', commit, 'HEAD'], {
      stdio: 'ignore',
    });
  } catch (error) {
    throw new Error('Bundle commit must exist locally and be an ancestor of HEAD.', {
      cause: error,
    });
  }
  return commit;
}

export function readCommittedBundle(
  commitValue: string,
  clientType: ClientType,
): Uint8Array<ArrayBuffer> {
  const commit = validateFullCommit(commitValue);
  let output: Buffer;
  try {
    output = runGit(['show', `${commit}:example/sing-box/published/${clientType}.bundle.json`]);
  } catch (error) {
    throw new Error(`Committed ${clientType} bundle is unavailable.`, { cause: error });
  }
  if (output.byteLength > remoteConfigLimits.bundleBytes) {
    throw new Error(`Committed ${clientType} bundle exceeds the runtime size limit.`);
  }
  return Uint8Array.from(output);
}
