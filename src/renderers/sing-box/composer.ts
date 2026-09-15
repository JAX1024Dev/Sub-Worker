import { generateDns } from '../../config/dns/generator';
import { generateRules } from '../../config/rules/generator';
import type { CanonicalNode, ClientType } from '../../domain/canonical-node';
import {
  resolveNetworkRoutingModes,
  type NetworkRoutingOptions,
  usesIosTunDualStack,
  usesMacosFakeIpDualStack,
} from '../../platforms/network-policy';
import { generatePlatformOverlay } from '../../platforms/overlay';
import { generateOutbounds } from './outbounds';
import type { SingBoxConfig } from './types';

export function composeSingBoxConfig(
  nodes: CanonicalNode[],
  clientType: ClientType,
  options: NetworkRoutingOptions = {},
): SingBoxConfig {
  const { iosRoutingMode, macosRoutingMode } = resolveNetworkRoutingModes(options);
  const iosTunDualStack = usesIosTunDualStack(clientType, iosRoutingMode);
  const macosFakeIpDualStack = usesMacosFakeIpDualStack(clientType, macosRoutingMode);
  const dns = generateDns(clientType, { iosRoutingMode, macosRoutingMode });
  const routing = generateRules(clientType, { iosRoutingMode, macosRoutingMode });
  const platform = generatePlatformOverlay(clientType, { iosRoutingMode, macosRoutingMode });
  const outbounds = generateOutbounds(nodes, {
    ...(iosTunDualStack || macosFakeIpDualStack
      ? { directNetworkStrategy: 'hybrid' as const }
      : {}),
  });

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
