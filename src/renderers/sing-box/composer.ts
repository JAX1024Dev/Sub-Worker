import { generateDns } from '../../config/dns/generator';
import { generateRules } from '../../config/rules/generator';
import type { CanonicalNode, ClientType } from '../../domain/canonical-node';
import { generatePlatformOverlay } from '../../platforms/overlay';
import { generateOutbounds } from './outbounds';
import type { SingBoxConfig } from './types';

export function composeSingBoxConfig(
  nodes: CanonicalNode[],
  clientType: ClientType,
): SingBoxConfig {
  const dns = generateDns();
  const routing = generateRules();
  const platform = generatePlatformOverlay(clientType);
  const outbounds = generateOutbounds(nodes);

  const tags = outbounds.outbounds.map((outbound) => outbound.tag);
  if (new Set(tags).size !== tags.length) {
    throw new Error('Generated outbound tags are not unique.');
  }

  return {
    $schema: 'https://sing-box.sagernet.org/schema.json',
    log: { level: 'info', timestamp: true },
    dns: dns.dns,
    http_clients: routing.httpClients,
    inbounds: platform.inbounds,
    outbounds: outbounds.outbounds,
    route: { ...routing.route, ...platform.route },
  };
}
