import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { build } from 'esbuild';

const sourceDirectory = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(sourceDirectory, '../..');

await mkdir(resolve(packageRoot, 'lib'), { recursive: true });

/** 共享的宿主端打包选项：esbuild 内联依赖，运行期零依赖。 */
const hostBuild = (entry, outfile) => build({
  entryPoints: [resolve(sourceDirectory, entry)],
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: ['node22'],
  mainFields: ['module', 'main'],
  external: ['bufferutil', 'utf-8-validate'],
  outfile: resolve(packageRoot, outfile),
  banner: {
    js: [
      "import { createRequire as __dshCreateRequire } from 'node:module';",
      "import { dirname as __dshDirname } from 'node:path';",
      "import { fileURLToPath as __dshFileURLToPath } from 'node:url';",
      'const require = __dshCreateRequire(import.meta.url);',
      'const __filename = __dshFileURLToPath(import.meta.url);',
      'const __dirname = __dshDirname(__filename);',
    ].join('\n'),
  },
  sourcemap: false,
  minify: true,
  legalComments: 'eof',
});

await hostBuild('index.mjs', 'lib/index.js');
await hostBuild('member-guard.mjs', 'lib/member-guard.js');

console.log(`Wrote ${resolve(packageRoot, 'lib/index.js')}`);
console.log(`Wrote ${resolve(packageRoot, 'lib/member-guard.js')}`);
