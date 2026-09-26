import type {
  DnsConfig,
  HttpClient,
  RemoteRuleSet,
  RouteConfig,
  RouteRule,
  TunInbound,
} from '../../renderers/sing-box/types';
import type { ClientType } from '../../domain/canonical-node';

export interface ChannelProfile {
  bundle_url: string;
  sha256: string;
}

export interface ChannelManifest {
  schema_version: 1;
  channel: 'staging' | 'production';
  profiles: Partial<Record<ClientType, ChannelProfile>>;
}

export interface CommonConfigFragment {
  $schema: string;
  log: {
    level: 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal' | 'panic';
    timestamp: boolean;
  };
  experimental?: { cache_file: { enabled: true } };
}

export interface PlatformConfigFragment {
  inbounds: TunInbound[];
  route: Pick<RouteConfig, 'auto_detect_interface' | 'override_android_vpn'>;
}

export interface RoutingConfigFragment {
  http_clients: HttpClient[];
  route: {
    rules: RouteRule[];
    rule_set: RemoteRuleSet[];
    final: string;
    default_http_client: string;
    default_domain_resolver: string;
  };
}

export interface OutboundPolicyFragment {
  node_defaults: {
    packet_encoding: 'xudp';
    domain_resolver: string;
  };
  urltest?: {
    type: 'urltest';
    tag: 'auto';
    url: string;
    interval: string;
    tolerance: number;
  };
  selector: {
    type: 'selector';
    tag: string;
    default: 'auto' | 'first_node';
  };
  service_selectors?: {
    type: 'selector';
    tag: string;
    default: 'global' | 'direct' | 'block' | 'uk' | 'uk_node';
    choices: ('global' | 'nodes' | 'direct' | 'block' | 'uk' | 'uk_node')[];
  }[];
  direct: {
    type: 'direct';
    tag: 'direct';
    network_strategy?: 'hybrid';
  };
  block: {
    type: 'block';
    tag: 'block';
  };
  region_selectors?: {
    type: 'selector';
    tag: string;
    region: 'uk';
    on_missing: 'block';
  }[];
}

export interface RemoteConfigBundle {
  schema_version: 1;
  target: {
    format: 'sing-box';
    version: '1.14.0';
    client_type: ClientType;
  };
  fragments: {
    common: CommonConfigFragment;
    dns: DnsConfig;
    platform: PlatformConfigFragment;
    route: RoutingConfigFragment;
    outbound_policy: OutboundPolicyFragment;
  };
}
