export const clientTypes = ['ios', 'macos', 'android', 'windows', 'linux'] as const;

export type ClientType = (typeof clientTypes)[number];

export type IgnoredNodeReason =
  | 'INVALID_VLESS_URL'
  | 'MISSING_REQUIRED_FIELD'
  | 'UNSUPPORTED_FLOW'
  | 'UNSUPPORTED_PROTOCOL'
  | 'UNSUPPORTED_SECURITY'
  | 'UNSUPPORTED_TRANSPORT';

export interface CanonicalNode {
  sourceId: 'three-x-ui';
  sourceIndex: number;
  protocol: 'vless';
  name: string;
  server: string;
  serverPort: number;
  uuid: string;
  network: 'tcp';
  flow?: 'xtls-rprx-vision';
  reality: {
    publicKey: string;
    serverName: string;
    shortId?: string;
    fingerprint?: string;
  };
  warnings: string[];
}

export interface ConversionSummary {
  total: number;
  accepted: number;
  ignored: number;
  ignoredByReason: Partial<Record<IgnoredNodeReason, number>>;
}

export interface ParsedSubscription {
  nodes: CanonicalNode[];
  summary: ConversionSummary;
}
