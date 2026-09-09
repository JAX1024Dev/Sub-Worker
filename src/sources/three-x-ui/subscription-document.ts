export interface SubscriptionMetadata {
  announce?: string;
  profileTitle?: string;
  profileUpdateInterval?: string;
  profileWebPageUrl?: string;
  subscriptionUserinfo?: string;
  supportUrl?: string;
}

export interface SubscriptionDocument {
  links: string[];
  metadata: SubscriptionMetadata;
}
