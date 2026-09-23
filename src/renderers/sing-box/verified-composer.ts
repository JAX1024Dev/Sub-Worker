import type { CanonicalNode } from '../../domain/canonical-node';
import { ServiceError } from '../../domain/errors';
import type { RemoteConfigBundle } from '../../sources/remote-config/types';
import { generateOutboundsFromPolicy } from './outbounds';
import type { SingBoxConfig } from './types';

function collectReservedTags(bundle: RemoteConfigBundle): string[] {
  return [
    ...bundle.fragments.dns.servers.map((server) => server.tag),
    ...bundle.fragments.platform.inbounds.map((inbound) => inbound.tag),
    ...bundle.fragments.route.http_clients.map((client) => client.tag),
    ...bundle.fragments.route.route.rule_set.map((ruleSet) => ruleSet.tag),
    bundle.fragments.outbound_policy.urltest.tag,
    bundle.fragments.outbound_policy.selector.tag,
    bundle.fragments.outbound_policy.direct.tag,
    bundle.fragments.outbound_policy.block.tag,
    ...(bundle.fragments.outbound_policy.region_selectors ?? []).map((selector) => selector.tag),
  ];
}

function buildPlatformRoute(
  bundle: RemoteConfigBundle,
): Pick<SingBoxConfig['route'], 'auto_detect_interface' | 'override_android_vpn'> {
  if (bundle.target.client_type === 'android') {
    if (bundle.fragments.platform.route.override_android_vpn !== false) {
      throw new Error('Android platform route option is missing.');
    }
    return { override_android_vpn: false };
  }
  if (bundle.fragments.platform.route.auto_detect_interface !== true) {
    throw new Error('Platform interface detection option is missing.');
  }
  return { auto_detect_interface: true };
}

export function composeVerifiedSingBoxConfig(
  nodes: CanonicalNode[],
  bundle: RemoteConfigBundle,
): SingBoxConfig {
  if (nodes.length === 0) {
    throw new ServiceError('NO_COMPATIBLE_NODES', 'No compatible nodes are available.');
  }

  try {
    const policy = bundle.fragments.outbound_policy;
    const generated = generateOutboundsFromPolicy(nodes, {
      nodeDefaults: {
        packetEncoding: policy.node_defaults.packet_encoding,
        domainResolver: policy.node_defaults.domain_resolver,
      },
      urltest: policy.urltest,
      selector: policy.selector,
      direct: policy.direct,
      block: policy.block,
      reservedTags: collectReservedTags(bundle),
      ...(policy.region_selectors === undefined
        ? {}
        : {
            regionSelectors: policy.region_selectors.map((selector) => ({
              type: selector.type,
              tag: selector.tag,
              region: selector.region,
              onMissing: selector.on_missing,
            })),
          }),
    });
    const outboundTags = generated.outbounds.map((outbound) => outbound.tag);
    if (new Set(outboundTags).size !== outboundTags.length) {
      throw new Error('Generated outbound tags are not unique.');
    }

    const platformRoute = buildPlatformRoute(bundle);

    return {
      $schema: bundle.fragments.common.$schema,
      log: bundle.fragments.common.log,
      dns: bundle.fragments.dns,
      http_clients: bundle.fragments.route.http_clients,
      inbounds: bundle.fragments.platform.inbounds,
      outbounds: generated.outbounds,
      route: {
        ...bundle.fragments.route.route,
        ...platformRoute,
      },
    };
  } catch (error) {
    throw new ServiceError('CONFIG_COMPOSITION_FAILED', 'Configuration composition failed.', {
      cause: error,
    });
  }
}
