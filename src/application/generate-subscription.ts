import type { ClientType } from '../domain/canonical-node';
import { ServiceError } from '../domain/errors';
import type { IosRoutingMode } from '../platforms/network-policy';
import { composeSingBoxConfig } from '../renderers/sing-box/composer';
import type { SingBoxConfig } from '../renderers/sing-box/types';
import type { SubscriptionMetadata } from '../sources/three-x-ui/subscription-document';
import { loadSubscription } from './load-subscription';

export interface GenerateSubscriptionOptions {
  baseUrl: string;
  clientType: ClientType;
  iosRoutingMode?: IosRoutingMode;
  subscriptionId: string;
  fetcher?: typeof fetch;
}

export interface GeneratedSubscription {
  config: SingBoxConfig;
  metadata: SubscriptionMetadata;
}

export async function generateSubscription(
  options: GenerateSubscriptionOptions,
): Promise<GeneratedSubscription> {
  const loaded = await loadSubscription({
    baseUrl: options.baseUrl,
    subscriptionId: options.subscriptionId,
    ...(options.fetcher === undefined ? {} : { fetcher: options.fetcher }),
  });

  if (loaded.nodes.length === 0) {
    throw new ServiceError('NO_COMPATIBLE_NODES', 'No compatible nodes are available.');
  }

  return {
    config: composeSingBoxConfig(loaded.nodes, options.clientType, {
      ...(options.iosRoutingMode === undefined ? {} : { iosRoutingMode: options.iosRoutingMode }),
    }),
    metadata: loaded.metadata,
  };
}
