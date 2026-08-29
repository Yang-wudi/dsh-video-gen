# Contributing

Bug reports should include the DSH version, Node version, selected video provider & model, and the complete redacted tool error. Never include an API key.

Before opening a pull request, run:

```sh
pnpm install
pnpm run typecheck
pnpm run check
pnpm test
```

## Architecture notes

- `lib/*.js` bundles (host: `index.js`, browser: `client.js`, plus `shared.js`, `google.js`, `reference-image.js`) are **hand-maintained**. Do **not** run `pnpm run build` (`tsc`) — it would overwrite them with a stale compile of `src/`. The `build` script exists only as a footgun guard.
- `src/*.ts` mirrors the host bundles as the public type surface (`package.json` → `types`). Keep it in sync with `lib/index.js` semantics when you change the host side.
- The browser bundle follows the DSH `__ModuleLoader__.load` single-file format; UI text lives in the bilingual `DICT` (zh/en) — every `t("key")` must exist in both locales (enforced by `tests/client-bundle.test.mjs`).
- The gallery follows the dsh-image-gen UX: IndexedDB store with tombstones, conversation.view tab, hover toolbars. Keep the visual design tokens aligned with it.
- Tests use the built-in `node:test` runner (no extra dependencies). The `test` script runs each test file in-process; the gallery durability tests simulate a host restart via `__resetVideoRouteStateForTests()`.

## Versioning & release

Releases are published to npm as `dsh-video-gen`. A release commit should update `package.json` version, be tagged `v<version>`, and the GitHub release notes should summarize provider/gallery changes.
