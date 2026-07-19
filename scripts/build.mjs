import { build } from 'esbuild';
import { cpSync, mkdirSync } from 'node:fs';

const common = {
  bundle: true,
  sourcemap: true,
  logLevel: 'info',
};

await build({
  ...common,
  entryPoints: ['src/main/index.ts'],
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  external: ['electron', '@modelcontextprotocol/sdk', '@modelcontextprotocol/server-filesystem'],
  outfile: 'dist/main/index.js',
});

// The embedding worker runs in a worker_thread; @xenova/transformers stays
// external (it loads ONNX/WASM assets from its own package directory).
await build({
  ...common,
  entryPoints: ['src/main/workers/embeddingWorker.ts'],
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  external: ['electron', '@xenova/transformers'],
  outfile: 'dist/main/workers/embeddingWorker.js',
});

await build({
  ...common,
  entryPoints: ['src/preload/index.ts'],
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  external: ['electron'],
  outfile: 'dist/preload/index.js',
});

await build({
  ...common,
  entryPoints: ['src/renderer/src/index.ts'],
  platform: 'browser',
  format: 'iife',
  target: 'chrome120',
  outfile: 'dist/renderer/index.js',
});

mkdirSync('dist/renderer', { recursive: true });
cpSync('src/renderer/index.html', 'dist/renderer/index.html');
cpSync('src/renderer/styles.css', 'dist/renderer/styles.css');
cpSync('assets', 'dist/assets', { recursive: true });
