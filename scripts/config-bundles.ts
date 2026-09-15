import { lstat, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';

import Ajv, { type AnySchema, type ErrorObject, type ValidateFunction } from 'ajv';
import { format } from 'prettier';

import { clientTypes, type ClientType } from '../src/domain/canonical-node.js';

const configRoot = resolve(import.meta.dirname, '../example/sing-box');
const profileDirectory = resolve(configRoot, 'profiles');
const publishedDirectory = resolve(configRoot, 'published');
const bundleLimitBytes = 512 * 1024;

const fragmentDirectories = {
  common: 'common',
  dns: 'dns',
  platform: 'platforms',
  route: 'rules',
  outbound_policy: 'outbounds',
} as const;

type FragmentName = keyof typeof fragmentDirectories;

interface Profile {
  schema_version: 1;
  client_type: ClientType;
  fragments: Record<FragmentName, string>;
}

interface TaggedValue {
  tag: string;
}

interface DnsRule {
  rule_set?: string;
  server?: string;
}

interface DnsFragment {
  servers: Array<TaggedValue & { detour?: string }>;
  rules: DnsRule[];
  final: string;
  strategy: string;
}

interface PlatformFragment {
  inbounds: TaggedValue[];
  route: {
    auto_detect_interface?: true;
    override_android_vpn?: false;
  };
}

interface RouteRule {
  outbound?: string;
  rule_set?: string;
}

interface RoutingFragment {
  http_clients: Array<TaggedValue & { detour: string }>;
  route: {
    rules: RouteRule[];
    rule_set: Array<TaggedValue & { http_client: string; url: string }>;
    final: string;
    default_http_client: string;
    default_domain_resolver: string;
  };
}

interface OutboundPolicyFragment {
  node_defaults: {
    packet_encoding: 'xudp';
    domain_resolver: string;
  };
  urltest: TaggedValue & Record<string, unknown>;
  selector: TaggedValue & Record<string, unknown>;
  direct: TaggedValue & Record<string, unknown>;
  block: TaggedValue & Record<string, unknown>;
}

interface CommonFragment {
  $schema: string;
  log: Record<string, unknown>;
}

export interface ConfigBundle {
  schema_version: 1;
  target: {
    format: 'sing-box';
    version: '1.14.0';
    client_type: ClientType;
  };
  fragments: {
    common: CommonFragment;
    dns: DnsFragment;
    platform: PlatformFragment;
    route: RoutingFragment;
    outbound_policy: OutboundPolicyFragment;
  };
}

interface Validators {
  profile: ValidateFunction<Profile>;
  bundle: ValidateFunction<ConfigBundle>;
  fragments: Record<FragmentName, ValidateFunction>;
}

function describeErrors(errors: ErrorObject[] | null | undefined): string {
  if (errors === null || errors === undefined || errors.length === 0) {
    return 'unknown schema error';
  }

  return errors
    .map(
      (error) => `${error.instancePath === '' ? '/' : error.instancePath} ${error.message ?? ''}`,
    )
    .join('; ');
}

async function readJson(path: string): Promise<unknown> {
  let contents: string;
  try {
    contents = await readFile(path, 'utf8');
  } catch (error) {
    throw new Error(`Unable to read ${relative(configRoot, path)}.`, { cause: error });
  }

  try {
    return JSON.parse(contents) as unknown;
  } catch (error) {
    throw new Error(`Invalid JSON in ${relative(configRoot, path)}.`, { cause: error });
  }
}

function requireJsonSchema(value: unknown, path: string): AnySchema {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${path} must contain a JSON Schema object.`);
  }
  return value;
}

async function createValidators(): Promise<Validators> {
  const bundleSchema = requireJsonSchema(
    await readJson(resolve(configRoot, 'schema/bundle.schema.json')),
    'schema/bundle.schema.json',
  );
  const profileSchema = requireJsonSchema(
    await readJson(resolve(configRoot, 'schema/profile.schema.json')),
    'schema/profile.schema.json',
  );
  const manifestSchema = requireJsonSchema(
    await readJson(resolve(configRoot, 'schema/manifest.schema.json')),
    'schema/manifest.schema.json',
  );
  const ajv = new Ajv({ allErrors: true, strict: true });
  ajv.addSchema(bundleSchema);
  ajv.compile(manifestSchema);

  const fragmentRefs: Record<FragmentName, string> = {
    common: 'common',
    dns: 'dns',
    platform: 'platform',
    route: 'routing',
    outbound_policy: 'outboundPolicy',
  };
  const fragments = Object.fromEntries(
    Object.entries(fragmentRefs).map(([name, definition]) => [
      name,
      ajv.compile({
        $ref: `https://subworker.jax1024.com/schema/bundle.schema.json#/definitions/${definition}`,
      }),
    ]),
  ) as Record<FragmentName, ValidateFunction>;

  return {
    profile: ajv.compile<Profile>(profileSchema),
    bundle: ajv.getSchema<ConfigBundle>(
      'https://subworker.jax1024.com/schema/bundle.schema.json',
    ) as ValidateFunction<ConfigBundle>,
    fragments,
  };
}

