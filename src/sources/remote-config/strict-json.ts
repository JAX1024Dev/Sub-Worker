import { ServiceError } from '../../domain/errors';

class JsonScanner {
  private index = 0;

  constructor(private readonly text: string) {}

  scan(): void {
    this.skipWhitespace();
    this.scanValue(0);
    this.skipWhitespace();
    if (this.index !== this.text.length) this.fail();
  }

  private scanValue(depth: number): void {
    if (depth > 64) {
      throw new ServiceError('CONFIG_SOURCE_INVALID', 'Configuration JSON is nested too deeply.');
    }
    const character = this.text[this.index];
    if (character === '{') {
      this.scanObject(depth);
    } else if (character === '[') {
      this.scanArray(depth);
    } else if (character === '"') {
      this.scanString();
    } else if (character === 't') {
      this.scanLiteral('true');
    } else if (character === 'f') {
      this.scanLiteral('false');
    } else if (character === 'n') {
      this.scanLiteral('null');
    } else {
      this.scanNumber();
    }
  }

  private scanObject(depth: number): void {
    this.index += 1;
    this.skipWhitespace();
    const keys = new Set<string>();
    if (this.consume('}')) return;

    for (;;) {
      if (this.text[this.index] !== '"') this.fail();
      const key = this.scanString();
      if (keys.has(key)) {
        throw new ServiceError('CONFIG_SOURCE_INVALID', 'Configuration JSON has duplicate keys.');
      }
      keys.add(key);
      this.skipWhitespace();
      if (!this.consume(':')) this.fail();
      this.skipWhitespace();
      this.scanValue(depth + 1);
      this.skipWhitespace();
      if (this.consume('}')) return;
      if (!this.consume(',')) this.fail();
      this.skipWhitespace();
    }
  }

  private scanArray(depth: number): void {
    this.index += 1;
    this.skipWhitespace();
    if (this.consume(']')) return;

    for (;;) {
      this.scanValue(depth + 1);
      this.skipWhitespace();
      if (this.consume(']')) return;
      if (!this.consume(',')) this.fail();
      this.skipWhitespace();
    }
  }

  private scanString(): string {
    const start = this.index;
    this.index += 1;

    while (this.index < this.text.length) {
      const character = this.text[this.index];
      if (character === '"') {
        this.index += 1;
        const decoded: unknown = JSON.parse(this.text.slice(start, this.index));
        if (typeof decoded !== 'string') this.fail();
        return decoded;
      }
      if (character === undefined || character.charCodeAt(0) < 0x20) this.fail();
      if (character === '\\') {
        this.index += 1;
        const escape = this.text[this.index];
        if (escape === 'u') {
          const codePoint = this.text.slice(this.index + 1, this.index + 5);
          if (!/^[0-9a-fA-F]{4}$/u.test(codePoint)) this.fail();
          this.index += 5;
          continue;
        }
        if (escape === undefined || !'"\\/bfnrt'.includes(escape)) this.fail();
      }
      this.index += 1;
    }
    this.fail();
  }

  private scanNumber(): void {
    const match = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/u.exec(
      this.text.slice(this.index),
    );
    if (match === null) this.fail();
    this.index += match[0].length;
  }

  private scanLiteral(literal: string): void {
    if (!this.text.startsWith(literal, this.index)) this.fail();
    this.index += literal.length;
  }

  private skipWhitespace(): void {
    while (
      this.text[this.index] === ' ' ||
      this.text[this.index] === '\n' ||
      this.text[this.index] === '\r' ||
      this.text[this.index] === '\t'
    ) {
      this.index += 1;
    }
  }

  private consume(character: string): boolean {
    if (this.text[this.index] !== character) return false;
    this.index += 1;
    return true;
  }

  private fail(): never {
    throw new ServiceError('CONFIG_SOURCE_INVALID', 'Configuration source is not valid JSON.');
  }
}

export function parseStrictJson(bytes: Uint8Array): unknown {
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    throw new ServiceError('CONFIG_SOURCE_INVALID', 'Configuration source must not contain a BOM.');
  }

  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(bytes);
  } catch (error) {
    throw new ServiceError('CONFIG_SOURCE_INVALID', 'Configuration source is not valid UTF-8.', {
      cause: error,
    });
  }

  try {
    new JsonScanner(text).scan();
    return JSON.parse(text) as unknown;
  } catch (error) {
    if (error instanceof ServiceError) throw error;
    throw new ServiceError('CONFIG_SOURCE_INVALID', 'Configuration source is not valid JSON.', {
      cause: error,
    });
  }
}
