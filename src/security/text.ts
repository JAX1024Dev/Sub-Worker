export function containsControlCharacters(value: string): boolean {
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (codePoint <= 31 || codePoint === 127) {
      return true;
    }
  }
  return false;
}

export function stripControlCharacters(value: string): string {
  let result = '';
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (codePoint > 31 && codePoint !== 127) {
      result += character;
    }
  }
  return result;
}
