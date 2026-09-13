import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { format } from 'prettier';

import { ruleSetSources } from '../src/config/rules/rule-set-sources.js';

const maximumRuleSetBytes = 32 * 1024 * 1024;
const outputPath = resolve(import.meta.dirname, '../src/config/rules/geoip-cn-ipv6.ts');
const temporaryDirectory = await mkdtemp(join(tmpdir(), 'sub-worker-ios-routes-'));

function isUnknownArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

function extractIpCidrs(value: unknown): string[] {
  if (typeof value !== 'object' || value === null || !('rules' in value)) {
    throw new Error('Decompiled rule-set does not contain rules.');
  }

  const { rules } = value;
  if (!isUnknownArray(rules)) {
    throw new Error('Decompiled rule-set rules are invalid.');
  }

  const cidrs: string[] = [];
  for (const rule of rules) {
    if (typeof rule !== 'object' || rule === null || !('ip_cidr' in rule)) {
      continue;
    }
    const ipCidrs = rule.ip_cidr;
    if (!isUnknownArray(ipCidrs) || !ipCidrs.every((cidr) => typeof cidr === 'string')) {
      throw new Error('Decompiled rule-set contains invalid IP CIDRs.');
    }
    cidrs.push(...ipCidrs);
  }

  return [...new Set(cidrs.filter((cidr) => cidr.includes(':')))];
}

try {
  const source = ruleSetSources.geoIpChina;
  const response = await fetch(source.url, { redirect: 'error' });
  if (!response.ok) {
    throw new Error(`Unable to download geoIpChina: HTTP ${String(response.status)}.`);
  }

  const body = new Uint8Array(await response.arrayBuffer());
  if (body.byteLength === 0 || body.byteLength > maximumRuleSetBytes) {
    throw new Error('geoIpChina has an invalid size.');
  }
  const actualHash = createHash('sha256').update(body).digest('hex');
  if (actualHash !== source.sha256) {
    throw new Error('geoIpChina checksum mismatch.');
  }

  const binaryPath = join(temporaryDirectory, 'geoip-cn.srs');
  const jsonPath = join(temporaryDirectory, 'geoip-cn.json');
  await writeFile(binaryPath, body);

  const result = spawnSync(
    process.env.SING_BOX_BIN ?? 'sing-box',
    ['rule-set', 'decompile', binaryPath, '--output', jsonPath],
    { encoding: 'utf8' },
  );
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || 'Unable to decompile geoIpChina.');
  }

  const parsed: unknown = JSON.parse(await readFile(jsonPath, 'utf8'));
  const cidrs = extractIpCidrs(parsed);
  if (cidrs.length === 0) {
    throw new Error('geoIpChina does not contain IPv6 CIDRs.');
  }

  const generated = `/**
 * Generated from SagerNet geoip-cn at revision ${source.revision}.
 * Run \`pnpm rules:generate:ios-routes\` after updating the pinned rule-set.
 */
export const chinaIpv6RouteExcludes = \`
${cidrs.join('\n')}
\`.trim().split('\\n');
`;
  const formatted = await format(generated, { parser: 'typescript', singleQuote: true });
  if (process.argv.includes('--check')) {
    if ((await readFile(outputPath, 'utf8')) !== formatted) {
      throw new Error('Generated iOS China IPv6 route exclusions are stale.');
    }
    console.log(`Verified ${String(cidrs.length)} iOS China IPv6 route exclusions.`);
  } else {
    await writeFile(outputPath, formatted, 'utf8');
    console.log(`Generated ${String(cidrs.length)} iOS China IPv6 route exclusions.`);
  }
} finally {
  await rm(temporaryDirectory, { recursive: true });
}
