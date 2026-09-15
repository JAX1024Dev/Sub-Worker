export type ServiceErrorCode =
  | 'CONFIG_COMPOSITION_FAILED'
  | 'CONFIG_INTEGRITY_FAILED'
  | 'CONFIG_PROFILE_NOT_FOUND'
  | 'CONFIG_SOURCE_INVALID'
  | 'CONFIG_SOURCE_UNAVAILABLE'
  | 'INVALID_BASE_URL'
  | 'INVALID_SUBSCRIPTION'
  | 'INVALID_SUBSCRIPTION_ID'
  | 'NO_COMPATIBLE_NODES'
  | 'SUBSCRIPTION_NOT_FOUND'
  | 'UPSTREAM_ERROR'
  | 'UPSTREAM_REDIRECT'
  | 'UPSTREAM_RESPONSE_TOO_LARGE'
  | 'UPSTREAM_TIMEOUT';

export class ServiceError extends Error {
  constructor(
    readonly code: ServiceErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'ServiceError';
  }
}
