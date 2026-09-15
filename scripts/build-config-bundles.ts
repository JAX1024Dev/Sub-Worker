import { buildConfigBundles, validateConfigSources, writeConfigBundles } from './config-bundles.js';

await validateConfigSources();
const bundles = await buildConfigBundles();
await writeConfigBundles(bundles);
console.log(`Built ${String(bundles.size)} immutable sing-box bundles.`);
