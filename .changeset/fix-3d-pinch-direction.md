---
"@shamokit/svelte-wordcloud": patch
---

fix(3d): reverse pinch-in/out direction on mobile for WordCloud3D

Previously, pinching in (fingers together) navigated deeper into layers
and pinching out (fingers apart) navigated shallower — the opposite of
the standard pinch-to-zoom convention found in most mobile apps.

The delta sign has been flipped so that:
- Pinch out (spread) → camera moves forward → deeper layers
- Pinch in (close) → camera pulls back → shallower layers
