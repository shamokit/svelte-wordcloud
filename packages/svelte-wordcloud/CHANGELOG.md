# @shamokit/svelte-wordcloud

## 0.4.2

### Patch Changes

- [#40](https://github.com/shamokit/svelte-wordcloud/pull/40) [`0d705b5`](https://github.com/shamokit/svelte-wordcloud/commit/0d705b5033217342e9fbc4501329c74c682dadba) Thanks [@shamokit](https://github.com/shamokit)! - ⬆️ update packages

## 0.4.1

### Patch Changes

- [#37](https://github.com/shamokit/svelte-wordcloud/pull/37) [`69abb17`](https://github.com/shamokit/svelte-wordcloud/commit/69abb17e7ea6c42601ee66589d4daa6db7150e92) Thanks [@shamokit](https://github.com/shamokit)! - fix: prevent word overlap when using large CJK fonts like NotoSansJP

  When a custom font is passed (e.g. `fontUrl="/font/NotoSansJP.ttf"`), the troika
  worker must download and parse the font file before it can measure character widths.
  For large CJK fonts such as NotoSansJP (9 MB), this can take several seconds on a
  first visit — longer than the 150 ms layout debounce.

  Previously the layout ran immediately with empty `wordWidths`, falling back to
  `CHAR_W_FALLBACK = 0.6 em` per character. Japanese characters are ~0.97 em wide, so
  every bounding box was ~38 % too narrow. The layout algorithm still placed words
  without collision, but the rendered glyphs were wider than the boxes, causing visible
  overlap until the re-layout with correct metrics completed.

  **Fix**: `WordCloud3D` and `WordCloudFlat` now wait for font metrics before starting
  the layout pass. While waiting, the loading spinner is shown instead of a blank or
  overlapping canvas. Once metrics arrive the layout runs once with correct widths and
  produces a clean result.

  Additional improvements in font metrics measurement:

  - **CJK `charH` estimation**: when a font does not report `capHeight` or `ascender`
    (common for CJK fonts), `charH` is now derived from `visibleBounds` as
    `halfH × 2 ≈ 0.905` instead of staying at the 0.65 default. This improves font-size
    scaling for Japanese/Chinese/Korean wordclouds.
  - **`caretPositions` stride fix**: troika uses stride 4 (`[startX, endX, bottomY, topY]`
    per character), not 3. The fallback width index has been corrected accordingly.

## 0.4.0

### Minor Changes

- [#35](https://github.com/shamokit/svelte-wordcloud/pull/35) [`c58a192`](https://github.com/shamokit/svelte-wordcloud/commit/c58a192ca4dc6e5d70cd20b60ed4b2aeeb020064) Thanks [@shamokit](https://github.com/shamokit)! - feat: add fullscreen button to WordCloud3D and WordCloudFlat

  A fullscreen toggle button is now displayed below the depth/zoom scrollbar
  in both `WordCloud3D` and `WordCloudFlat` components.

  - Clicking the button enters fullscreen mode via the browser Fullscreen API
    (`requestFullscreen` / `webkitRequestFullscreen` for Safari)
  - In fullscreen, the button switches to an exit-fullscreen icon; pressing it
    (or Esc) restores the normal view
  - The button remains visible and interactive even when the depth column is
    hidden (single-layer 3D cloud) or while the layout is loading
  - New a11y props `fullscreenLabel` and `exitFullscreenLabel` are available on
    both `WordCloud3DA11y` and `WordCloudFlatA11y` for localisation
    (defaults: `'Enter fullscreen'` / `'Exit fullscreen'`)

## 0.3.1

### Patch Changes

- [#33](https://github.com/shamokit/svelte-wordcloud/pull/33) [`e7d8095`](https://github.com/shamokit/svelte-wordcloud/commit/e7d80951b30e1b2763fdf37a8673fc66d3b95d18) Thanks [@shamokit](https://github.com/shamokit)! - fix(3d): reverse pinch-in/out direction on mobile for WordCloud3D

  Previously, pinching in (fingers together) navigated deeper into layers
  and pinching out (fingers apart) navigated shallower — the opposite of
  the standard pinch-to-zoom convention found in most mobile apps.

  The delta sign has been flipped so that:

  - Pinch out (spread) → camera moves forward → deeper layers
  - Pinch in (close) → camera pulls back → shallower layers

## 0.3.0

### Minor Changes

- [#30](https://github.com/shamokit/svelte-wordcloud/pull/30) [`2f7ed2b`](https://github.com/shamokit/svelte-wordcloud/commit/2f7ed2be1b50a7a1f815d2d8a81a321bb24ee44f) Thanks [@shamokit](https://github.com/shamokit)! - feat: deterministic layout, automatic in-memory cache, and `useCache` localStorage persistence

  - **Deterministic layout**: `Math.random()` replaced with a seeded PRNG (`mulberry32`). Identical data and configuration now always produce identical word positions.
  - **Automatic in-memory cache**: A module-level cache (max 20 entries, LRU-ish) means same-session re-renders skip the layout generator entirely — no API change required.
  - **`useCache` prop** on `WordCloud3D` and `WordCloudFlat`: opt-in `localStorage` persistence so page reloads render instantly. Accepts `true` (auto-keyed from a data hash), a `string`, or a `symbol`. The stored entry is automatically invalidated when data or layout parameters change.
  - **`clearCache()` instance method**: exported on both components for manual cache clearing.
  - **Colour decoupling**: CSS colour changes no longer trigger a full layout re-computation. A dedicated reactive effect updates word colours in place.

## 0.2.2

### Patch Changes

- [#28](https://github.com/shamokit/svelte-wordcloud/pull/28) [`83eefa9`](https://github.com/shamokit/svelte-wordcloud/commit/83eefa9d888d1e7240c40e61b3a399e94a176bb2) Thanks [@shamokit](https://github.com/shamokit)! - perf(3d): eliminate O(N²) re-render on layout yields to fix setTimeout violation

  Replace monolithic `wordLayout` state with fine-grained `displayWords` array and `applyWords()` that mutates only changed element properties through Svelte 5's `$state` proxy. Also eliminates per-query heap allocations in `SpatialGrid` hot paths via zero-allocation `candidatesInto()` with generation-counter deduplication.

## 0.2.1

### Patch Changes

- [#25](https://github.com/shamokit/svelte-wordcloud/pull/25) [`0d40880`](https://github.com/shamokit/svelte-wordcloud/commit/0d40880f5f4cc389d8c5baac07efe8e060647d41) Thanks [@shamokit](https://github.com/shamokit)! - Fix WordCloud3D scroll freeze and Svelte 5 production rendering issues

  **Bug fixes**

  - **WordCloud3D scroll freeze**: Replaced `{#if opacity > 0}` with `visible={opacity > 0}` in the 3D scene. The previous pattern caused hundreds of troika-three-text instances to be simultaneously destroyed and recreated as the camera crossed layer boundaries, overwhelming the web worker and producing a frozen canvas. Words now stay mounted permanently; Three.js `visible` skips rendering and raycasting without remounting.

  - **WordCloud3D scroll out-of-range after re-layout**: Added a reactive clamp so `targetZ` is snapped back into the valid scroll range when `scrollMinZ` shifts after a cosmetic re-run (e.g. font metrics arriving changes the number of layers).

  - **Svelte 5 production rendering stopped midway**: Fixed a Svelte 5 production bug where `$state` written from inside an async IIFE within a `$effect` was not notifying subscribers. Replaced `isLoading: boolean $state` with a `_loadingVersion` / `_finishedVersion` counter pair so `isLoading` can be a `$derived` value that Svelte tracks correctly in both dev and production builds.

  **Performance**

  - `makeYielder` now returns a plain (non-`async`) function that returns `void` synchronously when the time budget has not elapsed. Callers use `const _p = maybeYield(); if (_p) await _p;` to avoid the microtask allocation that `async` functions always incur, making it safe to call inside tight inner loops. Also adds per-word yield checks inside `compactLayer` to cap main-thread bursts on large datasets.

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
