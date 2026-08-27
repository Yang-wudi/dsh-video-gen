/** Multi-provider video-generation Bundle for DeepSeek Harness. */
import type { Context } from "@deepseek-ai/cordis";
import { credentialRef } from "@deepseek-ai/dsh-credentials";
import type {} from "@deepseek-ai/dsh-host-webserver";
import { installSettingsSection, settingsNamespace } from "@deepseek-ai/dsh-settings";
import { defineTool, type ToolResult } from "@deepseek-ai/dsh-tools";
import z from "@deepseek-ai/schemastery";
import { randomUUID } from "node:crypto";
import { mkdir, realpath, rename, unlink, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

import {
	VIDEO_ROUTE,
	VIDEO_GENERATION_NAMESPACE,
	VIDEO_PROVIDERS,
	type VideoProvider,
	DEFAULT_DASHSCOPE_ENDPOINT,
	DEFAULT_VOLCENGINE_BASE_URL,
	DEFAULT_OPENAI_BASE_URL,
	DEFAULT_GOOGLE_ENDPOINT,
	DEFAULT_DASHSCOPE_MODEL,
	DEFAULT_VOLCENGINE_MODEL,
	DEFAULT_OPENAI_MODEL,
	DEFAULT_GOOGLE_MODEL,
	DASHSCOPE_API_KEY_ENV,
	VOLCENGINE_API_KEY_ENV,
	OPENAI_API_KEY_ENV,
	GOOGLE_API_KEY_ENV,
	DEFAULT_WORKSPACE_FOLDER,
	DEFAULT_MAX_VIDEO_BYTES,
	delay,
	readBoundedText,
	readBoundedBytes,
	videoMediaType,
	downloadVideo,
} from "./shared.js";

import { generateGoogleVideo, animateGoogleVideo, type GeneratedVideo } from "./google.js";
import { resolveReferenceImage } from "./reference-image.js";

// Re-export for external consumers
export {
	VIDEO_ROUTE,
	VIDEO_GENERATION_NAMESPACE,
	VIDEO_PROVIDERS,
	DEFAULT_DASHSCOPE_ENDPOINT,
	DEFAULT_VOLCENGINE_BASE_URL,
	DEFAULT_OPENAI_BASE_URL,
	DEFAULT_GOOGLE_ENDPOINT,
	DEFAULT_DASHSCOPE_MODEL,
	DEFAULT_VOLCENGINE_MODEL,
	DEFAULT_OPENAI_MODEL,
	DEFAULT_GOOGLE_MODEL,
	DASHSCOPE_API_KEY_ENV,
	VOLCENGINE_API_KEY_ENV,
	OPENAI_API_KEY_ENV,
	GOOGLE_API_KEY_ENV,
	DEFAULT_WORKSPACE_FOLDER,
	DEFAULT_MAX_VIDEO_BYTES,
};

//#region config
const ERROR_LIMIT = 4096;

export interface Config {
	provider?: VideoProvider;
	dashscopeEndpoint?: string;
	dashscopeModel?: string;
	volcengineBaseURL?: string;
	volcengineModel?: string;
	openaiBaseURL?: string;
	openaiModel?: string;
	googleEndpoint?: string;
	googleModel?: string;
	pollIntervalMs?: number;
	waitTimeoutMs?: number;
	saveToWorkspace?: boolean;
	workspaceFolder?: string;
}

export const Config = z.object({
	provider: z.union(VIDEO_PROVIDERS).default("dashscope"),
	dashscopeEndpoint: z.string().default(DEFAULT_DASHSCOPE_ENDPOINT),
	dashscopeModel: z.string().default(DEFAULT_DASHSCOPE_MODEL),
	volcengineBaseURL: z.string().default(DEFAULT_VOLCENGINE_BASE_URL),
	volcengineModel: z.string().default(DEFAULT_VOLCENGINE_MODEL),
	openaiBaseURL: z.string().default(DEFAULT_OPENAI_BASE_URL),
	openaiModel: z.string().default(DEFAULT_OPENAI_MODEL),
	googleEndpoint: z.string().default(DEFAULT_GOOGLE_ENDPOINT),
	googleModel: z.string().default(DEFAULT_GOOGLE_MODEL),
	pollIntervalMs: z.number().default(5000),
	waitTimeoutMs: z.number().default(600000),
	saveToWorkspace: z.boolean().default(true),
	workspaceFolder: z.string().default(DEFAULT_WORKSPACE_FOLDER),
});

type ResolvedProvider =
	| { provider: "dashscope"; apiKeyEnv: string; model: string; endpoint: string }
	| { provider: "volcengine"; apiKeyEnv: string; model: string; baseURL: string }
	| { provider: "openai"; apiKeyEnv: string; model: string; baseURL: string }
	| { provider: "google"; apiKeyEnv: string; model: string; endpoint: string };

export function resolveProvider(config: Config): ResolvedProvider {
	switch (config.provider ?? "dashscope") {
		case "volcengine": return {
			provider: "volcengine",
			apiKeyEnv: VOLCENGINE_API_KEY_ENV,
			model: config.volcengineModel ?? DEFAULT_VOLCENGINE_MODEL,
			baseURL: config.volcengineBaseURL ?? DEFAULT_VOLCENGINE_BASE_URL,
		};
		case "openai": return {
			provider: "openai",
			apiKeyEnv: OPENAI_API_KEY_ENV,
			model: config.openaiModel ?? DEFAULT_OPENAI_MODEL,
			baseURL: config.openaiBaseURL ?? DEFAULT_OPENAI_BASE_URL,
		};
		case "google": return {
			provider: "google",
			apiKeyEnv: GOOGLE_API_KEY_ENV,
			model: config.googleModel ?? DEFAULT_GOOGLE_MODEL,
			endpoint: config.googleEndpoint ?? DEFAULT_GOOGLE_ENDPOINT,
		};
		default: return {
			provider: "dashscope",
			apiKeyEnv: DASHSCOPE_API_KEY_ENV,
			model: config.dashscopeModel ?? DEFAULT_DASHSCOPE_MODEL,
			endpoint: config.dashscopeEndpoint ?? DEFAULT_DASHSCOPE_ENDPOINT,
		};
	}
}
//#endregion

//#region DashScope adapter
interface DashScopeInput {
	apiKey: string;
	endpoint: string;
	model: string;
	prompt: string;
	size?: string;
	duration?: number;
	maxBytes: number;
	pollIntervalMs: number;
	waitTimeoutMs: number;
	signal: AbortSignal;
}

interface DashScopeAnimateInput extends DashScopeInput {
	sourceImage: { data: Uint8Array; mediaType: string };
}

async function generateDashScopeVideo(input: DashScopeInput): Promise<GeneratedVideo & { sourceUrl?: string }> {
	const submit = await fetch(`${input.endpoint}/services/aigc/video-generation/video-synthesis`, {
		method: "POST",
		signal: input.signal,
		headers: {
			"content-type": "application/json",
			authorization: `Bearer ${input.apiKey}`,
			"X-DashScope-Async": "enable",
		},
		body: JSON.stringify({
			model: input.model,
			input: { prompt: input.prompt },
			parameters: {
				...(input.size ? { size: input.size } : {}),
				...(input.duration ? { duration: input.duration } : {}),
			},
		}),
	});
	return pollDashScopeTask(submit, input);
}

async function animateDashScopeVideo(input: DashScopeAnimateInput): Promise<GeneratedVideo & { sourceUrl?: string }> {
	const { data, mediaType } = input.sourceImage;
	const imageBase64 = Buffer.from(data).toString("base64");
	const imageDataUrl = `data:${mediaType};base64,${imageBase64}`;

	const submit = await fetch(`${input.endpoint}/services/aigc/video-generation/video-synthesis`, {
		method: "POST",
		signal: input.signal,
		headers: {
			"content-type": "application/json",
			authorization: `Bearer ${input.apiKey}`,
			"X-DashScope-Async": "enable",
		},
		body: JSON.stringify({
			model: input.model,
			input: {
				prompt: input.prompt,
				image: imageDataUrl,
			},
			parameters: {
				...(input.size ? { size: input.size } : {}),
				...(input.duration ? { duration: input.duration } : {}),
			},
		}),
	});
	return pollDashScopeTask(submit, input);
}

async function pollDashScopeTask(submit: Response, input: DashScopeInput): Promise<GeneratedVideo & { sourceUrl?: string }> {
	const submitText = await readBoundedText(submit, ERROR_LIMIT * 4);
	if (!submit.ok) throw new Error(`DashScope video task creation failed (${submit.status}): ${submitText.slice(0, ERROR_LIMIT)}`);
	let submitJson: any;
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
			headers: { authorization: `Bearer ${input.apiKey}` },
		});
		const pollText = await readBoundedText(poll, ERROR_LIMIT * 4);
		if (!poll.ok) throw new Error(`DashScope task poll failed (${poll.status}): ${pollText.slice(0, ERROR_LIMIT)}`);
		let pollJson: any;
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
	}
}
//#endregion

