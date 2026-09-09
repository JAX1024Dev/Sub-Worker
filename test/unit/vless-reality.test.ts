import { describe, expect, it } from 'vitest';

import { parseSubscription } from '../../src/parsers/subscription-parser';
import { parseVlessRealityLink } from '../../src/parsers/vless-reality';

const publicKey = 'abcdefghijklmnopqrstuvwxyzABCDEFGH123456789';

function makeLink(parameters = ''): string {
  return `vless://01234567-89ab-cdef-0123-456789abcdef@node.example.invalid:443?type=tcp&security=reality&pbk=${publicKey}&sni=www.example.com${parameters}#Test%20Node`;
}

describe('parseVlessRealityLink', () => {
  it('creates a canonical VLESS Reality TCP node', () => {
    const result = parseVlessRealityLink(
      makeLink('&encryption=none&flow=xtls-rprx-vision&fp=chrome&sid=0123abcd'),
      2,
    );

    expect(result).toEqual({
      ok: true,
      node: {
        sourceId: 'three-x-ui',
        sourceIndex: 2,
        protocol: 'vless',
        name: 'Test Node',
        server: 'node.example.invalid',
        serverPort: 443,
        uuid: '01234567-89ab-cdef-0123-456789abcdef',
        network: 'tcp',
        flow: 'xtls-rprx-vision',
        reality: {
          publicKey,
          serverName: 'www.example.com',
          shortId: '0123abcd',
          fingerprint: 'chrome',
        },
        warnings: [],
      },
    });
  });

  it('rejects non-Reality and unsupported transports', () => {
    expect(
      parseVlessRealityLink(makeLink().replace('security=reality', 'security=tls'), 0),
    ).toEqual({
      ok: false,
      reason: 'UNSUPPORTED_SECURITY',
    });
    expect(parseVlessRealityLink(makeLink().replace('type=tcp', 'type=grpc'), 0)).toEqual({
      ok: false,
      reason: 'UNSUPPORTED_TRANSPORT',
    });
  });

  it('rejects unexpected credentials, paths, and duplicate security parameters', () => {
    expect(parseVlessRealityLink(makeLink().replace('@', ':password@'), 0)).toEqual({
      ok: false,
      reason: 'INVALID_VLESS_URL',
    });
    expect(parseVlessRealityLink(makeLink().replace(':443?', ':443/unexpected?'), 0)).toEqual({
      ok: false,
      reason: 'INVALID_VLESS_URL',
    });
    expect(
      parseVlessRealityLink(
        makeLink().replace('security=reality', 'security=reality&security=reality'),
        0,
      ),
    ).toEqual({
      ok: false,
      reason: 'INVALID_VLESS_URL',
    });
  });

  it('keeps compatible nodes and summarizes ignored nodes', () => {
    const parsed = parseSubscription({
      links: [makeLink(), 'trojan://credential@example.invalid:443'],
      metadata: {},
    });

    expect(parsed.nodes).toHaveLength(1);
    expect(parsed.summary).toEqual({
      total: 2,
      accepted: 1,
      ignored: 1,
      ignoredByReason: { UNSUPPORTED_PROTOCOL: 1 },
    });
  });
});
