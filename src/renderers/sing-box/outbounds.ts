import type { CanonicalNode } from '../../domain/canonical-node';
import { singBoxTags } from './tags';
import type { Outbound, VlessOutbound } from './types';

export interface OutboundRenderPolicy {
  nodeDefaults: {
    packetEncoding: 'xudp';
    domainResolver: string;
  };
  urltest: {
    type: 'urltest';
    tag: string;
    url: string;
    interval: string;
    tolerance: number;
  };
  selector: {
    type: 'selector';
    tag: string;
    default: string;
  };
  direct: {
    type: 'direct';
    tag: string;
    network_strategy?: 'hybrid';
  };
  block: {
    type: 'block';
    tag: string;
  };
  regionSelectors?: {
    type: 'selector';
    tag: string;
    region: 'uk';
    onMissing: 'block';
  }[];
  reservedTags: readonly string[];
}

function isUkNodeName(name: string): boolean {
  return /🇬🇧|英国|英國|(?:^|[^a-z])(?:uk|gb|united kingdom|london)(?=$|[^a-z])/iu.test(name);
}

function isIpAddress(value: string): boolean {
  if (value.includes(':')) {
    return /^[0-9a-f:]+$/i.test(value);
  }
  const octets = value.split('.');
  return (
    octets.length === 4 &&
    octets.every((octet) => {
      const number = Number(octet);
      return /^\d{1,3}$/.test(octet) && number >= 0 && number <= 255;
    })
  );
}

function createNodeTags(nodes: CanonicalNode[], reservedTags: readonly string[]): string[] {
  const used = new Set<string>(reservedTags);

  return nodes.map((node, index) => {
    const base = node.name === '' ? `node-${String(index + 1)}` : node.name;
    let candidate = base;
    let suffix = 2;
    while (used.has(candidate)) {
      candidate = `${base} (${String(suffix)})`;
      suffix += 1;
    }
    used.add(candidate);
    return candidate;
  });
}

function renderNode(
  node: CanonicalNode,
  tag: string,
  defaults: OutboundRenderPolicy['nodeDefaults'],
): VlessOutbound {
  return {
    type: 'vless',
    tag,
    server: node.server,
    server_port: node.serverPort,
    uuid: node.uuid,
    packet_encoding: defaults.packetEncoding,
    ...(node.flow === undefined ? {} : { flow: node.flow }),
    ...(isIpAddress(node.server) ? {} : { domain_resolver: defaults.domainResolver }),
    tls: {
      enabled: true,
      server_name: node.reality.serverName,
      ...(node.reality.fingerprint === undefined
        ? {}
        : { utls: { enabled: true as const, fingerprint: node.reality.fingerprint } }),
      reality: {
        enabled: true,
        public_key: node.reality.publicKey,
        short_id: node.reality.shortId ?? '',
      },
    },
  };
}

export interface OutboundFragment {
  outbounds: Outbound[];
  nodeTags: string[];
}

export interface GenerateOutboundsOptions {
  directNetworkStrategy?: 'hybrid';
}

export function generateOutboundsFromPolicy(
  nodes: CanonicalNode[],
  policy: OutboundRenderPolicy,
): OutboundFragment {
  if (nodes.length === 0) {
    throw new Error('Cannot generate outbounds without compatible nodes.');
  }

  const nodeTags = createNodeTags(nodes, policy.reservedTags);
  const nodeOutbounds = nodes.map((node, index) =>
    renderNode(node, nodeTags[index] ?? '', policy.nodeDefaults),
  );

  return {
    nodeTags,
    outbounds: [
      ...nodeOutbounds,
      {
        type: policy.urltest.type,
        tag: policy.urltest.tag,
        outbounds: nodeTags,
        url: policy.urltest.url,
        interval: policy.urltest.interval,
        tolerance: policy.urltest.tolerance,
      },
      {
        type: policy.selector.type,
        tag: policy.selector.tag,
        outbounds: [policy.urltest.tag, ...nodeTags],
        default: policy.selector.default,
      },
      ...(policy.regionSelectors ?? []).map((selector): Outbound => {
        const matched = nodes.flatMap((node, index) =>
          isUkNodeName(node.name) ? [nodeTags[index] ?? ''] : [],
        );
        const outbounds = matched.length > 0 ? matched : [policy.block.tag];
        return {
          type: 'selector',
          tag: selector.tag,
          outbounds,
          default: outbounds[0] ?? policy.block.tag,
        };
      }),
      { ...policy.direct },
      { ...policy.block },
    ],
  };
}

export function generateOutbounds(
  nodes: CanonicalNode[],
  options: GenerateOutboundsOptions = {},
): OutboundFragment {
  return generateOutboundsFromPolicy(nodes, {
    nodeDefaults: { packetEncoding: 'xudp', domainResolver: singBoxTags.dnsChina },
    urltest: {
      type: 'urltest',
      tag: singBoxTags.automatic,
      url: 'https://www.gstatic.com/generate_204',
      interval: '3m',
      tolerance: 50,
    },
    selector: {
      type: 'selector',
      tag: singBoxTags.proxy,
      default: singBoxTags.automatic,
    },
    direct: {
      type: 'direct',
      tag: singBoxTags.direct,
      ...(options.directNetworkStrategy === undefined
        ? {}
        : { network_strategy: options.directNetworkStrategy }),
    },
    block: { type: 'block', tag: singBoxTags.block },
    reservedTags: Object.values(singBoxTags),
  });
}