//#region Volcengine adapter
interface VolcengineInput {
	apiKey: string;
	baseURL: string;
	model: string;
	prompt: string;
	size?: string;
	duration?: number;
	maxBytes: number;
	pollIntervalMs: number;
	waitTimeoutMs: number;
	signal: AbortSignal;
}

interface VolcengineAnimateInput extends VolcengineInput {
	sourceImage: { data: Uint8Array; mediaType: string };
}

async function generateVolcengineVideo(input: VolcengineInput): Promise<GeneratedVideo & { sourceUrl?: string }> {
	const content = [{ type: "text", text: buildVolcenginePrompt(input) }];
	return submitVolcengineTask(input, content);
}

async function animateVolcengineVideo(input: VolcengineAnimateInput): Promise<GeneratedVideo & { sourceUrl?: string }> {
	const { data, mediaType } = input.sourceImage;
	const imageBase64 = Buffer.from(data).toString("base64");
	const imageDataUrl = `data:${mediaType};base64,${imageBase64}`;

	const content = [
		{ type: "image_url", image_url: { url: imageDataUrl } },
		{ type: "text", text: buildVolcenginePrompt(input) },
	];
	return submitVolcengineTask(input, content);
}

async function submitVolcengineTask(input: VolcengineInput, content: unknown[]): Promise<GeneratedVideo & { sourceUrl?: string }> {
	const submit = await fetch(`${input.baseURL}/contents/generations/tasks`, {
		method: "POST",
		signal: input.signal,
		headers: {
			"content-type": "application/json",
			authorization: `Bearer ${input.apiKey}`,
		},
		body: JSON.stringify({ model: input.model, content }),
	});
	const submitText = await readBoundedText(submit, ERROR_LIMIT * 4);
	if (!submit.ok) throw new Error(`Volcengine video task creation failed (${submit.status}): ${submitText.slice(0, ERROR_LIMIT)}`);
	let submitJson: any;
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
			headers: { authorization: `Bearer ${input.apiKey}` },
		});
		const pollText = await readBoundedText(poll, ERROR_LIMIT * 4);
		if (!poll.ok) throw new Error(`Volcengine task poll failed (${poll.status}): ${pollText.slice(0, ERROR_LIMIT)}`);
		let pollJson: any;
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
	}
}

