import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

import { generateSubscription } from '../src/application/generate-subscription.js';

function unquote(value: string): string {
  const first = value.at(0);
  const last = value.at(-1);
  return value.length >= 2 && first === last && (first === '"' || first === "'")
    ? value.slice(1, -1)
    : value;
}

async function loadLocalValue(name: string): Promise<string> {
  const environmentValue = process.env[name];
  if (environmentValue) {
    return environmentValue;
  }

  const file = await readFile(resolve(import.meta.dirname, '../.dev.vars'), 'utf8');
  for (const line of file.split(/\r?\n/)) {
    const separator = line.indexOf('=');
    if (separator < 1 || line.trimStart().startsWith('#')) {
      continue;
    }
    if (line.slice(0, separator).trim() === name) {
      const value = unquote(line.slice(separator + 1).trim());
      if (value) {
        return value;
      }
    }
  }

  throw new Error(`${name} is required for the live configuration check.`);
}

const baseUrl = await loadLocalValue('THREE_X_UI_SUB_BASE_URL');
const manifestUrl = await loadLocalValue('SING_BOX_CONFIG_MANIFEST_URL');
const subscriptionId = await loadLocalValue('LIVE_TEST_SUBSCRIPTION_ID');
const result = await generateSubscription({
  baseUrl,
  manifestUrl,
  subscriptionId,
  clientType: 'macos',
});
const temporaryDirectory = await mkdtemp(resolve(tmpdir(), 'sub-worker-live-check-'));
const configPath = resolve(temporaryDirectory, 'macos.json');

try {
  await writeFile(configPath, `${JSON.stringify(result.config, undefined, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o600,
  });
  const check = spawnSync(process.env.SING_BOX_BIN ?? 'sing-box', ['check', '-c', configPath], {
    stdio: 'inherit',
  });
  if (check.error) {
    throw check.error;
  }
  if (check.status !== 0) {
    process.exitCode = check.status ?? 1;
  }
} finally {
  await rm(temporaryDirectory, { recursive: true });
}
