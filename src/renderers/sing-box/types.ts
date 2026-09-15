export interface SingBoxConfig {
  $schema: string;
  log: {
    level: 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal' | 'panic';
    timestamp: boolean;
  };
  dns: DnsConfig;
  http_clients: HttpClient[];
  inbounds: TunInbound[];
  outbounds: Outbound[];
  route: RouteConfig;
}

export interface DnsConfig {
  servers: DnsServer[];
  rules: DnsRule[];
  final: string;
  strategy: 'prefer_ipv4' | 'ipv4_only';
  disable_cache: boolean;
  optimistic: boolean;
  timeout: string;
}

export interface HttpsDnsServer {
  type: 'https';
  tag: string;
  server: string;
  server_port: number;
  path: string;
  tls: {
    enabled: true;
    server_name: string;
  };
  detour?: string;
}

export interface FakeIpDnsServer {
  type: 'fakeip';
  tag: string;
  inet4_range: string;
  inet6_range: string;
}

export type DnsServer = HttpsDnsServer | FakeIpDnsServer;

export type DnsRule =
  | { query_type: ['AAAA']; action: 'reject'; no_drop: true }
  | { query_type: ['A', 'AAAA']; action: 'route'; server: string }
  | { rule_set: string; action: 'route'; server: string }
  | { action: 'route'; server: string };

export interface HttpClient {
  tag: string;
  detour: string;
}

export interface TunInbound {
  type: 'tun';
  tag: string;
  address: string[];
  mtu: number;
  stack: 'system' | 'gvisor' | 'mixed';
  dns_mode: 'hijack';
  auto_route: true;
  route_exclude_address?: string[];
  strict_route?: true;
  auto_redirect?: true;
}

export type Outbound =
  | VlessOutbound
  | { type: 'selector'; tag: string; outbounds: string[]; default: string }
  | {
      type: 'urltest';
      tag: string;
      outbounds: string[];
      url: string;
      interval: string;
      tolerance: number;
    }
  | { type: 'direct'; tag: string; network_strategy?: 'hybrid' }
  | { type: 'block'; tag: string };

export interface VlessOutbound {
  type: 'vless';
  tag: string;
  server: string;
  server_port: number;
  uuid: string;
  packet_encoding: 'xudp';
  flow?: 'xtls-rprx-vision';
  domain_resolver?: string;
  tls: {
    enabled: true;
    server_name: string;
    utls?: {
      enabled: true;
      fingerprint: string;
    };
    reality: {
      enabled: true;
      public_key: string;
      short_id: string;
    };
  };
}

export type RouteRule =
  | { action: 'sniff' }
  | { protocol: 'dns'; action: 'hijack-dns' }
  | { ip_is_private: true; action: 'route'; outbound: string }
  | { ip_version: 4 | 6; action: 'route'; outbound: string }
  | { rule_set: string; action: 'route'; outbound: string }
  | { action: 'resolve'; strategy?: 'ipv4_only' };

export interface RemoteRuleSet {
  type: 'remote';
  tag: string;
  format: 'binary';
  url: string;
  http_client: string;
}

export interface RouteConfig {
  rules: RouteRule[];
  rule_set: RemoteRuleSet[];
  final: string;
  default_http_client: string;
  default_domain_resolver: string;
  auto_detect_interface?: true;
  override_android_vpn?: false;
}