function buildVolcenginePrompt(input: { prompt: string; size?: string; duration?: number }): string {
	let text = input.prompt;
	if (input.size && !/--(?:ratio|rt)\b/.test(text)) text += ` --ratio ${input.size}`;
	if (input.duration && !/--(?:dur|duration)\b/.test(text)) text += ` --dur ${input.duration}`;
	return text;
}
//#endregion

//#region OpenAI adapter
interface OpenAIInput {
	apiKey: string;
	baseURL: string;
	model: string;
	prompt: string;
	size?: string;
	duration?: number;
	maxBytes: number;
	pollIntervalMs: number;
	waitTimeoutMs: number;
	signal: AbortSignal;
}

async function generateOpenAIVideo(input: OpenAIInput): Promise<GeneratedVideo & { sourceUrl?: string }> {
	const base = input.baseURL.endsWith("/") ? input.baseURL.slice(0, -1) : input.baseURL;
	const requestBody: Record<string, unknown> = {
		model: input.model,
		prompt: input.prompt,
		...(input.size ? { size: input.size } : {}),
		...(input.duration ? { seconds: String(input.duration) } : {}),
	};
	const submit = await fetch(`${base}/videos`, {
		method: "POST",
		signal: input.signal,
		headers: {
			"content-type": "application/json",
			authorization: `Bearer ${input.apiKey}`,
		},
		body: JSON.stringify(requestBody),
	});
	const submitText = await readBoundedText(submit, ERROR_LIMIT * 4);
	if (!submit.ok) throw new Error(`OpenAI video task creation failed (${submit.status}): ${submitText.slice(0, ERROR_LIMIT)}`);
	let submitJson: any;
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
			headers: { authorization: `Bearer ${input.apiKey}` },
		});
		const pollText = await readBoundedText(poll, ERROR_LIMIT * 4);
		if (!poll.ok) throw new Error(`OpenAI video task poll failed (${poll.status}): ${pollText.slice(0, ERROR_LIMIT)}`);
		let pollJson: any;
		try { pollJson = JSON.parse(pollText); } catch { throw new Error("OpenAI returned invalid JSON on task poll"); }
		const status = pollJson.status;
		if (status === "completed") {
			const relayUrl = pollJson.video_url ?? pollJson.output?.video_url;
			if (typeof relayUrl === "string" && relayUrl.length > 0) {
				return { ...(await downloadVideo(relayUrl, { maxBytes: input.maxBytes, signal: input.signal })), sourceUrl: relayUrl };
			}
			const contentResponse = await fetch(`${base}/videos/${encodeURIComponent(taskId)}/content`, {
				method: "GET",
				signal: input.signal,
				headers: { authorization: `Bearer ${input.apiKey}` },
			});
			if (!contentResponse.ok) throw new Error(`OpenAI video content download failed (${contentResponse.status})`);
			const data = await readBoundedBytes(contentResponse, input.maxBytes);
			const mediaType = videoMediaType(contentResponse.headers.get("content-type"));
			return { data, mediaType };
		}
		if (status === "failed" || status === "cancelled") {
			throw new Error(`OpenAI video task ${status}: ${pollJson.error?.message ?? pollText.slice(0, ERROR_LIMIT)}`);
		}
	}
}
//#endregion

