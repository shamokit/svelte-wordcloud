# @shamokit/svelte-wordcloud

A word cloud component for **Svelte 5**, built with [Threlte](https://threlte.xyz/) and [troika-three-text](https://github.com/protectwise/troika/tree/main/packages/troika-three-text).

Words are arranged in depth layers and the viewer can scroll through them with `Ctrl + Wheel` or a built-in depth slider. Each word can carry an optional link.

## Requirements

| Peer dependency  | Version   |
| ---------------- | --------- |
| svelte           | ^5.0.0    |
| three            | >=0.160.0 |
| @threlte/core    | ^8.0.0    |
| @threlte/extras  | ^9.0.0    |

## Installation

```sh
npm install @shamokit/svelte-wordcloud three @threlte/core @threlte/extras
# or
pnpm add @shamokit/svelte-wordcloud three @threlte/core @threlte/extras
```

### Vite / SvelteKit — add to `vite.config.ts`

troika-three-text uses a web worker internally. Add it to `optimizeDeps` so Vite pre-bundles it correctly:

```ts
// vite.config.ts
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [sveltekit()],
  optimizeDeps: {
    include: ['troika-three-text'],
  },
});
```

## Basic usage

```svelte
<script lang="ts">
  import { WordCloud3D } from '@shamokit/svelte-wordcloud';
  import type { WordItem } from '@shamokit/svelte-wordcloud';

  const words: WordItem[] = [
    { word: 'Svelte',     link: 'https://svelte.dev',          counts: 120 },
    { word: 'TypeScript', link: 'https://www.typescriptlang.org', counts: 95 },
    { word: 'Vite',       link: 'https://vitejs.dev',           counts: 80 },
    { word: 'Three.js',   link: 'https://threejs.org',          counts: 60 },
    { word: 'WebGL',      link: '',                             counts: 40 },
  ];
</script>

<!-- The component fills its container. Give the parent a size. -->
<div style="width: 100%; height: 500px;">
  <WordCloud3D data={words} />
</div>
```

## Props

### Data

| Prop | Type | Default | Description |
| ---- | ---- | ------- | ----------- |
| `data` | `WordItem[]` | `[]` | Array of words to display. Each item has `word` (string), `counts` (number), and `link` (string, can be empty). |

### Font size

| Prop | Type | Default | Description |
| ---- | ---- | ------- | ----------- |
| `size` | `'auto'` \| `(d: WordItem) => number` | `'auto'` | `'auto'` applies a power-curve from `minSizeDefault` to `maxSizeDefault`. Pass a function to take full control; the return value is in Three.js world units. |
| `font` | `FontOptions` | `{}` | `{ minSizeDefault?, maxSizeDefault? }` — override the minimum or maximum font size (world units). |
| `fontSizeContrast` | `number` | `3.0` | Exponent of the power curve. Higher = top words are larger relative to the rest; lower = more uniform sizes. |
| `topWordArea` | `number` | `0.22` | Fraction of the viewport area targeted by the top word's bounding box. Smaller values make the top word smaller, fitting more words per layer. |

### Layout

| Prop | Type | Default | Description |
| ---- | ---- | ------- | ----------- |
| `layers` | `number` | `ceil(sqrt(data.length))` | Override the number of depth layers. |
| `ellipsoid` | `EllipsoidOptions` | `{}` | `{ rx?, ry? }` — horizontal and vertical half-extents of the layout area (world units). Defaults are derived from the camera frustum and the container aspect ratio. |
| `layerSpacing` | `number` | `12` | Z-distance between adjacent layers (world units). |

### Appearance

| Prop | Type | Default | Description |
| ---- | ---- | ------- | ----------- |
| `background` | `string` | `'transparent'` | CSS background of the container (`'#1a1a2e'`, `'transparent'`, etc.). |
| `wordColor` | `string` \| `(d: WordItem, normalizedSize: number) => string` | `'#ffffff'` | Uniform color string, or a function that receives the word item and a normalised size `[0, 1]` (1 = largest word). |
| `fontUrl` | `string` | Noto Sans JP (CDN) | URL of the font file (TTF / OTF / WOFF). The default covers CJK + Latin. |

### Interaction

| Prop | Type | Default | Description |
| ---- | ---- | ------- | ----------- |
| `wheelScrollSpeed` | `number` | `1` | Multiplier applied to `Ctrl + Wheel` and pinch-zoom scroll speed. |

### Accessibility

| Prop | Type | Default | Description |
| ---- | ---- | ------- | ----------- |
| `canvasLabel` | `string` | `'Word Cloud'` | Accessible label for the canvas region (WCAG 1.1.1). Rendered as visually-hidden text and referenced via `aria-labelledby`. Used when `canvasLabelId` is not set. |
| `canvasLabelId` | `string` | — | ID of an **existing** DOM element whose text labels the canvas. Takes precedence over `canvasLabel`. |
| `depthLabelId` | `string` | — | ID of an existing DOM element that labels the depth slider (WCAG 4.1.2). |
| `depthValueText` | `(current: number, total: number) => string` | `(c, t) => \`Layer ${c} / ${t}\`` | Returns the `aria-valuetext` for the depth slider. Use this for localisation. |

## Types

```ts
type WordItem = {
  word: string;
  link: string;   // empty string = no link
  counts: number;
};

type FontOptions = {
  minSizeDefault?: number;
  maxSizeDefault?: number;
};

type EllipsoidOptions = {
  rx?: number;
  ry?: number;
};
```

## Examples

### Custom colors by frequency

```svelte
<WordCloud3D
  data={words}
  wordColor={(_, t) => `hsl(${200 + t * 60}, 80%, ${50 + t * 30}%)`}
/>
```

`t` is `0` for the smallest word and `1` for the largest, so this produces a blue-to-yellow gradient that highlights high-frequency words.

### Self-hosted font

```svelte
<WordCloud3D
  data={words}
  fontUrl="/fonts/MyFont.ttf"
/>
```

### Custom font size range

```svelte
<WordCloud3D
  data={words}
  font={{ minSizeDefault: 0.5, maxSizeDefault: 4 }}
/>
```

### Dense layout (more words per layer)

Reduce `topWordArea` and `fontSizeContrast` to shrink the top word and flatten the size curve:

```svelte
<WordCloud3D
  data={words}
  topWordArea={0.12}
  fontSizeContrast={2.0}
/>
```

### Accessibility — external labels

```svelte
<h2 id="wc-title">Popular topics</h2>
<p id="wc-depth">Depth control — scroll or drag to navigate layers</p>

<div style="height: 500px;">
  <WordCloud3D
    data={words}
    canvasLabelId="wc-title"
    depthLabelId="wc-depth"
    depthValueText={(current, total) => `Layer ${current} of ${total}`}
  />
</div>
```

### Wikipedia links helper

```ts
const wikiWords = words.map(d => ({
  ...d,
  link: `https://en.wikipedia.org/wiki/${encodeURIComponent(d.word)}`,
}));
```

## Interaction

| Input | Action |
| ----- | ------ |
| `Ctrl + Wheel` | Zoom through layers |
| Click a word | Navigate to `link` (same window) |
| Depth slider — drag | Scroll through layers |
| Depth slider — `ArrowUp` | Move towards the front layer |
| Depth slider — `ArrowDown` | Move towards the back layer |

The depth slider is hidden automatically when there is only one layer.

## Accessibility notes

- The `<canvas>` element receives `role="img"` and `aria-labelledby` automatically. No extra markup is required for basic compliance.
- For the best screen-reader experience, point `canvasLabelId` at a descriptive heading that is already visible on the page, and provide `depthLabelId` so the slider control has a meaningful label.
- The depth slider uses `role="slider"` with `aria-valuemin`, `aria-valuemax`, `aria-valuenow`, and `aria-valuetext`. VoiceOver on macOS enters interaction mode automatically, passing arrow-key events to the page.
- Individual word labels are rendered via WebGL (troika-three-text) and are not exposed in the accessibility tree. Consider providing a complementary visible or visually-hidden list of the top words if the content is meaningful to screen-reader users.
