import type { CanonicalNode } from '../../domain/canonical-node';
import { singBoxTags } from './tags';
import type { Outbound, VlessOutbound } from './types';

const reservedTags = new Set(Object.values(singBoxTags));

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

function createNodeTags(nodes: CanonicalNode[]): string[] {
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

function renderNode(node: CanonicalNode, tag: string): VlessOutbound {
  return {
    type: 'vless',
    tag,
    server: node.server,
    server_port: node.serverPort,
    uuid: node.uuid,
    packet_encoding: 'xudp',
    ...(node.flow === undefined ? {} : { flow: node.flow }),
    ...(isIpAddress(node.server) ? {} : { domain_resolver: singBoxTags.dnsChina }),
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

export function generateOutbounds(nodes: CanonicalNode[]): OutboundFragment {
  if (nodes.length === 0) {
    throw new Error('Cannot generate outbounds without compatible nodes.');
  }

  const nodeTags = createNodeTags(nodes);
  const nodeOutbounds = nodes.map((node, index) => renderNode(node, nodeTags[index] ?? ''));

  return {
    nodeTags,
    outbounds: [
      ...nodeOutbounds,
      {
        type: 'urltest',
        tag: singBoxTags.automatic,
        outbounds: nodeTags,
        url: 'https://www.gstatic.com/generate_204',
        interval: '3m',
        tolerance: 50,
      },
      {
        type: 'selector',
        tag: singBoxTags.proxy,
        outbounds: [singBoxTags.automatic, ...nodeTags],
        default: singBoxTags.automatic,
      },
      { type: 'direct', tag: singBoxTags.direct },
      { type: 'block', tag: singBoxTags.block },
    ],
  };
}
