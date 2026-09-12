/** Multi-provider video-generation Bundle for DeepSeek Harness. */
import type { Context } from "@deepseek-ai/cordis";
import { credentialRef } from "@deepseek-ai/dsh-credentials";
import type {} from "@deepseek-ai/dsh-host-webserver";
// Namespace import on purpose: dsh 0.1.5 removed the module-level
// `installSettingsSection` / `settingsNamespace` helpers, and a named import
// that resolves to nothing is a SyntaxError at module evaluation — it would take
// the whole host down instead of degrading. The generation is probed at runtime.
import * as settingsApi from "@deepseek-ai/dsh-settings";
import { defineTool, type ToolResult } from "@deepseek-ai/dsh-tools";
import z from "@deepseek-ai/schemastery";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, realpath, rename, unlink, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

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
const MAX_ROUTE_BODY_BYTES = 8192;
const VIDEO_FILE_EXTENSIONS = new Set([".mp4", ".webm", ".mov"]);
const VIDEO_EXTENSION_MEDIA_TYPE: Record<string, string> = { ".mp4": "video/mp4", ".webm": "video/webm", ".mov": "video/quicktime" };
/**
 * Marker index co-located with saved videos (one per video folder). It records
 * { videoId -> file } so the HTTP route can re-serve a video from disk after a
 * host restart, when both the in-memory byte cache and the trusted-root set
 * are gone. Only the plugin writes markers, which makes them the trust anchor
 * for post-restart reads.
 */
const WORKSPACE_MARKER_NAME = ".dsh-video-gen-index.json";

/** A durable reference the client can use to re-fetch a generated video. */
export type VideoAttachmentRef = {
	videoId: string;
	savedTo: string;
	mediaType: string;
	[k: string]: string;
};

// Workspace roots seen while persisting videos this process lifetime. The POST
// fallback only reads files contained inside one of these trusted roots, so a
// client-supplied savedTo path can never escape the workspace (defense-in-depth
// on top of the realpath containment check).
const knownWorkspaceRoots = new Set<string>();

function rememberWorkspaceRoot(root: string | undefined): void {
	if (typeof root === "string" && root.length > 0) knownWorkspaceRoots.add(resolve(root));
}

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

/** A video file name safe to join onto a directory: no separators, known extension. */
function safeVideoFileName(name: string): boolean {
	if (typeof name !== "string" || name.length === 0) return false;
	if (name.includes("/") || name.includes("\\")) return false;
	const dot = name.lastIndexOf(".");
	if (dot <= 0) return false;
	return VIDEO_FILE_EXTENSIONS.has(name.slice(dot).toLowerCase());
}

interface WorkspaceMarkerEntry {
	file: string;
	mediaType?: unknown;
	bytes?: unknown;
	createdAt?: unknown;
}

/** Parse the marker index in dir and return one video entry, or undefined. */
async function readWorkspaceMarkerEntry(dir: string, videoId: string): Promise<WorkspaceMarkerEntry | undefined> {
	try {
		const parsed: unknown = JSON.parse(await readFile(join(dir, WORKSPACE_MARKER_NAME), "utf8"));
		const record = parsed !== null && typeof parsed === "object" ? parsed as { videos?: unknown } : undefined;
		const videos = record?.videos !== undefined && typeof record.videos === "object" && !Array.isArray(record.videos)
			? record.videos as Record<string, unknown>
			: undefined;
		const entry = videos ? videos[videoId] : undefined;
		if (entry && typeof entry === "object" && typeof (entry as { file?: unknown }).file === "string") {
			return entry as WorkspaceMarkerEntry;
		}
		return undefined;
	} catch {
		return undefined;
	}
}

