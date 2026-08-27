import assert from "node:assert/strict";
import test from "node:test";

import { createIndigoWebMcpDiscoverySurface } from "../dist/index.js";

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

function projection(
	{ revision = "projection-1", route = "/indigo/products" } = {},
) {
	return {
		revision,
		context: {
			surface: "admin",
			tenantId: "tenant-1",
			branchId: "branch-1",
			route,
			module: "products",
		},
		capabilities: [
			{
				name: "admin.catalog.search.read",
				title: "Search catalog",
				description: "Search the authorized catalog.",
				inputSchema: { type: "object", properties: {} },
				toolVersion: "1.0.0",
				ownerDomain: "catalog",
				riskLevel: "low",
				requiresConfirmation: false,
				requiresOwner: false,
				requiresLock: false,
				sideEffect: false,
			},
		],
	};
}

test("registers discovery locally without loading backend capabilities", async () => {
	const harness = createDocumentHarness();
	let loads = 0;
	const discovery = await createIndigoWebMcpDiscoverySurface({
		document: harness.document,
		getContext: () => ({ route: "/indigo/products", module: "products" }),
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
		"indigo.capabilities.discover",
	);
	assert.equal(discovery.status, "registered");
});

test("loads the current projection only when discovery is invoked", async () => {
	const harness = createDocumentHarness();
	const observed = [];
	const discovery = await createIndigoWebMcpDiscoverySurface({
		document: harness.document,
		getContext: () => ({ route: "/indigo/products", module: "products" }),
		loadProjection: async (request) => {
			observed.push(request);
			return projection();
		},
		execute: async () => null,
	});

	const execution = new AbortController();
	const result = await harness.registrations[0].tool.execute(
		{},
		{ signal: execution.signal },
	);

	assert.equal(observed.length, 1);
	assert.deepEqual(observed[0].context, {
		route: "/indigo/products",
		module: "products",
	});
	assert.equal(observed[0].signal, execution.signal);
	assert.equal(harness.registrations.length, 2);
	assert.deepEqual(result, {
		status: "registered",
		revision: "projection-1",
		toolNames: ["admin.catalog.search.read"],
	});
	assert.equal(discovery.status, "registered");
});

test("invalidation removes business tools without reloading the backend", async () => {
	const harness = createDocumentHarness();
	let loads = 0;
	const discovery = await createIndigoWebMcpDiscoverySurface({
		document: harness.document,
		getContext: () => ({ route: "/indigo/products" }),
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
	const businessSignal = harness.registrations[1].options.signal;
	discovery.invalidate("route-changed");

	assert.equal(loads, 1);
	assert.equal(businessSignal.aborted, true);
	assert.equal(harness.registrations[0].options.signal.aborted, false);
});

test("a later discovery reads fresh context after invalidation", async () => {
	const harness = createDocumentHarness();
	let route = "/indigo/products";
	const contexts = [];
	const discovery = await createIndigoWebMcpDiscoverySurface({
		document: harness.document,
		getContext: () => ({ route }),
		loadProjection: async (request) => {
			contexts.push(request.context);
			return projection({ revision: `projection-${contexts.length}`, route });
		},
		execute: async () => null,
	});

	await harness.registrations[0].tool.execute(
		{},
		{ signal: new AbortController().signal },
	);
	route = "/indigo/orders";
	discovery.invalidate("route-changed");
	await harness.registrations[0].tool.execute(
		{},
		{ signal: new AbortController().signal },
	);

	assert.deepEqual(contexts, [
		{ route: "/indigo/products" },
		{ route: "/indigo/orders" },
	]);
});

test("disposing removes discovery and projected business tools", async () => {
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

	discovery.dispose("admin-unmounted");

	assert.equal(harness.registrations[0].options.signal.aborted, true);
	assert.equal(harness.registrations[1].options.signal.aborted, true);
});
