#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

const args = process.argv.slice(2);
const checkOnly = args.includes('--check-only');
const configArgumentIndex = args.indexOf('--config');
const configArgument = configArgumentIndex >= 0 ? args[configArgumentIndex + 1] : undefined;
const outputDirectory = resolve(import.meta.dirname, '../.local/generated');
const outputPath = resolve(outputDirectory, 'macos-dual-stack-staging.json');
const reportPath = resolve(
  outputDirectory,
  `macos-dual-stack-report-${new Date().toISOString().replace(/[:.]/g, '-')}.md`,
);
const results = [];

function pass(name, detail = 'ok') {
  results.push({ name, status: 'PASS', detail });
  console.log(`PASS  ${name}`);
}

function fail(name, detail = 'failed') {
  results.push({ name, status: 'FAIL', detail });
  console.error(`FAIL  ${name}: ${detail}`);
}

function skip(name, detail) {
  results.push({ name, status: 'SKIP', detail });
  console.log(`SKIP  ${name}: ${detail}`);
}

function unquote(value) {
  const first = value.at(0);
  const last = value.at(-1);
  return value.length >= 2 && first === last && (first === '"' || first === "'")
    ? value.slice(1, -1)
    : value;
}

async function loadLocalValue(name) {
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

  throw new Error(`${name} is required.`);
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validateConfig(config) {
  if (!isRecord(config)) {
    throw new Error('The configuration is not a JSON object.');
  }
  const { dns, inbounds, outbounds, route } = config;
  if (!isRecord(dns) || !Array.isArray(dns.rules)) {
    throw new Error('DNS rules are missing.');
  }
  if (!Array.isArray(inbounds) || !isRecord(inbounds[0])) {
    throw new Error('The TUN inbound is missing.');
  }
  if (!Array.isArray(outbounds)) {
    throw new Error('Outbounds are missing.');
  }
  if (!isRecord(route) || !Array.isArray(route.rules)) {
    throw new Error('Route rules are missing.');
  }

  const rejectAaaa = dns.rules.some(
    (rule) =>
      isRecord(rule) &&
      Array.isArray(rule.query_type) &&
      rule.query_type.includes('AAAA') &&
      rule.action === 'reject',
  );
  if (dns.strategy !== 'prefer_ipv4' || rejectAaaa) {
    throw new Error('macOS dual-stack DNS must keep AAAA and use prefer_ipv4.');
  }
  const fakeIpServer = dns.servers?.find(
    (server) => isRecord(server) && server.type === 'fakeip' && server.tag === 'dns-fakeip',
  );
  const fakeIpRule = dns.rules.find(
    (rule) =>
      isRecord(rule) &&
      Array.isArray(rule.query_type) &&
      rule.query_type.includes('A') &&
      rule.query_type.includes('AAAA') &&
      rule.server === 'dns-fakeip',
  );
  if (!isRecord(fakeIpServer) || !isRecord(fakeIpRule)) {
    throw new Error('macOS dual-stack DNS must use the FakeIP transport.');
  }

  const resolveRule = route.rules.find((rule) => isRecord(rule) && rule.action === 'resolve');
  if (
    !isRecord(resolveRule) ||
    resolveRule.strategy !== undefined ||
    !route.rules.some((rule) => isRecord(rule) && rule.rule_set === 'geoip-cn')
  ) {
    throw new Error('R6 must not force IPv4 and the geoip-cn direct stage must remain.');
  }
  if (route.final !== 'proxy' || route.auto_detect_interface !== true) {
    throw new Error('Route final and interface detection are invalid.');
  }

  const tun = inbounds[0];
  if (
    tun.type !== 'tun' ||
    !Array.isArray(tun.address) ||
    !tun.address.some((address) => String(address).includes(':')) ||
    Object.hasOwn(tun, 'route_exclude_address')
  ) {
    throw new Error('The dual-stack TUN inbound is invalid.');
  }

  const direct = outbounds.find((outbound) => isRecord(outbound) && outbound.type === 'direct');
  if (!isRecord(direct) || direct.network_strategy !== 'hybrid') {
    throw new Error('direct must use network_strategy: hybrid.');
  }
}

function curl(name, url, family) {
  const result = spawnSync(
    '/usr/bin/curl',
    [
      '--fail',
      '--silent',
      '--show-error',
      '--output',
      '/dev/null',
      '--write-out',
      '%{http_code}',
      '--connect-timeout',
      '5',
      '--max-time',
      '20',
      `-${family}`,
      url,
    ],
    { encoding: 'utf8', timeout: 25000 },
  );
  const httpCode = Number.parseInt(result.stdout.trim(), 10);
  const status = result.status === 0 && httpCode >= 200 && httpCode < 400 ? 'PASS' : 'FAIL';
  results.push({
    name,
    status,
    detail: result.status === 0 ? `HTTP ${String(httpCode)}` : 'connection failed',
  });
  console.log(`${status}  ${name}`);
}

function baselineCurl(name, url, family) {
  const result = spawnSync(
    '/usr/bin/curl',
    [
      '--fail',
      '--silent',
      '--show-error',
      '--output',
      '/dev/null',
      '--connect-timeout',
      '5',
      '--max-time',
      '20',
      `-${family}`,
      url,
    ],
    { encoding: 'utf8', timeout: 25000 },
  );
  results.push({
    name,
    status: result.status === 0 ? 'INFO' : 'BASELINE-FAIL',
    detail: result.status === 0 ? 'reachable' : 'unreachable before tunnel',
  });
  console.log(`${result.status === 0 ? 'INFO' : 'BASELINE-FAIL'}  ${name}`);
}

function runNetworkQuality() {
  const result = spawnSync('/usr/bin/networkQuality', ['-v'], { timeout: 180000 });
  const status = result.status === 0 ? 'PASS' : 'FAIL';
  results.push({
    name: 'UDP / system network quality',
    status,
    detail: result.status === 0 ? 'completed' : 'failed or unavailable',
  });
  console.log(`${status}  UDP / system network quality`);
}

async function confirmTunnelEnabled() {
  const readline = createInterface({ input, output });
  try {
    await readline.question(
      'Import the printed config file into the official sing-box macOS client, enable it, then press Enter to continue...',
    );
  } finally {
    readline.close();
  }
}

async function writeReport() {
  const lines = [
    '# macOS sing-box dual-stack experiment',
    '',
    `- Date: ${new Date().toISOString()}`,
    `- Config: ${outputPath}`,
    '- Secrets, subscription IDs, request URLs, node links, and generated JSON are intentionally omitted.',
    '',
    '| Result | Test | Detail |',
    '| --- | --- | --- |',
    ...results.map(
      (result) => `| ${result.status} | ${result.name} | ${result.detail.replace(/\|/g, '/')} |`,
    ),
    '',
  ];
  await writeFile(reportPath, lines.join('\n'), { encoding: 'utf8', mode: 0o600 });
  await chmod(reportPath, 0o600);
  console.log(`\nReport: ${reportPath}`);
}

async function fetchStagingConfig() {
  const baseUrl = await loadLocalValue('STAGING_WORKER_BASE_URL');
  const subscriptionId = await loadLocalValue('LIVE_TEST_SUBSCRIPTION_ID');
  const parsedBaseUrl = new URL(baseUrl);
  if (parsedBaseUrl.protocol !== 'https:') {
    throw new Error('STAGING_WORKER_BASE_URL must use HTTPS.');
  }
  parsedBaseUrl.pathname = `${parsedBaseUrl.pathname.replace(/\/+$/, '')}/v1/sing-box/macos`;
  parsedBaseUrl.search = '';
  parsedBaseUrl.hash = '';
  const requestUrl = new URL(`${parsedBaseUrl.toString()}/${encodeURIComponent(subscriptionId)}`);

  let response;
  try {
    response = await fetch(requestUrl, { headers: { Accept: 'application/json' } });
  } catch {
    throw new Error('Unable to reach the staging Worker.');
  }
  if (!response.ok) {
    throw new Error(`The staging Worker returned HTTP ${response.status}.`);
  }
  if (response.headers.get('cache-control') !== 'private, no-store') {
    throw new Error('The staging response is not marked private and no-store.');
  }
  return await response.json();
}

try {
  if (process.platform !== 'darwin') {
    throw new Error('Run this test on the macOS device that will import the configuration.');
  }

  await mkdir(outputDirectory, { recursive: true, mode: 0o700 });
  const config =
    configArgument === undefined
      ? await fetchStagingConfig()
      : JSON.parse(await readFile(configArgument, 'utf8'));

  validateConfig(config);
  pass('Static dual-stack policy');
  await writeFile(outputPath, `${JSON.stringify(config, undefined, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o600,
  });
  await chmod(outputPath, 0o600);
  console.log(`Config: ${outputPath}`);

  const singBoxBinary = process.env.SING_BOX_BIN ?? 'sing-box';
  const check = spawnSync(singBoxBinary, ['check', '-c', outputPath], { encoding: 'utf8' });
  if (check.error) {
    skip('sing-box 1.14.0 schema check', 'sing-box executable was not found');
  } else if (check.status === 0) {
    pass('sing-box 1.14.0 schema check');
  } else {
    fail('sing-box 1.14.0 schema check', `exit ${String(check.status ?? 'unknown')}`);
  }

  if (!checkOnly) {
    console.log('\nCollecting the pre-tunnel IPv6 baseline...');
    baselineCurl('Baseline physical IPv6', 'https://ipv6.google.com/generate_204', '6');
    await confirmTunnelEnabled();
    console.log('\nCollecting enabled-tunnel results...');
    curl('Tunnel IPv4 / foreign TCP', 'https://www.google.com/generate_204', '4');
    curl('Tunnel IPv6 / foreign TCP', 'https://ipv6.google.com/generate_204', '6');
    curl('Tunnel IPv4 / China TCP', 'https://www.baidu.com/', '4');
    curl('Tunnel IPv6 / China TCP', 'https://docs.bigmodel.cn/', '6');
    runNetworkQuality();
    skip(
      'WebRTC',
      'Open a WebRTC test in Safari/Chrome while the tunnel is enabled and record the result manually',
    );
  }

  await writeReport();
  if (results.some((result) => result.status === 'FAIL')) {
    process.exitCode = 1;
  }
} catch (error) {
  const message = error instanceof Error ? error.message : 'Unexpected validation failure.';
  fail('macOS dual-stack test setup', message);
  await writeReport().catch(() => undefined);
  process.exitCode = 1;
}
