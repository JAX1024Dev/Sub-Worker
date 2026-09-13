import type { ClientType } from '../domain/canonical-node';
import type { RouteConfig, TunInbound } from '../renderers/sing-box/types';
import { chinaIpv6RouteExcludes } from '../config/rules/geoip-cn-ipv6';

export interface PlatformOverlay {
  inbounds: TunInbound[];
  route: Pick<RouteConfig, 'auto_detect_interface' | 'override_android_vpn'>;
}

export function generatePlatformOverlay(clientType: ClientType): PlatformOverlay {
  const tun: TunInbound = {
    type: 'tun',
    tag: 'tun-in',
    address: ['172.19.0.1/30', 'fdfe:dcba:9876::1/126'],
    mtu: 9000,
    stack: 'mixed',
    dns_mode: 'hijack',
    auto_route: true,
    ...(clientType === 'ios' ? { route_exclude_address: [...chinaIpv6RouteExcludes] } : {}),
    ...(clientType === 'windows' || clientType === 'linux' ? { strict_route: true } : {}),
    ...(clientType === 'linux' ? { auto_redirect: true } : {}),
  };

  switch (clientType) {
    case 'android':
      return { inbounds: [tun], route: { override_android_vpn: false } };
    case 'macos':
    case 'windows':
    case 'linux':
    case 'ios':
      return { inbounds: [tun], route: { auto_detect_interface: true } };
  }
}
