import { singBoxTags } from '../../renderers/sing-box/tags';
import type { ClientType } from '../../domain/canonical-node';
import type { HttpClient, RemoteRuleSet, RouteConfig } from '../../renderers/sing-box/types';
import { ruleSetSources } from './rule-set-sources';

export interface RoutingFragment {
  httpClients: HttpClient[];
  route: RouteConfig;
}

function remoteRuleSet(tag: string, url: string): RemoteRuleSet {
  return {
    type: 'remote',
    tag,
    format: 'binary',
    url,
    http_client: singBoxTags.rulesHttpClient,
  };
}

export function generateRules(clientType: ClientType): RoutingFragment {
  return {
    httpClients: [{ tag: singBoxTags.rulesHttpClient, detour: singBoxTags.proxy }],
    route: {
      rules: [
        { action: 'sniff' },
        { protocol: 'dns', action: 'hijack-dns' },
        { ip_is_private: true, action: 'route', outbound: singBoxTags.direct },
        {
          rule_set: singBoxTags.ruleSetGeositeChina,
          action: 'route',
          outbound: singBoxTags.direct,
        },
        {
          rule_set: singBoxTags.ruleSetGeositeNonChina,
          action: 'route',
          outbound: singBoxTags.proxy,
        },
        clientType === 'ios' ? { action: 'resolve', strategy: 'ipv4_only' } : { action: 'resolve' },
        { ip_is_private: true, action: 'route', outbound: singBoxTags.direct },
        {
          rule_set: singBoxTags.ruleSetGeoIpChina,
          action: 'route',
          outbound: singBoxTags.direct,
        },
      ],
      rule_set: [
        remoteRuleSet(singBoxTags.ruleSetGeositeChina, ruleSetSources.geositeChina.url),
        remoteRuleSet(singBoxTags.ruleSetGeositeNonChina, ruleSetSources.geositeNonChina.url),
        remoteRuleSet(singBoxTags.ruleSetGeoIpChina, ruleSetSources.geoIpChina.url),
      ],
      final: singBoxTags.proxy,
      default_http_client: singBoxTags.rulesHttpClient,
      default_domain_resolver: singBoxTags.dnsChina,
    },
  };
}
