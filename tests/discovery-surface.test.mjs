import assert from "node:assert/strict";
import test from "node:test";

import {
	createIndigoWebMcpDiscoverySurface,
	INDIGO_WEBMCP_DISCOVERY_TOOL_NAME,
} from "../dist/index.js";

function createDocumentHarness() {
	const registrations = [];
	return {
		document: {
			modelContext: {
				async registerTool(tool, options) {
					registrations.push({ tool, options });
				},
			},
		},
		registrations,
	};
}

function projection({ revision = "projection-1", route = "/products" } = {}) {
	return {
		revision,
		context: { surface: "admin", route },
		capabilities: [
			{
				name: "catalog.search",
				title: "Search catalog",
				description: "Search the authorized catalog.",
				inputSchema: { type: "object", properties: {} },
				annotations: { readOnlyHint: true, untrustedContentHint: false },
			},
		],
	};
}

test("registers discovery locally without loading capabilities", async () => {
	const harness = createDocumentHarness();
	let loads = 0;
	const discovery = await createIndigoWebMcpDiscoverySurface({
		document: harness.document,
		getContext: () => ({ route: "/products", module: "catalog" }),
		loadProjection: async () => {
			loads += 1;
			return projection();
		},
		execute: async () => null,
	});
	assert.equal(loads, 0);
	assert.equal(harness.registrations.length, 1);
	assert.equal(
		harness.registrations[0].tool.name,
		INDIGO_WEBMCP_DISCOVERY_TOOL_NAME,
	);
	assert.equal(discovery.status, "registered");
});

test("loads the current projection only when discovery is invoked", async () => {
	const harness = createDocumentHarness();
	const observed = [];
	await createIndigoWebMcpDiscoverySurface({
		document: harness.document,
		getContext: () => ({ route: "/products", module: "catalog" }),
		loadProjection: async (request) => {
			observed.push(request);
			return projection();
		},
		execute: async () => null,
	});
	const signal = new AbortController().signal;
	const result = await harness.registrations[0].tool.execute({}, { signal });
	assert.deepEqual(observed[0].context, {
		route: "/products",
		module: "catalog",
	});
	assert.deepEqual(observed[0].input, {});
	assert.equal(observed[0].signal, signal);
	assert.deepEqual(result, {
		status: "registered",
		revision: "projection-1",
		toolNames: ["catalog.search"],
	});
	assert.equal(harness.registrations.length, 2);
});

test("passes an optional natural-language intent to discovery", async () => {
	const harness = createDocumentHarness();
	const inputs = [];
	await createIndigoWebMcpDiscoverySurface({
		document: harness.document,
		getContext: () => ({}),
		loadProjection: async ({ input }) => {
			inputs.push(input);
			return projection();
		},
		execute: async () => null,
	});
	await harness.registrations[0].tool.execute(
		{ query: "  find low stock products  " },
		{ signal: new AbortController().signal },
	);
	assert.deepEqual(inputs, [{ query: "find low stock products" }]);
});

test("invalidation removes contextual tools without reloading discovery", async () => {
	const harness = createDocumentHarness();
	let loads = 0;
	const discovery = await createIndigoWebMcpDiscoverySurface({
		document: harness.document,
		getContext: () => ({ route: "/products" }),
		loadProjection: async () => {
			loads += 1;
			return projection();
		},
		execute: async () => null,
	});
	await harness.registrations[0].tool.execute(
		{},
		{ signal: new AbortController().signal },
	);
	const contextualSignal = harness.registrations[1].options.signal;
	discovery.invalidate("route-changed");
	assert.equal(loads, 1);
	assert.equal(contextualSignal.aborted, true);
	assert.equal(harness.registrations[0].options.signal.aborted, false);
});

test("later discovery reads fresh context after invalidation", async () => {
	const harness = createDocumentHarness();
	let route = "/products";
	const contexts = [];
	const discovery = await createIndigoWebMcpDiscoverySurface({
		document: harness.document,
		getContext: () => ({ route }),
		loadProjection: async ({ context }) => {
			contexts.push(context);
			return projection({ revision: `projection-${contexts.length}`, route });
		},
		execute: async () => null,
	});
	await harness.registrations[0].tool.execute(
		{},
		{ signal: new AbortController().signal },
	);
	route = "/orders";
	discovery.invalidate("route-changed");
	await harness.registrations[0].tool.execute(
		{},
		{ signal: new AbortController().signal },
	);
	assert.deepEqual(contexts, [{ route: "/products" }, { route: "/orders" }]);
});

test("disposing removes discovery and projected contextual tools", async () => {
	const harness = createDocumentHarness();
	const discovery = await createIndigoWebMcpDiscoverySurface({
		document: harness.document,
		getContext: () => ({}),
		loadProjection: async () => projection(),
		execute: async () => null,
	});
	await harness.registrations[0].tool.execute(
		{},
		{ signal: new AbortController().signal },
	);
	discovery.dispose("page-unmounted");
	assert.equal(harness.registrations[0].options.signal.aborted, true);
	assert.equal(harness.registrations[1].options.signal.aborted, true);
});

test("degrades to unsupported when WebMCP is absent", async () => {
	const discovery = await createIndigoWebMcpDiscoverySurface({
		document: {},
		getContext: () => ({}),
		loadProjection: async () => projection(),
		execute: async () => null,
	});
	assert.equal(discovery.status, "unsupported");
});
