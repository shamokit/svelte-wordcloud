import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import path from 'node:path';

export default defineConfig({
  plugins: [sveltekit()],
  resolve: {
    alias: {
      // Resolve the workspace library from source in dev (no build step needed)
      '@shamokit/svelte-wordcloud': path.resolve(
        '../packages/svelte-wordcloud/src/lib/index.ts',
      ),
    },
    // Force these to resolve from playground's node_modules so pnpm doesn't
    // pick up the library package's peer-dep instances (which lack @threlte/core)
    dedupe: ['@threlte/core', '@threlte/extras', 'three', 'svelte', 'troika-three-text'],
  },
  optimizeDeps: {
    include: ['troika-three-text'],
  },
});
