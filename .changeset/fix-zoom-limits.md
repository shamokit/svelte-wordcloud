---
"@shamokit/svelte-wordcloud": minor
---

WordCloudFlat: fix zoom slider initial position so zoom-out below 1× is accessible via the scrollbar (Ctrl+Wheel already worked). WordCloud3D: extend the depth scroll range by 0.5 layers beyond each end, allowing the camera to pull back before layer 1 (zoom-out for clipped words) and move past the last layer (zoom-in for small words).
