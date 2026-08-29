/**
 * Tests for finishVideo: workspace persistence, the durable attachment
 * reference, and the co-located marker index that keeps the gallery usable
 * across host restarts.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";

import {
	finishVideo,
	readPersistedVideo,
	readWorkspaceMarkerEntry,
	saveVideoToWorkspace,
	upsertWorkspaceMarker,
	__resetVideoRouteStateForTests,
} from "../lib/index.js";

const MP4_BYTES = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
const MARKER_NAME = ".dsh-video-gen-index.json";

function execFor(workspaceRoot) {
	return { agent: { session: { header: { cwd: workspaceRoot } } }, signal: new AbortController().signal };
}

async function generate(base, data = MP4_BYTES, folder = "dsh-video-gen") {
	return finishVideo(
		{ data, mediaType: "video/mp4" },
		{ provider: "dashscope", model: "wanx2.1-t2v-turbo" },
		{ saveToWorkspace: true, workspaceFolder: folder },
		execFor(base),
	);
}

test("finishVideo saves the video and exposes a durable attachment", async () => {
	__resetVideoRouteStateForTests();
	const base = await mkdtemp(join(tmpdir(), "dsh-video-gen-finish-"));
	try {
		const value = await generate(base);
		assert.ok(typeof value.videoId === "string" && value.videoId.length > 0);
		assert.ok(typeof value.savedTo === "string" && value.savedTo.startsWith(base));
		assert.equal(value.mediaType, "video/mp4");
		assert.deepEqual(value.attachment, { videoId: value.videoId, savedTo: value.savedTo, mediaType: "video/mp4" });
		assert.equal(value.saveError, undefined);

		const savedStat = await stat(value.savedTo);
		assert.ok(savedStat.isFile());
		assert.deepEqual(new Uint8Array(await readFile(value.savedTo)), MP4_BYTES);
		assert.equal(basename(value.savedTo).endsWith(".mp4"), true);
	} finally {
		await rm(base, { recursive: true, force: true });
	}
});

test("finishVideo writes a marker index entry for the gallery", async () => {
	__resetVideoRouteStateForTests();
	const base = await mkdtemp(join(tmpdir(), "dsh-video-gen-mark-"));
	try {
		const value = await generate(base);
		const markerDir = join(base, "dsh-video-gen");
		const entry = await readWorkspaceMarkerEntry(markerDir, value.videoId);
		assert.ok(entry, "marker entry must exist next to the video");
		assert.equal(entry.file, basename(value.savedTo));
		assert.equal(entry.mediaType, "video/mp4");
		assert.equal(entry.bytes, MP4_BYTES.byteLength);
		assert.equal(typeof entry.createdAt, "number");

		const marker = JSON.parse(await readFile(join(markerDir, MARKER_NAME), "utf8"));
		assert.equal(marker.version, 1);
		assert.ok(marker.videos[value.videoId]);
	} finally {
		await rm(base, { recursive: true, force: true });
	}
});

test("finishVideo merges marker entries across videos in the same folder", async () => {
	__resetVideoRouteStateForTests();
	const base = await mkdtemp(join(tmpdir(), "dsh-video-gen-merge-"));
	try {
		const first = await generate(base, new Uint8Array([1]));
		const second = await generate(base, new Uint8Array([2, 2]));
		assert.notEqual(first.videoId, second.videoId);
		const markerDir = join(base, "dsh-video-gen");
		assert.ok(await readWorkspaceMarkerEntry(markerDir, first.videoId));
		assert.ok(await readWorkspaceMarkerEntry(markerDir, second.videoId));

		// Both remain reachable through the durable path after a restart.
		__resetVideoRouteStateForTests();
		const one = await readPersistedVideo(first.attachment);
		const two = await readPersistedVideo(second.attachment);
		assert.deepEqual(new Uint8Array(one?.data ?? []), new Uint8Array([1]));
		assert.deepEqual(new Uint8Array(two?.data ?? []), new Uint8Array([2, 2]));
	} finally {
		await rm(base, { recursive: true, force: true });
	}
});

test("upsertWorkspaceMarker repairs a corrupted marker", async () => {
	const base = await mkdtemp(join(tmpdir(), "dsh-video-gen-corrupt-"));
	try {
		const dir = join(base, "dsh-video-gen");
		await mkdir(dir, { recursive: true });
		await writeFile(join(dir, MARKER_NAME), "totally not json");
		await upsertWorkspaceMarker(dir, "vid-fix", "video-fix.mp4", "video/mp4", 3);
		const entry = await readWorkspaceMarkerEntry(dir, "vid-fix");
		assert.equal(entry?.file, "video-fix.mp4");
	} finally {
		await rm(base, { recursive: true, force: true });
	}
});

test("finishVideo skips workspace persistence when disabled", async () => {
	__resetVideoRouteStateForTests();
	const base = await mkdtemp(join(tmpdir(), "dsh-video-gen-off-"));
	try {
		const value = await finishVideo(
			{ data: MP4_BYTES, mediaType: "video/mp4" },
			{ provider: "dashscope", model: "wanx2.1-t2v-turbo" },
			{ saveToWorkspace: false, workspaceFolder: "dsh-video-gen" },
			execFor(base),
		);
		assert.equal(value.savedTo, undefined);
		assert.equal(value.attachment, undefined);
		assert.equal((await readdir(base)).length, 0);
	} finally {
		await rm(base, { recursive: true, force: true });
	}
});

test("finishVideo reports saveError instead of throwing on unwritable roots", async () => {
	__resetVideoRouteStateForTests();
	const base = await mkdtemp(join(tmpdir(), "dsh-video-gen-err-"));
	try {
		const blocker = join(base, "occupied");
		await writeFile(blocker, "a file, not a directory");
		const value = await finishVideo(
			{ data: MP4_BYTES, mediaType: "video/mp4" },
			{ provider: "dashscope", model: "wanx2.1-t2v-turbo" },
			{ saveToWorkspace: true, workspaceFolder: "" },
			execFor(blocker),
		);
		assert.equal(value.attachment, undefined);
		assert.equal(typeof value.saveError, "string");
	} finally {
		await rm(base, { recursive: true, force: true });
	}
});

test("saveVideoToWorkspace rejects folders that escape the workspace", async () => {
	const base = await mkdtemp(join(tmpdir(), "dsh-video-gen-esc-"));
	try {
		await assert.rejects(
			saveVideoToWorkspace({ workspaceRoot: base, folder: "..\\escape", mediaType: "video/mp4", data: MP4_BYTES }),
			/must stay inside/,
		);
		await assert.rejects(
			saveVideoToWorkspace({ workspaceRoot: base, folder: "a/../../escape", mediaType: "video/mp4", data: MP4_BYTES }),
			/must stay inside/,
		);
	} finally {
		await rm(base, { recursive: true, force: true });
	}
});
