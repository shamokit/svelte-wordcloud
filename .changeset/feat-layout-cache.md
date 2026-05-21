---
"@shamokit/svelte-wordcloud": minor
---

feat: deterministic layout, automatic in-memory cache, and `useCache` localStorage persistence

- **Deterministic layout**: `Math.random()` replaced with a seeded PRNG (`mulberry32`). Identical data and configuration now always produce identical word positions.
- **Automatic in-memory cache**: A module-level cache (max 20 entries, LRU-ish) means same-session re-renders skip the layout generator entirely — no API change required.
- **`useCache` prop** on `WordCloud3D` and `WordCloudFlat`: opt-in `localStorage` persistence so page reloads render instantly. Accepts `true` (auto-keyed from a data hash), a `string`, or a `symbol`. The stored entry is automatically invalidated when data or layout parameters change.
- **`clearCache()` instance method**: exported on both components for manual cache clearing.
- **Colour decoupling**: CSS colour changes no longer trigger a full layout re-computation. A dedicated reactive effect updates word colours in place.
