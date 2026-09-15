import type { ClientType } from '../domain/canonical-node';
import { ServiceError } from '../domain/errors';
import type { SingBoxConfig } from '../renderers/sing-box/types';
import { composeVerifiedSingBoxConfig } from '../renderers/sing-box/verified-composer';
import { loadRemoteConfig } from '../sources/remote-config/source-adapter';
import type { SubscriptionMetadata } from '../sources/three-x-ui/subscription-document';
import { loadSubscription } from './load-subscription';

export interface GenerateSubscriptionOptions {
  baseUrl: string;
  clientType: ClientType;
  manifestUrl: string;
  subscriptionId: string;
  configFetcher?: typeof fetch;
  fetcher?: typeof fetch;
}

export interface ConfigurationProvenance {
  bundleSha256: string;
  channel: 'staging' | 'production';
}

export interface GeneratedSubscription {
  config: SingBoxConfig;
  configuration: ConfigurationProvenance;
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

  const remoteConfig = await loadRemoteConfig(
    options.manifestUrl,
    options.clientType,
    options.configFetcher,
  );

  return {
    config: composeVerifiedSingBoxConfig(loaded.nodes, remoteConfig.bundle),
    configuration: {
      bundleSha256: remoteConfig.bundleSha256,
      channel: remoteConfig.channel,
    },
    metadata: loaded.metadata,
  };
}
