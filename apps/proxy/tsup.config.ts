import { defineConfig } from 'tsup';

export default defineConfig([
  {
    // CLI entry point — needs shebang so it runs as a script via npm link / npx
    entry: { index: 'src/index.ts' },
    format: ['esm'],
    dts: true,
    banner: { js: '#!/usr/bin/env node' },
  },
  {
    // Library entry point — no shebang, imported by other packages
    entry: { lib: 'src/lib.ts' },
    format: ['esm'],
    dts: true,
  },
]);
