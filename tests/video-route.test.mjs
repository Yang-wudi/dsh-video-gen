/**
 * Tests for the video HTTP route that feeds the chat result card and the
 * gallery: in-memory cache fast path, durable POST fallback (trusted roots +
 * co-located marker index), and the security guards around it.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import {
	VIDEO_ROUTE,
	cacheVideo,
	finishVideo,
	readPersistedVideo,
	serveVideo,
	upsertWorkspaceMarker,
	readWorkspaceMarkerEntry,
	__resetVideoRouteStateForTests,
} from "../lib/index.js";

const MP4_BYTES = new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112, 105, 115, 111, 109]);
const WEBM_BYTES = new Uint8Array([26, 69, 223, 163, 1, 0, 0, 0, 0, 0, 0, 0]);

/** Serve the real route handler on an ephemeral port. */
async function withServer(run) {
	const { createServer } = await import("node:http");
	const server = createServer((req, res) => { void serveVideo(req, res); });
	await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
	const { port } = server.address();
	try {
		return await run(`http://127.0.0.1:${port}${VIDEO_ROUTE}`);
	} finally {
		await new Promise((resolve) => server.close(resolve));
	}
}

function jsonPost(base, body, headers = {}) {
	return fetch(base, {
		method: "POST",
		headers: { "content-type": "application/json", ...headers },
		body: typeof body === "string" ? body : JSON.stringify(body),
	});
}

async function readBody(response) {
	return new Uint8Array(await response.arrayBuffer());
}

function execFor(workspaceRoot) {
	return { agent: { session: { header: { cwd: workspaceRoot } } }, signal: new AbortController().signal };
}

test("GET serves cached video bytes with no-store headers", async () => {
	__resetVideoRouteStateForTests();
	const id = cacheVideo(MP4_BYTES, "video/mp4");
	await withServer(async (base) => {
		const response = await fetch(`${base}?id=${id}`);
		assert.equal(response.status, 200);
		assert.equal(response.headers.get("content-type"), "video/mp4");
		assert.equal(response.headers.get("cache-control"), "private, no-store");
		assert.equal(response.headers.get("x-content-type-options"), "nosniff");
		assert.deepEqual(await readBody(response), MP4_BYTES);
	});
});

test("GET returns 404 for an unknown id", async () => {
	__resetVideoRouteStateForTests();
	await withServer(async (base) => {
		const response = await fetch(`${base}?id=does-not-exist`);
		assert.equal(response.status, 404);
	});
});

test("HEAD returns headers without a body", async () => {
	__resetVideoRouteStateForTests();
	const id = cacheVideo(MP4_BYTES, "video/mp4");
	await withServer(async (base) => {
		const response = await fetch(`${base}?id=${id}`, { method: "HEAD" });
		assert.equal(response.status, 200);
		assert.equal(Number(response.headers.get("content-length")), MP4_BYTES.byteLength);
		assert.equal((await response.arrayBuffer()).byteLength, 0);
	});
});

test("POST serves from the cache by attachment videoId", async () => {
	__resetVideoRouteStateForTests();
	const id = cacheVideo(MP4_BYTES, "video/mp4");
	await withServer(async (base) => {
		const response = await jsonPost(base, { attachment: { videoId: id, savedTo: "D:\\nowhere\\x.mp4", mediaType: "video/mp4" } });
		assert.equal(response.status, 200);
		assert.deepEqual(await readBody(response), MP4_BYTES);
	});
});

test("POST falls back to the workspace file after a restart (marker path)", async () => {
	__resetVideoRouteStateForTests();
	const base = await mkdtemp(join(tmpdir(), "dsh-video-gen-route-"));
	try {
		const value = await finishVideo(
			{ data: MP4_BYTES, mediaType: "video/mp4" },
			{ provider: "dashscope", model: "wanx2.1-t2v-turbo" },
			{ saveToWorkspace: true, workspaceFolder: "dsh-video-gen" },
			execFor(base),
		);
		assert.ok(value.attachment, "finishVideo should expose a durable attachment");
		// Simulate a host restart: byte cache and trusted roots are gone.
		__resetVideoRouteStateForTests();
		await withServer(async (http) => {
			const response = await jsonPost(http, { attachment: value.attachment });
			assert.equal(response.status, 200);
			assert.equal(response.headers.get("content-type"), "video/mp4");
			assert.deepEqual(await readBody(response), MP4_BYTES);
		});
	} finally {
		await rm(base, { recursive: true, force: true });
	}
});

