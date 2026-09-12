/** resolveReferenceImage: workspace paths and conversation attachments. */
import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";

import { resolveReferenceImage } from "../lib/reference-image.js";

/** The smallest byte sequence the PNG sniffer accepts. */
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01]);

const signal = () => new AbortController().signal;

/** One conversation image ref as the harness carries it. */
function ref(id, mediaType = "image/png") {
	return { attachmentId: id, mediaType, bytes: PNG.length, width: 1, height: 1 };
}

test("source_path reads an image from the session workspace", async () => {
	const root = await mkdtemp(join(tmpdir(), "vg-ref-"));
	try {
		await mkdir(join(root, "shots"));
		await writeFile(join(root, "shots", "frame.png"), PNG);
		const resolved = await resolveReferenceImage({
			sourcePath: "shots/frame.png",
			workspaceRoot: root,
			signal: signal(),
		});
		assert.equal(resolved?.mediaType, "image/png");
		assert.deepEqual(resolved?.data, PNG);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("source_attachment_id reads the matching conversation image", async () => {
	const asked = [];
	const resolved = await resolveReferenceImage({
		sourceAttachmentId: "att-2",
		conversationImages: [ref("att-1"), ref("att-2", "image/jpeg"), ref("att-3")],
		readImage: async (imageRef) => {
			asked.push(String(imageRef.attachmentId));
			return { data: PNG, mediaType: imageRef.mediaType };
		},
		signal: signal(),
	});
	assert.deepEqual(asked, ["att-2"], "only the requested attachment is read");
	assert.equal(resolved?.mediaType, "image/jpeg");
	assert.deepEqual(resolved?.data, PNG);
});

test("source_attachment_id matches a digest written in another surface form", async () => {
	// Some harness builds hand the model a digest rather than a raw id, so the
	// same attachment can arrive prefixed, upper-cased, or bare. Compare digests
	// rather than the strings.
	const digest = createHash("sha256").update("att-9 bytes").digest("hex");
	const stdin = [];
	const resolved = await resolveReferenceImage({
		sourceAttachmentId: digest,
		conversationImages: [ref(`sha256:${digest.toUpperCase()}`)],
		readImage: async (imageRef) => {
			stdin.push(String(imageRef.attachmentId));
			return { data: PNG, mediaType: imageRef.mediaType };
		},
		signal: signal(),
	});
	assert.equal(stdin.length, 1, "the digest resolves to the stored attachment");
	assert.equal(resolved?.mediaType, "image/png");
});

test("source_attachment_id that the conversation does not carry fails loudly", async () => {
	await assert.rejects(
		() => resolveReferenceImage({
			sourceAttachmentId: "att-missing",
			conversationImages: [ref("att-1")],
			readImage: async () => ({ data: PNG }),
			signal: signal(),
		}),
		/could not find image attachment att-missing in the current conversation/,
	);
});

test("omitting both arguments animates the newest conversation image", async () => {
	const read = [];
	const resolved = await resolveReferenceImage({
		conversationImages: [ref("older"), ref("middle"), ref("newest", "image/webp")],
		readImage: async (imageRef) => {
			read.push(String(imageRef.attachmentId));
			return { data: PNG, mediaType: imageRef.mediaType };
		},
		signal: signal(),
	});
	assert.deepEqual(read, ["newest"], "the last image in conversation order wins");
	assert.equal(resolved?.mediaType, "image/webp");
});

test("omitting both arguments with no conversation image yields nothing", async () => {
	const resolved = await resolveReferenceImage({
		conversationImages: [],
		readImage: async () => ({ data: PNG }),
		signal: signal(),
	});
	assert.equal(resolved, undefined);
});

test("an attachment request without an attachment store is refused", async () => {
	await assert.rejects(
		() => resolveReferenceImage({
			sourceAttachmentId: "att-1",
			conversationImages: [ref("att-1")],
			signal: signal(),
		}),
		/requires an image attachment store/,
	);
});

test("a store failure is reported against the attachment it names", async () => {
	await assert.rejects(
		() => resolveReferenceImage({
			sourceAttachmentId: "att-7",
			conversationImages: [ref("att-7")],
			readImage: async () => { throw new Error("store offline"); },
			signal: signal(),
		}),
		/could not read image attachment att-7: store offline/,
	);
});

test("naming both a path and an attachment is rejected", async () => {
	await assert.rejects(
		() => resolveReferenceImage({
			sourcePath: "shots/frame.png",
			sourceAttachmentId: "att-1",
			signal: signal(),
		}),
		/accepts either source_attachment_id or source_path, not both/,
	);
});
