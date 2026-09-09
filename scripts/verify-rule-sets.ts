import { createHash } from 'node:crypto';

import { ruleSetSources } from '../src/config/rules/rule-set-sources.js';

const maximumRuleSetBytes = 32 * 1024 * 1024;

for (const [name, source] of Object.entries(ruleSetSources)) {
  const response = await fetch(source.url, { redirect: 'error' });
  if (!response.ok) {
    throw new Error(`Unable to download ${name}: HTTP ${String(response.status)}.`);
  }

  const body = new Uint8Array(await response.arrayBuffer());
  if (body.byteLength === 0 || body.byteLength > maximumRuleSetBytes) {
    throw new Error(`${name} has an invalid size.`);
  }

  const actual = createHash('sha256').update(body).digest('hex');
  if (actual !== source.sha256) {
    throw new Error(`${name} checksum mismatch.`);
  }
}
