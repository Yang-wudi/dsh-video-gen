/**
 * Smoke tests for the browser bundle: it must load under the DSH
 * ModuleLoader contract, register the settings card, both tool result views,
 * and the conversation gallery view, and keep its bilingual gallery strings
 * consistent.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

/** Load the bundle exactly the way the DSH web client does (once per process: ESM caches). */
async function loadBundle() {
	const captured = {};
	globalThis.window = {
		__ModuleLoader__: {
			load(definition) { Object.assign(captured, definition); },
		},
	};
	try {
		await import("../lib/client.js");
	} finally {
		delete globalThis.window;
	}
	assert.equal(captured.id, "dsh-video-gen", "bundle must announce the dsh-video-gen module id");
	assert.equal(typeof captured.factory, "function");
	return captured.factory(require);
}

// The bundle registers itself through window.__ModuleLoader__ at import time,
// so it is captured once here and shared by every test in this file.
const bundleExports = await loadBundle();

function makeContext() {
	const injected = [];
	const registered = [];
	const effects = [];
	const ctx = {
		// The DSH client exposes the injected services as context properties;
		// `connection` is additionally read through ctx.get().
		settingsScope: { bind: () => ({ getSnapshot: () => ({}), subscribe: () => () => {} }) },
		get(name) {
			if (name === "connection") return { api: { credentials: {} } };
			if (name === "settingsScope") return ctx.settingsScope;
			if (name === "locale") return undefined;
			return {};
		},
		slots: {
			inject(slot, factory) { injected.push([slot, factory]); },
			register(options) { registered.push(options); return () => {}; },
		},
		effect(fn, id) { effects.push([fn, id]); },
	};
	return { ctx, injected, registered, effects };
}

test("client bundle loads and exposes the ModuleLoader surface", () => {
	assert.equal(typeof bundleExports.apply, "function");
	assert.deepEqual(bundleExports.inject, ["slots", "connection", "settingsScope", "locale"]);
	assert.equal(typeof bundleExports.VideoGenerationSettingsCard, "function");
	assert.equal(typeof bundleExports.GeneratedVideoCard, "function");
});

test("apply registers settings, both tool views, and the gallery tab", () => {
	const { ctx, injected, registered, effects } = makeContext();
	bundleExports.apply(ctx);

	assert.deepEqual(
		injected.map(([slot]) => slot),
		["settings.plugin.item", "tool.call.toolview", "tool.call.toolview", "conversation.view"],
	);
	// Lazily trigger each registration factory like the host would.
	for (const [, factory] of injected) factory();

	assert.equal(registered[0].key, "video-generation");
	assert.equal(registered[1].key, "generate_video");
	assert.equal(registered[2].key, "animate_image");
	assert.equal(registered[3].id, "video-gallery");
	assert.equal(typeof registered[3].label, "function");
	assert.equal(registered[3].label(), "视频画廊", "zh label without a locale service");
	assert.deepEqual(registered[3].inject(), { locale: undefined });

	// Style effect injects the stylesheet once and cleans up on dispose.
	const styleEffects = effects.filter(([, id]) => id === "dsh-video-gen: styles");
	assert.equal(styleEffects.length, 1);
	let disposed = false;
	globalThis.document = {
		createElement() {
			return { dataset: {}, textContent: "", remove() { disposed = true; } };
		},
		head: { appendChild() {} },
	};
	try {
		const dispose = styleEffects[0][0]();
		assert.equal(typeof dispose, "function");
		dispose();
		assert.equal(disposed, true);
	} finally {
		delete globalThis.document;
	}
});

test("the injected stylesheet carries the gallery design", () => {
	const { ctx, effects } = makeContext();
	bundleExports.apply(ctx);
	let css = "";
	globalThis.document = {
		createElement() {
			const el = { dataset: {}, remove() {} };
			Object.defineProperty(el, "textContent", { set(value) { css = value; } });
			return el;
		},
		head: { appendChild() {} },
	};
	try {
		for (const [fn] of effects) fn();
	} finally {
		delete globalThis.document;
	}
	for (const marker of [
		".dsh-vg-gallery-page",
		".dsh-vg-gallery-grid",
		".dsh-vg-gallery-card",
		".dsh-vg-card-toolbar",
		".dsh-vg-gallery-card-sub",
		".dsh-vg-tag-i2v",
		".dsh-vg-lightbox-backdrop",
		".dsh-vg-gallery-page-toast",
	]) {
		assert.ok(css.includes(marker), `stylesheet must style ${marker}`);
	}
});

test("every t() key exists in both locales", async () => {
	const source = await readFile(new URL("../lib/client.js", import.meta.url), "utf8");
	const used = [...new Set([...source.matchAll(/\bt\("([A-Za-z0-9_]+)"/g)].map((m) => m[1]))];
	assert.ok(used.length >= 40, `expected a substantial dictionary, found ${used.length} keys`);
	const zhStart = source.indexOf("zh: {");
	const enStart = source.indexOf("en: {");
	assert.ok(zhStart >= 0 && enStart > zhStart, "dictionary must define zh before en");
	const zh = source.slice(zhStart, enStart);
	const en = source.slice(enStart);
	const missing = [];
	for (const key of used) {
		if (!new RegExp(`\\b${key}:`).test(zh)) missing.push(`zh:${key}`);
		if (!new RegExp(`\\b${key}:`).test(en)) missing.push(`en:${key}`);
	}
	assert.deepEqual(missing, []);
});

test("gallery strings cover the image-gen parity features", async () => {
	const source = await readFile(new URL("../lib/client.js", import.meta.url), "utf8");
	for (const key of [
		"galleryTab", "galleryTotalCount", "gallerySearchPlaceholder", "galleryFilterAll",
		"galleryEmptyTitle", "galleryNoMatchTitle", "galleryDelete", "galleryConfirmDelete",
		"galleryDeleted", "galleryI2v", "galleryUnavailable", "copiedPrompt", "copyFailed",
		"download", "copyPpt", "openNewTab",
	]) {
		assert.ok(source.includes(`${key}:`), `dictionary must define ${key}`);
	}
	// The auto-collect path keys records on the stable videoId and stores the
	// durable fields the gallery renders.
	assert.ok(source.includes("saveGalleryItem"), "result card must auto-collect into the gallery store");
	assert.ok(source.includes("savedTo"), "gallery records keep the workspace path");
	assert.ok(source.includes("operation"), "gallery records keep the animate operation");
	assert.ok(source.includes("duration"), "gallery records keep the requested duration");
});

test("bundle has no stray debug logging on the gallery save path", async () => {
	const source = await readFile(new URL("../lib/client.js", import.meta.url), "utf8");
	assert.ok(!/console\.log\("\[dsh-video-gen\] Gallery item saved/.test(source), "save path must stay quiet");
});
