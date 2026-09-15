import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { format } from 'prettier';

import { clientTypes } from '../src/domain/canonical-node.js';
import { composeSingBoxConfig } from '../src/renderers/sing-box/composer.js';
import { fakeCanonicalNode } from '../test/fixtures/fake-node.js';

const outputDirectory = resolve(import.meta.dirname, '../test/fixtures/generated');

for (const clientType of clientTypes) {
  const config = composeSingBoxConfig([fakeCanonicalNode], clientType);
  const outputPath = resolve(outputDirectory, `${clientType}.json`);
  const contents = await format(JSON.stringify(config), { parser: 'json' });
  await writeFile(outputPath, contents, 'utf8');
}

const macosDualStack = composeSingBoxConfig([fakeCanonicalNode], 'macos', {
  macosRoutingMode: 'fakeip-dual-stack',
});
await writeFile(
  resolve(outputDirectory, 'macos-dual-stack.json'),
  await format(JSON.stringify(macosDualStack), { parser: 'json' }),
  'utf8',
);

const iosTunDualStack = composeSingBoxConfig([fakeCanonicalNode], 'ios', {
  iosRoutingMode: 'tun-dual-stack',
});
await writeFile(
  resolve(outputDirectory, 'ios-tun-dual-stack.json'),
  await format(JSON.stringify(iosTunDualStack), { parser: 'json' }),
  'utf8',
);
