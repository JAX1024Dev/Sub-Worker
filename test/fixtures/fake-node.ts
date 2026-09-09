import type { CanonicalNode } from '../../src/domain/canonical-node.js';

export const fakeCanonicalNode: CanonicalNode = {
  sourceId: 'three-x-ui',
  sourceIndex: 0,
  protocol: 'vless',
  name: 'Example node',
  server: 'node.example.invalid',
  serverPort: 443,
  uuid: '01234567-89ab-cdef-0123-456789abcdef',
  network: 'tcp',
  flow: 'xtls-rprx-vision',
  reality: {
    publicKey: 'abcdefghijklmnopqrstuvwxyzABCDEFGH123456789',
    serverName: 'www.example.com',
    shortId: '0123abcd',
    fingerprint: 'chrome',
  },
  warnings: [],
};
