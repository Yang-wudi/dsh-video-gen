# 🎬 dsh-video-gen

**Bring text-to-video generation to DeepSeek Harness — supports Aliyun Wanx, Volcengine/Doubao Seedance, OpenAI Sora, and compatible relays.**

[![npm version](https://img.shields.io/npm/v/dsh-video-gen.svg?style=flat-square&color=blue)](https://www.npmjs.com/package/dsh-video-gen)
[![DSH Plugin](https://img.shields.io/badge/Plugin%20For-DeepSeek%20Harness-6366f1?style=flat-square)](https://github.com/deepseek-ai)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](LICENSE)

**English** | [简体中文](README.zh-CN.md)

---

## 💡 What Does It Solve?

**`dsh-video-gen` is an open-source video generation plugin built for DeepSeek Harness (DSH).**

DeepSeek Harness already enables agents to call various tools to complete tasks. This plugin adds native **text-to-video generation**:

- ✅ **Multi-provider support**: Aliyun DashScope (Wanx), Volcengine/Doubao Seedance, OpenAI Sora, and compatible relays
- ✅ **In-conversation playback**: Generated videos are displayed directly in the conversation flow
- ✅ **Auto-save to workspace**: Videos are saved to the agent's workspace for later use
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
2. Select a provider (Aliyun / Volcengine / OpenAI)
3. Fill in the corresponding API key and click **Save**

**Credential environment variable names:**
- Aliyun DashScope: `DASHSCOPE_API_KEY`
- Volcengine Ark: `ARK_API_KEY`
- OpenAI / Relay: `OPENAI_API_KEY`

You can also set these environment variables in the shell that starts DSH.

### 3. Generate Videos

Simply tell the agent:

```text
Generate a 5-second video: a cyberpunk cat running through a rainy neon street at night, camera following.
```

The agent will automatically call the `generate_video` tool, generate the video, and display it in the conversation.

---

## 📖 Supported Providers

| Provider | Example Model | Endpoint | Notes |
|----------|---------------|----------|-------|
| **Aliyun DashScope** | `wanx2.1-t2v-turbo` | `https://dashscope.aliyuncs.com/api/v1` | Wanx text-to-video |
| **Volcengine / Doubao** | `doubao-seedance-1-0-pro-250528` | `https://ark.cn-beijing.volces.com/api/v3` | Doubao Seedance video |
| **OpenAI Sora** | `sora-2` | `https://api.openai.com/v1` | Sora or compatible relay |

---

## 🛠️ Tool Parameters

The `generate_video` tool accepts:

- **`prompt`** (required): Complete video description (subject, action, camera, setting, style)
- **`size`**: Resolution or aspect ratio, e.g. `1280*720` (DashScope) or `16:9` (Seedance/Sora)
- **`duration`**: Clip length in seconds, e.g. `5` or `10` (provider-dependent)

---

## 📝 How It Works

1. **Async tasks**: Video generation is asynchronous (submit → poll → download). The plugin handles polling automatically.
2. **In-memory cache**: Generated video bytes are cached in memory and streamed to the client via the HTTP route `/plugins/dsh-video-gen/video`.
3. **Workspace persistence**: By default, videos are saved to the agent's workspace under the `dsh-video-gen` subfolder. The file path is returned in the `savedTo` field.

---

## ⚙️ Configuration

Available in Settings → Plugins → Video generation:

- **Provider**: Choose provider (Aliyun / Volcengine / OpenAI)
- **Model**: Model name
- **Endpoint / Base URL**: API endpoint
- **API Key**: Credential (write-only, not echoed)
- **Save to Workspace**: Save videos to workspace (default: on)
- **Workspace Folder**: Subfolder name (default: `dsh-video-gen`)
- **Poll Interval**: Polling interval in ms (default: 5000)
- **Wait Timeout**: Max wait time in ms (default: 600000)

---

## 📦 Development & Build

This project is written in pure ES modules (no TypeScript build step). The client code is pre-wrapped in the `__ModuleLoader__.load` format.

```bash
# Syntax check
node --check lib/index.js
node --check lib/client.js

# Install to web profile
pnpm dsh plugin --profile web add ./dsh-video-gen
```

---

## 📄 License

MIT © shanliuling

---

## 🙏 Acknowledgments

This project is inspired by [dsh-image-gen](https://github.com/shanliuling/dsh-image-gen) and follows its design patterns for settings cards and in-conversation display.
