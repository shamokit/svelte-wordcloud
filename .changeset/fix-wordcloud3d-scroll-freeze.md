---
"@shamokit/svelte-wordcloud": patch
---

Fix WordCloud3D scroll freeze and Svelte 5 production rendering issues

**Bug fixes**

- **WordCloud3D scroll freeze**: Replaced `{#if opacity > 0}` with `visible={opacity > 0}` in the 3D scene. The previous pattern caused hundreds of troika-three-text instances to be simultaneously destroyed and recreated as the camera crossed layer boundaries, overwhelming the web worker and producing a frozen canvas. Words now stay mounted permanently; Three.js `visible` skips rendering and raycasting without remounting.

- **WordCloud3D scroll out-of-range after re-layout**: Added a reactive clamp so `targetZ` is snapped back into the valid scroll range when `scrollMinZ` shifts after a cosmetic re-run (e.g. font metrics arriving changes the number of layers).

- **Svelte 5 production rendering stopped midway**: Fixed a Svelte 5 production bug where `$state` written from inside an async IIFE within a `$effect` was not notifying subscribers. Replaced `isLoading: boolean $state` with a `_loadingVersion` / `_finishedVersion` counter pair so `isLoading` can be a `$derived` value that Svelte tracks correctly in both dev and production builds.

**Performance**

- `makeYielder` now returns a plain (non-`async`) function that returns `void` synchronously when the time budget has not elapsed. Callers use `const _p = maybeYield(); if (_p) await _p;` to avoid the microtask allocation that `async` functions always incur, making it safe to call inside tight inner loops. Also adds per-word yield checks inside `compactLayer` to cap main-thread bursts on large datasets.