//#region in-memory video store + HTTP route
const videoCache = new Map<string, { data: Uint8Array; mediaType: string }>();
const MAX_CACHE_ENTRIES = 24;

function cacheVideo(data: Uint8Array, mediaType: string): string {
	const id = randomUUID();
	videoCache.set(id, { data, mediaType });
	while (videoCache.size > MAX_CACHE_ENTRIES) {
		const oldest = videoCache.keys().next().value;
		if (oldest === undefined) break;
		videoCache.delete(oldest);
	}
	return id;
}

function serveVideo(req: import("node:http").IncomingMessage, res: import("node:http").ServerResponse): void {
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
function workspaceVideoName(mediaType: string): string {
	const ext = mediaType === "video/webm" ? "webm" : mediaType === "video/quicktime" ? "mov" : "mp4";
	return `video-${Date.now().toString(36)}-${randomUUID().slice(0, 8)}.${ext}`;
}

function containsPath(parent: string, child: string): boolean {
	const rel = relative(parent, child);
	return rel === "" || (rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
}

function workspaceVideoDir(workspaceRoot: string, folder: string | undefined): string {
	const trimmed = (folder ?? "").trim();
	const root = resolve(workspaceRoot);
	const dir = trimmed === "" ? root : resolve(root, trimmed);
	if (!containsPath(root, dir)) throw new Error(`video workspace folder '${folder}' must stay inside the session workspace`);
	return dir;
}

async function nearestExistingRealPath(dir: string): Promise<string> {
	let probe = dir;
	for (;;) {
		try { return await realpath(probe); }
		catch (error) {
			if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
			const parent = dirname(probe);
			if (parent === probe) throw error;
			probe = parent;
		}
	}
}

function assertInsideWorkspace(realRoot: string, candidate: string, folder: string | undefined): void {
	if (containsPath(realRoot, candidate)) return;
	throw new Error(`video workspace folder '${folder ?? ""}' must stay inside the session workspace`);
}

async function saveVideoToWorkspace(options: {
	workspaceRoot: string;
	folder: string | undefined;
	mediaType: string;
	data: Uint8Array;
	signal?: AbortSignal;
}): Promise<string> {
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

interface VideoOutputValue {
	provider: string;
	model: string;
	videoId: string;
	mediaType: string;
	bytes: number;
	route: string;
	sourceUrl?: string;
	savedTo?: string;
	saveError?: string;
}

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
		saveError: { type: "string" },
	},
};

async function finishVideo(
	generated: GeneratedVideo & { sourceUrl?: string },
	active: ResolvedProvider,
	config: Config,
	exec: { agent?: { session: { header: { cwd?: string } } }; signal: AbortSignal },
): Promise<VideoOutputValue> {
	const videoId = cacheVideo(generated.data, generated.mediaType);
	const value: VideoOutputValue = {
		provider: active.provider,
		model: active.model,
		videoId,
		mediaType: generated.mediaType,
		bytes: generated.data.byteLength,
		route: `${VIDEO_ROUTE}?id=${videoId}`,
		...(generated.sourceUrl ? { sourceUrl: generated.sourceUrl } : {}),
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
			signal: exec.signal,
		});
	} catch (error) {
		exec.signal.throwIfAborted();
		value.saveError = error instanceof Error ? error.message : String(error);
	}
	return value;
}

