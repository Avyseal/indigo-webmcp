import assert from "node:assert/strict";
import test from "node:test";

import { createLabState, INITIAL_PRODUCTS } from "../examples/interoperability-lab/state.js";
import { startExampleServer } from "../scripts/serve-example.mjs";

function createMemoryStorage(initial = {}) {
	const values = new Map(Object.entries(initial));
	return {
		getItem(key) {
			return values.has(key) ? values.get(key) : null;
		},
		setItem(key, value) {
			values.set(key, String(value));
		},
	};
}

test("standalone lab persists mutations and restores them in a new state instance", () => {
	const storage = createMemoryStorage();
	const first = createLabState(storage);
	const before = first.snapshot().find((product) => product.id === "oat-milk");
	const updated = first.restock("oat-milk", 7);
	assert.equal(updated.stock, before.stock + 7);

	const restored = createLabState(storage);
	assert.equal(restored.snapshot().find((product) => product.id === "oat-milk").stock, updated.stock);
});

test("standalone lab falls back to canonical seed state when persisted data is invalid", () => {
	const storage = createMemoryStorage({ "indigo-webmcp-lab-state-v1": "{not-json" });
	const lab = createLabState(storage);
	assert.deepEqual(lab.snapshot(), INITIAL_PRODUCTS.map((product) => ({ ...product })));
});

test("standalone host serves the lab, dist bundle, health endpoint, and WebMCP policy", async (t) => {
	const { server, url } = await startExampleServer({ port: 0 });
	t.after(() => new Promise((resolve) => server.close(resolve)));
	const origin = new URL(url).origin;

	const health = await fetch(`${origin}/healthz`);
	assert.equal(health.status, 200);
	assert.deepEqual(await health.json(), { status: "ok", app: "indigo-webmcp", mode: "standalone" });
	assert.equal(health.headers.get("permissions-policy"), "tools=(self)");
	assert.match(health.headers.get("content-security-policy"), /default-src 'self'/);

	const page = await fetch(url);
	assert.equal(page.status, 200);
	assert.match(await page.text(), /Indigo WebMCP Interoperability Lab/);

	const app = await fetch(`${origin}/examples/interoperability-lab/app.js`);
	assert.equal(app.status, 200);
	assert.match(await app.text(), /createIndigoWebMcpDiscoverySurface/);

	const state = await fetch(`${origin}/examples/interoperability-lab/state.js`);
	assert.equal(state.status, 200);
	assert.match(await state.text(), /createLabState/);

	const bundle = await fetch(`${origin}/dist/index.js`);
	assert.equal(bundle.status, 200);
	assert.match(await bundle.text(), /registerWebMcpToolSet/);
});

test("standalone host rejects unsupported methods", async (t) => {
	const { server, url } = await startExampleServer({ port: 0 });
	t.after(() => new Promise((resolve) => server.close(resolve)));
	const response = await fetch(url, { method: "POST" });
	assert.equal(response.status, 405);
	assert.equal(response.headers.get("allow"), "GET, HEAD");
});
