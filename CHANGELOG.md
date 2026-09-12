# Changelog

All notable changes to this project are documented in this file. The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.4] - 2026-09-13

### Fixed

- **The harness UI failed the whole plugin: "failed to apply loader entry … cannot get property \"remote.credentials\" without inject".** cordis refuses to read a service a plugin never injected, and 0.2.2 switched the credential face to `ctx.remote.credentials` while leaving `remote` out of the client's `inject` list — so the client half was rejected at load and the harness showed "Failed to load plugins". `remote` is now declared (it exists in both the 0.1.1 and 0.1.5 compositions), and the read is wrapped so a build with a different `remote` shape degrades to the legacy `connection.api.credentials` face instead of failing the plugin.

### Added

- The client-bundle test double now enforces cordis's rule — reading an undeclared service throws, exactly as the harness does — and a test asserts the declared `inject` list. Removing `remote` from `inject` fails three tests; before this it failed none.

## [0.2.3] - 2026-09-13

### Fixed

- **`animate_image` works from an image pasted into the chat.** The `source_attachment_id` branch was never wired: the call site omitted the reader that `resolveReferenceImage` requires, so every request through it failed with "requires an image attachment store" — and the tool description actively told the model to use it. The plugin now injects the `attachments` service, collects the conversation's image references from the session (`deriveMessages()` → image / nested tool-result blocks, the same traversal `dsh-image-gen` uses), and resolves from those.
- The documented "omit both arguments to animate the newest conversation image" behaviour now exists: with neither `source_path` nor `source_attachment_id`, the newest image the conversation carries is used. Previously that also threw.
- Attachment ids are matched by exact value first, then by sha256 digest, so a harness that surfaces the digest form still resolves.

### Changed

- `resolveReferenceImage` takes `conversationImages` + a `readImage(ref, signal)` reader instead of a bare id reader. It stays exported from `lib/reference-image.js` for tests and advanced integrations; note the reader signature change.
- `inject` now lists `attachments`.

### Added

- `tests/reference-image.test.mjs`: 9 cases covering workspace paths, attachment lookup by id and digest, the newest-image fallback, missing attachments, and failure reporting (42 tests total).

## [0.2.2] - 2026-09-13

### Fixed

- **Compatibility with dsh 0.1.5**: `@deepseek-ai/dsh-settings` removed the module-level `installSettingsSection` / `settingsNamespace` helpers. Because a missing *named* import is a `SyntaxError` at module evaluation, the plugin took the whole host's plugin tree down instead of degrading. The section now registers through the `settings` service (`ctx.settings.installSection`) when that generation is present, and falls back to the legacy helpers on older builds — one bundle serves both.
- **Client credentials on dsh 0.1.5**: the credential face moved from `connection.api.credentials` (object arguments) to `ctx.remote.credentials` (positional arguments). Both are normalised behind a single `describe(ref) -> {ok, configured}` / `set(ref, value)` interface; the settings card is unchanged, and a host with neither API degrades to "key unavailable" instead of throwing.
- `dsh.client.inject` no longer names `@deepseek-ai/dsh-client-runtime`, which is not published for 0.1.5; `@deepseek-ai/dsh-api-remotes` (the package carrying the credential face) takes its place. That package exists in the 0.1.1 line too, so older hosts are unaffected.

### Added

- Credential-face tests covering the 0.1.5 API, the legacy API, and the no-API fallback (4 new cases; 33 total).

## [0.2.1] - 2026-08-29

### Added

- Durable gallery playback: a marker index (`.dsh-video-gen-index.json`) written next to saved videos lets the video route stream gallery videos after DSH restarts (in-memory cache → known workspace roots → marker fallback chain).
- Gallery card hover toolbar: download, copy prompt, delete.
- Gallery card meta row: file size, duration, creation date, and an image-to-video tag.
- Video result cards: hover toolbar with download and open-in-new-tab; playback-error state is distinct from resolve-failure.
- Lightbox reuses the card's resolved URL and shows the saved workspace path.
- Automated tests: 29 `node:test` cases (video route security, finishVideo, client bundle smoke) plus `npm test` / `npm run check` / `npm run typecheck` scripts and a GitHub Actions CI workflow.
- `files` package whitelist now ships `src/*.ts` so the `exports.types` entry resolves from npm installs.

### Changed

- License attribution corrected: © Yang-wudi, retaining the dsh-image-gen (MIT) upstream copyright notice for adapted gallery code.
- `package.json` `author` and `repository` now point at Yang-wudi; npm published metadata updated accordingly.

## [0.2.0] - 2026-08-27

### Added

- Initial release: `generate_video` (text-to-video) and `animate_image` (image-to-video) tools.
- Multi-provider support: Aliyun DashScope Wanx, Volcengine/Doubao Seedance, Google Veo, OpenAI Sora, and OpenAI-compatible relays.
- Optional saving of generated videos into the session workspace with a stable attachment reference.
- Video gallery: conversation slot tab, IndexedDB history with tombstones, grid preview, lightbox playback, search and provider filter.
- Settings card for provider, model, resolution, duration, and API-key management via DSH credentials.

[0.2.1]: https://github.com/Yang-wudi/dsh-video-gen/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/Yang-wudi/dsh-video-gen/releases/tag/v0.2.1
