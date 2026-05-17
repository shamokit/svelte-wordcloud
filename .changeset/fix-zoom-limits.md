---
"@shamokit/svelte-wordcloud": minor
---

WordCloudFlat: dynamic minimum zoom — the zoom-out limit is computed from the actual word layout so the scrollbar can always reach the zoom level where all words fit on screen. WordCloud3D: extend the depth scroll range by 0.5 layers past the last layer, allowing the camera to move beyond it for better visibility of small words; the near end remains at layer 1 since all words already fit at that depth.
