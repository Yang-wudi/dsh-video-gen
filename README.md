# 🎬 dsh-video-gen

**Bring text-to-video and image-to-video generation to DeepSeek Harness — supports Aliyun Wanx, Volcengine/Doubao Seedance, Google Veo, OpenAI Sora, and compatible relays.**

[![npm version](https://img.shields.io/npm/v/dsh-video-gen.svg?style=flat-square&color=blue)](https://www.npmjs.com/package/dsh-video-gen)
[![DSH Plugin](https://img.shields.io/badge/Plugin%20For-DeepSeek%20Harness-6366f1?style=flat-square)](https://github.com/deepseek-ai)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](LICENSE)

**English** | [简体中文](README.zh-CN.md)

---

## 💡 What Does It Solve?

**`dsh-video-gen` is an open-source video generation plugin built for DeepSeek Harness (DSH).**

DeepSeek Harness already enables agents to call various tools to complete tasks. This plugin adds native **text-to-video** and **image-to-video** generation:

- ✅ **Multi-provider support**: Aliyun DashScope (Wanx), Volcengine/Doubao Seedance, Google Veo, OpenAI Sora, and compatible relays
- ✅ **Two tools**: `generate_video` (text-to-video) and `animate_image` (image-to-video)
- ✅ **In-conversation playback**: Generated videos are displayed directly in the conversation flow
- ✅ **Auto-save to workspace**: Videos are saved to the agent's workspace for later use
- ✅ **Video gallery**: A session tab that collects every generated video — search, filter, preview, download, delete
- ✅ **Web settings UI**: Configure API keys, endpoints, and models visually in DSH Settings

---

## 🚀 Quick Start

### 1. Install the Plugin

Run in your DeepSeek Harness project root:

```bash
# Recommended: install from local directory
pnpm dsh plugin --profile web add ./dsh-video-gen

# Or install from npm (after publishing)
pnpm dsh plugin --profile web add dsh-video-gen@latest
```

### 2. Configure API Key

Open the DSH Web UI (default `http://localhost:3080`):

1. Go to **Settings → Plugins → Video generation**
2. Select a provider (Aliyun / Volcengine / OpenAI / Google)
3. Fill in the corresponding API key and click **Save**

**Credential environment variable names:**
- Aliyun DashScope: `DASHSCOPE_API_KEY`
- Volcengine Ark: `ARK_API_KEY`
- OpenAI / Relay: `OPENAI_API_KEY`
- Google Gemini: `GEMINI_API_KEY`

You can also set these environment variables in the shell that starts DSH.

### 3. Generate Videos

Simply tell the agent:

```text
Generate a 5-second video: a cyberpunk cat running through a rainy neon street at night, camera following.
```

Or animate an existing image:

```text
Animate this image: the cat slowly blinks and its tail swishes, with rain falling in the background.
```

The agent will automatically call the `generate_video` or `animate_image` tool, generate the video, and display it in the conversation.

---

## 📖 Supported Providers

| Provider | Example Model | Endpoint | Image-to-Video |
|----------|---------------|----------|:---:|
| **Aliyun DashScope** | `wanx2.1-t2v-turbo` | `https://dashscope.aliyuncs.com/api/v1` | ✅ |
| **Volcengine / Doubao** | `doubao-seedance-1-0-pro-250528` | `https://ark.cn-beijing.volces.com/api/v3` | ✅ |
| **Google Veo** | `veo-3.0-generate-preview` | `https://generativelanguage.googleapis.com/v1beta/interactions` | ✅ |
| **OpenAI Sora** | `sora-2` | `https://api.openai.com/v1` | ❌ |

---

## 🛠️ Tools

### `generate_video` (text-to-video)

- **`prompt`** (required): Complete video description (subject, action, camera, setting, style)
- **`size`**: Resolution or aspect ratio, e.g. `1280*720` (DashScope) or `16:9` (Seedance/Sora)
- **`duration`**: Clip length in seconds, e.g. `5` or `10` (provider-dependent)

### `animate_image` (image-to-video)

- **`prompt`** (required): Describe the motion and animation to apply to the source image
- **`source_path`**: Absolute or workspace-relative path of a source image file
- **`source_attachment_id`**: Attachment id of an image already in the conversation
- **`size`**: Resolution or aspect ratio
- **`duration`**: Clip length in seconds

---

## 🖼️ Video Gallery

Every video the agent generates is automatically collected into the **Video Gallery** — a native session tab next to the conversation (same UX as the [dsh-image-gen](https://github.com/shanliuling/dsh-image-gen) gallery):

- **Grid overview** with hover-to-play previews, provider/model tags, an image-to-video badge, file size, requested duration, and generation date
- **Search** by prompt keywords or model, and **filter** by provider
- **Lightbox preview**: click a card to play full-screen with controls
- **Card & lightbox actions**: download the file, copy the prompt, delete from the gallery (chat history is untouched; tombstones prevent re-collection)
- **Durable playback**: the gallery does not depend on the in-memory cache. Items re-fetch the video from the workspace file — through the HTTP route's persistence fallback and a co-located marker index — so videos keep playing after the 24-entry LRU eviction *and* after a DSH host restart (as long as "Save to workspace" is enabled, the default)

---

## 📝 How It Works

1. **Async tasks**: Video generation is asynchronous (submit → poll → download). The plugin handles polling automatically.
2. **In-memory cache**: Generated video bytes are cached in memory and streamed to the client via `GET /plugins/dsh-video-gen/video?id=…` for immediate playback.
3. **Durable fallback**: `POST /plugins/dsh-video-gen/video` with the `attachment` reference (`videoId` + `savedTo`) re-serves the video from the workspace file when the cache has evicted it or the host restarted. A `.dsh-video-gen-index.json` marker next to the saved videos authorizes post-restart reads; reads are always confined to that video folder, and the client falls back to the cached route when the file is gone.
4. **Workspace persistence**: By default, videos are saved to the agent's workspace under the `dsh-video-gen` subfolder. The file path is returned in the `savedTo` field.

---

## ⚙️ Configuration

Available in Settings → Plugins → Video generation:

- **Provider**: Choose provider (Aliyun / Volcengine / OpenAI / Google)
- **Model**: Model name
- **Endpoint / Base URL**: API endpoint (with reset button to restore defaults)
- **API Key**: Credential (write-only, not echoed)
- **Save to Workspace**: Save videos to workspace (default: on)
- **Workspace Folder**: Subfolder name (default: `dsh-video-gen`)
- **Poll Interval**: Polling interval in ms (default: 5000)
- **Wait Timeout**: Max wait time in ms (default: 600000)

---

## 📦 Development & Build

This project is written in pure ES modules (no TypeScript build step). The client code is pre-wrapped in the `__ModuleLoader__.load` format. `src/index.ts` mirrors `lib/index.js` as the public type surface — do not run `tsc` build, it would overwrite the hand-maintained bundles.

```bash
# Syntax check
npm run check

# Type check (src as the public type surface)
npm run typecheck

# Tests (node:test, no extra dependencies)
npm test

# Install to web profile
pnpm dsh plugin --profile web add ./dsh-video-gen
```

---

## 📄 License

MIT © Yang-wudi

Portions of this software are adapted from [dsh-image-gen](https://github.com/shanliuling/dsh-image-gen) (MIT © dsh-image-gen contributors); see [LICENSE](LICENSE).

---

## 🙏 Acknowledgments

This project is adapted from [dsh-image-gen](https://github.com/shanliuling/dsh-image-gen) by shanliuling (MIT): the gallery, settings card, in-conversation result cards, and multi-provider architecture derive from its design and code. Thanks to shanliuling for the excellent groundwork.