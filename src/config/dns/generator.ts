import { singBoxTags } from '../../renderers/sing-box/tags';
import type { ClientType } from '../../domain/canonical-node';
import {
  defaultIosRoutingMode,
  type IosRoutingMode,
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
  iosRoutingMode: IosRoutingMode = defaultIosRoutingMode,
): DnsFragment {
  const forceIpv4 = usesIpv4OnlyDns(clientType, iosRoutingMode);
  const rules: DnsRule[] = [];

  if (forceIpv4) {
    rules.push({ query_type: ['AAAA'], action: 'reject', no_drop: true });
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