function videoPresentation(result: ToolResult): { card: "generic"; title: string; content: { type: "text"; text: string }[] } | undefined {
	const meta = result.meta as Record<string, unknown> | undefined;
	if (meta === undefined || meta === null || typeof meta !== "object") return undefined;
	if (typeof meta.route !== "string") return undefined;
	return {
		card: "generic",
		title: "Generated video",
		content: [{ type: "text", text: `Video generated with ${meta.provider}/${meta.model}.` }],
	};
}

export function apply(ctx: Context, config: Config = {}): void {
	let current: () => Config = () => config;
	installSettingsSection(ctx, settingsNamespace(VIDEO_GENERATION_NAMESPACE), Config, config, {
		setSource: (source) => { current = source; },
		onChange: () => {},
	});

	ctx.effect(() => ctx.webServer.register({
		kind: "exact",
		path: VIDEO_ROUTE,
		handler: (req, res) => serveVideo(req, res),
	}), "dsh-video-gen: video route");

	// --- generate_video tool ---
	ctx.tools.register(defineTool({
		name: "generate_video",
		description: "Generate one short video from a text prompt with the configured video provider (DashScope Wanx, Volcengine/Doubao Seedance, Google Veo, or an OpenAI/Sora-compatible endpoint). Use only when the user explicitly asks to create or generate a video. Give a complete visual prompt: subject, action, camera movement, setting, mood, and style. Generation is asynchronous and may take one to several minutes. On success the video is streamed into the conversation and, with workspace saving enabled (the default), also written as a file whose absolute path is in the result's savedTo field. Do not call read, glob, or other tools to locate or verify the video.",
		parameters: {
			prompt: { type: "string", required: true, description: "Complete text description of the video to generate (subject, action, camera, setting, mood, style)." },
			size: { type: "string", description: "Optional resolution or aspect ratio, e.g. '1280*720' for DashScope or '16:9' for Seedance/Sora." },
			duration: { type: "integer", description: "Optional clip length in seconds (provider-dependent, e.g. 5 or 10)." },
		},
		output: {
			schema: VIDEO_OUTPUT_SCHEMA,
			render: (_args: unknown, value: VideoOutputValue) => {
				const saved = typeof value.savedTo === "string"
					? ` It was also saved to the workspace as ${value.savedTo}.`
					: typeof value.saveError === "string"
						? ` Saving it to the workspace failed: ${value.saveError}.`
						: "";
				return [{
					type: "text" as const,
					text: `Generated one video with ${value.provider}/${value.model} (${String(value.bytes)} bytes). It is already attached to the conversation.${saved} Respond to the user without reading or searching for the video.`,
				}];
			},
			presentationMeta: (args: { prompt: string }, value: VideoOutputValue) => ({
				kind: "dsh-video-gen",
				provider: value.provider,
				model: value.model,
				videoId: value.videoId,
				mediaType: value.mediaType,
				route: value.route,
				bytes: value.bytes,
				...(typeof value.savedTo === "string" ? { savedTo: value.savedTo } : {}),
				...(typeof value.sourceUrl === "string" ? { sourceUrl: value.sourceUrl } : {}),
				prompt: args.prompt,
			}),
		},
		timeoutMs: (current().waitTimeoutMs ?? 600000) + 60000,
		async execute(args, exec): Promise<VideoOutputValue> {
			const cfg = current();
			const active = resolveProvider(cfg);
			const credential = await ctx.credentials.resolve(credentialRef(active.apiKeyEnv));
			if (credential === undefined || credential.value.length === 0) {
				throw new Error(`generate_video requires the ${active.apiKeyEnv} credential; configure it in Settings > Plugins > Video generation.`);
			}
			const shared = {
				apiKey: credential.value,
				model: active.model,
				prompt: args.prompt as string,
				size: args.size as string | undefined,
				duration: args.duration as number | undefined,
				maxBytes: DEFAULT_MAX_VIDEO_BYTES,
				pollIntervalMs: cfg.pollIntervalMs ?? 5000,
				waitTimeoutMs: cfg.waitTimeoutMs ?? 600000,
				signal: exec.signal,
			};
			let generated: GeneratedVideo & { sourceUrl?: string };
			if (active.provider === "dashscope") {
				generated = await generateDashScopeVideo({ ...shared, endpoint: active.endpoint });
			} else if (active.provider === "volcengine") {
				generated = await generateVolcengineVideo({ ...shared, baseURL: active.baseURL });
			} else if (active.provider === "google") {
				generated = await generateGoogleVideo({ ...shared, endpoint: active.endpoint });
			} else {
				generated = await generateOpenAIVideo({ ...shared, baseURL: active.baseURL });
			}
			return finishVideo(generated, active, cfg, exec);
		},
		presentResult: (_args, result) => videoPresentation(result),
	}));

	// --- animate_image tool ---
	ctx.tools.register(defineTool({
		name: "animate_image",
		description: "Generate one short video from a source image and a text prompt with the configured video provider. Use when the user asks to animate, bring to life, or create a video from an existing image. For a named workspace file, pass its exact path as source_path. For a specific image still attached to the current conversation, pass source_attachment_id. Never provide both. Omit both only when the user clearly means the newest conversation image. The source image is used as the starting frame or visual reference. Give a complete visual prompt: desired motion, camera movement, and any changes to the scene. Generation is asynchronous and may take one to several minutes. On success the video is streamed into the conversation and, with workspace saving enabled (the default), also written as a file whose absolute path is in the result's savedTo field. Do not call read, glob, or other tools to locate or verify the video.",
		parameters: {
			prompt: { type: "string", required: true, description: "Describe the motion and animation to apply to the source image." },
			source_attachment_id: { type: "string", description: "Optional attachment id of a specific image already present in the current conversation." },
			source_path: { type: "string", description: "Optional absolute or workspace-relative path of a specific image file inside the active session workspace. Prefer this when the user names a saved file." },
			size: { type: "string", description: "Optional resolution or aspect ratio, e.g. '1280*720' for DashScope or '16:9' for Seedance." },
			duration: { type: "integer", description: "Optional clip length in seconds (provider-dependent, e.g. 5 or 10)." },
		},
		output: {
			schema: VIDEO_OUTPUT_SCHEMA,
			render: (_args: unknown, value: VideoOutputValue) => {
				const saved = typeof value.savedTo === "string"
					? ` It was also saved to the workspace as ${value.savedTo}.`
					: typeof value.saveError === "string"
						? ` Saving it to the workspace failed: ${value.saveError}.`
						: "";
				return [{
					type: "text" as const,
					text: `Animated one video from a source image with ${value.provider}/${value.model} (${String(value.bytes)} bytes). It is already attached to the conversation.${saved} Respond to the user without reading or searching for the video.`,
				}];
			},
			presentationMeta: (args: { prompt: string }, value: VideoOutputValue) => ({
				kind: "dsh-video-gen",
				operation: "animate",
				provider: value.provider,
				model: value.model,
				videoId: value.videoId,
				mediaType: value.mediaType,
				route: value.route,
				bytes: value.bytes,
				...(typeof value.savedTo === "string" ? { savedTo: value.savedTo } : {}),
				...(typeof value.sourceUrl === "string" ? { sourceUrl: value.sourceUrl } : {}),
				prompt: args.prompt,
			}),
		},
		timeoutMs: (current().waitTimeoutMs ?? 600000) + 60000,
		async execute(args, exec): Promise<VideoOutputValue> {
			const cfg = current();
			const active = resolveProvider(cfg);

			if (active.provider === "openai") {
				throw new Error("animate_image is not supported by the OpenAI Sora provider. Switch to DashScope, Volcengine, or Google in Settings > Plugins > Video generation.");
			}

			const credential = await ctx.credentials.resolve(credentialRef(active.apiKeyEnv));
			if (credential === undefined || credential.value.length === 0) {
				throw new Error(`animate_image requires the ${active.apiKeyEnv} credential; configure it in Settings > Plugins > Video generation.`);
			}

			const sourceImage = await resolveReferenceImage({
				sourceAttachmentId: args.source_attachment_id as string | undefined,
				sourcePath: args.source_path as string | undefined,
				workspaceRoot: exec.agent?.session.header.cwd,
				maxBytes: DEFAULT_MAX_VIDEO_BYTES,
				signal: exec.signal,
			});

			if (sourceImage === undefined) {
				throw new Error("animate_image requires a source image. Provide source_path (workspace file) or source_attachment_id (conversation image), or ensure there is an image in the current conversation.");
			}

			const shared = {
				apiKey: credential.value,
				model: active.model,
				prompt: args.prompt as string,
				sourceImage,
				size: args.size as string | undefined,
				duration: args.duration as number | undefined,
				maxBytes: DEFAULT_MAX_VIDEO_BYTES,
				pollIntervalMs: cfg.pollIntervalMs ?? 5000,
				waitTimeoutMs: cfg.waitTimeoutMs ?? 600000,
				signal: exec.signal,
			};

			let generated: GeneratedVideo & { sourceUrl?: string };
			if (active.provider === "dashscope") {
				generated = await animateDashScopeVideo({ ...shared, endpoint: active.endpoint });
			} else if (active.provider === "volcengine") {
				generated = await animateVolcengineVideo({ ...shared, baseURL: active.baseURL });
			} else {
				generated = await animateGoogleVideo({ ...shared, endpoint: active.endpoint });
			}
			return finishVideo(generated, active, cfg, exec);
		},
		presentResult: (_args, result) => videoPresentation(result),
	}));
}
//#endregion