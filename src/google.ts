/** Google Veo video generation adapter (Gemini Interactions API). */
import { readBoundedText } from "./shared.js";

const ERROR_LIMIT = 4096;
const REQUESTED_MEDIA_TYPE = "video/mp4";

export interface GoogleVideoInput {
	apiKey: string;
	endpoint: string;
	model: string;
	prompt: string;
	maxBytes: number;
	signal: AbortSignal;
}

export interface GoogleAnimateInput extends GoogleVideoInput {
	sourceImage: { data: Uint8Array; mediaType: string };
}

export interface GeneratedVideo {
	data: Uint8Array;
	mediaType: string;
}

/**
 * Generate a video from a text prompt via Google Veo.
 */
export async function generateGoogleVideo(input: GoogleVideoInput): Promise<GeneratedVideo> {
	return requestVeoVideo({ ...input, operation: "generation" });
}

/**
 * Generate a video from a reference image + text prompt via Google Veo.
 */
export async function animateGoogleVideo(input: GoogleAnimateInput): Promise<GeneratedVideo> {
	const { data, mediaType } = input.sourceImage;
	return requestVeoVideo({
		...input,
		operation: "image-to-video",
		extraInput: [
			{ type: "image", mime_type: mediaType, data: Buffer.from(data).toString("base64") },
		],
	});
}

interface VeoRequest extends GoogleVideoInput {
	operation: string;
	extraInput?: Array<Record<string, string>>;
}

async function requestVeoVideo(input: VeoRequest): Promise<GeneratedVideo> {
	const label = `Google Veo video ${input.operation}`;

	const interactionInput = input.extraInput && input.extraInput.length > 0
		? [{ type: "text", text: input.prompt }, ...input.extraInput]
		: input.prompt;

	const response = await fetch(input.endpoint, {
		method: "POST",
		redirect: "error",
		signal: input.signal,
		headers: {
			"content-type": "application/json",
			"x-goog-api-key": input.apiKey,
		},
		body: JSON.stringify({
			model: input.model,
			input: interactionInput,
			response_format: {
				type: "video",
				mime_type: REQUESTED_MEDIA_TYPE,
			},
		}),
	});

	const text = await readBoundedText(response, Math.ceil(input.maxBytes * 1.4) + ERROR_LIMIT, label);
	if (!response.ok) {
		throw new Error(`${label} failed (${String(response.status)}): ${text.slice(0, ERROR_LIMIT)}`);
	}

	let payload: unknown;
	try {
		payload = JSON.parse(text);
	} catch {
		throw new Error(`${label} returned invalid JSON`);
	}

	const video = extractVideo(payload);
	if (video === undefined) {
		throw new Error(`${label} returned no video: ${text.slice(0, ERROR_LIMIT)}`);
	}

	const mediaType = videoMediaType(video.mime_type ?? REQUESTED_MEDIA_TYPE);
	if (mediaType === undefined) {
		throw new Error(`${label} returned unsupported media type ${JSON.stringify(video.mime_type)}`);
	}

	const data = decodeBase64(video.data, label);
	if (data.byteLength > input.maxBytes) {
		throw new Error(`${label} exceeded the ${String(input.maxBytes)} byte video limit`);
	}

	return { data, mediaType };
}

function extractVideo(value: unknown): { data: string; mime_type?: unknown } | undefined {
	const interaction = record(value);
	if (interaction === undefined) return undefined;

	const direct = videoContent(interaction.output_video, false);
	if (direct !== undefined) return direct;

	if (!Array.isArray(interaction.steps)) return undefined;
	for (const step of interaction.steps) {
		const modelOutput = record(step);
		if (modelOutput?.type !== "model_output" || !Array.isArray(modelOutput.content)) continue;
		for (const content of modelOutput.content) {
			const video = videoContent(content, true);
			if (video !== undefined) return video;
		}
	}
	return undefined;
}

function videoContent(value: unknown, requiresVideoType: boolean): { data: string; mime_type?: unknown } | undefined {
	const video = record(value);
	if (video === undefined) return undefined;
	if (requiresVideoType && video.type !== "video") return undefined;
	if (typeof video.data !== "string" || video.data.length === 0) return undefined;
	return { data: video.data, mime_type: video.mime_type };
}

function record(value: unknown): Record<string, unknown> | undefined {
	return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function videoMediaType(value: unknown): string | undefined {
	if (value === "video/mp4" || value === "video/webm" || value === "video/quicktime") return value;
	return "video/mp4";
}

function decodeBase64(data: string, label: string): Uint8Array {
	const clean = data.replace(/\s+/g, "");
	if (clean.length === 0) throw new Error(`${label} returned invalid base64 video data`);
	const decoded = Buffer.from(clean, "base64");
	if (decoded.length === 0) throw new Error(`${label} returned invalid base64 video data`);
	return new Uint8Array(decoded);
}