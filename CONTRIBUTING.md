# Contributing to @shamokit/svelte-wordcloud

Thank you for your interest in contributing! This document covers how to set up the project locally, make changes, and submit a pull request.

## Prerequisites

- [Node.js](https://nodejs.org/) 18 or later
- [pnpm](https://pnpm.io/) 10 or later

## Development setup

```sh
# Clone the repository
git clone <repo-url>
cd svelte-wordcloud

# Install dependencies
pnpm install

# Start the development server (opens the demo at http://localhost:5173)
pnpm dev
```

## Project structure

```
src/
  lib/          # Component source — this is what gets published
    *.svelte    # Public components (exported from index.ts)
    Scene.svelte / SceneFlat.svelte   # Internal Three.js scene (not exported)
    types.ts    # Public TypeScript types
    index.ts    # Package entry point
  routes/       # Demo app (not published)
```

## Making changes

1. Create a feature branch from `main`
2. Make your changes in `src/lib/`
3. Test using the demo app (`pnpm dev`) — the demo in `src/routes/+page.svelte` exercises all components
4. Run type checking: `pnpm check`
5. Run a production build to verify the package output: `pnpm prepack`

## Adding a changeset

Every pull request that changes behavior or the public API needs a changeset entry so the changelog and version bump are handled automatically.

```sh
pnpm changeset
```

You will be prompted to:
1. Select a bump type — `patch` for bug fixes, `minor` for new features, `major` for breaking changes
2. Write a short description of the change (this appears in the changelog)

The generated file in `.changeset/` should be committed alongside your code changes.

If your PR is purely a docs or tooling change with no impact on published code, you can add an empty changeset:

```sh
pnpm changeset --empty
```

## Pull request checklist

- [ ] `pnpm check` passes with no errors
- [ ] `pnpm prepack` succeeds
- [ ] A changeset file is included (or `--empty` for non-code changes)
- [ ] The demo app (`pnpm dev`) still works correctly

## Release process

Releases are handled automatically by the `changesets/action` GitHub Actions workflow:

1. When changesets are detected on `main`, the action opens a **"Version Packages"** PR that bumps versions and updates `CHANGELOG.md`
2. Merging that PR triggers an automatic `npm publish` and creates a GitHub Release

Maintainers do not need to run any manual publish commands.

## Code style

- TypeScript is required for all logic in `.svelte` `<script>` blocks
- Follow the existing patterns for `$state` / `$derived` / `$effect` (Svelte 5 runes)
- Keep `src/lib/` components free of demo-only dependencies

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
