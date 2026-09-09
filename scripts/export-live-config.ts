import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { generateSubscription } from '../src/application/generate-subscription.js';
import { parseClientType } from '../src/security/subscription-input.js';

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

  throw new Error(`${name} is required to export a live configuration.`);
}

const clientType = parseClientType(process.argv[2] ?? '');
if (!clientType) {
  throw new Error('Usage: tsx scripts/export-live-config.ts <ios|android|macos|windows|linux>');
}

const baseUrl = await loadLocalValue('THREE_X_UI_SUB_BASE_URL');
const subscriptionId = await loadLocalValue('LIVE_TEST_SUBSCRIPTION_ID');
const result = await generateSubscription({ baseUrl, subscriptionId, clientType });
const outputDirectory = resolve(import.meta.dirname, '../.local/generated');
const outputPath = resolve(outputDirectory, `sing-box-${clientType}.json`);

await mkdir(outputDirectory, { recursive: true, mode: 0o700 });
await writeFile(outputPath, `${JSON.stringify(result.config, undefined, 2)}\n`, {
  encoding: 'utf8',
  mode: 0o600,
});
await chmod(outputPath, 0o600);

console.log(outputPath);
