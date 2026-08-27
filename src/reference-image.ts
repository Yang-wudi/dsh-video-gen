/** Resolve a reference image for image-to-video (animate_image) requests. */
import { readFile, realpath, stat } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";

export interface ResolvedReferenceImage {
	data: Uint8Array;
	mediaType: string;
}

export interface ResolveReferenceImageInput {
	sourceAttachmentId?: string;
	sourcePath?: string;
	workspaceRoot?: string;
	maxBytes?: number;
	signal: AbortSignal;
	readImage?: (id: string, signal?: AbortSignal) => Promise<{ data?: Uint8Array; ref?: { data?: Uint8Array; mediaType?: string } } | undefined>;
}

export async function resolveReferenceImage(input: ResolveReferenceImageInput): Promise<ResolvedReferenceImage | undefined> {
	if (input.sourceAttachmentId !== undefined && input.sourcePath !== undefined) {
		throw new Error("animate_image accepts either source_attachment_id or source_path, not both");
	}

	if (input.sourcePath !== undefined) {
		return readWorkspaceReferenceImage({
			sourcePath: input.sourcePath,
			workspaceRoot: input.workspaceRoot,
			maxBytes: input.maxBytes,
			signal: input.signal,
		});
	}

	if (input.sourceAttachmentId === undefined) {
		return undefined;
	}

	if (input.readImage === undefined) {
		throw new Error("animate_image requires an image attachment store to resolve source_attachment_id");
	}

	try {
		const stored = await input.readImage(input.sourceAttachmentId, input.signal);
		if (stored === undefined) {
			throw new Error(`animate_image could not find image attachment ${input.sourceAttachmentId}`);
		}
		const data = stored.data ?? stored.ref?.data;
		if (data === undefined) {
			throw new Error(`animate_image could not read image data for attachment ${input.sourceAttachmentId}`);
		}
		return {
			data: data instanceof Uint8Array ? data : new Uint8Array(data),
			mediaType: stored.ref?.mediaType ?? "image/png",
		};
	} catch (error) {
		if (error instanceof Error && error.message.includes("animate_image")) throw error;
		throw new Error(`animate_image could not find image attachment ${input.sourceAttachmentId}: ${error instanceof Error ? error.message : String(error)}`);
	}
}

async function readWorkspaceReferenceImage(input: {
	sourcePath: string;
	workspaceRoot?: string;
	maxBytes?: number;
	signal: AbortSignal;
}): Promise<ResolvedReferenceImage> {
	const requested = input.sourcePath.trim();
	if (requested.length === 0) throw new Error("animate_image source_path must not be empty");
	if (input.workspaceRoot === undefined) {
		throw new Error("animate_image source_path requires an active DSH session workspace");
	}

	const root = resolve(input.workspaceRoot);
	const candidate = isAbsolute(requested) ? resolve(requested) : resolve(root, requested);
	if (!containsPath(root, candidate)) {
		throw new Error("animate_image source_path must stay inside the session workspace: " + requested);
	}

	let realRoot: string;
	let realCandidate: string;
	try {
		[realRoot, realCandidate] = await Promise.all([realpath(root), realpath(candidate)]);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") {
			throw new Error("animate_image could not find workspace image: " + requested);
		}
		throw error;
	}
	if (!containsPath(realRoot, realCandidate)) {
		throw new Error("animate_image source_path resolves outside the session workspace: " + requested);
	}

	const file = await stat(realCandidate);
	if (!file.isFile()) throw new Error("animate_image source_path is not a file: " + requested);
	if (input.maxBytes !== undefined && file.size > input.maxBytes) {
		throw new Error("animate_image source image is too large (" + String(file.size) + " bytes; maximum " + String(input.maxBytes) + ")");
	}

	const data = await readFile(realCandidate, { signal: input.signal });
	const mediaType = detectImageMediaType(new Uint8Array(data));
	if (mediaType === undefined) {
		throw new Error("animate_image source_path is not a supported PNG, JPEG, WebP, or GIF image: " + requested);
	}
	return { data: new Uint8Array(data), mediaType };
}

function detectImageMediaType(data: Uint8Array): string | undefined {
	if (startsWith(data, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
	if (startsWith(data, [0xff, 0xd8, 0xff])) return "image/jpeg";
	if (ascii(data, 0, 6) === "GIF87a" || ascii(data, 0, 6) === "GIF89a") return "image/gif";
	if (ascii(data, 0, 4) === "RIFF" && ascii(data, 8, 4) === "WEBP") return "image/webp";
	return undefined;
}

function startsWith(data: Uint8Array, signature: readonly number[]): boolean {
	return signature.every((byte, index) => data[index] === byte);
}

function ascii(data: Uint8Array, offset: number, length: number): string {
	return String.fromCharCode(...data.subarray(offset, offset + length));
}

function containsPath(parent: string, child: string): boolean {
	const rel = relative(parent, child);
	return rel === "" || (rel !== ".." && !rel.startsWith(".." + sep) && !isAbsolute(rel));
}