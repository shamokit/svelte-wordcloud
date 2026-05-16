---
"@shamokit/svelte-wordcloud": minor
---

WordCloudFlat: words now overflow up to 3× the visible viewport (no retry loop), default `topWordArea` raised to 0.5, and minimum zoom lowered to 0.2 so all words are reachable by zooming out. Both WordCloudFlat and WordCloud3D show a spinner overlay and block interactions while the layout is computing. Ctrl+scroll zoom/depth speed reduced for finer control.
