import { credentialRef } from "@deepseek-ai/dsh-credentials";
import { installSettingsSection, settingsNamespace } from "@deepseek-ai/dsh-settings";
import { defineTool } from "@deepseek-ai/dsh-tools";
import z from "@deepseek-ai/schemastery";
import { randomUUID } from "node:crypto";
import { mkdir, realpath, rename, unlink, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

//#region shared constants
/** Browser route that streams a generated video file back to the result card. */
export const VIDEO_ROUTE = "/plugins/dsh-video-gen/video";
/** Namespace persisted through DSH Settings. */
export const VIDEO_GENERATION_NAMESPACE = "video-generation";
/** Supported text-to-video providers. */
export const VIDEO_PROVIDERS = ["dashscope", "volcengine", "openai"];

/** Default endpoints / base URLs. */
export const DEFAULT_DASHSCOPE_ENDPOINT = "https://dashscope.aliyuncs.com/api/v1";
export const DEFAULT_VOLCENGINE_BASE_URL = "https://ark.cn-beijing.volces.com/api/v3";
export const DEFAULT_OPENAI_BASE_URL = "https://api.openai.com/v1";

/** Default model names. */
export const DEFAULT_DASHSCOPE_MODEL = "wanx2.1-t2v-turbo";
export const DEFAULT_VOLCENGINE_MODEL = "doubao-seedance-1-0-pro-250528";
export const DEFAULT_OPENAI_MODEL = "sora-2";

/** Credential reference env-var names, one per provider. */
export const DASHSCOPE_API_KEY_ENV = "DASHSCOPE_API_KEY";
export const VOLCENGINE_API_KEY_ENV = "ARK_API_KEY";
export const OPENAI_API_KEY_ENV = "OPENAI_API_KEY";

/** Default workspace subfolder that receives generated video files. */
export const DEFAULT_WORKSPACE_FOLDER = "dsh-video-gen";

/** Hard ceiling for a downloaded video file (bytes). Protects host memory. */
export const DEFAULT_MAX_VIDEO_BYTES = 200 * 1024 * 1024;
//#endregion

//#region config
/** Cordis / DSH Settings configuration schema. */
export const Config = z.object({
	provider: z.union(VIDEO_PROVIDERS).default("dashscope"),
	dashscopeEndpoint: z.string().default(DEFAULT_DASHSCOPE_ENDPOINT),
	dashscopeModel: z.string().default(DEFAULT_DASHSCOPE_MODEL),
	volcengineBaseURL: z.string().default(DEFAULT_VOLCENGINE_BASE_URL),
	volcengineModel: z.string().default(DEFAULT_VOLCENGINE_MODEL),
	openaiBaseURL: z.string().default(DEFAULT_OPENAI_BASE_URL),
	openaiModel: z.string().default(DEFAULT_OPENAI_MODEL),
	/** Async task polling interval (ms). */
	pollIntervalMs: z.number().default(5000),
	/** Maximum time to wait for one video task to finish (ms). */
	waitTimeoutMs: z.number().default(600000),
	/** Also write every generated video as a file under the session workspace. */
	saveToWorkspace: z.boolean().default(true),
	/** Workspace subfolder for generated videos; empty means the workspace root. */
	workspaceFolder: z.string().default(DEFAULT_WORKSPACE_FOLDER)
});

/** Resolve exactly one provider profile for a tool call. */
export function resolveProvider(config) {
	switch (config.provider ?? "dashscope") {
		case "volcengine": return {
			provider: "volcengine",
			apiKeyEnv: VOLCENGINE_API_KEY_ENV,
			model: config.volcengineModel ?? DEFAULT_VOLCENGINE_MODEL,
			baseURL: config.volcengineBaseURL ?? DEFAULT_VOLCENGINE_BASE_URL
		};
		case "openai": return {
			provider: "openai",
			apiKeyEnv: OPENAI_API_KEY_ENV,
			model: config.openaiModel ?? DEFAULT_OPENAI_MODEL,
			baseURL: config.openaiBaseURL ?? DEFAULT_OPENAI_BASE_URL
		};
		default: return {
			provider: "dashscope",
			apiKeyEnv: DASHSCOPE_API_KEY_ENV,
			model: config.dashscopeModel ?? DEFAULT_DASHSCOPE_MODEL,
			endpoint: config.dashscopeEndpoint ?? DEFAULT_DASHSCOPE_ENDPOINT
		};
	}
}
//#endregion

//#region shared http helpers
const ERROR_LIMIT = 4096;

/** Sleep that rejects promptly when the caller aborts. */
function delay(ms, signal) {
	return new Promise((resolveDelay, reject) => {
		if (signal?.aborted) {
			reject(signal.reason ?? new Error("aborted"));
			return;
		}
		const timer = setTimeout(resolveDelay, ms);
		signal?.addEventListener("abort", () => {
			clearTimeout(timer);
			reject(signal.reason ?? new Error("aborted"));
		}, { once: true });
	});
}

/** Read a response body as text, bounded so a hostile endpoint cannot exhaust memory. */
async function readBoundedText(response, maxBytes) {
	if (response.body === null) return "";
	const reader = response.body.getReader();
	const chunks = [];
	let bytes = 0;
	try {
		for (;;) {
			const next = await reader.read();
			if (next.done) break;
			bytes += next.value.byteLength;
			if (bytes > maxBytes) throw new Error(`response exceeded the ${String(maxBytes)} byte limit`);
			chunks.push(next.value);
		}
	} finally {
		reader.releaseLock();
	}
	return new TextDecoder().decode(concatChunks(chunks, bytes));
}

/** Read a response body as bytes, bounded by maxBytes. */
async function readBoundedBytes(response, maxBytes) {
	if (response.body === null) return new Uint8Array();
	const reader = response.body.getReader();
	const chunks = [];
	let bytes = 0;
	try {
		for (;;) {
			const next = await reader.read();
			if (next.done) break;
			bytes += next.value.byteLength;
			if (bytes > maxBytes) throw new Error(`video (${String(bytes)}+ bytes) exceeds the ${String(maxBytes)} byte limit`);
			chunks.push(next.value);
		}
	} finally {
		reader.releaseLock();
	}
	return concatChunks(chunks, bytes);
}

function concatChunks(chunks, bytes) {
	const joined = new Uint8Array(bytes);
	let offset = 0;
	for (const chunk of chunks) {
		joined.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return joined;
}

/** Video media type inferred from a content-type header, defaulting to mp4. */
function videoMediaType(value) {
	const mt = value?.split(";", 1)[0]?.trim().toLowerCase();
	if (mt === "video/mp4" || mt === "video/webm" || mt === "video/quicktime") return mt;
	return "video/mp4";
}

/** Download a video URL into memory as bytes plus its media type. */
async function downloadVideo(url, { maxBytes, signal }) {
	const response = await fetch(url, { redirect: "follow", ...(signal ? { signal } : {}) });
	if (!response.ok) throw new Error(`video download failed (${String(response.status)})`);
	const data = await readBoundedBytes(response, maxBytes);
	return { data, mediaType: videoMediaType(response.headers.get("content-type")) };
}
//#endregion

//#region DashScope (Aliyun Wanx text-to-video) adapter
/**
 * DashScope video synthesis. Submits an async task, polls until it succeeds,
 * then downloads the produced video. Returns the bytes and media type.
 * Docs: POST {endpoint}/services/aigc/video-generation/video-synthesis
 *       GET  {endpoint}/tasks/{task_id}
 */
async function generateDashScopeVideo(input) {
	const submit = await fetch(`${input.endpoint}/services/aigc/video-generation/video-synthesis`, {
		method: "POST",
		signal: input.signal,
		headers: {
			"content-type": "application/json",
			authorization: `Bearer ${input.apiKey}`,
			"X-DashScope-Async": "enable"
		},
		body: JSON.stringify({
			model: input.model,
			input: { prompt: input.prompt },
			parameters: {
				...(input.size ? { size: input.size } : {}),
				...(input.duration ? { duration: input.duration } : {})
			}
		})
	});
	const submitText = await readBoundedText(submit, ERROR_LIMIT * 4);
	if (!submit.ok) throw new Error(`DashScope video task creation failed (${submit.status}): ${submitText.slice(0, ERROR_LIMIT)}`);
	let submitJson;
	try { submitJson = JSON.parse(submitText); } catch { throw new Error("DashScope returned invalid JSON on task creation"); }
	const taskId = submitJson.output?.task_id;
	if (typeof taskId !== "string" || taskId.length === 0) throw new Error(`DashScope did not return a task_id: ${submitText.slice(0, ERROR_LIMIT)}`);

	const deadline = Date.now() + input.waitTimeoutMs;
	for (;;) {
		if (Date.now() > deadline) throw new Error(`DashScope video task ${taskId} timed out after ${String(Math.round(input.waitTimeoutMs / 1000))}s`);
		await delay(input.pollIntervalMs, input.signal);
		const poll = await fetch(`${input.endpoint}/tasks/${encodeURIComponent(taskId)}`, {
			method: "GET",
			signal: input.signal,
			headers: { authorization: `Bearer ${input.apiKey}` }
		});
		const pollText = await readBoundedText(poll, ERROR_LIMIT * 4);
		if (!poll.ok) throw new Error(`DashScope task poll failed (${poll.status}): ${pollText.slice(0, ERROR_LIMIT)}`);
		let pollJson;
		try { pollJson = JSON.parse(pollText); } catch { throw new Error("DashScope returned invalid JSON on task poll"); }
		const status = pollJson.output?.task_status;
		if (status === "SUCCEEDED") {
			const url = pollJson.output?.video_url ?? pollJson.output?.results?.[0]?.url;
			if (typeof url !== "string" || url.length === 0) throw new Error("DashScope task succeeded but returned no video URL");
			return { ...(await downloadVideo(url, { maxBytes: input.maxBytes, signal: input.signal })), sourceUrl: url };
		}
		if (status === "FAILED" || status === "UNKNOWN") {
			throw new Error(`DashScope video task ${status}: ${pollJson.output?.message ?? pollText.slice(0, ERROR_LIMIT)}`);
		}
		// PENDING / RUNNING → keep polling
	}
}
//#endregion

//#region Volcengine Ark (Doubao Seedance text-to-video) adapter
/**
 * Volcengine Ark content-generation video tasks.
 * Docs: POST {baseURL}/contents/generations/tasks
 *       GET  {baseURL}/contents/generations/tasks/{id}
 * The prompt may carry inline commands such as "--ratio 16:9 --dur 5".
 */
async function generateVolcengineVideo(input) {
	const content = [{ type: "text", text: buildVolcenginePrompt(input) }];
	const submit = await fetch(`${input.baseURL}/contents/generations/tasks`, {
		method: "POST",
		signal: input.signal,
		headers: {
			"content-type": "application/json",
			authorization: `Bearer ${input.apiKey}`
		},
		body: JSON.stringify({ model: input.model, content })
	});
	const submitText = await readBoundedText(submit, ERROR_LIMIT * 4);
	if (!submit.ok) throw new Error(`Volcengine video task creation failed (${submit.status}): ${submitText.slice(0, ERROR_LIMIT)}`);
	let submitJson;
	try { submitJson = JSON.parse(submitText); } catch { throw new Error("Volcengine returned invalid JSON on task creation"); }
	const taskId = submitJson.id;
	if (typeof taskId !== "string" || taskId.length === 0) throw new Error(`Volcengine did not return a task id: ${submitText.slice(0, ERROR_LIMIT)}`);

	const deadline = Date.now() + input.waitTimeoutMs;
	for (;;) {
		if (Date.now() > deadline) throw new Error(`Volcengine video task ${taskId} timed out after ${String(Math.round(input.waitTimeoutMs / 1000))}s`);
		await delay(input.pollIntervalMs, input.signal);
		const poll = await fetch(`${input.baseURL}/contents/generations/tasks/${encodeURIComponent(taskId)}`, {
			method: "GET",
			signal: input.signal,
			headers: { authorization: `Bearer ${input.apiKey}` }
		});
		const pollText = await readBoundedText(poll, ERROR_LIMIT * 4);
		if (!poll.ok) throw new Error(`Volcengine task poll failed (${poll.status}): ${pollText.slice(0, ERROR_LIMIT)}`);
		let pollJson;
		try { pollJson = JSON.parse(pollText); } catch { throw new Error("Volcengine returned invalid JSON on task poll"); }
		const status = pollJson.status;
		if (status === "succeeded") {
			const url = pollJson.content?.video_url;
			if (typeof url !== "string" || url.length === 0) throw new Error("Volcengine task succeeded but returned no video_url");
			return { ...(await downloadVideo(url, { maxBytes: input.maxBytes, signal: input.signal })), sourceUrl: url };
		}
		if (status === "failed" || status === "cancelled") {
			throw new Error(`Volcengine video task ${status}: ${pollJson.error?.message ?? pollText.slice(0, ERROR_LIMIT)}`);
		}
		// queued / running → keep polling
	}
}

/** Append optional ratio/duration flags Seedance reads from the text prompt. */
function buildVolcenginePrompt(input) {
	let text = input.prompt;
	if (input.size && !/--(?:ratio|rt)\b/.test(text)) text += ` --ratio ${input.size}`;
	if (input.duration && !/--(?:dur|duration)\b/.test(text)) text += ` --dur ${input.duration}`;
	return text;
}
//#endregion

//#region OpenAI-compatible (Sora text-to-video) adapter
/**
 * OpenAI Sora videos API or a compatible relay.
 * Official: POST {baseURL}/videos (using `seconds`, not `duration`)
 *           GET  {baseURL}/videos/{id}
 *           GET  {baseURL}/videos/{id}/content (binary MP4 download)
 * Relays may return a video_url field instead of requiring /content download.
 */
async function generateOpenAIVideo(input) {
	const base = input.baseURL.endsWith("/") ? input.baseURL.slice(0, -1) : input.baseURL;
	const requestBody = {
		model: input.model,
		prompt: input.prompt,
		...(input.size ? { size: input.size } : {}),
		...(input.duration ? { seconds: String(input.duration) } : {})
	};
	const submit = await fetch(`${base}/videos`, {
		method: "POST",
		signal: input.signal,
		headers: {
			"content-type": "application/json",
			authorization: `Bearer ${input.apiKey}`
		},
		body: JSON.stringify(requestBody)
	});
	const submitText = await readBoundedText(submit, ERROR_LIMIT * 4);
	if (!submit.ok) throw new Error(`OpenAI video task creation failed (${submit.status}): ${submitText.slice(0, ERROR_LIMIT)}`);
	let submitJson;
	try { submitJson = JSON.parse(submitText); } catch { throw new Error("OpenAI returned invalid JSON on task creation"); }
	const taskId = submitJson.id;
	if (typeof taskId !== "string" || taskId.length === 0) throw new Error(`OpenAI did not return a video task id: ${submitText.slice(0, ERROR_LIMIT)}`);

	const deadline = Date.now() + input.waitTimeoutMs;
	for (;;) {
		if (Date.now() > deadline) throw new Error(`OpenAI video task ${taskId} timed out after ${String(Math.round(input.waitTimeoutMs / 1000))}s`);
		await delay(input.pollIntervalMs, input.signal);
		const poll = await fetch(`${base}/videos/${encodeURIComponent(taskId)}`, {
			method: "GET",
			signal: input.signal,
			headers: { authorization: `Bearer ${input.apiKey}` }
		});
		const pollText = await readBoundedText(poll, ERROR_LIMIT * 4);
		if (!poll.ok) throw new Error(`OpenAI video task poll failed (${poll.status}): ${pollText.slice(0, ERROR_LIMIT)}`);
		let pollJson;
		try { pollJson = JSON.parse(pollText); } catch { throw new Error("OpenAI returned invalid JSON on task poll"); }
		const status = pollJson.status;
		if (status === "completed") {
			// Relay-style response with a video_url field
			const relayUrl = pollJson.video_url ?? pollJson.output?.video_url;
			if (typeof relayUrl === "string" && relayUrl.length > 0) {
				return { ...(await downloadVideo(relayUrl, { maxBytes: input.maxBytes, signal: input.signal })), sourceUrl: relayUrl };
			}
			// Official OpenAI Sora format: binary download at /videos/{id}/content
			const contentResponse = await fetch(`${base}/videos/${encodeURIComponent(taskId)}/content`, {
				method: "GET",
				signal: input.signal,
				headers: { authorization: `Bearer ${input.apiKey}` }
			});
			if (!contentResponse.ok) throw new Error(`OpenAI video content download failed (${contentResponse.status})`);
			const data = await readBoundedBytes(contentResponse, input.maxBytes);
			const mediaType = videoMediaType(contentResponse.headers.get("content-type"));
			return { data, mediaType };
		}
		if (status === "failed" || status === "cancelled") {
			throw new Error(`OpenAI video task ${status}: ${pollJson.error?.message ?? pollText.slice(0, ERROR_LIMIT)}`);
		}
		// pending / processing → keep polling
	}
}
//#endregion

//#region in-memory video store + HTTP route
/**
 * Generated video bytes are not durable attachments (the DSH attachment
 * service is image-only), so the result card streams them from this
 * short-lived in-process cache keyed by an opaque id. Entries are evicted
 * once the cache exceeds a bounded number of recent videos.
 */
const videoCache = new Map();
const MAX_CACHE_ENTRIES = 24;

function cacheVideo(data, mediaType) {
	const id = randomUUID();
	videoCache.set(id, { data, mediaType });
	while (videoCache.size > MAX_CACHE_ENTRIES) {
		const oldest = videoCache.keys().next().value;
		if (oldest === undefined) break;
		videoCache.delete(oldest);
	}
	return id;
}

/** Serve one cached video to a same-origin browser request (GET ?id=...). */
function serveVideo(req, res) {
	try {
		const url = new URL(req.url ?? "", "http://localhost");
		const id = url.searchParams.get("id");
		const entry = id === null ? undefined : videoCache.get(id);
		if (entry === undefined) {
			res.statusCode = 404;
			res.setHeader("content-type", "text/plain; charset=utf-8");
			res.end("video not found");
			return;
		}
		res.statusCode = 200;
		res.setHeader("content-type", entry.mediaType);
		res.setHeader("content-length", String(entry.data.byteLength));
		res.setHeader("cache-control", "no-store");
		res.setHeader("accept-ranges", "none");
		if (req.method === "HEAD") { res.end(); return; }
		res.end(Buffer.from(entry.data));
	} catch {
		res.statusCode = 500;
		res.end("video route error");
	}
}
//#endregion

//#region workspace save
/** Deterministic-ish file name for a generated video. */
function workspaceVideoName(mediaType) {
	const ext = mediaType === "video/webm" ? "webm" : mediaType === "video/quicktime" ? "mov" : "mp4";
	return `video-${Date.now().toString(36)}-${randomUUID().slice(0, 8)}.${ext}`;
}

/** True when `child` equals `parent` or lives underneath it (lexically). */
function containsPath(parent, child) {
	const rel = relative(parent, child);
	return rel === "" || (rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
}

/** Resolve the configured video folder, rejecting escapes from the workspace. */
function workspaceVideoDir(workspaceRoot, folder) {
	const trimmed = (folder ?? "").trim();
	const root = resolve(workspaceRoot);
	const dir = trimmed === "" ? root : resolve(root, trimmed);
	if (!containsPath(root, dir)) throw new Error(`video workspace folder '${folder}' must stay inside the session workspace`);
	return dir;
}

async function nearestExistingRealPath(dir) {
	let probe = dir;
	for (;;) {
		try { return await realpath(probe); }
		catch (error) {
			if (error?.code !== "ENOENT") throw error;
			const parent = dirname(probe);
			if (parent === probe) throw error;
			probe = parent;
		}
	}
}

function assertInsideWorkspace(realRoot, candidate, folder) {
	if (containsPath(realRoot, candidate)) return;
	throw new Error(`video workspace folder '${folder ?? ""}' must stay inside the session workspace`);
}

/** Write one generated video durably under the session workspace via atomic rename. */
async function saveVideoToWorkspace(options) {
	const dir = workspaceVideoDir(options.workspaceRoot, options.folder);
	options.signal?.throwIfAborted();
	const realRoot = await realpath(resolve(options.workspaceRoot));
	assertInsideWorkspace(realRoot, await nearestExistingRealPath(dir), options.folder);
	const name = workspaceVideoName(options.mediaType);
	const target = join(dir, name);
	const staging = join(dir, `.${name}.${process.pid}-${randomUUID()}.tmp`);
	await mkdir(dir, { recursive: true });
	assertInsideWorkspace(realRoot, await realpath(dir), options.folder);
	try {
		await writeFile(staging, options.data, { flag: "wx", signal: options.signal });
		options.signal?.throwIfAborted();
		await rename(staging, target);
	} catch (error) {
		await unlink(staging).catch(() => {});
		throw error;
	}
	return target;
}
//#endregion

//#region tool + plugin wiring
export const name = "dsh-video-gen";
export const inject = ["tools", "credentials", "webServer"];

const VIDEO_OUTPUT_SCHEMA = {
	type: "object",
	additionalProperties: false,
	properties: {
		provider: { type: "string", required: true },
		model: { type: "string", required: true },
		videoId: { type: "string", required: true },
		mediaType: { type: "string", required: true },
		bytes: { type: "integer", required: true },
		route: { type: "string", required: true },
		sourceUrl: { type: "string" },
		savedTo: { type: "string" },
		saveError: { type: "string" }
	}
};

/** Persist to workspace (best-effort) and shape the tool result value. */
async function finishVideo(generated, active, config, exec) {
	const videoId = cacheVideo(generated.data, generated.mediaType);
	const value = {
		provider: active.provider,
		model: active.model,
		videoId,
		mediaType: generated.mediaType,
		bytes: generated.data.byteLength,
		route: `${VIDEO_ROUTE}?id=${videoId}`,
		...(generated.sourceUrl ? { sourceUrl: generated.sourceUrl } : {})
	};
	if (config.saveToWorkspace === false) return value;
	const workspaceRoot = exec.agent?.session.header.cwd;
	if (workspaceRoot === undefined) return value;
	try {
		value.savedTo = await saveVideoToWorkspace({
			workspaceRoot,
			folder: config.workspaceFolder,
			mediaType: generated.mediaType,
			data: generated.data,
			signal: exec.signal
		});
	} catch (error) {
		exec.signal.throwIfAborted();
		value.saveError = error instanceof Error ? error.message : String(error);
	}
	return value;
}

/** Register settings wiring, the video route, and the model-callable tool. */
export function apply(ctx, config = {}) {
	let current = () => config;
	installSettingsSection(ctx, settingsNamespace(VIDEO_GENERATION_NAMESPACE), Config, config, {
		setSource: (source) => { current = source; },
		onChange: () => {}
	});

	ctx.effect(() => ctx.webServer.register({
		kind: "exact",
		path: VIDEO_ROUTE,
		handler: (req, res) => serveVideo(req, res)
	}), "dsh-video-gen: video route");

	ctx.tools.register(defineTool({
		name: "generate_video",
		description: "Generate one short video from a text prompt with the configured video provider (DashScope Wanx, Volcengine/Doubao Seedance, or an OpenAI/Sora-compatible endpoint). Use only when the user explicitly asks to create or generate a video. Give a complete visual prompt: subject, action, camera movement, setting, mood, and style. Generation is asynchronous and may take one to several minutes. On success the video is streamed into the conversation and, with workspace saving enabled (the default), also written as a file whose absolute path is in the result's savedTo field. Do not call read, glob, or other tools to locate or verify the video.",
		parameters: {
			prompt: {
				type: "string",
				required: true,
				description: "Complete text description of the video to generate (subject, action, camera, setting, mood, style)."
			},
			size: {
				type: "string",
				description: "Optional resolution or aspect ratio, e.g. '1280*720' for DashScope or '16:9' for Seedance/Sora."
			},
			duration: {
				type: "integer",
				description: "Optional clip length in seconds (provider-dependent, e.g. 5 or 10)."
			}
		},
		output: {
			schema: VIDEO_OUTPUT_SCHEMA,
			render: (_args, value) => {
				const saved = typeof value.savedTo === "string"
					? ` It was also saved to the workspace as ${value.savedTo}.`
					: typeof value.saveError === "string"
						? ` Saving it to the workspace failed: ${value.saveError}.`
						: "";
				return [{
					type: "text",
					text: `Generated one video with ${value.provider}/${value.model} (${String(value.bytes)} bytes). It is already attached to the conversation.${saved} Respond to the user without reading or searching for the video.`
				}];
			},
			presentationMeta: (args, value) => ({
				kind: "dsh-video-gen",
				provider: value.provider,
				model: value.model,
				videoId: value.videoId,
				mediaType: value.mediaType,
				route: value.route,
				bytes: value.bytes,
				...(typeof value.savedTo === "string" ? { savedTo: value.savedTo } : {}),
				...(typeof value.sourceUrl === "string" ? { sourceUrl: value.sourceUrl } : {}),
				prompt: args.prompt
			})
		},
		timeoutMs: (current().waitTimeoutMs ?? 600000) + 60000,
		async execute(args, exec) {
			const cfg = current();
			const active = resolveProvider(cfg);
			const credential = await ctx.credentials.resolve(credentialRef(active.apiKeyEnv));
			if (credential === undefined || credential.value.length === 0) {
				throw new Error(`generate_video requires the ${active.apiKeyEnv} credential; configure it in Settings > Plugins > Video generation.`);
			}
			const shared = {
				apiKey: credential.value,
				model: active.model,
				prompt: args.prompt,
				size: args.size,
				duration: args.duration,
				maxBytes: DEFAULT_MAX_VIDEO_BYTES,
				pollIntervalMs: cfg.pollIntervalMs ?? 5000,
				waitTimeoutMs: cfg.waitTimeoutMs ?? 600000,
				signal: exec.signal
			};
			let generated;
			if (active.provider === "dashscope") {
				generated = await generateDashScopeVideo({ ...shared, endpoint: active.endpoint });
			} else if (active.provider === "volcengine") {
				generated = await generateVolcengineVideo({ ...shared, baseURL: active.baseURL });
			} else {
				generated = await generateOpenAIVideo({ ...shared, baseURL: active.baseURL });
			}
			return finishVideo(generated, active, cfg, exec);
		},
		presentResult: (_args, result) => videoPresentation(result)
	}));
}

function videoPresentation(result) {
	const meta = result.meta;
	if (meta === undefined || meta === null || typeof meta !== "object") return undefined;
	if (typeof meta.route !== "string") return undefined;
	return {
		card: "generic",
		title: "Generated video",
		content: [{ type: "text", text: `Video generated with ${meta.provider}/${meta.model}.` }]
	};
}
//#endregion

