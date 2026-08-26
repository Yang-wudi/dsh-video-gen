# 🎬 dsh-video-gen

**让 DeepSeek Harness 像 ChatGPT 一样在对话中直接生成视频，支持阿里云通义万相、火山引擎豆包 Seedance、OpenAI Sora 及兼容中转站。**

[![npm version](https://img.shields.io/npm/v/dsh-video-gen.svg?style=flat-square&color=blue)](https://www.npmjs.com/package/dsh-video-gen)
[![DSH Plugin](https://img.shields.io/badge/Plugin%20For-DeepSeek%20Harness-6366f1?style=flat-square)](https://github.com/deepseek-ai)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](LICENSE)

[English](README.md) | **简体中文**

---

## 💡 它解决什么问题？

**`dsh-video-gen` 是专为 DeepSeek Harness (DSH) 打造的开源视频生成插件。**

DeepSeek Harness 已经可以让 Agent 调用不同工具完成任务，本项目为它补上了原生的**文生视频能力**：

- ✅ **多提供商支持**：阿里云 DashScope (通义万相)、火山引擎/豆包 Seedance、OpenAI Sora 及兼容中转站
- ✅ **对话内播放**：生成的视频直接在对话流中显示，无需跳转
- ✅ **自动保存**：视频文件自动保存到 Agent 工作区，方便后续使用
- ✅ **Web 设置界面**：在 DSH Settings 中可视化配置 API Key、端点、模型等

---

## 🚀 快速安装与使用

### 1. 安装插件

在你的 DeepSeek Harness 项目根目录下运行：

```bash
# 推荐方式：从本地目录安装
pnpm dsh plugin --profile web add ./dsh-video-gen

# 或从 npm 安装（发布后可用）
pnpm dsh plugin --profile web add dsh-video-gen@latest
```

### 2. 配置 API Key

打开 DSH Web 页面（默认 `http://localhost:3080`）：

1. 进入 **Settings → Plugins → Video generation**
2. 选择 Provider（阿里云 / 火山引擎 / OpenAI）
3. 填写对应的 API Key，点击 **保存**

**密钥环境变量名称：**
- 阿里云 DashScope: `DASHSCOPE_API_KEY`
- 火山引擎 Ark: `ARK_API_KEY`
- OpenAI / 中转站: `OPENAI_API_KEY`

你也可以在启动 DSH 的环境中预先设置这些环境变量，插件会自动读取。

### 3. 开始生成视频

直接对 Agent 说：

```text
帮我生成一段 5 秒的视频：雨夜霓虹街头，一只赛博朋克风格的猫咪在奔跑，镜头跟随。
```

Agent 会自动调用 `generate_video` 工具，生成视频并直接显示在当前对话中。

---

## 📖 支持的提供商

| 提供商 | 模型示例 | 端点 | 说明 |
|--------|----------|------|------|
| **阿里云 DashScope** | `wanx2.1-t2v-turbo` | `https://dashscope.aliyuncs.com/api/v1` | 通义万相文生视频 |
| **火山引擎 / 豆包** | `doubao-seedance-1-0-pro-250528` | `https://ark.cn-beijing.volces.com/api/v3` | 豆包 Seedance 视频生成 |
| **OpenAI Sora** | `sora-2` | `https://api.openai.com/v1` | Sora 或兼容中转站 |

---

## 🛠️ 工具参数

`generate_video` 工具支持以下参数：

- **`prompt`** (必填): 完整的视频描述（主体、动作、镜头、场景、风格）
- **`size`**: 分辨率或宽高比，例如 `1280*720` (DashScope) 或 `16:9` (Seedance/Sora)
- **`duration`**: 视频时长（秒），例如 `5` 或 `10`（具体支持取决于提供商）

---

## 📝 工作原理

1. **异步任务**：视频生成是异步的（提交任务 → 轮询状态 → 下载视频），插件会自动处理轮询逻辑
2. **内存缓存**：生成的视频字节暂存在内存中，通过 HTTP 路由 `/plugins/dsh-video-gen/video` 流式传输到前端
3. **工作区持久化**：默认情况下，视频会保存到 Agent 工作区的 `dsh-video-gen` 子文件夹，文件路径通过 `savedTo` 字段返回

---

## ⚙️ 配置选项

在 Settings → Plugins → Video generation 中可配置：

- **Provider**: 选择提供商（阿里云 / 火山引擎 / OpenAI）
- **Model**: 模型名称
- **Endpoint / Base URL**: API 端点
- **API Key**: 密钥（仅写入，不会回显）
- **Save to Workspace**: 是否保存视频到工作区（默认开启）
- **Workspace Folder**: 工作区子文件夹名称（默认 `dsh-video-gen`）
- **Poll Interval**: 轮询间隔（毫秒，默认 5000）
- **Wait Timeout**: 最大等待时间（毫秒，默认 600000）

---

## 📦 开发与构建

本项目采用纯 ES 模块编写，无需 TypeScript 编译。客户端代码已预封装为 `__ModuleLoader__.load` 格式。

```bash
# 语法检查
node --check lib/index.js
node --check lib/client.js

# 安装到 web profile
pnpm dsh plugin --profile web add ./dsh-video-gen
```

---

## 📄 许可证

MIT © shanliuling

---

## 🙏 鸣谢

本项目受 [dsh-image-gen](https://github.com/shanliuling/dsh-image-gen) 启发，架构参考了其设置卡片与对话内展示的设计模式。
