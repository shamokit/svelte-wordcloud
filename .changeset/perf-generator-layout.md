---
"@shamokit/svelte-wordcloud": minor
---

Switch layout computation to async generators with SpatialGrid collision detection. Words are placed progressively (releasing the main thread every ~8 ms), and collision queries are O(1) amortised via a spatial hash grid instead of O(n) linear scans.
