---
"@shamokit/svelte-wordcloud": patch
---

perf(3d): eliminate O(N²) re-render on layout yields to fix setTimeout violation

Replace monolithic `wordLayout` state with fine-grained `displayWords` array and `applyWords()` that mutates only changed element properties through Svelte 5's `$state` proxy. Also eliminates per-query heap allocations in `SpatialGrid` hot paths via zero-allocation `candidatesInto()` with generation-counter deduplication.
