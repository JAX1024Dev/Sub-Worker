import type { IgnoredNodeReason, ParsedSubscription } from '../domain/canonical-node';
import type { SubscriptionDocument } from '../sources/three-x-ui/subscription-document';
import { parseVlessRealityLink } from './vless-reality';

export function parseSubscription(document: SubscriptionDocument): ParsedSubscription {
  const nodes: ParsedSubscription['nodes'] = [];
  const ignoredByReason: Partial<Record<IgnoredNodeReason, number>> = {};

  document.links.forEach((link, sourceIndex) => {
    const result = parseVlessRealityLink(link, sourceIndex);
    if (result.ok) {
      nodes.push(result.node);
      return;
    }

    ignoredByReason[result.reason] = (ignoredByReason[result.reason] ?? 0) + 1;
  });

  return {
    nodes,
    summary: {
      total: document.links.length,
      accepted: nodes.length,
      ignored: document.links.length - nodes.length,
      ignoredByReason,
    },
  };
}
