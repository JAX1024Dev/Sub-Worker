import { clientTypes, type ClientType } from '../domain/canonical-node';
import { ServiceError } from '../domain/errors';

const subscriptionIdPattern = /^[A-Za-z0-9_-]{1,128}$/;

export function parseClientType(value: string): ClientType | undefined {
  return clientTypes.find((clientType) => clientType === value);
}

export function validateSubscriptionId(value: string): string {
  if (!subscriptionIdPattern.test(value)) {
    throw new ServiceError(
      'INVALID_SUBSCRIPTION_ID',
      'Subscription ID must contain only letters, digits, underscores, or hyphens.',
    );
  }

  return value;
}
