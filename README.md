# @shamokit/svelte-wordcloud

Word cloud component library for Svelte with accessibility support.

## Installation

```sh
npm install @shamokit/svelte-wordcloud three @threlte/core @threlte/extras
# or
pnpm add @shamokit/svelte-wordcloud three @threlte/core @threlte/extras
```

## Vite / SvelteKit

Add `troika-three-text` to `optimizeDeps` in `vite.config.ts`:

```ts
export default defineConfig({
  plugins: [sveltekit()],
  optimizeDeps: {
    include: ['troika-three-text'],
  },
});
```

## Usage

```svelte
<script lang="ts">
  import { WordCloud, WordCloud3D, WordCloudLabel } from '@shamokit/svelte-wordcloud';
  import type { WordItem } from '@shamokit/svelte-wordcloud';

  const FONT_URL = 'https://fonts.gstatic.com/s/notosansjp/v56/-F6jfjtqLzI2JPCgQBnw7HFyzSD-AsregP8VFBEj75s.ttf';

  const words: WordItem[] = [
    { word: 'Svelte',     counts: 120 },
    { word: 'TypeScript', counts: 95  },
    { word: 'Vite',       counts: 80  },
    { word: 'Three.js',   counts: 60  },
  ];
</script>

<div style="width: 100%; height: 500px;">
  <WordCloud data={words}>
    <WordCloudLabel>
      {#snippet label({ props })}
        <span {...props} style="position:absolute;width:1px;height:1px;overflow:hidden">
          Technology word cloud
        </span>
      {/snippet}
    </WordCloudLabel>
    <WordCloud3D fontUrl={FONT_URL} />
  </WordCloud>
</div>
```

## Documentation

[svelte-wordcloud-docs.vercel.app](https://svelte-wordcloud-docs.vercel.app)

## License

MIT
