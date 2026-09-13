export interface SingBoxConfig {
  $schema: string;
  log: {
    level: 'info';
    timestamp: true;
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
  disable_cache: false;
  optimistic: false;
  timeout: '5s';
}

export interface DnsServer {
  type: 'https';
  tag: string;
  server: string;
  server_port: 443;
  path: '/dns-query';
  tls: {
    enabled: true;
    server_name: string;
  };
  detour?: string;
}

export type DnsRule =
  | { query_type: ['AAAA']; action: 'reject'; no_drop: true }
  | { rule_set: string; action: 'route'; server: string }
  | { action: 'route'; server: string };

export interface HttpClient {
  tag: string;
  detour: string;
}

export interface TunInbound {
  type: 'tun';
  tag: 'tun-in';
  address: string[];
  mtu: 9000;
  stack: 'mixed';
  dns_mode: 'hijack';
  auto_route: true;
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
  | { type: 'direct' | 'block'; tag: string };

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
  | { ip_version: 6; action: 'route'; outbound: string }
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
