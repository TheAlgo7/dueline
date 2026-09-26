import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Emits sw.js with the exact list of hashed files this build produced, and a
 * version derived from them, so an installed PWA picks up every deploy and
 * nobody has to remember to bump a constant.
 */
function serviceWorker(): Plugin {
  return {
    name: 'dueline-sw',
    apply: 'build',
    generateBundle(_options, bundle) {
      const files = Object.keys(bundle).filter((f) => !f.endsWith('.map') && f !== 'sw.js');
      const statics = ['icons/icon-192.png', 'icons/badge-96.png', 'icons/mark.svg'];
      const precache = ['/', ...files.map((f) => `/${f}`), ...statics.map((f) => `/${f}`)];
      const version = createHash('sha256').update(files.sort().join('|')).digest('hex').slice(0, 10);
      const source = readFileSync('src/sw.js', 'utf8')
        .replace('__VERSION__', version)
        .replace('__PRECACHE__', JSON.stringify(precache));
      this.emitFile({ type: 'asset', fileName: 'sw.js', source });
    },
  };
}

export default defineConfig({
  plugins: [react(), serviceWorker()],
  build: {
    target: 'es2022',
    sourcemap: false,
    chunkSizeWarningLimit: 700,
    rolldownOptions: {
      output: {
        // Vendors change far less often than the app, so they stay cached across deploys.
        codeSplitting: {
          groups: [
            { name: 'firebase', test: /node_modules[\/](@firebase|firebase)[\/]/, priority: 2 },
            { name: 'react', test: /node_modules[\/](react|react-dom|scheduler)[\/]/, priority: 1 },
          ],
        },
      },
    },
  },
  server: { port: 5173 },
});
