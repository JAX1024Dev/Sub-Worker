import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { format } from 'prettier';

import { buildConfigBundles, writeConfigBundles } from './config-bundles.js';

const owner = 'DustinWin';
const repo = 'ruleset_geodata';
const branch = 'sing-box-ruleset';
const apiUrl = `https://api.github.com/repos/${owner}/${repo}/commits/${branch}`;
const requiredFiles = ['ads', 'ai', 'youtube', 'media', 'netflix', 'disney', 'spotify', 'tiktok'];
const routeFiles = ['cn-direct.json', 'cn-direct-ipv4-only.json'];
const update = process.argv.includes('--update');

const response = await fetch(apiUrl, {
  headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'Sub-Worker-ruleset-check' },
  redirect: 'error',
});
if (!response.ok)
  throw new Error(`Unable to resolve upstream commit: HTTP ${String(response.status)}.`);
const payload: unknown = await response.json();
if (
  typeof payload !== 'object' ||
  payload === null ||
  !('sha' in payload) ||
  typeof payload.sha !== 'string' ||
  !/^[0-9a-f]{40}$/u.test(payload.sha)
) {
  throw new Error('Upstream commit response is invalid.');
}
const sha = payload.sha;
const base = `https://raw.githubusercontent.com/${owner}/${repo}/${sha}/`;
for (const name of requiredFiles) {
  const rule = await fetch(`${base}${name}.srs`, { redirect: 'error' });
  if (!rule.ok) throw new Error(`Missing upstream ${name}: HTTP ${String(rule.status)}.`);
  const data = new Uint8Array(await rule.arrayBuffer());
  if (
    data.length < 16 ||
    data.length > 16 * 1024 * 1024 ||
    data[0] !== 83 ||
    data[1] !== 82 ||
    data[2] !== 83
  ) {
    throw new Error(`Upstream ${name} is not a bounded SRS rule set.`);
  }
}

let changed = false;
for (const filename of routeFiles) {
  const path = resolve(import.meta.dirname, `../example/sing-box/rules/${filename}`);
  const original = await readFile(path, 'utf8');
  const document: unknown = JSON.parse(original);
  if (
    typeof document !== 'object' ||
    document === null ||
    !('route' in document) ||
    typeof document.route !== 'object' ||
    document.route === null ||
    !('rule_set' in document.route) ||
    !Array.isArray(document.route.rule_set)
  ) {
    throw new Error(`Invalid route fragment: ${filename}.`);
  }
  let found = 0;
  const ruleSets: unknown[] = document.route.rule_set;
  for (const item of ruleSets) {
    if (
      typeof item !== 'object' ||
      item === null ||
      !('tag' in item) ||
      !requiredFiles.includes(String(item.tag))
    )
      continue;
    found += 1;
    if (!('url' in item) || typeof item.url !== 'string')
      throw new Error(`Invalid URL for ${String(item.tag)}.`);
    const expected = `${base}${String(item.tag)}.srs`;
    if (item.url !== expected) {
      item.url = expected;
      changed = true;
    }
  }
  if (found !== requiredFiles.length) throw new Error(`Missing DustinWin rule set in ${filename}.`);
  if (changed && update)
    await writeFile(path, await format(JSON.stringify(document), { parser: 'json' }));
}
if (changed && update) {
  await writeConfigBundles(await buildConfigBundles());
  console.log(`Updated DustinWin rule-set pin to ${sha}.`);
} else if (changed) {
  console.log(
    `DustinWin rule sets have a newer verified commit: ${sha}. Run with --update to pin it.`,
  );
  process.exitCode = 2;
} else {
  console.log(`DustinWin rule sets are current at ${sha}.`);
}