/** Merge one video entry into the marker index next to the saved file (best effort). */
async function upsertWorkspaceMarker(dir: string, videoId: string, file: string, mediaType: string, bytes: number): Promise<void> {
	const markerPath = join(dir, WORKSPACE_MARKER_NAME);
	let videos: Record<string, unknown> = {};
	try {
		const parsed: unknown = JSON.parse(await readFile(markerPath, "utf8"));
		const candidate = parsed !== null && typeof parsed === "object" ? (parsed as { videos?: unknown }).videos : undefined;
		if (candidate && typeof candidate === "object" && !Array.isArray(candidate)) {
			videos = candidate as Record<string, unknown>;
		}
	} catch { /* first save or unreadable marker: start a fresh index */ }
	videos[videoId] = { file, mediaType, bytes, createdAt: Date.now() };
	const staging = join(dir, `.${WORKSPACE_MARKER_NAME}.${process.pid}-${randomUUID()}.tmp`);
	try {
		await writeFile(staging, JSON.stringify({ version: 1, videos }, null, "\t"), { flag: "wx" });
		await rename(staging, markerPath);
	} catch (error) {
		await unlink(staging).catch(() => {});
		// The marker only powers gallery durability after restarts; a failed
		// write must never fail the generation itself.
		console.warn("[dsh-video-gen] failed to update the gallery marker index:", error instanceof Error ? error.message : error);
	}
}

function readRouteBody(req: import("node:http").IncomingMessage): Promise<string> {
	return new Promise((resolvePromise, rejectPromise) => {
		const chunks: Buffer[] = [];
		let bytes = 0;
		req.on("data", (chunk) => {
			const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
			bytes += buffer.byteLength;
			if (bytes > MAX_ROUTE_BODY_BYTES) { rejectPromise(new Error("request too large")); req.destroy(); return; }
			chunks.push(buffer);
		});
		req.on("end", () => resolvePromise(Buffer.concat(chunks).toString("utf8")));
		req.on("error", rejectPromise);
	});
}

function originAllowed(req: import("node:http").IncomingMessage): boolean {
	const origin = req.headers.origin;
	const host = req.headers.host;
	if (origin === undefined || host === undefined) return true;
	return origin === `http://${host}` || origin === `https://${host}`;
}

/**
 * Resolve a persisted savedTo path to real bytes. Two paths:
 * 1. Fast path — the file sits inside a workspace root recorded during this
 *    process lifetime, enforced by realpath containment.
 * 2. Durable path — the co-located marker index (written at save time) proves
 *    the video folder, so reads keep working after a host restart, when the
 *    trusted-root set is empty. Reads stay confined to the marker's directory.
 * Returns { data, mediaType } or undefined when the path is missing, out of
 * bounds, or not a recognized video file.
 */
async function readPersistedVideo(attachment: unknown): Promise<{ data: Uint8Array; mediaType: string } | undefined> {
	const record = attachment !== null && typeof attachment === "object" ? attachment as Record<string, unknown> : undefined;
	const savedTo = typeof record?.savedTo === "string" ? record.savedTo : undefined;
	if (typeof savedTo !== "string" || savedTo.length === 0) return undefined;
	if (!safeVideoFileName(savedTo.slice(Math.max(savedTo.lastIndexOf("/"), savedTo.lastIndexOf("\\")) + 1))) return undefined;

	if (knownWorkspaceRoots.size > 0) {
		try {
			const realFile = await realpath(savedTo);
			for (const root of knownWorkspaceRoots) {
				let realRoot: string;
				try { realRoot = await realpath(root); }
				catch { continue; }
				if (containsPath(realRoot, realFile)) {
					const data = await readFile(realFile);
					return { data, mediaType: VIDEO_EXTENSION_MEDIA_TYPE[savedTo.slice(savedTo.lastIndexOf(".")).toLowerCase()] ?? "application/octet-stream" };
				}
			}
		} catch { /* fall through to the marker path */ }
	}

	const videoId = typeof record?.videoId === "string" ? record.videoId : undefined;
	if (videoId === undefined || videoId.length === 0) return undefined;
	const dir = dirname(savedTo);
	const entry = await readWorkspaceMarkerEntry(dir, videoId);
	if (entry === undefined) return undefined;
	if (!safeVideoFileName(entry.file)) return undefined;
	const fileName = savedTo.slice(Math.max(savedTo.lastIndexOf("/"), savedTo.lastIndexOf("\\")) + 1);
	if (entry.file !== fileName) return undefined;
	try {
		const realFile = await realpath(join(dir, entry.file));
		const realDir = await realpath(dir);
		if (!containsPath(realDir, realFile)) return undefined;
		const data = await readFile(realFile);
		return { data, mediaType: VIDEO_EXTENSION_MEDIA_TYPE[entry.file.slice(entry.file.lastIndexOf(".")).toLowerCase()] ?? "application/octet-stream" };
	} catch {
		return undefined;
	}
}