async function listJsonFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .map((entry) => resolve(directory, entry.name))
    .sort();
}

async function resolveFragmentPath(name: FragmentName, reference: string): Promise<string> {
  if (isAbsolute(reference)) {
    throw new Error(`Profile fragment ${name} must be a relative path.`);
  }

  const expectedPrefix = `${fragmentDirectories[name]}/`;
  if (!reference.startsWith(expectedPrefix)) {
    throw new Error(`Profile fragment ${name} must start with ${expectedPrefix}.`);
  }

  const path = resolve(configRoot, reference);
  const pathFromRoot = relative(configRoot, path);
  if (pathFromRoot.startsWith(`..${sep}`) || pathFromRoot === '..') {
    throw new Error(`Profile fragment ${name} escapes the configuration root.`);
  }

  const stats = await lstat(path);
  if (!stats.isFile() || stats.isSymbolicLink()) {
    throw new Error(`Profile fragment ${name} must reference a regular file.`);
  }
  return path;
}

function assertUniqueTags(values: TaggedValue[], context: string): Set<string> {
  const tags = values.map((value) => value.tag);
  const unique = new Set(tags);
  if (unique.size !== tags.length) {
    throw new Error(`${context} contains duplicate tags.`);
  }
  return unique;
}

function requireTag(tags: Set<string>, tag: string, context: string): void {
  if (!tags.has(tag)) {
    throw new Error(`${context} references missing tag ${tag}.`);
  }
}

function validateSemantics(bundle: ConfigBundle): void {
  const { dns, platform, route, outbound_policy: outboundPolicy } = bundle.fragments;
  const dnsTags = assertUniqueTags(dns.servers, 'DNS servers');
  const inboundTags = assertUniqueTags(platform.inbounds, 'Platform inbounds');
  const httpClientTags = assertUniqueTags(route.http_clients, 'HTTP clients');
  const ruleSetTags = assertUniqueTags(route.route.rule_set, 'Route rule sets');
  const outboundTags = assertUniqueTags(
    [outboundPolicy.urltest, outboundPolicy.selector, outboundPolicy.direct, outboundPolicy.block],
    'Fixed outbounds',
  );

  for (const required of ['auto', 'proxy', 'direct', 'block']) {
    requireTag(outboundTags, required, 'Outbound policy');
  }
  requireTag(inboundTags, 'tun-in', 'Platform');
  requireTag(dnsTags, dns.final, 'DNS final');
  requireTag(dnsTags, route.route.default_domain_resolver, 'Route resolver');
  requireTag(dnsTags, outboundPolicy.node_defaults.domain_resolver, 'Node resolver');
  requireTag(httpClientTags, route.route.default_http_client, 'Default HTTP client');
  requireTag(outboundTags, route.route.final, 'Route final');

  for (const server of dns.servers) {
    if (server.detour !== undefined) {
      requireTag(outboundTags, server.detour, `DNS server ${server.tag}`);
    }
  }
  for (const rule of dns.rules) {
    if (rule.server !== undefined) requireTag(dnsTags, rule.server, 'DNS rule');
    if (rule.rule_set !== undefined) requireTag(ruleSetTags, rule.rule_set, 'DNS rule');
  }
  for (const client of route.http_clients) {
    requireTag(outboundTags, client.detour, `HTTP client ${client.tag}`);
  }
  for (const ruleSet of route.route.rule_set) {
    requireTag(httpClientTags, ruleSet.http_client, `Rule set ${ruleSet.tag}`);
    const url = new URL(ruleSet.url);
    if (url.protocol !== 'https:' || !/\/[0-9a-f]{40}\//u.test(url.pathname)) {
      throw new Error(`Rule set ${ruleSet.tag} must use an HTTPS URL pinned to a full commit SHA.`);
    }
  }
  for (const rule of route.route.rules) {
    if (rule.outbound !== undefined) requireTag(outboundTags, rule.outbound, 'Route rule');
    if (rule.rule_set !== undefined) requireTag(ruleSetTags, rule.rule_set, 'Route rule');
  }

  const routeOptions = Object.keys(platform.route);
  if (bundle.target.client_type === 'android') {
    if (routeOptions.length !== 1 || routeOptions[0] !== 'override_android_vpn') {
      throw new Error('Android platform must exclusively own override_android_vpn.');
    }
  } else if (routeOptions.length !== 1 || routeOptions[0] !== 'auto_detect_interface') {
    throw new Error(
      `${bundle.target.client_type} platform must exclusively own auto_detect_interface.`,
    );
  }
}

