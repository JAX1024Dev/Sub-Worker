import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const fixtureDirectory = new URL('../test/fixtures/generated/', import.meta.url);
const configFiles = readdirSync(fixtureDirectory)
  .filter((name) => name.endsWith('.json'))
  .sort();

if (configFiles.length === 0) {
  console.log('No generated sing-box fixtures exist yet; config validation skipped.');
  process.exit(0);
}

const singBoxBinary = process.env.SING_BOX_BIN ?? 'sing-box';

for (const configFile of configFiles) {
  const configPath = join(fileURLToPath(fixtureDirectory), configFile);
  let checkPath = configPath;
  let temporaryDirectory;

  // auto_redirect is Linux-only and fails during initialization when the
  // Linux fixture is schema-checked on a macOS development host.
  if (process.platform === 'darwin' && configFile === 'linux.json') {
    const config = JSON.parse(readFileSync(configPath, 'utf8'));
    for (const inbound of config.inbounds ?? []) {
      delete inbound.auto_redirect;
    }
    temporaryDirectory = mkdtempSync(join(tmpdir(), 'sub-worker-config-check-'));
    checkPath = join(temporaryDirectory, configFile);
    writeFileSync(checkPath, `${JSON.stringify(config, null, 2)}\n`);
  }

  const result = spawnSync(singBoxBinary, ['check', '--disable-color', '-c', checkPath], {
    stdio: 'inherit',
  });

  if (temporaryDirectory) {
    rmSync(temporaryDirectory, { recursive: true });
  }

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
