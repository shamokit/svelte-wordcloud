import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import svelte from '@astrojs/svelte';
import vercel from '@astrojs/vercel';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  adapter: vercel({
    webAnalytics: { enabled: true },
  }),
  integrations: [
    starlight({
      title: 'svelte-wordcloud',
      description: 'A composable 3D word cloud component library for Svelte 5.',
      social: [
        { icon: 'github', label: 'GitHub', href: 'https://github.com/shamokit/svelte-wordcloud' },
      ],
      defaultLocale: 'root',
      locales: {
        root: { label: 'English', lang: 'en' },
        ja: { label: '日本語', lang: 'ja' },
      },
      sidebar: [
        {
          label: 'Getting Started',
          translations: { ja: 'はじめに' },
          items: [
            { label: 'Introduction', translations: { ja: 'イントロダクション' }, slug: '' },
            { label: 'Installation', translations: { ja: 'インストール' }, slug: 'installation' },
          ],
        },
        {
          label: 'Components',
          translations: { ja: 'コンポーネント' },
          items: [
            { label: 'WordCloud', slug: 'components/word-cloud' },
            { label: 'WordCloudLabel', slug: 'components/word-cloud-label' },
            { label: 'WordCloudFlat', slug: 'components/word-cloud-flat' },
            { label: 'WordCloud3D', slug: 'components/word-cloud-3d' },
            { label: 'WordCloudAudio', slug: 'components/word-cloud-audio' },
            { label: 'WordCloudData', slug: 'components/word-cloud-data' },
          ],
        },
      ],
      customCss: ['./src/styles/custom.css'],
    }),
    svelte(),
  ],
  vite: {
    resolve: {
      alias: {
        '@shamokit/svelte-wordcloud': path.resolve(
          __dirname,
          '../packages/svelte-wordcloud/src/lib/index.ts',
        ),
      },
      dedupe: ['@threlte/core', '@threlte/extras', 'three', 'svelte', 'troika-three-text'],
    },
    optimizeDeps: {
      include: ['troika-three-text'],
    },
  },
});
