import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { clientTypes } from '../src/domain/canonical-node.js';
import { composeVerifiedSingBoxConfig } from '../src/renderers/sing-box/verified-composer.js';
import { parseRemoteConfigBundle } from '../src/sources/remote-config/validator.js';
import { fakeCanonicalNode } from '../test/fixtures/fake-node.js';
import { buildConfigBundles, validateConfigSources } from './config-bundles.js';

await validateConfigSources();
const bundles = await buildConfigBundles();
const temporaryDirectory = mkdtempSync(join(tmpdir(), 'sub-worker-published-check-'));
const binary = process.env.SING_BOX_BIN ?? 'sing-box';

try {
  const version = spawnSync(binary, ['version'], { encoding: 'utf8' });
  if (version.status !== 0 || !version.stdout.startsWith('sing-box version 1.14.0')) {
    throw new Error('Published configs require sing-box 1.14.0 for validation.');
  }

  for (const clientType of clientTypes) {
    const source = bundles.get(clientType);
    if (source === undefined) throw new Error(`Missing ${clientType} bundle.`);
    const bundle = parseRemoteConfigBundle(source, clientType);
    const config = composeVerifiedSingBoxConfig(
      [{ ...fakeCanonicalNode, name: 'UK London' }],
      bundle,
    );
    if (process.platform === 'darwin' && clientType === 'linux') {
      for (const inbound of config.inbounds) delete inbound.auto_redirect;
    }
    const path = join(temporaryDirectory, `${clientType}.json`);
    writeFileSync(path, `${JSON.stringify(config)}\n`, 'utf8');
    const result = spawnSync(binary, ['check', '--disable-color', '-c', path], {
      encoding: 'utf8',
      timeout: 90_000,
    });
    if (result.status !== 0) {
      throw new Error(`${clientType} sing-box check failed: ${result.stderr || result.stdout}`);
    }
  }
  console.log('All published profiles passed sing-box 1.14.0 check.');
} finally {
  rmSync(temporaryDirectory, { recursive: true, force: true });
}
