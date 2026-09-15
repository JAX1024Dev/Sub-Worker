import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { format } from 'prettier';

import { clientTypes } from '../src/domain/canonical-node.js';
import { composeSingBoxConfig } from '../src/renderers/sing-box/composer.js';
import { fakeCanonicalNode } from '../test/fixtures/fake-node.js';

const fixtureDirectory = resolve(import.meta.dirname, '../test/fixtures/generated');
const staleFixtures: string[] = [];

for (const clientType of clientTypes) {
  const expected = await format(
    JSON.stringify(composeSingBoxConfig([fakeCanonicalNode], clientType)),
    {
      parser: 'json',
    },
  );
  const path = resolve(fixtureDirectory, `${clientType}.json`);
  const actual = await readFile(path, 'utf8');

  if (actual !== expected) {
    staleFixtures.push(`${clientType}.json`);
  }
}

const iosDualStackExpected = await format(
  JSON.stringify(
    composeSingBoxConfig([fakeCanonicalNode], 'ios', { iosRoutingMode: 'tun-dual-stack' }),
  ),
  { parser: 'json' },
);
const iosDualStackActual = await readFile(
  resolve(fixtureDirectory, 'ios-tun-dual-stack.json'),
  'utf8',
);

if (iosDualStackActual !== iosDualStackExpected) {
  staleFixtures.push('ios-tun-dual-stack.json');
}

const macosDualStackExpected = await format(
  JSON.stringify(
    composeSingBoxConfig([fakeCanonicalNode], 'macos', {
      macosRoutingMode: 'fakeip-dual-stack',
    }),
  ),
  { parser: 'json' },
);
const macosDualStackActual = await readFile(
  resolve(fixtureDirectory, 'macos-dual-stack.json'),
  'utf8',
);

if (macosDualStackActual !== macosDualStackExpected) {
  staleFixtures.push('macos-dual-stack.json');
}

if (staleFixtures.length > 0) {
  throw new Error(
    `Generated fixtures are stale: ${staleFixtures.join(', ')}. Run pnpm fixtures:generate.`,
  );
}
