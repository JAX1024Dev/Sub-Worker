import type { ClientType } from '../../domain/canonical-node';
import { ServiceError } from '../../domain/errors';
import type {
  DnsRule,
  DnsServer,
  HttpClient,
  RemoteRuleSet,
  RouteRule,
  TunInbound,
} from '../../renderers/sing-box/types';
import type {
  ChannelManifest,
  ChannelProfile,
  CommonConfigFragment,
  OutboundPolicyFragment,
  PlatformConfigFragment,
  RemoteConfigBundle,
  RoutingConfigFragment,
} from './types';
import { validateBundleUrl } from './url-policy';

type JsonRecord = Record<string, unknown>;

const sha256Pattern = /^[0-9a-f]{64}$/u;
const dnsDurationPattern = /^[1-9][0-9]*(?:ms|s|m)$/u;
const outboundDurationPattern = /^[1-9][0-9]*(?:s|m|h)$/u;
const pinnedRuleSetPattern =
  /^https:\/\/raw\.githubusercontent\.com\/[^/]+\/[^/]+\/[0-9a-f]{40}\/.+\.srs$/u;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasKeys(value: JsonRecord, required: string[], optional: string[] = []): boolean {
  const allowed = new Set([...required, ...optional]);
  return (
    required.every((key) => key in value) && Object.keys(value).every((key) => allowed.has(key))
  );
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isStringArray(value: unknown, minimumLength = 0): value is string[] {
  return Array.isArray(value) && value.length >= minimumLength && value.every(isNonEmptyString);
}

function isClientType(value: string): value is ClientType {
  return (
    value === 'ios' ||
    value === 'macos' ||
    value === 'android' ||
    value === 'windows' ||
    value === 'linux'
  );
}

function isChannelProfile(value: unknown): value is ChannelProfile {
  return (
    isRecord(value) &&
    hasKeys(value, ['bundle_url', 'sha256']) &&
    isNonEmptyString(value.bundle_url) &&
    typeof value.sha256 === 'string' &&
    sha256Pattern.test(value.sha256)
  );
}

export function parseChannelManifest(value: unknown): ChannelManifest {
  if (
    !isRecord(value) ||
    !hasKeys(value, ['schema_version', 'channel', 'profiles']) ||
    value.schema_version !== 1 ||
    (value.channel !== 'staging' && value.channel !== 'production') ||
    !isRecord(value.profiles) ||
    Object.keys(value.profiles).length === 0
  ) {
    throw new ServiceError('CONFIG_SOURCE_INVALID', 'Configuration manifest is invalid.');
  }

  const profiles: Partial<Record<ClientType, ChannelProfile>> = {};
  for (const [clientType, profile] of Object.entries(value.profiles)) {
    if (!isClientType(clientType) || !isChannelProfile(profile)) {
      throw new ServiceError('CONFIG_SOURCE_INVALID', 'Configuration manifest profile is invalid.');
    }
    validateBundleUrl(profile.bundle_url, clientType);
    profiles[clientType] = profile;
  }

  return { schema_version: 1, channel: value.channel, profiles };
}

function isCommonFragment(value: unknown): value is CommonConfigFragment {
  if (
    !isRecord(value) ||
    !hasKeys(value, ['$schema', 'log'], ['experimental']) ||
    value.$schema !== 'https://sing-box.sagernet.org/schema.json' ||
    !isRecord(value.log) ||
    !hasKeys(value.log, ['level', 'timestamp']) ||
    typeof value.log.timestamp !== 'boolean' ||
    (value.experimental !== undefined &&
      (!isRecord(value.experimental) ||
        !hasKeys(value.experimental, ['cache_file']) ||
        !isRecord(value.experimental.cache_file) ||
        !hasKeys(value.experimental.cache_file, ['enabled']) ||
        value.experimental.cache_file.enabled !== true))
  ) {
    return false;
  }
  return (
    value.log.level === 'trace' ||
    value.log.level === 'debug' ||
    value.log.level === 'info' ||
    value.log.level === 'warn' ||
    value.log.level === 'error' ||
    value.log.level === 'fatal' ||
    value.log.level === 'panic'
  );
}

function isHttpsDnsServer(value: JsonRecord): value is JsonRecord & DnsServer {
  return (
    hasKeys(value, ['type', 'tag', 'server', 'server_port', 'path', 'tls'], ['detour']) &&
    value.type === 'https' &&
    isNonEmptyString(value.tag) &&
    isNonEmptyString(value.server) &&
    Number.isInteger(value.server_port) &&
    typeof value.server_port === 'number' &&
    value.server_port >= 1 &&
    value.server_port <= 65_535 &&
    typeof value.path === 'string' &&
    value.path.startsWith('/') &&
    (value.detour === undefined || isNonEmptyString(value.detour)) &&
    isRecord(value.tls) &&
    hasKeys(value.tls, ['enabled', 'server_name']) &&
    value.tls.enabled === true &&
    isNonEmptyString(value.tls.server_name)
  );
}

function isFakeIpDnsServer(value: JsonRecord): value is JsonRecord & DnsServer {
  return (
    hasKeys(value, ['type', 'tag', 'inet4_range', 'inet6_range']) &&
    value.type === 'fakeip' &&
    isNonEmptyString(value.tag) &&
    isNonEmptyString(value.inet4_range) &&
    isNonEmptyString(value.inet6_range)
  );
}

function isDnsServer(value: unknown): value is DnsServer {
  return isRecord(value) && (isHttpsDnsServer(value) || isFakeIpDnsServer(value));
}

function isDnsRule(value: unknown): value is DnsRule {
  if (!isRecord(value)) return false;
  if (
    hasKeys(value, ['query_type', 'action', 'no_drop']) &&
    Array.isArray(value.query_type) &&
    value.query_type.length === 1 &&
    value.query_type[0] === 'AAAA' &&
    value.action === 'reject' &&
    value.no_drop === true
  ) {
    return true;
  }
  if (
    hasKeys(value, ['query_type', 'action', 'server']) &&
    Array.isArray(value.query_type) &&
    value.query_type.length === 2 &&
    value.query_type[0] === 'A' &&
    value.query_type[1] === 'AAAA' &&
    value.action === 'route' &&
    isNonEmptyString(value.server)
  ) {
    return true;
  }
  if (
    hasKeys(value, ['rule_set', 'action', 'server']) &&
    isNonEmptyString(value.rule_set) &&
    value.action === 'route' &&
    isNonEmptyString(value.server)
  ) {
    return true;
  }
  return (
    hasKeys(value, ['action', 'server']) &&
    value.action === 'route' &&
    isNonEmptyString(value.server)
  );
}

function isDnsFragment(value: unknown): value is RemoteConfigBundle['fragments']['dns'] {
  return (
    isRecord(value) &&
    hasKeys(value, [
      'servers',
      'rules',
      'final',
      'strategy',
      'disable_cache',
      'optimistic',
      'timeout',
    ]) &&
    Array.isArray(value.servers) &&
    value.servers.length >= 2 &&
    value.servers.every(isDnsServer) &&
    Array.isArray(value.rules) &&
    value.rules.length > 0 &&
    value.rules.every(isDnsRule) &&
    isNonEmptyString(value.final) &&
    (value.strategy === 'prefer_ipv4' || value.strategy === 'ipv4_only') &&
    typeof value.disable_cache === 'boolean' &&
    typeof value.optimistic === 'boolean' &&
    typeof value.timeout === 'string' &&
    dnsDurationPattern.test(value.timeout)
  );
}

function isTunInbound(value: unknown): value is TunInbound {
  return (
    isRecord(value) &&
    hasKeys(
      value,
      ['type', 'tag', 'address', 'mtu', 'stack', 'dns_mode', 'auto_route'],
      ['strict_route', 'auto_redirect', 'route_exclude_address'],
    ) &&
    value.type === 'tun' &&
    isNonEmptyString(value.tag) &&
    isStringArray(value.address, 1) &&
    new Set(value.address).size === value.address.length &&
    Number.isInteger(value.mtu) &&
    typeof value.mtu === 'number' &&
    value.mtu >= 1280 &&
    value.mtu <= 65_535 &&
    (value.stack === 'system' || value.stack === 'gvisor' || value.stack === 'mixed') &&
    value.dns_mode === 'hijack' &&
    value.auto_route === true &&
    (value.strict_route === undefined || value.strict_route === true) &&
    (value.auto_redirect === undefined || value.auto_redirect === true) &&
    (value.route_exclude_address === undefined ||
      (isStringArray(value.route_exclude_address) &&
        new Set(value.route_exclude_address).size === value.route_exclude_address.length))
  );
}

function isPlatformFragment(value: unknown): value is PlatformConfigFragment {
  if (
    !isRecord(value) ||
    !hasKeys(value, ['inbounds', 'route']) ||
    !Array.isArray(value.inbounds) ||
    value.inbounds.length === 0 ||
    !value.inbounds.every(isTunInbound) ||
    !isRecord(value.route) ||
    !hasKeys(value.route, [], ['auto_detect_interface', 'override_android_vpn']) ||
    Object.keys(value.route).length === 0
  ) {
    return false;
  }
  return (
    (value.route.auto_detect_interface === undefined ||
      value.route.auto_detect_interface === true) &&
    (value.route.override_android_vpn === undefined || value.route.override_android_vpn === false)
  );
}

function isRouteRule(value: unknown): value is RouteRule {
  if (!isRecord(value)) return false;
  if (hasKeys(value, ['action']) && value.action === 'sniff') return true;
  if (
    hasKeys(value, ['protocol', 'action']) &&
    value.protocol === 'dns' &&
    value.action === 'hijack-dns'
  ) {
    return true;
  }
  if (
    hasKeys(value, ['ip_is_private', 'action', 'outbound']) &&
    value.ip_is_private === true &&
    value.action === 'route' &&
    isNonEmptyString(value.outbound)
  ) {
    return true;
  }
  if (
    hasKeys(value, ['ip_version', 'action', 'outbound']) &&
    (value.ip_version === 4 || value.ip_version === 6) &&
    value.action === 'route' &&
    isNonEmptyString(value.outbound)
  ) {
    return true;
  }
  if (
    hasKeys(value, ['rule_set', 'action', 'outbound']) &&
    isNonEmptyString(value.rule_set) &&
    value.action === 'route' &&
    isNonEmptyString(value.outbound)
  ) {
    return true;
  }
  if (
    hasKeys(value, ['domain_suffix', 'action', 'outbound']) &&
    Array.isArray(value.domain_suffix) &&
    value.domain_suffix.length > 0 &&
    value.domain_suffix.every(
      (domain) => typeof domain === 'string' && /^[a-z0-9.-]+$/u.test(domain),
    ) &&
    value.action === 'route' &&
    isNonEmptyString(value.outbound)
  ) {
    return true;
  }
  return (
    hasKeys(value, ['action'], ['strategy']) &&
    value.action === 'resolve' &&
    (value.strategy === undefined || value.strategy === 'ipv4_only')
  );
}

function isRemoteRuleSet(value: unknown): value is RemoteRuleSet {
  return (
    isRecord(value) &&
    hasKeys(value, ['type', 'tag', 'format', 'url', 'http_client']) &&
    value.type === 'remote' &&
    isNonEmptyString(value.tag) &&
    value.format === 'binary' &&
    typeof value.url === 'string' &&
    pinnedRuleSetPattern.test(value.url) &&
    isNonEmptyString(value.http_client)
  );
}

function isHttpClient(value: unknown): value is HttpClient {
  return (
    isRecord(value) &&
    hasKeys(value, ['tag', 'detour']) &&
    isNonEmptyString(value.tag) &&
    isNonEmptyString(value.detour)
  );
}

function isRoutingFragment(value: unknown): value is RoutingConfigFragment {
  return (
    isRecord(value) &&
    hasKeys(value, ['http_clients', 'route']) &&
    Array.isArray(value.http_clients) &&
    value.http_clients.length > 0 &&
    value.http_clients.every(isHttpClient) &&
    isRecord(value.route) &&
    hasKeys(value.route, [
      'rules',
      'rule_set',
      'final',
      'default_http_client',
      'default_domain_resolver',
    ]) &&
    Array.isArray(value.route.rules) &&
    value.route.rules.length > 0 &&
    value.route.rules.every(isRouteRule) &&
    Array.isArray(value.route.rule_set) &&
    value.route.rule_set.length > 0 &&
    value.route.rule_set.every(isRemoteRuleSet) &&
    isNonEmptyString(value.route.final) &&
    isNonEmptyString(value.route.default_http_client) &&
    isNonEmptyString(value.route.default_domain_resolver)
  );
}

function isOutboundPolicy(value: unknown): value is OutboundPolicyFragment {
  if (
    !isRecord(value) ||
    !hasKeys(
      value,
      ['node_defaults', 'selector', 'direct', 'block'],
      ['urltest', 'region_selectors', 'service_selectors'],
    ) ||
    !isRecord(value.node_defaults) ||
    !hasKeys(value.node_defaults, ['packet_encoding', 'domain_resolver']) ||
    value.node_defaults.packet_encoding !== 'xudp' ||
    !isNonEmptyString(value.node_defaults.domain_resolver) ||
    (value.urltest !== undefined &&
      (!isRecord(value.urltest) ||
        !hasKeys(value.urltest, ['type', 'tag', 'url', 'interval', 'tolerance']) ||
        value.urltest.type !== 'urltest' ||
        value.urltest.tag !== 'auto' ||
        typeof value.urltest.url !== 'string' ||
        !value.urltest.url.startsWith('https://') ||
        typeof value.urltest.interval !== 'string' ||
        !outboundDurationPattern.test(value.urltest.interval) ||
        !Number.isInteger(value.urltest.tolerance) ||
        typeof value.urltest.tolerance !== 'number' ||
        value.urltest.tolerance < 0)) ||
    !isRecord(value.selector) ||
    !hasKeys(value.selector, ['type', 'tag', 'default']) ||
    value.selector.type !== 'selector' ||
    (value.selector.tag !== 'proxy' && value.selector.tag !== '🚀 节点选择') ||
    !['auto', 'first_node'].includes(String(value.selector.default)) ||
    (value.selector.default === 'auto' && value.urltest === undefined) ||
    !isRecord(value.direct) ||
    !hasKeys(value.direct, ['type', 'tag'], ['network_strategy']) ||
    value.direct.type !== 'direct' ||
    value.direct.tag !== 'direct' ||
    (value.direct.network_strategy !== undefined && value.direct.network_strategy !== 'hybrid') ||
    !isRecord(value.block) ||
    !hasKeys(value.block, ['type', 'tag']) ||
    value.block.type !== 'block' ||
    value.block.tag !== 'block' ||
    (value.region_selectors !== undefined &&
      (!Array.isArray(value.region_selectors) ||
        value.region_selectors.length === 0 ||
        !value.region_selectors.every(
          (selector) =>
            isRecord(selector) &&
            hasKeys(selector, ['type', 'tag', 'region', 'on_missing']) &&
            selector.type === 'selector' &&
            isNonEmptyString(selector.tag) &&
            selector.region === 'uk' &&
            selector.on_missing === 'block',
        ))) ||
    (value.service_selectors !== undefined &&
      (!Array.isArray(value.service_selectors) ||
        value.service_selectors.length === 0 ||
        value.service_selectors.length > 24 ||
        !value.service_selectors.every(
          (selector) =>
            isRecord(selector) &&
            hasKeys(selector, ['type', 'tag', 'default', 'choices']) &&
            selector.type === 'selector' &&
            isNonEmptyString(selector.tag) &&
            ['global', 'direct', 'block', 'uk', 'uk_node'].includes(String(selector.default)) &&
            Array.isArray(selector.choices) &&
            selector.choices.length > 0 &&
            selector.choices.length <= 5 &&
            selector.choices.every((choice) =>
              ['global', 'nodes', 'direct', 'block', 'uk', 'uk_node'].includes(String(choice)),
            ) &&
            new Set(selector.choices).size === selector.choices.length &&
            selector.choices.includes(selector.default),
        )))
  ) {
    return false;
  }
  return true;
}

function validateBundleSemantics(bundle: RemoteConfigBundle): void {
  const dnsTags = new Set(bundle.fragments.dns.servers.map((server) => server.tag));
  const inboundTags = new Set(bundle.fragments.platform.inbounds.map((inbound) => inbound.tag));
  const httpClientTags = new Set(bundle.fragments.route.http_clients.map((client) => client.tag));
  const ruleSetTags = new Set(bundle.fragments.route.route.rule_set.map((ruleSet) => ruleSet.tag));
  const tags = [
    ...(bundle.fragments.outbound_policy.urltest === undefined
      ? []
      : [bundle.fragments.outbound_policy.urltest.tag]),
    bundle.fragments.outbound_policy.selector.tag,
    bundle.fragments.outbound_policy.direct.tag,
    bundle.fragments.outbound_policy.block.tag,
    ...(bundle.fragments.outbound_policy.region_selectors ?? []).map((selector) => selector.tag),
    ...(bundle.fragments.outbound_policy.service_selectors ?? []).map((selector) => selector.tag),
  ];
  const outboundTags: Set<string> = new Set(tags);

  if (
    dnsTags.size !== bundle.fragments.dns.servers.length ||
    inboundTags.size !== bundle.fragments.platform.inbounds.length ||
    httpClientTags.size !== bundle.fragments.route.http_clients.length ||
    ruleSetTags.size !== bundle.fragments.route.route.rule_set.length ||
    outboundTags.size !== tags.length ||
    !inboundTags.has('tun-in') ||
    !dnsTags.has(bundle.fragments.dns.final) ||
    !dnsTags.has(bundle.fragments.route.route.default_domain_resolver) ||
    !dnsTags.has(bundle.fragments.outbound_policy.node_defaults.domain_resolver) ||
    !httpClientTags.has(bundle.fragments.route.route.default_http_client) ||
    !outboundTags.has(bundle.fragments.route.route.final)
  ) {
    throw new ServiceError('CONFIG_SOURCE_INVALID', 'Configuration bundle references are invalid.');
  }

  for (const server of bundle.fragments.dns.servers) {
    if ('detour' in server && !outboundTags.has(server.detour)) {
      throw new ServiceError('CONFIG_SOURCE_INVALID', 'DNS detour reference is invalid.');
    }
  }
  for (const selector of bundle.fragments.outbound_policy.service_selectors ?? []) {
    if (
      selector.choices.includes('uk') &&
      !bundle.fragments.outbound_policy.region_selectors?.length
    ) {
      throw new ServiceError('CONFIG_SOURCE_INVALID', 'Service selector UK choice is unavailable.');
    }
  }
  for (const rule of bundle.fragments.dns.rules) {
    if ('server' in rule && !dnsTags.has(rule.server)) {
      throw new ServiceError('CONFIG_SOURCE_INVALID', 'DNS server reference is invalid.');
    }
    if ('rule_set' in rule && !ruleSetTags.has(rule.rule_set)) {
      throw new ServiceError('CONFIG_SOURCE_INVALID', 'DNS rule-set reference is invalid.');
    }
  }
  for (const client of bundle.fragments.route.http_clients) {
    if (!outboundTags.has(client.detour)) {
      throw new ServiceError('CONFIG_SOURCE_INVALID', 'HTTP client detour is invalid.');
    }
  }
  for (const ruleSet of bundle.fragments.route.route.rule_set) {
    if (!httpClientTags.has(ruleSet.http_client)) {
      throw new ServiceError('CONFIG_SOURCE_INVALID', 'Rule-set HTTP client is invalid.');
    }
  }
  for (const rule of bundle.fragments.route.route.rules) {
    if ('outbound' in rule && !outboundTags.has(rule.outbound)) {
      throw new ServiceError('CONFIG_SOURCE_INVALID', 'Route outbound reference is invalid.');
    }
    if ('rule_set' in rule && !ruleSetTags.has(rule.rule_set)) {
      throw new ServiceError('CONFIG_SOURCE_INVALID', 'Route rule-set reference is invalid.');
    }
  }

  const routeKeys = Object.keys(bundle.fragments.platform.route);
  const validPlatformRoute =
    bundle.target.client_type === 'android'
      ? routeKeys.length === 1 && routeKeys[0] === 'override_android_vpn'
      : routeKeys.length === 1 && routeKeys[0] === 'auto_detect_interface';
  if (!validPlatformRoute) {
    throw new ServiceError('CONFIG_SOURCE_INVALID', 'Platform route ownership is invalid.');
  }
}

export function parseRemoteConfigBundle(
  value: unknown,
  expectedClientType: ClientType,
): RemoteConfigBundle {
  if (
    !isRecord(value) ||
    !hasKeys(value, ['schema_version', 'target', 'fragments']) ||
    value.schema_version !== 1 ||
    !isRecord(value.target) ||
    !hasKeys(value.target, ['format', 'version', 'client_type']) ||
    value.target.format !== 'sing-box' ||
    value.target.version !== '1.14.0' ||
    value.target.client_type !== expectedClientType ||
    !isRecord(value.fragments) ||
    !hasKeys(value.fragments, ['common', 'dns', 'platform', 'route', 'outbound_policy']) ||
    !isCommonFragment(value.fragments.common) ||
    !isDnsFragment(value.fragments.dns) ||
    !isPlatformFragment(value.fragments.platform) ||
    !isRoutingFragment(value.fragments.route) ||
    !isOutboundPolicy(value.fragments.outbound_policy)
  ) {
    throw new ServiceError('CONFIG_SOURCE_INVALID', 'Configuration bundle is invalid.');
  }

  const bundle: RemoteConfigBundle = {
    schema_version: 1,
    target: {
      format: 'sing-box',
      version: '1.14.0',
      client_type: expectedClientType,
    },
    fragments: {
      common: value.fragments.common,
      dns: value.fragments.dns,
      platform: value.fragments.platform,
      route: value.fragments.route,
      outbound_policy: value.fragments.outbound_policy,
    },
  };
  validateBundleSemantics(bundle);
  return bundle;
}
