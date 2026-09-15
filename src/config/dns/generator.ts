import { singBoxTags } from '../../renderers/sing-box/tags';
import type { ClientType } from '../../domain/canonical-node';
import {
  resolveNetworkRoutingModes,
  type NetworkRoutingOptions,
  usesMacosFakeIpDualStack,
  usesIpv4OnlyDns,
} from '../../platforms/network-policy';
import type { DnsConfig, DnsRule } from '../../renderers/sing-box/types';

export interface DnsFragment {
  dns: DnsConfig;
  outboundRequirements: {
    domainResolverForDomainNodes: 'dns-cn';
  };
  routeRequirements: {
    explicitHijackDnsRule: true;
  };
  tunRequirements: {
    dnsMode: 'hijack';
  };
}

export function generateDns(
  clientType: ClientType,
  routing: NetworkRoutingOptions = {},
): DnsFragment {
  const { iosRoutingMode, macosRoutingMode } = resolveNetworkRoutingModes(routing);
  const forceIpv4 = usesIpv4OnlyDns(clientType, iosRoutingMode, macosRoutingMode);
  const macosFakeIpDualStack = usesMacosFakeIpDualStack(clientType, macosRoutingMode);
  const rules: DnsRule[] = [];

  if (forceIpv4) {
    rules.push({ query_type: ['AAAA'], action: 'reject', no_drop: true });
  }

  if (macosFakeIpDualStack) {
    rules.push({
      query_type: ['A', 'AAAA'],
      action: 'route',
      server: singBoxTags.dnsFakeIp,
    });
  }

  rules.push(
    {
      rule_set: singBoxTags.ruleSetGeositeChina,
      action: 'route',
      server: singBoxTags.dnsChina,
    },
    { action: 'route', server: singBoxTags.dnsGlobal },
  );

  return {
    dns: {
      servers: [
        ...(macosFakeIpDualStack
          ? [
              {
                type: 'fakeip' as const,
                tag: singBoxTags.dnsFakeIp,
                inet4_range: '198.18.0.0/15' as const,
                inet6_range: 'fc00::/18' as const,
              },
            ]
          : []),
        {
          type: 'https',
          tag: singBoxTags.dnsChina,
          server: '223.5.5.5',
          server_port: 443,
          path: '/dns-query',
          tls: { enabled: true, server_name: 'dns.alidns.com' },
        },
        {
          type: 'https',
          tag: singBoxTags.dnsGlobal,
          server: '1.1.1.1',
          server_port: 443,
          path: '/dns-query',
          tls: { enabled: true, server_name: 'cloudflare-dns.com' },
          detour: singBoxTags.proxy,
        },
      ],
      rules,
      final: singBoxTags.dnsGlobal,
      strategy: forceIpv4 ? 'ipv4_only' : 'prefer_ipv4',
      disable_cache: false,
      optimistic: false,
      timeout: '5s',
    },
    outboundRequirements: { domainResolverForDomainNodes: singBoxTags.dnsChina },
    routeRequirements: { explicitHijackDnsRule: true },
    tunRequirements: { dnsMode: 'hijack' },
  };
}
