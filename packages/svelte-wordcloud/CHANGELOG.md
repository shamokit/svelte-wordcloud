# @shamokit/svelte-wordcloud

## 0.2.0

### Minor Changes

- [#21](https://github.com/shamokit/svelte-wordcloud/pull/21) [`36613ab`](https://github.com/shamokit/svelte-wordcloud/commit/36613ab1185d5572cea9d422e551f738c33ec7ef) Thanks [@shamokit](https://github.com/shamokit)! - WordCloudFlat: words now overflow up to 3× the visible viewport (no retry loop), default `topWordArea` raised to 0.5, and minimum zoom lowered to 0.2 so all words are reachable by zooming out. Both WordCloudFlat and WordCloud3D show a spinner overlay and block interactions while the layout is computing. Ctrl+scroll zoom/depth speed reduced for finer control.

- [#24](https://github.com/shamokit/svelte-wordcloud/pull/24) [`92d9443`](https://github.com/shamokit/svelte-wordcloud/commit/92d944303bb66aac21caab7da5fb0acbfe9b85b3) Thanks [@shamokit](https://github.com/shamokit)! - WordCloudFlat: dynamic minimum zoom — the zoom-out limit is computed from the actual word layout so the scrollbar can always reach the zoom level where all words fit on screen. WordCloud3D: extend the depth scroll range by 0.5 layers past the last layer, allowing the camera to move beyond it for better visibility of small words; the near end remains at layer 1 since all words already fit at that depth.

- [#24](https://github.com/shamokit/svelte-wordcloud/pull/24) [`01b9c8f`](https://github.com/shamokit/svelte-wordcloud/commit/01b9c8f44991d40957d5c5586ac2b5d4a886fe4c) Thanks [@shamokit](https://github.com/shamokit)! - Layout quality, accessibility, and performance improvements across both components.

  **WordCloud3D**

  - Fix spiral placement coverage: the golden-angle spiral now correctly covers the full canvas area for every layer, eliminating sparse corners in layer 2 and beyond (previously only ~37% of the corner distance was reachable in deeper layers)
  - Lower default `randomness` from `0.5` to `0.32` for denser, more uniform packing per layer
  - Add `aria-busy` to the canvas region during layout computation so screen readers are informed of the loading state

  **WordCloudFlat**

  - Fix pan limits: the camera can now pan far enough to reach every placed word at any zoom level (previously words near the edges of the 3× placement area could be unreachable)
  - Add font-size-proportional padding (`max(fixedPx, fontSize × 0.10)`) so large words get breathing room while small words keep their existing fixed gap, preventing cramped layouts with heavy datasets
  - Add `aria-busy` to the canvas region during layout computation

  **Performance**

  - `SpatialGrid` now uses packed 32-bit integer keys instead of template-literal strings, eliminating per-operation heap allocations
  - Yielder budget increased from 8 ms to 16 ms, reducing scheduler overhead during layout
  - Adjacency candidate list capped at 128 entries, keeping per-word placement cost constant on dense layers

- [#20](https://github.com/shamokit/svelte-wordcloud/pull/20) [`c1e5a98`](https://github.com/shamokit/svelte-wordcloud/commit/c1e5a985fe384f1e6404b46f1cd0a63488325507) Thanks [@shamokit](https://github.com/shamokit)! - Switch layout computation to async generators with SpatialGrid collision detection. Words are placed progressively (releasing the main thread every ~8 ms), and collision queries are O(1) amortised via a spatial hash grid instead of O(n) linear scans.

## 0.1.4

### Patch Changes

- [#17](https://github.com/shamokit/svelte-wordcloud/pull/17) [`ee42510`](https://github.com/shamokit/svelte-wordcloud/commit/ee42510305df73f3cf98b2ec16a96bb40ff1cda6) Thanks [@shamokit](https://github.com/shamokit)! - Update documentation URL to Vercel site.

## 0.1.3

### Patch Changes

- [#15](https://github.com/shamokit/svelte-wordcloud/pull/15) [`7c6e850`](https://github.com/shamokit/svelte-wordcloud/commit/7c6e85082d4983be06cc23d2b41a0704af4e38de) Thanks [@shamokit](https://github.com/shamokit)! - Extract shared font metrics logic, cache troika import, add error handling and input validation.

## 0.1.2

### Patch Changes

- [#5](https://github.com/shamokit/svelte-wordcloud/pull/5) [`c4b3750`](https://github.com/shamokit/svelte-wordcloud/commit/c4b3750317c5afafaf0971f53f0da128329201e1) Thanks [@shamokit](https://github.com/shamokit)! - Fix English docs example for WordCloudAudioLabel to use English text instead of Japanese.

## 0.1.1

### Patch Changes

- [#1](https://github.com/shamokit/svelte-wordcloud/pull/1) [`b226972`](https://github.com/shamokit/svelte-wordcloud/commit/b226972e20fe8e812101e41fddb37ad05e281fea) Thanks [@shamokit](https://github.com/shamokit)! - Update package description.
