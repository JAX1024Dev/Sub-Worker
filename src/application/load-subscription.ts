import type { ParsedSubscription } from '../domain/canonical-node';
import { parseSubscription } from '../parsers/subscription-parser';
import { fetchSubscription } from '../sources/three-x-ui/source-adapter';
import type { SubscriptionDocument } from '../sources/three-x-ui/subscription-document';

export interface LoadSubscriptionOptions {
  baseUrl: string;
  subscriptionId: string;
  fetcher?: typeof fetch;
}

export interface LoadedSubscription extends ParsedSubscription {
  metadata: SubscriptionDocument['metadata'];
}

export async function loadSubscription(
  options: LoadSubscriptionOptions,
): Promise<LoadedSubscription> {
  const document = await fetchSubscription(
    options.baseUrl,
    options.subscriptionId,
    options.fetcher,
  );
  return { ...parseSubscription(document), metadata: document.metadata };
}
