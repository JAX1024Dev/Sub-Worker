import { describe, expect, it } from 'vitest';

import { parseStrictJson } from '../../src/sources/remote-config/strict-json';

const encode = (value: string): Uint8Array => new TextEncoder().encode(value);

describe('strict remote configuration JSON parser', () => {
  it('parses nested JSON with escaped object keys', () => {
    expect(parseStrictJson(encode('{"a":{"\\u0062":[true,false,null,-1.2e3]}}'))).toEqual({
      a: { b: [true, false, null, -1200] },
    });
  });

  it.each(['{"a":1,"a":2}', '{"a":1,"\\u0061":2}', '{"outer":{"x":1,"x":2}}'])(
    'rejects duplicate object keys: %s',
    (value) => {
      expect(() => parseStrictJson(encode(value))).toThrow(
        expect.objectContaining({ code: 'CONFIG_SOURCE_INVALID' }),
      );
    },
  );

  it('rejects UTF-8 BOM input', () => {
    const body = encode('{"ok":true}');
    const withBom = new Uint8Array(body.length + 3);
    withBom.set([0xef, 0xbb, 0xbf]);
    withBom.set(body, 3);

    expect(() => parseStrictJson(withBom)).toThrow(
      expect.objectContaining({ code: 'CONFIG_SOURCE_INVALID' }),
    );
  });

  it('rejects excessive nesting', () => {
    const nested = `${'['.repeat(66)}null${']'.repeat(66)}`;
    expect(() => parseStrictJson(encode(nested))).toThrow(
      expect.objectContaining({ code: 'CONFIG_SOURCE_INVALID' }),
    );
  });

  it.each(['', '{', '[1,]', '{"x":01}', 'true false', '"unterminated'])(
    'rejects malformed JSON: %s',
    (value) => {
      expect(() => parseStrictJson(encode(value))).toThrow(
        expect.objectContaining({ code: 'CONFIG_SOURCE_INVALID' }),
      );
    },
  );
});
