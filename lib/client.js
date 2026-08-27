window.__ModuleLoader__.load({
	id: "dsh-video-gen",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react_jsx_runtime = require("react/jsx-runtime");
		let react = require("react");

		//#region shared
		const VIDEO_ROUTE = "/plugins/dsh-video-gen/video";
		const VIDEO_GENERATION_NAMESPACE = "video-generation";
		const VIDEO_PROVIDERS = ["dashscope", "volcengine", "openai", "google"];
		const DEFAULT_DASHSCOPE_ENDPOINT = "https://dashscope.aliyuncs.com/api/v1";
		const DEFAULT_VOLCENGINE_BASE_URL = "https://ark.cn-beijing.volces.com/api/v3";
		const DEFAULT_OPENAI_BASE_URL = "https://api.openai.com/v1";
		const DEFAULT_GOOGLE_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/interactions";
		const DEFAULT_DASHSCOPE_MODEL = "wanx2.1-t2v-turbo";
		const DEFAULT_VOLCENGINE_MODEL = "doubao-seedance-1-0-pro-250528";
		const DEFAULT_OPENAI_MODEL = "sora-2";
		const DEFAULT_GOOGLE_MODEL = "veo-3.0-generate-preview";
		const DEFAULT_WORKSPACE_FOLDER = "dsh-video-gen";

		const KEY_REF = {
			dashscope: "DASHSCOPE_API_KEY",
			volcengine: "ARK_API_KEY",
			openai: "OPENAI_API_KEY",
			google: "GEMINI_API_KEY",
		};

		const DEFAULT_BASE_URLS = {
			dashscope: DEFAULT_DASHSCOPE_ENDPOINT,
			volcengine: DEFAULT_VOLCENGINE_BASE_URL,
			openai: DEFAULT_OPENAI_BASE_URL,
			google: DEFAULT_GOOGLE_ENDPOINT,
		};

		const DEFAULT_MODELS = {
			dashscope: DEFAULT_DASHSCOPE_MODEL,
			volcengine: DEFAULT_VOLCENGINE_MODEL,
			openai: DEFAULT_OPENAI_MODEL,
			google: DEFAULT_GOOGLE_MODEL,
		};

		const DICT = {
			zh: {
				title: "视频生成",
				description: "使用通义万相、豆包 Seedance、Google Veo 或 Sora 生成短视频",
				provider: "提供商",
				providerDashScope: "阿里云 DashScope (通义万相)",
				providerVolcengine: "火山引擎 / 豆包 Seedance",
				providerOpenAI: "OpenAI Sora / 中转站",
				providerGoogle: "Google Veo (Gemini)",
				model: "模型",
				endpoint: "端点 / Base URL",
				apiKey: "API Key",
				apiKeyPlaceholder: "粘贴新密钥以更新...",
				keyConfigured: "✓ 已配置",
				keyNotConfigured: "✗ 未配置",
				checkingKey: "检查中...",
				saveToWorkspace: "保存视频到工作区",
				workspaceFolder: "工作区子文件夹",
				pollInterval: "轮询间隔 (ms)",
				waitTimeout: "等待超时 (ms)",
				save: "保存设置",
				saving: "保存中...",
				saved: "✓ 已保存",
				generatedTitle: "生成的视频",
				animatedTitle: "图生视频",
				loading: "加载中...",
				loadFailed: "视频加载失败 ({status})",
				savedToPath: "保存位置",
				generating: "正在生成视频，请稍候...",
				animating: "正在从图片生成视频，请稍候...",
				reset: "重置",
				resetTitle: "重置为默认官方地址",
				// Gallery
				galleryTab: "视频画廊",
				galleryTotalCount: "共 {count} 个生成视频",
				gallerySearchPlaceholder: "搜索 Prompt 关键词…",
				galleryFilterAll: "全部厂商",
				galleryEmptyTitle: "暂无视频生成记录",
				galleryEmptyDesc: "在对话中让 Agent 生成视频后，生成的视频会自动收录到这里。",
				galleryNoMatchTitle: "未找到匹配结果",
				galleryNoMatchDesc: "尝试更换搜索关键词或选择其他厂商。",
				copiedPrompt: "已复制 Prompt",
				copyFailed: "复制失败",
				preview: "预览播放",
				download: "下载视频",
				copyPpt: "复制 Prompt",
				galleryDelete: "从画廊删除",
				galleryConfirmDelete: "确定要从画廊中删除这个视频吗？（不会影响原聊天记录）",
				galleryDeleted: "已从画廊删除",
				close: "关闭 (Esc)",
			},
			en: {
				title: "Video Generation",
				description: "Generate videos with Wanx, Doubao Seedance, Google Veo, or Sora",
				provider: "Provider",
				providerDashScope: "Aliyun DashScope (Wanx)",
				providerVolcengine: "Volcengine / Doubao Seedance",
				providerOpenAI: "OpenAI Sora / Relay",
				providerGoogle: "Google Veo (Gemini)",
				model: "Model",
				endpoint: "Endpoint / Base URL",
				apiKey: "API Key",
				apiKeyPlaceholder: "Paste a new key to update...",
				keyConfigured: "✓ Configured",
				keyNotConfigured: "✗ Not configured",
				checkingKey: "Checking...",
				saveToWorkspace: "Save videos to workspace",
				workspaceFolder: "Workspace subfolder",
				pollInterval: "Poll interval (ms)",
				waitTimeout: "Wait timeout (ms)",
				save: "Save Settings",
				saving: "Saving...",
				saved: "✓ Saved",
				generatedTitle: "Generated Video",
				animatedTitle: "Image-to-Video",
				loading: "Loading...",
				loadFailed: "Video loading failed ({status})",
				savedToPath: "Saved to",
				generating: "Generating video, please wait...",
				animating: "Animating image into video, please wait...",
				reset: "Reset",
				resetTitle: "Reset to official default URL",
				// Gallery
				galleryTab: "Video Gallery",
				galleryTotalCount: "{count} videos total",
				gallerySearchPlaceholder: "Search prompt keywords…",
				galleryFilterAll: "All Providers",
				galleryEmptyTitle: "No videos generated yet",
				galleryEmptyDesc: "Videos generated during conversations will automatically appear here.",
				galleryNoMatchTitle: "No matching videos",
				galleryNoMatchDesc: "Try a different search keyword or provider filter.",
				copiedPrompt: "Prompt copied",
				copyFailed: "Copy failed",
				preview: "Preview",
				download: "Download",
				copyPpt: "Copy Prompt",
				galleryDelete: "Delete from gallery",
				galleryConfirmDelete: "Are you sure you want to remove this video from the gallery? (Chat history will not be affected)",
				galleryDeleted: "Deleted from gallery",
				close: "Close (Esc)",
			}
		};

		function modelOf(provider, config) {
			if (provider === "volcengine") return config?.volcengineModel ?? DEFAULT_VOLCENGINE_MODEL;
			if (provider === "openai") return config?.openaiModel ?? DEFAULT_OPENAI_MODEL;
			if (provider === "google") return config?.googleModel ?? DEFAULT_GOOGLE_MODEL;
			return config?.dashscopeModel ?? DEFAULT_DASHSCOPE_MODEL;
		}

		function baseURLOf(provider, config) {
			if (provider === "volcengine") return config?.volcengineBaseURL ?? DEFAULT_VOLCENGINE_BASE_URL;
			if (provider === "openai") return config?.openaiBaseURL ?? DEFAULT_OPENAI_BASE_URL;
			if (provider === "google") return config?.googleEndpoint ?? DEFAULT_GOOGLE_ENDPOINT;
			return config?.dashscopeEndpoint ?? DEFAULT_DASHSCOPE_ENDPOINT;
		}
		//#endregion

		//#region styles
		const STYLE = `
/* Settings Card — matches dsh-image-gen design tokens */
.dsh-vg-card{list-style:none;border:1px solid var(--dsw-alias-border-l2,#e5e7eb);border-radius:12px;background:var(--dsw-alias-bg-layer-3,#fff);transition:border-color .16s,background .16s;overflow:hidden;margin-bottom:10px}
.dsh-vg-card:hover{border-color:var(--dsw-alias-label-dimmed,#9ca3af)}
.dsh-vg-card-open{background:var(--dsw-alias-bg-layer-2,#fff);border-color:var(--dsw-alias-label-dimmed,#9ca3af)}
.dsh-vg-head{width:100%;appearance:none;border:0;background:none;font:inherit;color:inherit;text-align:left;cursor:pointer;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 16px;border-radius:12px}
.dsh-vg-head:focus-visible{outline:2px solid var(--dsw-alias-brand-primary,#4c78ff);outline-offset:-2px}
.dsh-vg-head-text{flex:1;min-width:0;display:flex;flex-direction:column;gap:4px}
.dsh-vg-title{display:block;font-size:15px;font-weight:600;line-height:1.4;color:var(--dsw-alias-label-primary,inherit)}
.dsh-vg-desc{display:block;font-size:13px;line-height:1.5;color:var(--dsw-alias-label-tertiary,#7b818b)}
.dsh-vg-chevron{flex:none;color:var(--dsw-alias-label-tertiary,#7b818b);transition:transform .16s;display:inline-flex;align-items:center}
.dsh-vg-chevron-open{transform:rotate(180deg)}
.dsh-vg-body{border-top:1px solid var(--dsw-alias-border-l2,#eee);padding:0 16px 16px}
.dsh-vg-field{display:grid;gap:6px;margin-top:14px}
.dsh-vg-label{font-size:13px;font-weight:500;color:var(--dsw-alias-label-primary,inherit)}
.dsh-vg-input,.dsh-vg-select{box-sizing:border-box;width:100%;padding:8px 12px;font-size:13px;border:1px solid var(--dsw-alias-border-l2,#d7dbe0);border-radius:8px;background:var(--dsw-alias-bg-layer-3,transparent);color:inherit;outline:none;transition:border-color .15s}
.dsh-vg-input:focus,.dsh-vg-select:focus{border-color:var(--dsw-alias-brand-primary,#4c78ff)}
.dsh-vg-hint,.dsh-vg-status{margin:0;color:var(--dsw-alias-label-tertiary,#7b818b);font-size:12px;line-height:1.4}
.dsh-vg-checkbox-row{display:flex;align-items:center;gap:8px;cursor:pointer}
.dsh-vg-checkbox-row input[type=checkbox]{width:15px;height:15px;accent-color:var(--dsw-alias-brand-primary,#4c78ff);margin:0}
.dsh-vg-checkbox-row label{font-size:13px;color:var(--dsw-alias-label-primary,inherit);cursor:pointer}
.dsh-vg-input-group{display:flex;gap:8px;align-items:center}
.dsh-vg-btn-reset{appearance:none;border:1px solid var(--dsw-alias-border-l2,#d7dbe0);border-radius:8px;padding:7px 12px;background:var(--dsw-alias-bg-layer-3,#f9fafb);color:var(--dsw-alias-label-secondary,inherit);font:inherit;font-size:13px;cursor:pointer;white-space:nowrap;transition:background .15s,border-color .15s}
.dsh-vg-btn-reset:hover{background:var(--dsw-alias-bg-layer-2,#edf0f3);border-color:var(--dsw-alias-label-dimmed,#9ca3af)}
.dsh-vg-actions{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:16px;padding-top:12px;border-top:1px solid var(--dsw-alias-border-l2,#eee)}
.dsh-vg-save{appearance:none;border:0;border-radius:8px;padding:6px 16px;background:var(--dsw-alias-label-primary,#111827);color:var(--dsw-alias-bg-layer-3,#fff);font:inherit;font-size:13px;font-weight:500;cursor:pointer;transition:opacity .15s}
.dsh-vg-save:disabled{opacity:.4;cursor:default}

/* Result card */
.dsh-vg-result{display:grid;gap:10px;max-width:520px}
.dsh-vg-result-title{font-size:14px;font-weight:600;color:var(--dsw-alias-label-primary,inherit)}
.dsh-vg-savedto{font-size:12px;line-height:1.5;color:var(--dsw-alias-label-tertiary,#7b818b);word-break:break-all}
.dsh-vg-error{color:var(--dsw-alias-label-error,#d33);font-size:13px}
.dsh-vg-loading{color:var(--dsw-alias-label-tertiary,#7b818b);font-size:13px}
.dsh-vg-container{margin-top:8px}
.dsh-vg-video{width:100%;max-width:640px;border-radius:8px;background:#000}

/* Gallery — matches dsh-image-gen design tokens */
.dsh-vg-gallery-page{width:100%;height:100%;background:var(--dsw-alias-bg-layer-1,#fff);display:flex;flex-direction:column;overflow:hidden;flex:1}
.dsh-vg-gallery-page-header{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:12px 28px;border-bottom:1px solid var(--dsw-alias-border-l2,#e5e7eb);background:var(--dsw-alias-bg-layer-1,#fff);flex-shrink:0}
.dsh-vg-gallery-page-title-row{display:flex;align-items:center;gap:12px}
.dsh-vg-gallery-page-count{font-size:13px;font-weight:500;color:var(--dsw-alias-label-secondary,#4b5563);background:var(--dsw-alias-bg-layer-3,#f3f4f6);padding:3px 10px;border-radius:20px}
.dsh-vg-gallery-page-tools{display:flex;align-items:center;gap:12px}
.dsh-vg-gallery-search-wrap{position:relative;display:flex;align-items:center}
.dsh-vg-gallery-search-icon{position:absolute;left:10px;color:var(--dsw-alias-label-tertiary,#9ca3af);pointer-events:none}
.dsh-vg-gallery-search-input{padding:6px 12px 6px 32px;font-size:13px;border:1px solid var(--dsw-alias-border-l2,#d7dbe0);border-radius:8px;background:var(--dsw-alias-bg-layer-2,#fff);color:inherit;outline:none;width:200px;transition:border-color .15s,width .2s}
.dsh-vg-gallery-search-input:focus{border-color:var(--dsw-alias-brand-primary,#4c78ff);width:240px}
.dsh-vg-gallery-select{padding:6px 12px;font-size:13px;border:1px solid var(--dsw-alias-border-l2,#d7dbe0);border-radius:8px;background:var(--dsw-alias-bg-layer-2,#fff);color:inherit;outline:none;cursor:pointer}
.dsh-vg-gallery-page-body{flex:1;overflow-y:auto;padding:24px 28px}
.dsh-vg-gallery-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:20px}
.dsh-vg-gallery-card{background:var(--dsw-alias-bg-layer-2,#fff);border:1px solid var(--dsw-alias-border-l2,#e5e7eb);border-radius:12px;overflow:hidden;display:flex;flex-direction:column;cursor:pointer;transition:transform .18s ease,box-shadow .18s ease,border-color .18s ease}
.dsh-vg-gallery-card:hover{transform:translateY(-2px);box-shadow:0 8px 24px rgba(0,0,0,0.06);border-color:var(--dsw-alias-border-l1,#cfd4dc)}
.dsh-vg-gallery-card-media{position:relative;width:100%;aspect-ratio:16/9;background:#000;overflow:hidden;display:flex;align-items:center;justify-content:center}
.dsh-vg-gallery-card-video{width:100%;height:100%;object-fit:cover}
.dsh-vg-gallery-card-loading{font-size:12px;color:var(--dsw-alias-label-tertiary,#9ca3af)}
.dsh-vg-gallery-card-meta{padding:12px 14px;display:flex;flex-direction:column;gap:6px;background:var(--dsw-alias-bg-layer-2,#fff);flex:1}
.dsh-vg-gallery-card-header{display:flex;align-items:center;justify-content:space-between;font-size:11px}
.dsh-vg-tag{display:inline-block;padding:2px 6px;border-radius:4px;background:var(--dsw-alias-bg-layer-3,#edf0f3);color:var(--dsw-alias-label-secondary,inherit);font-weight:500;text-transform:uppercase;font-size:10px}
.dsh-vg-tag-model{background:rgba(76,120,255,0.1);color:#4c78ff}
.dsh-vg-gallery-card-prompt{margin:0;font-size:12px;line-height:1.5;color:var(--dsw-alias-label-primary,inherit);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;word-break:break-word}
.dsh-vg-gallery-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;min-height:360px;text-align:center;color:var(--dsw-alias-label-tertiary,#7b818b)}
.dsh-vg-gallery-empty-icon{font-size:48px;margin-bottom:12px}
.dsh-vg-gallery-empty-title{font-size:16px;font-weight:600;color:var(--dsw-alias-label-primary,inherit);margin-bottom:6px}
.dsh-vg-gallery-empty-desc{font-size:13px;max-width:360px;line-height:1.5}

/* Lightbox */
.dsh-vg-lightbox-backdrop{position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,0.88);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);display:flex;flex-direction:column;align-items:center;justify-content:center;padding:20px;box-sizing:border-box;cursor:zoom-out;animation:dsh-vg-fade .15s ease-out}
@keyframes dsh-vg-fade{from{opacity:0}to{opacity:1}}
.dsh-vg-lightbox-topbar{position:absolute;top:20px;left:24px;right:24px;display:flex;align-items:center;justify-content:space-between;z-index:10;pointer-events:none}
.dsh-vg-lightbox-meta{display:flex;align-items:center;gap:8px;pointer-events:auto}
.dsh-vg-lightbox-close-btn{appearance:none;border:0;background:rgba(255,255,255,0.15);color:#fff;border-radius:50%;width:34px;height:34px;font-size:16px;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;transition:background .15s;pointer-events:auto}
.dsh-vg-lightbox-close-btn:hover{background:rgba(255,255,255,0.3)}
.dsh-vg-lightbox-video-wrap{max-width:86vw;max-height:78vh;display:flex;align-items:center;justify-content:center;cursor:default}
.dsh-vg-lightbox-video{max-width:100%;max-height:78vh;border-radius:8px;box-shadow:0 24px 60px rgba(0,0,0,0.7)}
.dsh-vg-lightbox-bottombar{position:absolute;bottom:24px;left:50%;transform:translateX(-50%);max-width:min(90vw,640px);background:rgba(20,22,26,0.85);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);border:1px solid rgba(255,255,255,0.15);border-radius:14px;padding:10px 16px;display:flex;flex-direction:column;gap:8px;color:#fff;box-shadow:0 16px 40px rgba(0,0,0,0.5);cursor:default}
.dsh-vg-lightbox-prompt-text{font-size:13px;line-height:1.4;color:rgba(255,255,255,0.92);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;word-break:break-word}
.dsh-vg-lightbox-actions{display:flex;align-items:center;gap:8px;justify-content:flex-end;border-top:1px solid rgba(255,255,255,0.1);padding-top:8px}
.dsh-vg-lightbox-btn{appearance:none;border:1px solid rgba(255,255,255,0.18);background:rgba(255,255,255,0.08);color:#fff;border-radius:6px;padding:5px 10px;font-size:12px;cursor:pointer;display:inline-flex;align-items:center;gap:5px;transition:background .15s,border-color .15s,color .15s}
.dsh-vg-lightbox-btn:hover{background:rgba(255,255,255,0.22)}
.dsh-vg-lightbox-btn-danger{border-color:rgba(239,68,68,0.4);color:#fca5a5}
.dsh-vg-lightbox-btn-danger:hover{background:rgba(239,68,68,0.35)!important;color:#fff!important;border-color:rgba(239,68,68,0.7)!important}
.dsh-vg-gallery-page-toast{position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.85);color:#fff;padding:6px 14px;border-radius:8px;font-size:13px;z-index:99999;animation:dsh-vg-fade .15s}
`;
		//#endregion

		//#region client apply + settings card
		const inject = ["slots", "connection", "settingsScope", "locale"];

		function apply(ctx) {
			const { api } = ctx.get("connection");
			const scope = ctx.settingsScope.bind({ namespace: VIDEO_GENERATION_NAMESPACE });
			const locale = ctx.get("locale");
			ctx.effect(() => {
				const style = document.createElement("style");
				style.dataset.plugin = "dsh-video-gen";
				style.textContent = STYLE;
				document.head.appendChild(style);
				return () => { style.remove(); };
			}, "dsh-video-gen: styles");

			const register = ctx.slots.register.bind(ctx.slots);
			ctx.slots.inject("settings.plugin.item", () => register({
				name: "settings.plugin.item",
				key: VIDEO_GENERATION_NAMESPACE,
				inject: () => ({ scope, credentials: api.credentials, locale })
			}, VideoGenerationSettingsCard));

			ctx.slots.inject("tool.call.toolview", () => register({
				name: "tool.call.toolview",
				key: "generate_video",
				inject: () => ({ locale })
			}, GeneratedVideoCard));

			ctx.slots.inject("tool.call.toolview", () => register({
				name: "tool.call.toolview",
				key: "animate_image",
				inject: () => ({ locale })
			}, GeneratedVideoCard));

			// Gallery view tab
			ctx.slots.inject("conversation.view", () => register({
				name: "conversation.view",
				id: "video-gallery",
				order: 30,
				label: () => {
					const active = locale?.getSnapshot?.()?.active;
					return active?.startsWith("en") ? "Video Gallery" : "视频画廊";
				},
				inject: () => ({ locale }),
			}, GalleryViewTab));
		}

		function VideoGenerationSettingsCard(props) {
			const [open, setOpen] = react.useState(false);
			const [snapshot, setSnapshot] = react.useState(() => props.scope.getSnapshot());
			const [lang, setLang] = react.useState(() => props.locale?.getSnapshot?.()?.active?.startsWith("en") ? "en" : "zh");
			const [provider, setProvider] = react.useState("dashscope");
			const [model, setModel] = react.useState("");
			const [baseURL, setBaseURL] = react.useState("");
			const [saveToWorkspace, setSaveToWorkspace] = react.useState(true);
			const [workspaceFolder, setWorkspaceFolder] = react.useState(DEFAULT_WORKSPACE_FOLDER);
			const [key, setKey] = react.useState("");
			const [configured, setConfigured] = react.useState();
			const [saving, setSaving] = react.useState(false);
			const [message, setMessage] = react.useState("");

			react.useEffect(() => props.scope.subscribe(() => setSnapshot(props.scope.getSnapshot())), [props.scope]);
			react.useEffect(() => props.locale?.subscribe?.(() => {
				setLang(props.locale?.getSnapshot?.()?.active?.startsWith("en") ? "en" : "zh");
			}), [props.locale]);

			const t = (keyName, params) => {
				let text = (lang === "en" ? DICT.en : DICT.zh)[keyName] || DICT.zh[keyName] || keyName;
				if (params) for (const [k, v] of Object.entries(params)) text = text.replace(`{${k}}`, v);
				return text;
			};

			react.useEffect(() => {
				const value = snapshot.value;
				const next = value?.provider ?? "dashscope";
				setProvider(next);
				setModel(modelOf(next, value));
				setBaseURL(baseURLOf(next, value));
				setSaveToWorkspace(value?.saveToWorkspace ?? true);
				setWorkspaceFolder(value?.workspaceFolder ?? DEFAULT_WORKSPACE_FOLDER);
			}, [snapshot]);

			react.useEffect(() => {
				let active = true;
				props.credentials.describe({ refs: [KEY_REF[provider]] }).then((response) => {
					if (active) setConfigured(response.result.ok ? response.result.value.credentials[KEY_REF[provider]]?.configured ?? false : undefined);
				}).catch(() => { if (active) setConfigured(undefined); });
				return () => { active = false; };
			}, [props.credentials, provider]);

			const save = async (event) => {
				event.preventDefault();
				setSaving(true);
				setMessage("");
				try {
					await props.scope.set("provider", provider);
					await props.scope.set(provider === "dashscope" ? "dashscopeModel" : provider === "volcengine" ? "volcengineModel" : provider === "openai" ? "openaiModel" : "googleModel", model);
					await props.scope.set(provider === "dashscope" ? "dashscopeEndpoint" : provider === "volcengine" ? "volcengineBaseURL" : provider === "openai" ? "openaiBaseURL" : "googleEndpoint", baseURL);
					await props.scope.set("saveToWorkspace", saveToWorkspace);
					await props.scope.set("workspaceFolder", workspaceFolder.trim());
					if (key.trim().length > 0) {
						const response = await props.credentials.set({ ref: KEY_REF[provider], value: key.trim() });
						if (!response.result.ok) throw new Error(response.result.error.message);
						setKey("");
						setConfigured(true);
					}
					setMessage(t("saved"));
				} catch (cause) {
					setMessage(cause instanceof Error ? cause.message : String(cause));
				} finally {
					setSaving(false);
				}
			};

			const keyStatus = configured === undefined ? t("checkingKey") : configured ? t("keyConfigured") : t("keyNotConfigured");

			return react_jsx_runtime.jsxs("li", {
				className: `dsh-vg-card ${open ? "dsh-vg-card-open" : ""}`,
				children: [
					react_jsx_runtime.jsxs("button", {
						type: "button",
						className: "dsh-vg-head",
						"aria-expanded": open,
						onClick: () => setOpen((v) => !v),
						children: [
							react_jsx_runtime.jsxs("span", {
								className: "dsh-vg-head-text",
								children: [
									react_jsx_runtime.jsx("span", { className: "dsh-vg-title", children: t("title") }),
									react_jsx_runtime.jsx("span", { className: "dsh-vg-desc", children: t("description") })
								]
							}),
							react_jsx_runtime.jsx("span", {
								className: `dsh-vg-chevron ${open ? "dsh-vg-chevron-open" : ""}`,
								children: react_jsx_runtime.jsx("svg", { width: "14", height: "14", viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: "2", children: react_jsx_runtime.jsx("path", { d: "M4 6l4 4 4-4" }) })
							})
						]
					}),
					open ? react_jsx_runtime.jsxs("form", {
						className: "dsh-vg-body",
						onSubmit: save,
						children: [
							react_jsx_runtime.jsxs("label", {
								className: "dsh-vg-field",
								children: [
									react_jsx_runtime.jsx("span", { className: "dsh-vg-label", children: t("provider") }),
									react_jsx_runtime.jsxs("select", {
										className: "dsh-vg-input",
										value: provider,
										onChange: (e) => {
											const next = e.target.value;
											setProvider(next);
											setModel(modelOf(next, snapshot.value));
											setBaseURL(baseURLOf(next, snapshot.value));
											setKey("");
										},
										children: [
											react_jsx_runtime.jsx("option", { value: "dashscope", children: t("providerDashScope") }),
											react_jsx_runtime.jsx("option", { value: "volcengine", children: t("providerVolcengine") }),
											react_jsx_runtime.jsx("option", { value: "openai", children: t("providerOpenAI") }),
											react_jsx_runtime.jsx("option", { value: "google", children: t("providerGoogle") })
										]
									})
								]
							}),
							react_jsx_runtime.jsxs("label", {
								className: "dsh-vg-field",
								children: [
									react_jsx_runtime.jsx("span", { className: "dsh-vg-label", children: t("model") }),
									react_jsx_runtime.jsx("input", { type: "text", className: "dsh-vg-input", value: model, onChange: (e) => setModel(e.target.value) })
								]
							}),
							react_jsx_runtime.jsxs("label", {
								className: "dsh-vg-field",
								children: [
									react_jsx_runtime.jsx("span", { className: "dsh-vg-label", children: t("endpoint") }),
									react_jsx_runtime.jsxs("div", {
										className: "dsh-vg-input-group",
										children: [
											react_jsx_runtime.jsx("input", { type: "text", className: "dsh-vg-input", value: baseURL, onChange: (e) => setBaseURL(e.target.value) }),
											react_jsx_runtime.jsx("button", { type: "button", className: "dsh-vg-btn-reset", title: t("resetTitle"), onClick: () => setBaseURL(DEFAULT_BASE_URLS[provider]), children: t("reset") })
										]
									})
								]
							}),
							react_jsx_runtime.jsxs("label", {
								className: "dsh-vg-field",
								children: [
									react_jsx_runtime.jsxs("span", { className: "dsh-vg-label", children: [t("apiKey"), " ", react_jsx_runtime.jsx("span", { className: "dsh-vg-status", children: keyStatus })] }),
									react_jsx_runtime.jsx("input", { type: "password", className: "dsh-vg-input", value: key, placeholder: t("apiKeyPlaceholder"), onChange: (e) => setKey(e.target.value) })
								]
							}),
							react_jsx_runtime.jsxs("div", {
								className: "dsh-vg-checkbox-row",
								children: [
									react_jsx_runtime.jsx("input", { type: "checkbox", id: "vg-save-ws", checked: saveToWorkspace, onChange: (e) => setSaveToWorkspace(e.target.checked) }),
									react_jsx_runtime.jsx("label", { htmlFor: "vg-save-ws", children: t("saveToWorkspace") })
								]
							}),
							saveToWorkspace ? react_jsx_runtime.jsxs("label", {
								className: "dsh-vg-field",
								children: [
									react_jsx_runtime.jsx("span", { className: "dsh-vg-label", children: t("workspaceFolder") }),
									react_jsx_runtime.jsx("input", { type: "text", className: "dsh-vg-input", value: workspaceFolder, onChange: (e) => setWorkspaceFolder(e.target.value) })
								]
							}) : null,
							react_jsx_runtime.jsxs("div", {
								className: "dsh-vg-actions",
								children: [
									message ? react_jsx_runtime.jsx("span", { className: "dsh-vg-status", children: message }) : null,
									react_jsx_runtime.jsx("button", { type: "submit", className: "dsh-vg-save", disabled: saving, children: saving ? t("saving") : t("save") })
								]
							})
						]
					}) : null
				]
			});
		}

		function GeneratedVideoCard(props) {
			const meta = props.block?.meta ?? props.block?.resultView?.meta;
			const route = typeof meta?.route === "string" ? meta.route : undefined;
			const savedTo = typeof meta?.savedTo === "string" ? meta.savedTo : undefined;
			const isAnimate = meta?.operation === "animate";
			const [error, setError] = react.useState();
			const [lang, setLang] = react.useState(() => props.locale?.getSnapshot?.()?.active?.startsWith("en") ? "en" : "zh");

			react.useEffect(() => props.locale?.subscribe?.(() => {
				setLang(props.locale?.getSnapshot?.()?.active?.startsWith("en") ? "en" : "zh");
			}), [props.locale]);

			const t = (keyName, params) => {
				let text = (lang === "en" ? DICT.en : DICT.zh)[keyName] || DICT.zh[keyName] || keyName;
				if (params) for (const [k, v] of Object.entries(params)) text = text.replace(`{${k}}`, v);
				return text;
			};

			// Auto-collect into gallery IndexedDB
			react.useEffect(() => {
				if (route === undefined) return;
				const metaAny = (props.block?.meta ?? props.block?.resultView?.meta) || {};
				const prompt = typeof metaAny.prompt === "string" ? metaAny.prompt : "Generated Video";
				const provider = typeof metaAny.provider === "string" ? metaAny.provider : "dashscope";
				const model = typeof metaAny.model === "string" ? metaAny.model : "";
				const videoId = typeof metaAny.videoId === "string" ? metaAny.videoId : "";

				saveGalleryItem({
					id: videoId || (route + "_" + Date.now()),
					videoId, route, mediaType: metaAny.mediaType ?? "video/mp4",
					prompt, provider, model, bytes: metaAny.bytes ?? 0,
				}).catch(() => {});
			}, [route]);

			if (route === undefined) {
				return react_jsx_runtime.jsx("div", { className: "dsh-vg-loading", children: isAnimate ? t("animating") : t("generating") });
			}

			return react_jsx_runtime.jsxs("section", {
				className: "dsh-vg-result",
				children: [
					react_jsx_runtime.jsx("div", { className: "dsh-vg-result-title", children: isAnimate ? t("animatedTitle") : t("generatedTitle") }),
					savedTo ? react_jsx_runtime.jsxs("div", { className: "dsh-vg-savedto", children: [t("savedToPath"), ": ", savedTo] }) : null,
					error ? react_jsx_runtime.jsx("div", { className: "dsh-vg-error", children: error }) : null,
					react_jsx_runtime.jsx("div", {
						className: "dsh-vg-container",
						children: react_jsx_runtime.jsx("video", {
							className: "dsh-vg-video",
							controls: true,
							preload: "metadata",
							onError: () => setError(t("loadFailed", { status: "playback" })),
							children: react_jsx_runtime.jsx("source", { src: route, type: meta?.mediaType ?? "video/mp4" })
						})
					})
				]
			});
		}
		//#endregion

		//#region gallery store (IndexedDB)
		const DB_NAME = "dsh_video_gen_db";
		const DB_VERSION = 1;
		const STORE_NAME = "gallery_history";
		const TOMBSTONE_STORE = "gallery_tombstones";

		let dbPromise = null;
		let tombstonesCache = null;

		function getDB() {
			if (dbPromise) return dbPromise;
			dbPromise = new Promise((resolve, reject) => {
				if (typeof indexedDB === "undefined") {
					reject(new Error("IndexedDB is not supported"));
					return;
				}
				const request = indexedDB.open(DB_NAME, DB_VERSION);
				request.onupgradeneeded = (event) => {
					const db = event.target.result;
					if (!db.objectStoreNames.contains(STORE_NAME)) {
						const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
						store.createIndex("createdAt", "createdAt", { unique: false });
					}
					if (!db.objectStoreNames.contains(TOMBSTONE_STORE)) {
						db.createObjectStore(TOMBSTONE_STORE, { keyPath: "id" });
					}
				};
				request.onsuccess = () => resolve(request.result);
				request.onerror = () => reject(request.error);
			});
			return dbPromise;
		}

		async function loadTombstones(db) {
			if (tombstonesCache) return tombstonesCache;
			return new Promise((resolve) => {
				if (!db.objectStoreNames.contains(TOMBSTONE_STORE)) { tombstonesCache = new Set(); resolve(tombstonesCache); return; }
				try {
					const tx = db.transaction(TOMBSTONE_STORE, "readonly");
					const store = tx.objectStore(TOMBSTONE_STORE);
					const req = store.getAllKeys();
					req.onsuccess = () => { tombstonesCache = new Set(req.result.map(String)); resolve(tombstonesCache); };
					req.onerror = () => { tombstonesCache = new Set(); resolve(tombstonesCache); };
				} catch { tombstonesCache = new Set(); resolve(tombstonesCache); }
			});
		}

		const galleryListeners = new Set();
		function notifyGalleryListeners() {
			for (const fn of galleryListeners) { try { fn(); } catch {} }
		}

		function subscribeGallery(listener) {
			galleryListeners.add(listener);
			return () => { galleryListeners.delete(listener); };
		}

		async function saveGalleryItem(item) {
			try {
				const db = await getDB();
				const tombstones = await loadTombstones(db);
				if (tombstones.has(item.id)) return;
				const record = { ...item, createdAt: item.createdAt ?? Date.now() };
				await new Promise((resolve, reject) => {
					const tx = db.transaction(STORE_NAME, "readwrite");
					const store = tx.objectStore(STORE_NAME);
					const req = store.put(record);
					req.onsuccess = () => resolve();
					req.onerror = () => reject(req.error);
				});
				notifyGalleryListeners();
			} catch (err) { console.warn("[dsh-video-gen] Failed to save gallery item:", err); }
		}

		async function getGalleryItems() {
			try {
				const db = await getDB();
				return new Promise((resolve, reject) => {
					const tx = db.transaction(STORE_NAME, "readonly");
					const store = tx.objectStore(STORE_NAME);
					const index = store.index("createdAt");
					const req = index.openCursor(null, "prev");
					const items = [];
					req.onsuccess = (event) => {
						const cursor = event.target.result;
						if (cursor) { items.push(cursor.value); cursor.continue(); }
						else resolve(items);
					};
					req.onerror = () => reject(req.error);
				});
			} catch (err) { console.warn("[dsh-video-gen] Failed to read gallery items:", err); return []; }
		}

		async function deleteGalleryItem(id) {
			try {
				const db = await getDB();
				const tombstones = await loadTombstones(db);
				tombstones.add(id);
				await new Promise((resolve, reject) => {
					const tx = db.transaction([STORE_NAME, TOMBSTONE_STORE], "readwrite");
					tx.objectStore(STORE_NAME).delete(id);
					tx.objectStore(TOMBSTONE_STORE).put({ id, deletedAt: Date.now() });
					tx.oncomplete = () => resolve();
					tx.onerror = () => reject(tx.error);
				});
				notifyGalleryListeners();
			} catch (err) { console.warn("[dsh-video-gen] Failed to delete gallery item:", err); }
		}
		//#endregion

		//#region gallery view
		function GalleryViewTab(props) {
			const [items, setItems] = react.useState([]);
			const [search, setSearch] = react.useState("");
			const [selectedProvider, setSelectedProvider] = react.useState("all");
			const [previewItem, setPreviewItem] = react.useState(null);
			const [toast, setToast] = react.useState(null);
			const [lang, setLang] = react.useState(() => (props.locale?.getSnapshot?.()?.active?.startsWith("en") ? "en" : "zh"));

			react.useEffect(() => {
				if (!props.locale?.subscribe) return;
				return props.locale.subscribe(() => {
					setLang(props.locale?.getSnapshot?.()?.active?.startsWith("en") ? "en" : "zh");
				});
			}, [props.locale]);

			const t = (keyName, params) => {
				let text = (lang === "en" ? DICT.en : DICT.zh)[keyName] || DICT.zh[keyName] || keyName;
				if (params) for (const [k, v] of Object.entries(params)) text = text.replace(`{${k}}`, v);
				return text;
			};

			const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 2000); };

			react.useEffect(() => {
				const seat = document.querySelector("[data-composer-seat]");
				if (seat) {
					const prev = seat.style.display;
					seat.style.display = "none";
					return () => { seat.style.display = prev; };
				}
			}, []);

			react.useEffect(() => {
				let active = true;
				const load = () => { getGalleryItems().then((res) => { if (active) setItems(res); }); };
				load();
				const unsub = subscribeGallery(load);
				return () => { active = false; unsub(); };
			}, []);

			react.useEffect(() => {
				if (!previewItem) return;
				const onKey = (e) => { if (e.key === "Escape") setPreviewItem(null); };
				window.addEventListener("keydown", onKey);
				return () => window.removeEventListener("keydown", onKey);
			}, [previewItem]);

			const filteredItems = react.useMemo(() => {
				return items.filter((item) => {
					if (selectedProvider !== "all" && item.provider !== selectedProvider) return false;
					if (search.trim().length > 0) {
						const q = search.trim().toLowerCase();
						if (!(item.prompt || "").toLowerCase().includes(q) && !(item.model || "").toLowerCase().includes(q)) return false;
					}
					return true;
				});
			}, [items, search, selectedProvider]);

			return react_jsx_runtime.jsxs("div", { className: "dsh-vg-gallery-page", children: [
				react_jsx_runtime.jsxs("header", { className: "dsh-vg-gallery-page-header", children: [
					react_jsx_runtime.jsx("span", { className: "dsh-vg-gallery-page-count", children: t("galleryTotalCount", { count: String(items.length) }) }),
					react_jsx_runtime.jsxs("div", { className: "dsh-vg-gallery-page-tools", children: [
						react_jsx_runtime.jsxs("div", { className: "dsh-vg-gallery-search-wrap", children: [
							react_jsx_runtime.jsx("svg", { className: "dsh-vg-gallery-search-icon", width: "14", height: "14", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", children: react_jsx_runtime.jsxs("g", null, [react_jsx_runtime.jsx("circle", { cx: "11", cy: "11", r: "8" }), react_jsx_runtime.jsx("line", { x1: "21", y1: "21", x2: "16.65", y2: "16.65" })]) }),
							react_jsx_runtime.jsx("input", { type: "text", className: "dsh-vg-gallery-search-input", placeholder: t("gallerySearchPlaceholder"), value: search, onChange: (e) => setSearch(e.target.value) })
						] }),
						react_jsx_runtime.jsxs("select", { className: "dsh-vg-gallery-select", value: selectedProvider, onChange: (e) => setSelectedProvider(e.target.value), children: [
							react_jsx_runtime.jsx("option", { value: "all", children: t("galleryFilterAll") }),
							react_jsx_runtime.jsx("option", { value: "dashscope", children: t("providerDashScope") }),
							react_jsx_runtime.jsx("option", { value: "volcengine", children: t("providerVolcengine") }),
							react_jsx_runtime.jsx("option", { value: "openai", children: t("providerOpenAI") }),
							react_jsx_runtime.jsx("option", { value: "google", children: t("providerGoogle") })
						] })
					] })
				] }),
				react_jsx_runtime.jsx("div", { className: "dsh-vg-gallery-page-body", children:
					items.length === 0
						? react_jsx_runtime.jsxs("div", { className: "dsh-vg-gallery-empty", children: [
							react_jsx_runtime.jsx("div", { className: "dsh-vg-gallery-empty-icon", children: "🎬" }),
							react_jsx_runtime.jsx("div", { className: "dsh-vg-gallery-empty-title", children: t("galleryEmptyTitle") }),
							react_jsx_runtime.jsx("div", { className: "dsh-vg-gallery-empty-desc", children: t("galleryEmptyDesc") })
						] })
						: filteredItems.length === 0
							? react_jsx_runtime.jsxs("div", { className: "dsh-vg-gallery-empty", children: [
								react_jsx_runtime.jsx("div", { className: "dsh-vg-gallery-empty-icon", children: "🔍" }),
								react_jsx_runtime.jsx("div", { className: "dsh-vg-gallery-empty-title", children: t("galleryNoMatchTitle") }),
								react_jsx_runtime.jsx("div", { className: "dsh-vg-gallery-empty-desc", children: t("galleryNoMatchDesc") })
							] })
							: react_jsx_runtime.jsx("div", { className: "dsh-vg-gallery-grid", children: filteredItems.map((item) =>
								react_jsx_runtime.jsx(GalleryCard, { item, t, onPreview: (it) => setPreviewItem(it), onToast: showToast }, item.id)
							) })
				}),
				toast ? react_jsx_runtime.jsx("div", { className: "dsh-vg-gallery-page-toast", children: toast }) : null,
				previewItem ? react_jsx_runtime.jsx(GalleryLightbox, { item: previewItem, t, onToast: showToast, onClose: () => setPreviewItem(null) }) : null
			] });
		}

		function GalleryCard(props) {
			const { item, t, onPreview, onToast } = props;
			const copyPrompt = async (e) => {
				e.stopPropagation();
				try { await navigator.clipboard.writeText(item.prompt); onToast(t("copiedPrompt")); }
				catch { onToast(t("copyFailed")); }
			};
			const downloadVideo = (e) => {
				e.stopPropagation();
				const a = document.createElement("a");
				a.href = item.route;
				a.download = `dsh-${item.provider}-${item.id}.mp4`;
				document.body.appendChild(a); a.click(); document.body.removeChild(a);
			};

			return react_jsx_runtime.jsxs("div", {
				className: "dsh-vg-gallery-card",
				onClick: () => onPreview(item),
				children: [
					react_jsx_runtime.jsx("div", { className: "dsh-vg-gallery-card-media", children:
						react_jsx_runtime.jsx("video", { className: "dsh-vg-gallery-card-video", src: item.route, preload: "metadata", muted: true, disablePictureInPicture: true, onMouseEnter: (e) => { try { e.target.play().catch(() => {}); } catch {} }, onMouseLeave: (e) => { try { e.target.pause(); e.target.currentTime = 0; } catch {} } })
					}),
					react_jsx_runtime.jsxs("div", { className: "dsh-vg-gallery-card-meta", children: [
						react_jsx_runtime.jsxs("div", { className: "dsh-vg-gallery-card-header", children: [
							react_jsx_runtime.jsx("span", { className: "dsh-vg-tag", children: item.provider }),
							item.model ? react_jsx_runtime.jsx("span", { className: "dsh-vg-tag dsh-vg-tag-model", children: item.model }) : null
						] }),
						react_jsx_runtime.jsx("p", { className: "dsh-vg-gallery-card-prompt", title: item.prompt, children: item.prompt })
					] })
				]
			});
		}

		function GalleryLightbox(props) {
			const { item, t, onToast, onClose } = props;
			const copyPrompt = async () => {
				try { await navigator.clipboard.writeText(item.prompt); onToast(t("copiedPrompt")); }
				catch { onToast(t("copyFailed")); }
			};
			const downloadVideo = () => {
				const a = document.createElement("a");
				a.href = item.route;
				a.download = `dsh-${item.provider}-${item.id}.mp4`;
				document.body.appendChild(a); a.click(); document.body.removeChild(a);
			};
			const deleteItem = async () => {
				if (!window.confirm(t("galleryConfirmDelete"))) return;
				await deleteGalleryItem(item.id);
				onToast(t("galleryDeleted"));
				onClose();
			};

			return react_jsx_runtime.jsxs("div", { className: "dsh-vg-lightbox-backdrop", onClick: onClose, children: [
				react_jsx_runtime.jsxs("div", { className: "dsh-vg-lightbox-topbar", onClick: (e) => e.stopPropagation(), children: [
					react_jsx_runtime.jsxs("div", { className: "dsh-vg-lightbox-meta", children: [
						react_jsx_runtime.jsx("span", { className: "dsh-vg-tag", children: item.provider }),
						item.model ? react_jsx_runtime.jsx("span", { className: "dsh-vg-tag dsh-vg-tag-model", children: item.model }) : null
					] }),
					react_jsx_runtime.jsx("button", { type: "button", className: "dsh-vg-lightbox-close-btn", title: t("close"), onClick: onClose, children:
						react_jsx_runtime.jsx("svg", { width: "18", height: "18", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", children: react_jsx_runtime.jsxs("g", null, [react_jsx_runtime.jsx("line", { x1: "18", y1: "6", x2: "6", y2: "18" }), react_jsx_runtime.jsx("line", { x1: "6", y1: "6", x2: "18", y2: "18" })]) })
					})
				] }),
				react_jsx_runtime.jsx("div", { className: "dsh-vg-lightbox-video-wrap", onClick: (e) => e.stopPropagation(), children:
					react_jsx_runtime.jsx("video", { className: "dsh-vg-lightbox-video", src: item.route, controls: true, autoPlay: true })
				}),
				react_jsx_runtime.jsxs("div", { className: "dsh-vg-lightbox-bottombar", onClick: (e) => e.stopPropagation(), children: [
					react_jsx_runtime.jsx("div", { className: "dsh-vg-lightbox-prompt-text", title: item.prompt, children: item.prompt }),
					react_jsx_runtime.jsxs("div", { className: "dsh-vg-lightbox-actions", children: [
						react_jsx_runtime.jsxs("button", { type: "button", className: "dsh-vg-lightbox-btn", title: t("copyPpt"), onClick: copyPrompt, children: [
							react_jsx_runtime.jsx("svg", { width: "14", height: "14", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", children: react_jsx_runtime.jsxs("g", null, [react_jsx_runtime.jsx("path", { d: "M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" }), react_jsx_runtime.jsx("rect", { x: "8", y: "2", width: "8", height: "4", rx: "1", ry: "1" })]) }),
							react_jsx_runtime.jsx("span", { children: t("copyPpt") })
						] }),
						react_jsx_runtime.jsxs("button", { type: "button", className: "dsh-vg-lightbox-btn", title: t("download"), onClick: downloadVideo, children: [
							react_jsx_runtime.jsx("svg", { width: "14", height: "14", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", children: react_jsx_runtime.jsxs("g", null, [react_jsx_runtime.jsx("path", { d: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" }), react_jsx_runtime.jsx("polyline", { points: "7 10 12 15 17 10" }), react_jsx_runtime.jsx("line", { x1: "12", y1: "15", x2: "12", y2: "3" })]) }),
							react_jsx_runtime.jsx("span", { children: t("download") })
						] }),
						react_jsx_runtime.jsxs("button", { type: "button", className: "dsh-vg-lightbox-btn dsh-vg-lightbox-btn-danger", title: t("galleryDelete"), onClick: () => { deleteItem(); }, children: [
							react_jsx_runtime.jsx("svg", { width: "14", height: "14", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", children: react_jsx_runtime.jsxs("g", null, [react_jsx_runtime.jsx("polyline", { points: "3 6 5 6 21 6" }), react_jsx_runtime.jsx("path", { d: "M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" }), react_jsx_runtime.jsx("line", { x1: "10", y1: "11", x2: "10", y2: "17" }), react_jsx_runtime.jsx("line", { x1: "14", y1: "11", x2: "14", y2: "17" })]) }),
							react_jsx_runtime.jsx("span", { children: t("galleryDelete") })
						] })
					] })
				] })
			] });
		}
		//#endregion

		exports.apply = apply;
		exports.inject = inject;
		exports.VideoGenerationSettingsCard = VideoGenerationSettingsCard;
		exports.GeneratedVideoCard = GeneratedVideoCard;
		return module.exports;
	}
});