function sendVideoBytes(req: import("node:http").IncomingMessage, res: import("node:http").ServerResponse, data: Uint8Array, mediaType: string): void {
	res.statusCode = 200;
	res.setHeader("content-type", mediaType);
	res.setHeader("content-length", String(data.byteLength));
	res.setHeader("cache-control", "private, no-store");
	res.setHeader("x-content-type-options", "nosniff");
	res.setHeader("accept-ranges", "none");
	if (req.method === "HEAD") { res.end(); return; }
	res.end(Buffer.from(data));
}

/**
 * Serve a generated video. Fast path: GET/HEAD ?id= from the in-memory cache
 * (immediate playback). Persistence fallback: POST { attachment: { videoId,
 * savedTo, mediaType } } reads the durable workspace file when the cache has
 * evicted the id or the server restarted, so the gallery survives beyond the
 * 24-entry LRU window — and, thanks to the co-located marker index, beyond a
 * host restart.
 */
async function serveVideo(req: import("node:http").IncomingMessage, res: import("node:http").ServerResponse): Promise<void> {
	try {
		if (req.method === "POST") {
			if (!originAllowed(req)) { res.statusCode = 403; res.end("origin rejected"); return; }
			let body: unknown;
			try { body = JSON.parse(await readRouteBody(req)); }
			catch { res.statusCode = 400; res.end("invalid request"); return; }
			const wrapper = body !== null && typeof body === "object" ? body as { attachment?: unknown } : undefined;
			const attachment = wrapper?.attachment !== undefined && typeof wrapper.attachment === "object" ? wrapper.attachment : undefined;
			const attachmentRecord = attachment !== null && typeof attachment === "object" ? attachment as Record<string, unknown> : undefined;
			const cachedId = typeof attachmentRecord?.videoId === "string" ? attachmentRecord.videoId : undefined;
			const cached = cachedId === undefined ? undefined : videoCache.get(cachedId);
			if (cached !== undefined) { sendVideoBytes(req, res, cached.data, cached.mediaType); return; }
			const persisted = await readPersistedVideo(attachment);
			if (persisted === undefined) { res.statusCode = 404; res.setHeader("content-type", "text/plain; charset=utf-8"); res.end("video not found"); return; }
			sendVideoBytes(req, res, persisted.data, persisted.mediaType);
			return;
		}
		const url = new URL(req.url ?? "", "http://localhost");
		const id = url.searchParams.get("id");
		const entry = id === null ? undefined : videoCache.get(id);
		if (entry === undefined) {
			res.statusCode = 404;
			res.setHeader("content-type", "text/plain; charset=utf-8");
			res.end("video not found");
			return;
		}
		sendVideoBytes(req, res, entry.data, entry.mediaType);
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
	// Backslash separators are rejected on every platform: on Windows they are
	// path separators (so "..\\escape" would traverse), while on POSIX they are
	// legal filename characters and resolve() would not treat them as traversal.
	// A folder coming from model output has no business containing them, so both
	// platforms reject uniformly instead of disagreeing with the security tests.
	if (trimmed.includes("\\")) throw new Error(`video workspace folder '${folder}' must stay inside the session workspace`);
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
	attachment?: VideoAttachmentRef;
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
		attachment: {
			type: "object",
			additionalProperties: false,
			properties: {
				videoId: { type: "string", required: true },
				savedTo: { type: "string", required: true },
				mediaType: { type: "string", required: true },
			},
		},
	},
} as const;

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
		// Record the trusted root for this lifetime and co-locate a marker index
		// so the route can re-serve the video from disk even after a restart,
		// when both the byte cache and the trusted-root set are gone.
		rememberWorkspaceRoot(workspaceRoot);
		await upsertWorkspaceMarker(dirname(value.savedTo), videoId, basename(value.savedTo), generated.mediaType, generated.data.byteLength);
		value.attachment = { videoId, savedTo: value.savedTo, mediaType: generated.mediaType };
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