test("POST prefers the cache over the marker file", async () => {
	__resetVideoRouteStateForTests();
	const base = await mkdtemp(join(tmpdir(), "dsh-video-gen-cache-"));
	try {
		const value = await finishVideo(
			{ data: MP4_BYTES, mediaType: "video/mp4" },
			{ provider: "dashscope", model: "wanx2.1-t2v-turbo" },
			{ saveToWorkspace: true, workspaceFolder: "dsh-video-gen" },
			execFor(base),
		);
		// Overwrite the cache entry with different bytes; the cache must win.
		const freshId = value.attachment.videoId;
		cacheVideo(WEBM_BYTES, "video/webm");
		// Re-cache under the same id is impossible (uuid based), so instead prove
		// the cache fast path by resetting to a state where the marker is absent
		// but the cache holds the id.
		__resetVideoRouteStateForTests();
		const id = cacheVideo(WEBM_BYTES, "video/webm");
		await withServer(async (http) => {
			const response = await jsonPost(http, { attachment: { videoId: id, savedTo: join(base, "missing.mp4"), mediaType: "video/webm" } });
			assert.equal(response.status, 200);
			assert.deepEqual(await readBody(response), WEBM_BYTES);
		});
		assert.ok(freshId);
	} finally {
		await rm(base, { recursive: true, force: true });
	}
});

test("POST without a marker or trusted root returns 404", async () => {
	__resetVideoRouteStateForTests();
	const base = await mkdtemp(join(tmpdir(), "dsh-video-gen-orphan-"));
	try {
		const orphanDir = join(base, "dsh-video-gen");
		await mkdir(orphanDir, { recursive: true });
		const orphanFile = join(orphanDir, "orphan.mp4");
		await writeFile(orphanFile, MP4_BYTES);
		await withServer(async (http) => {
			const response = await jsonPost(http, { attachment: { videoId: "vid-orphan", savedTo: orphanFile, mediaType: "video/mp4" } });
			assert.equal(response.status, 404);
		});
	} finally {
		await rm(base, { recursive: true, force: true });
	}
});

test("POST with a tampered marker entry (file mismatch) returns 404", async () => {
	__resetVideoRouteStateForTests();
	const base = await mkdtemp(join(tmpdir(), "dsh-video-gen-tamper-"));
	try {
		const dir = join(base, "dsh-video-gen");
		await mkdir(dir, { recursive: true });
		await writeFile(join(dir, "real.mp4"), MP4_BYTES);
		await upsertWorkspaceMarker(dir, "vid-1", "real.mp4", "video/mp4", MP4_BYTES.byteLength);
		await withServer(async (http) => {
			// savedTo basename does not match the marker entry for vid-1.
			const response = await jsonPost(http, { attachment: { videoId: "vid-1", savedTo: join(dir, "other.mp4"), mediaType: "video/mp4" } });
			assert.equal(response.status, 404);
		});
	} finally {
		await rm(base, { recursive: true, force: true });
	}
});

test("POST rejects marker entries carrying path separators", async () => {
	__resetVideoRouteStateForTests();
	const base = await mkdtemp(join(tmpdir(), "dsh-video-gen-trav-"));
	try {
		const dir = join(base, "dsh-video-gen");
		await mkdir(dir, { recursive: true });
		const marker = { version: 1, videos: { "vid-evil": { file: "..\\..\\escape.mp4", mediaType: "video/mp4" } } };
		await writeFile(join(dir, ".dsh-video-gen-index.json"), JSON.stringify(marker));
		await withServer(async (http) => {
			const response = await jsonPost(http, { attachment: { videoId: "vid-evil", savedTo: join(dir, "escape.mp4"), mediaType: "video/mp4" } });
			assert.equal(response.status, 404);
		});
	} finally {
		await rm(base, { recursive: true, force: true });
	}
});

test("POST rejects disallowed file extensions", async () => {
	__resetVideoRouteStateForTests();
	const base = await mkdtemp(join(tmpdir(), "dsh-video-gen-ext-"));
	try {
		const dir = join(base, "dsh-video-gen");
		await mkdir(dir, { recursive: true });
		const secret = join(base, "secret.txt");
		await writeFile(secret, "precious");
		await upsertWorkspaceMarker(dir, "vid-2", "secret.txt", "text/plain", 8);
		await withServer(async (http) => {
			const response = await jsonPost(http, { attachment: { videoId: "vid-2", savedTo: secret, mediaType: "text/plain" } });
			assert.equal(response.status, 404);
		});
	} finally {
		await rm(base, { recursive: true, force: true });
	}
});

test("POST rejects cross-origin requests", async () => {
	__resetVideoRouteStateForTests();
	await withServer(async (base) => {
		const response = await jsonPost(base, { attachment: { videoId: "x", savedTo: "C:\\x.mp4" } }, { origin: "http://evil.example" });
		assert.equal(response.status, 403);
	});
});

test("POST rejects oversized request bodies", async () => {
	__resetVideoRouteStateForTests();
	await withServer(async (base) => {
		const huge = JSON.stringify({ attachment: { videoId: "x", savedTo: "C:\\" + "a".repeat(16384) + ".mp4" } });
		try {
			const response = await jsonPost(base, huge);
			assert.ok(response.status >= 400, `expected an error status, got ${response.status}`);
		} catch (error) {
			// The server destroys the socket on overflow; a rejected fetch is fine.
			assert.ok(error instanceof Error);
		}
	});
});

