# Changelog

All notable changes to this project are documented in this file. The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