/**
 * Register the settings section across dsh settings generations. 0.1.5 moved
 * this onto the `settings` service (`installSection`) and removed both
 * module-level helpers; older builds only ship the helpers. The generation is
 * detected at runtime so a single bundle serves the whole supported range.
 * @param ctx - the plugin context.
 * @param config - the composition entry, i.e. the section's initial value.
 * @param hooks - the section hooks (`setSource` / `onChange`).
 */
function installVideoSettings(ctx: Context, config: Config, hooks: SettingsSectionHooks<Config>): void {
	// Every cast below goes through `unknown`: the installed type declarations may
	// describe either generation (the module d.ts a build has, and what the
	// registry serves today, differ), so the probe is structural by design.
	const modern = settingsApi as unknown as {
		SettingsProvider?: { prototype?: { installSection?: unknown } };
	};
	if (typeof modern.SettingsProvider?.prototype?.installSection === "function") {
		ctx.inject(["settings"], (settingsCtx) => {
			const service = settingsCtx.settings as unknown as {
				installSection: (owner: Context, ns: string, schema: unknown, entry: Config, hooks: SettingsSectionHooks<Config>) => void;
			};
			service.installSection(ctx, VIDEO_GENERATION_NAMESPACE, Config, config, hooks);
		});
		return;
	}
	const legacy = settingsApi as unknown as {
		installSettingsSection?: (owner: Context, ns: unknown, schema: unknown, entry: Config, hooks: SettingsSectionHooks<Config>) => void;
		settingsNamespace?: (name: string) => unknown;
	};
	if (typeof legacy.installSettingsSection === "function" && typeof legacy.settingsNamespace === "function") {
		legacy.installSettingsSection(ctx, legacy.settingsNamespace(VIDEO_GENERATION_NAMESPACE), Config, config, hooks);
		return;
	}
	ctx.logger?.warn?.("[dsh-video-gen] unsupported settings API; the settings section stays disabled");
}

/** Hooks handed to a settings section (shape shared by both generations). */
interface SettingsSectionHooks<T> {
	setSource: (source: () => T) => void;
	onChange: () => void;
}

export function apply(ctx: Context, config: Config = {}): void {
	let current: () => Config = () => config;
	installVideoSettings(ctx, config, {
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
			presentationMeta: (args: { prompt: string; duration?: number }, value: VideoOutputValue) => ({
				kind: "dsh-video-gen",
				provider: value.provider,
				model: value.model,
				videoId: value.videoId,
				mediaType: value.mediaType,
				route: value.route,
				bytes: value.bytes,
				...(typeof value.savedTo === "string" ? { savedTo: value.savedTo } : {}),
				...(value.attachment && typeof value.attachment === "object" ? { attachment: value.attachment } : {}),
				...(typeof value.sourceUrl === "string" ? { sourceUrl: value.sourceUrl } : {}),
				...(typeof args.duration === "number" ? { duration: args.duration } : {}),
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
			presentationMeta: (args: { prompt: string; duration?: number }, value: VideoOutputValue) => ({
				kind: "dsh-video-gen",
				operation: "animate",
				provider: value.provider,
				model: value.model,
				videoId: value.videoId,
				mediaType: value.mediaType,
				route: value.route,
				bytes: value.bytes,
				...(typeof value.savedTo === "string" ? { savedTo: value.savedTo } : {}),
				...(value.attachment && typeof value.attachment === "object" ? { attachment: value.attachment } : {}),
				...(typeof value.sourceUrl === "string" ? { sourceUrl: value.sourceUrl } : {}),
				...(typeof args.duration === "number" ? { duration: args.duration } : {}),
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

// Exported for tests and advanced integrations; the plugin wiring above is the
// primary surface.
export {
	serveVideo,
	readPersistedVideo,
	upsertWorkspaceMarker,
	readWorkspaceMarkerEntry,
	cacheVideo,
	rememberWorkspaceRoot,
	saveVideoToWorkspace,
	finishVideo,
};

/** Drop every in-memory video byte and trusted workspace root (test helper). */
export function __resetVideoRouteStateForTests(): void {
	videoCache.clear();
	knownWorkspaceRoots.clear();
}
//#endregion