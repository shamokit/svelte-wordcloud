---
"@shamokit/svelte-wordcloud": minor
---

feat: add fullscreen button to WordCloud3D and WordCloudFlat

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