async function loadProfile(path: string, validate: ValidateFunction<Profile>): Promise<Profile> {
  const data = await readJson(path);
  if (!validate(data)) {
    throw new Error(`${relative(configRoot, path)}: ${describeErrors(validate.errors)}`);
  }
  return data;
}

async function buildBundleFromProfile(
  profile: Profile,
  validators: Validators,
): Promise<ConfigBundle> {
  const loadedEntries = await Promise.all(
    (Object.keys(fragmentDirectories) as FragmentName[]).map(async (name) => {
      const path = await resolveFragmentPath(name, profile.fragments[name]);
      return [name, await readJson(path)] as const;
    }),
  );
  const fragments = Object.fromEntries(loadedEntries);
  const candidate: unknown = {
    schema_version: 1,
    target: {
      format: 'sing-box',
      version: '1.14.0',
      client_type: profile.client_type,
    },
    fragments,
  };

  if (!validators.bundle(candidate)) {
    throw new Error(
      `profiles/${profile.client_type}.json: ${describeErrors(validators.bundle.errors)}`,
    );
  }
  validateSemantics(candidate);

  const encoded = new TextEncoder().encode(JSON.stringify(candidate));
  if (encoded.byteLength > bundleLimitBytes) {
    throw new Error(`${profile.client_type} bundle exceeds ${String(bundleLimitBytes)} bytes.`);
  }
  return candidate;
}

export async function validateConfigSources(): Promise<void> {
  const validators = await createValidators();

  for (const [name, directory] of Object.entries(fragmentDirectories) as Array<
    [FragmentName, string]
  >) {
    const paths = await listJsonFiles(resolve(configRoot, directory));
    if (paths.length === 0) throw new Error(`${directory} does not contain any JSON fragments.`);
    for (const path of paths) {
      const data = await readJson(path);
      const validate = validators.fragments[name];
      if (!validate(data)) {
        throw new Error(`${relative(configRoot, path)}: ${describeErrors(validate.errors)}`);
      }
    }
  }

  const profilePaths = await listJsonFiles(profileDirectory);
  const expectedNames = new Set(clientTypes.map((clientType) => `${clientType}.json`));
  if (profilePaths.length !== expectedNames.size) {
    throw new Error('Exactly one source profile is required for each supported client type.');
  }
  for (const path of profilePaths) {
    const fileName = relative(profileDirectory, path);
    if (!expectedNames.delete(fileName)) throw new Error(`Unexpected profile ${fileName}.`);
    const profile = await loadProfile(path, validators.profile);
    if (`${profile.client_type}.json` !== fileName) {
      throw new Error(`${fileName} declares client_type ${profile.client_type}.`);
    }
    await buildBundleFromProfile(profile, validators);
  }
  if (expectedNames.size !== 0) {
    throw new Error(`Missing profiles: ${[...expectedNames].join(', ')}.`);
  }
}

export async function buildConfigBundles(): Promise<Map<ClientType, ConfigBundle>> {
  const validators = await createValidators();
  const bundles = new Map<ClientType, ConfigBundle>();

  for (const clientType of clientTypes) {
    const profile = await loadProfile(
      resolve(profileDirectory, `${clientType}.json`),
      validators.profile,
    );
    const bundle = await buildBundleFromProfile(profile, validators);
    bundles.set(clientType, bundle);
  }
  return bundles;
}

export async function writeConfigBundles(
  bundles: ReadonlyMap<ClientType, ConfigBundle>,
): Promise<void> {
  await mkdir(publishedDirectory, { recursive: true });
  for (const [clientType, bundle] of bundles) {
    const contents = await format(JSON.stringify(bundle), { parser: 'json' });
    await writeFile(resolve(publishedDirectory, `${clientType}.bundle.json`), contents, 'utf8');
  }
}

export async function assertPublishedBundlesCurrent(
  bundles: ReadonlyMap<ClientType, ConfigBundle>,
): Promise<void> {
  const stale: string[] = [];
  for (const [clientType, bundle] of bundles) {
    const expected = await format(JSON.stringify(bundle), { parser: 'json' });
    let actual: string;
    try {
      actual = await readFile(resolve(publishedDirectory, `${clientType}.bundle.json`), 'utf8');
    } catch {
      stale.push(clientType);
      continue;
    }
    if (actual !== expected) stale.push(clientType);
  }

  if (stale.length > 0) {
    throw new Error(
      `Published bundles are stale or missing for: ${stale.join(', ')}. Run pnpm config:build.`,
    );
  }
}