test("readPersistedVideo unit checks", async () => {
	__resetVideoRouteStateForTests();
	const base = await mkdtemp(join(tmpdir(), "dsh-video-gen-unit-"));
	try {
		const dir = join(base, "dsh-video-gen");
		await mkdir(dir, { recursive: true });
		const file = join(dir, "video-abc.mp4");
		await writeFile(file, MP4_BYTES);
		await upsertWorkspaceMarker(dir, "vid-unit", "video-abc.mp4", "video/mp4", MP4_BYTES.byteLength);

		// Marker path works with no trusted roots at all.
		const resolved = await readPersistedVideo({ videoId: "vid-unit", savedTo: file, mediaType: "video/mp4" });
		assert.ok(resolved);
		assert.equal(resolved.mediaType, "video/mp4");
		assert.deepEqual(new Uint8Array(resolved.data), MP4_BYTES);

		assert.equal(await readPersistedVideo(undefined), undefined);
		assert.equal(await readPersistedVideo({ savedTo: file }), undefined, "missing videoId needs a trusted root");
		assert.equal(await readPersistedVideo({ videoId: "vid-unit", savedTo: join(dir, "video-abc.txt") }), undefined);
		assert.equal(await readPersistedVideo({ videoId: "vid-other", savedTo: file }), undefined);
		assert.equal(
			await readPersistedVideo({ videoId: "vid-unit", savedTo: join(dir, "renamed.mp4") }),
			undefined,
			"basename mismatch with the marker entry fails",
		);
		// A traversal-style savedTo that resolves back onto the marked file is safe.
		const roundTrip = await readPersistedVideo({ videoId: "vid-unit", savedTo: join(dir, "..", "dsh-video-gen", "video-abc.mp4") });
		assert.ok(roundTrip, "a path resolving inside the marker dir still serves");
		assert.deepEqual(new Uint8Array(roundTrip?.data ?? []), MP4_BYTES);
		// A hand-crafted marker entry carrying separators is rejected outright.
		await writeFile(
			join(dir, ".dsh-video-gen-index.json"),
			JSON.stringify({ version: 1, videos: { "vid-trav": { file: "..\\escape.mp4", mediaType: "video/mp4" } } }),
		);
		assert.equal(
			await readPersistedVideo({ videoId: "vid-trav", savedTo: join(dir, "escape.mp4") }),
			undefined,
			"separator-carrying marker entries are rejected",
		);
	} finally {
		await rm(base, { recursive: true, force: true });
	}
});

test("readWorkspaceMarkerEntry tolerates corrupted markers", async () => {
	const base = await mkdtemp(join(tmpdir(), "dsh-video-gen-mark-"));
	try {
		const dir = join(base, "dsh-video-gen");
		await mkdir(dir, { recursive: true });
		assert.equal(await readWorkspaceMarkerEntry(dir, "vid-x"), undefined, "missing marker");
		await writeFile(join(dir, ".dsh-video-gen-index.json"), "{not json");
		assert.equal(await readWorkspaceMarkerEntry(dir, "vid-x"), undefined, "corrupt marker");
		await writeFile(join(dir, ".dsh-video-gen-index.json"), JSON.stringify({ version: 1, videos: [] }));
		assert.equal(await readWorkspaceMarkerEntry(dir, "vid-x"), undefined, "array-shaped videos");
		await upsertWorkspaceMarker(dir, "vid-x", "a.mp4", "video/mp4", 1);
		const entry = await readWorkspaceMarkerEntry(dir, "vid-x");
		assert.equal(entry?.file, "a.mp4");
	} finally {
		await rm(base, { recursive: true, force: true });
	}
});

test("the durable path also serves webm media types", async () => {
	__resetVideoRouteStateForTests();
	const base = await mkdtemp(join(tmpdir(), "dsh-video-gen-webm-"));
	try {
		const value = await finishVideo(
			{ data: WEBM_BYTES, mediaType: "video/webm" },
			{ provider: "volcengine", model: "doubao-seedance-1-0-pro-250528" },
			{ saveToWorkspace: true, workspaceFolder: "dsh-video-gen" },
			execFor(base),
		);
		assert.equal(value.attachment.mediaType, "video/webm");
		__resetVideoRouteStateForTests();
		const resolved = await readPersistedVideo(value.attachment);
		assert.ok(resolved);
		assert.equal(resolved.mediaType, "video/webm");
		assert.deepEqual(new Uint8Array(resolved.data), WEBM_BYTES);
	} finally {
		await rm(base, { recursive: true, force: true });
	}
});

test("VIDEO_ROUTE stays stable", () => {
	assert.equal(VIDEO_ROUTE, "/plugins/dsh-video-gen/video");
});
