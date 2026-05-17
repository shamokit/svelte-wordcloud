---
"@shamokit/svelte-wordcloud": minor
---

Layout quality, accessibility, and performance improvements across both components.

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
