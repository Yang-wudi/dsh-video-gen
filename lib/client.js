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
		const VIDEO_PROVIDERS = ["dashscope", "volcengine", "openai"];
		const DEFAULT_DASHSCOPE_ENDPOINT = "https://dashscope.aliyuncs.com/api/v1";
		const DEFAULT_VOLCENGINE_BASE_URL = "https://ark.cn-beijing.volces.com/api/v3";
		const DEFAULT_OPENAI_BASE_URL = "https://api.openai.com/v1";
		const DEFAULT_DASHSCOPE_MODEL = "wanx2.1-t2v-turbo";
		const DEFAULT_VOLCENGINE_MODEL = "doubao-seedance-1-0-pro-250528";
		const DEFAULT_OPENAI_MODEL = "sora-2";
		const DEFAULT_WORKSPACE_FOLDER = "dsh-video-gen";

		const KEY_REF = {
			dashscope: "DASHSCOPE_API_KEY",
			volcengine: "ARK_API_KEY",
			openai: "OPENAI_API_KEY"
		};

		const DICT = {
			zh: {
				title: "视频生成",
				description: "使用通义万相、豆包 Seedance 或 Sora 生成短视频",
				provider: "提供商",
				providerDashScope: "阿里云 DashScope (通义万相)",
				providerVolcengine: "火山引擎 / 豆包 Seedance",
				providerOpenAI: "OpenAI Sora / 中转站",
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
				loading: "加载中...",
				loadFailed: "视频加载失败 ({status})",
				savedToPath: "保存位置",
				generating: "正在生成视频，请稍候..."
			},
			en: {
				title: "Video Generation",
				description: "Generate videos with Wanx, Doubao Seedance, or Sora",
				provider: "Provider",
				providerDashScope: "Aliyun DashScope (Wanx)",
				providerVolcengine: "Volcengine / Doubao Seedance",
				providerOpenAI: "OpenAI Sora / Relay",
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
				loading: "Loading...",
				loadFailed: "Video loading failed ({status})",
				savedToPath: "Saved to",
				generating: "Generating video, please wait..."
			}
		};

		function modelOf(provider, config) {
			if (provider === "volcengine") return config?.volcengineModel ?? DEFAULT_VOLCENGINE_MODEL;
			if (provider === "openai") return config?.openaiModel ?? DEFAULT_OPENAI_MODEL;
			return config?.dashscopeModel ?? DEFAULT_DASHSCOPE_MODEL;
		}

		function baseURLOf(provider, config) {
			if (provider === "volcengine") return config?.volcengineBaseURL ?? DEFAULT_VOLCENGINE_BASE_URL;
			if (provider === "openai") return config?.openaiBaseURL ?? DEFAULT_OPENAI_BASE_URL;
			return config?.dashscopeEndpoint ?? DEFAULT_DASHSCOPE_ENDPOINT;
		}
		//#endregion

		//#region styles
		const STYLE = `
.dsh-vg-card { border-bottom: 1px solid #e0e0e0; padding: 12px 0; }
.dsh-vg-head { display: flex; align-items: center; justify-content: space-between; width: 100%; background: none; border: none; cursor: pointer; text-align: left; padding: 4px 0; }
.dsh-vg-head:hover { opacity: 0.8; }
.dsh-vg-title { font-weight: 600; font-size: 14px; color: #1a1a1a; display: block; margin-bottom: 2px; }
.dsh-vg-desc { font-size: 12px; color: #666; }
.dsh-vg-chevron { transition: transform 0.2s; display: inline-block; }
.dsh-vg-chevron-open { transform: rotate(180deg); }
.dsh-vg-body { padding-top: 12px; display: flex; flex-direction: column; gap: 12px; }
.dsh-vg-field { display: flex; flex-direction: column; gap: 4px; }
.dsh-vg-label { font-size: 13px; font-weight: 500; color: #333; }
.dsh-vg-input, .dsh-vg-select { width: 100%; padding: 6px 10px; border: 1px solid #ccc; border-radius: 4px; font-size: 13px; font-family: inherit; }
.dsh-vg-input:focus, .dsh-vg-select:focus { outline: none; border-color: #4a90e2; }
.dsh-vg-hint { font-size: 11px; color: #888; }
.dsh-vg-checkbox-row { display: flex; align-items: center; gap: 8px; }
.dsh-vg-checkbox-row input[type="checkbox"] { width: auto; cursor: pointer; }
.dsh-vg-checkbox-row label { font-size: 13px; color: #333; cursor: pointer; }
.dsh-vg-button { padding: 8px 16px; background: #4a90e2; color: white; border: none; border-radius: 4px; font-size: 13px; font-weight: 500; cursor: pointer; align-self: flex-start; }
.dsh-vg-button:hover:not(:disabled) { background: #3a7bc8; }
.dsh-vg-button:disabled { background: #aaa; cursor: not-allowed; }
.dsh-vg-message { font-size: 12px; color: #4a90e2; margin-top: 8px; }
.dsh-vg-result { padding: 16px; border: 1px solid #e0e0e0; border-radius: 8px; background: #f9f9f9; }
.dsh-vg-result-title { font-size: 14px; font-weight: 600; margin-bottom: 8px; color: #1a1a1a; }
.dsh-vg-savedto { font-size: 12px; color: #666; margin-bottom: 8px; word-break: break-all; }
.dsh-vg-error { color: #d9534f; font-size: 12px; margin-bottom: 8px; }
.dsh-vg-loading { font-size: 13px; color: #888; padding: 16px 0; }
.dsh-vg-container { margin-top: 8px; }
.dsh-vg-video { width: 100%; max-width: 640px; border-radius: 4px; background: #000; }
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
					await props.scope.set(provider === "dashscope" ? "dashscopeModel" : provider === "volcengine" ? "volcengineModel" : "openaiModel", model);
					await props.scope.set(provider === "dashscope" ? "dashscopeEndpoint" : provider === "volcengine" ? "volcengineBaseURL" : "openaiBaseURL", baseURL);
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
											react_jsx_runtime.jsx("option", { value: "openai", children: t("providerOpenAI") })
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
									react_jsx_runtime.jsx("input", { type: "text", className: "dsh-vg-input", value: baseURL, onChange: (e) => setBaseURL(e.target.value) })
								]
							}),
							react_jsx_runtime.jsxs("label", {
								className: "dsh-vg-field",
								children: [
									react_jsx_runtime.jsxs("span", { className: "dsh-vg-label", children: [t("apiKey"), " (", keyStatus, ")"] }),
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
							react_jsx_runtime.jsx("button", { type: "submit", className: "dsh-vg-button", disabled: saving, children: saving ? t("saving") : t("save") }),
							message ? react_jsx_runtime.jsx("div", { className: "dsh-vg-message", children: message }) : null
						]
					}) : null
				]
			});
		}

		function GeneratedVideoCard(props) {
			const meta = props.block?.meta ?? props.block?.resultView?.meta;
			const route = typeof meta?.route === "string" ? meta.route : undefined;
			const savedTo = typeof meta?.savedTo === "string" ? meta.savedTo : undefined;
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

			if (route === undefined) {
				return react_jsx_runtime.jsx("div", { className: "dsh-vg-loading", children: t("generating") });
			}

			return react_jsx_runtime.jsxs("section", {
				className: "dsh-vg-result",
				children: [
					react_jsx_runtime.jsx("div", { className: "dsh-vg-result-title", children: t("generatedTitle") }),
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

		exports.apply = apply;
		exports.inject = inject;
		exports.VideoGenerationSettingsCard = VideoGenerationSettingsCard;
		exports.GeneratedVideoCard = GeneratedVideoCard;
		return module.exports;
	}
});
