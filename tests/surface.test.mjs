import assert from "node:assert/strict";
import test from "node:test";

import { createIndigoWebMcpSurface } from "../dist/index.js";

function createDocumentHarness({ holdFirstRegistration = false } = {}) {
	const registrations = [];
	let releaseFirstRegistration = null;
	let firstRegistrationStarted = null;

	if (holdFirstRegistration) {
		firstRegistrationStarted = Promise.withResolvers();
	}

	return {
		document: {
			modelContext: {
				async registerTool(tool, options) {
					registrations.push({ tool, options });
					if (holdFirstRegistration && registrations.length === 1) {
						firstRegistrationStarted.resolve();
						await new Promise((resolve, reject) => {
							releaseFirstRegistration = resolve;
							if (options.signal.aborted) {
								reject(options.signal.reason);
								return;
							}
							options.signal.addEventListener(
								"abort",
								() => reject(options.signal.reason),
								{ once: true },
							);
						});
					}
				},
			},
		},
		registrations,
		firstRegistrationStarted: firstRegistrationStarted?.promise ?? null,
		releaseFirstRegistration: () => releaseFirstRegistration?.(),
	};
}

function projection({
	revision = "projection-1",
	branchId = "branch-1",
	capabilities = [
		{
			name: "admin.catalog.search.read",
			title: "Search catalog",
			description: "Search the authorized Indigo catalog.",
			inputSchema: {
				type: "object",
				properties: { query: { type: "string" } },
				additionalProperties: false,
			},
			toolVersion: "1.0.0",
			ownerDomain: "catalog",
			riskLevel: "low",
			requiresConfirmation: false,
			requiresOwner: true,
			requiresLock: false,
			sideEffect: false,
			untrustedContentHint: false,
		},
	],
} = {}) {
	return {
		revision,
		context: {
			surface: "admin",
			tenantId: "tenant-1",
			branchId,
			route: "/indigo/products",
			module: "products",
		},
		capabilities,
	};
}

test("registers a server-projected capability and preserves canonical execution context", async () => {
	const harness = createDocumentHarness();
	const executions = [];
	const surface = createIndigoWebMcpSurface({
		document: harness.document,
		execute: async (request) => {
			executions.push(request);
			return { ok: true };
		},
	});

	const result = await surface.sync(projection());

	assert.equal(result.status, "registered");
	assert.equal(result.revision, "projection-1");
	assert.deepEqual(result.toolNames, ["admin.catalog.search.read"]);
	assert.equal(harness.registrations.length, 1);
	const registered = harness.registrations[0];
	assert.equal(registered.tool.name, "admin.catalog.search.read");
	assert.deepEqual(registered.tool.annotations, {
		readOnlyHint: true,
		untrustedContentHint: false,
	});

	const execution = new AbortController();
	await registered.tool.execute(
		{ query: "coffee" },
		{ signal: execution.signal },
	);

	assert.equal(executions.length, 1);
	assert.equal(executions[0].projectionRevision, "projection-1");
	assert.equal(executions[0].context.tenantId, "tenant-1");
	assert.equal(executions[0].context.branchId, "branch-1");
	assert.equal(executions[0].capability.name, "admin.catalog.search.read");
	assert.deepEqual(executions[0].input, { query: "coffee" });
	assert.equal(executions[0].signal.aborted, false);
});

test("replaces the previous contextual tool set without leaving stale registrations", async () => {
	const harness = createDocumentHarness();
	const surface = createIndigoWebMcpSurface({
		document: harness.document,
		execute: async () => null,
	});

	await surface.sync(projection());
	const firstSignal = harness.registrations[0].options.signal;
	const secondProjection = projection({
		revision: "projection-2",
		branchId: "branch-2",
		capabilities: [
			{
				...projection().capabilities[0],
				name: "admin.catalog.product.read",
				title: "Read product",
			},
		],
	});

	const result = await surface.sync(secondProjection);

	assert.equal(firstSignal.aborted, true);
	assert.equal(result.status, "registered");
	assert.deepEqual(result.toolNames, ["admin.catalog.product.read"]);
	assert.equal(harness.registrations.length, 2);
	assert.equal(harness.registrations[1].options.signal.aborted, false);
});

test("latest projection wins when an earlier browser registration is still pending", async () => {
	const harness = createDocumentHarness({ holdFirstRegistration: true });
	const surface = createIndigoWebMcpSurface({
		document: harness.document,
		execute: async () => null,
	});

	const firstSync = surface.sync(projection({ revision: "projection-old" }));
	await harness.firstRegistrationStarted;
	const secondSync = surface.sync(
		projection({
			revision: "projection-new",
			capabilities: [
				{
					...projection().capabilities[0],
					name: "admin.catalog.product.read",
					title: "Read product",
				},
			],
		}),
	);

	const [firstResult, secondResult] = await Promise.all([firstSync, secondSync]);

	assert.equal(firstResult.status, "superseded");
	assert.equal(secondResult.status, "registered");
	assert.equal(secondResult.revision, "projection-new");
	assert.equal(harness.registrations[0].options.signal.aborted, true);
	assert.equal(harness.registrations.at(-1).tool.name, "admin.catalog.product.read");
});

test("treats missing WebMCP browser support as progressive enhancement", async () => {
	const surface = createIndigoWebMcpSurface({
		document: {},
		execute: async () => null,
	});

	const result = await surface.sync(projection());

	assert.equal(result.status, "unsupported");
	assert.deepEqual(result.toolNames, []);
});

test("clearing a projection cancels an in-flight execution", async () => {
	const harness = createDocumentHarness();
	const executionStarted = Promise.withResolvers();
	let executorSignal = null;
	const surface = createIndigoWebMcpSurface({
		document: harness.document,
		execute: async (request) => {
			executorSignal = request.signal;
			executionStarted.resolve();
			await new Promise((resolve) => {
				if (request.signal.aborted) {
					resolve();
					return;
				}
				request.signal.addEventListener("abort", resolve, { once: true });
			});
			return null;
		},
	});

	await surface.sync(projection());
	const invocation = harness.registrations[0].tool.execute(
		{},
		{ signal: new AbortController().signal },
	);
	await executionStarted.promise;

	surface.clear("route-changed");
	await invocation;

	assert.equal(executorSignal.aborted, true);
	assert.equal(executorSignal.reason, "route-changed");
	assert.equal(harness.registrations[0].options.signal.aborted, true);
});

test("empty projections remove the previous tools and remain a valid state", async () => {
	const harness = createDocumentHarness();
	const surface = createIndigoWebMcpSurface({
		document: harness.document,
		execute: async () => null,
	});

	await surface.sync(projection());
	const previousSignal = harness.registrations[0].options.signal;
	const result = await surface.sync(
		projection({ revision: "projection-empty", capabilities: [] }),
	);

	assert.equal(previousSignal.aborted, true);
	assert.equal(result.status, "empty");
	assert.deepEqual(result.toolNames, []);
});

test("forwards agent execution cancellation into the Indigo executor", async () => {
	const harness = createDocumentHarness();
	const executionStarted = Promise.withResolvers();
	let executorSignal = null;
	const surface = createIndigoWebMcpSurface({
		document: harness.document,
		execute: async (request) => {
			executorSignal = request.signal;
			executionStarted.resolve();
			await new Promise((resolve) => {
				if (request.signal.aborted) {
					resolve();
					return;
				}
				request.signal.addEventListener("abort", resolve, { once: true });
			});
			return null;
		},
	});

	await surface.sync(projection());
	const execution = new AbortController();
	const invocation = harness.registrations[0].tool.execute(
		{},
		{ signal: execution.signal },
	);
	await executionStarted.promise;

	execution.abort("agent-cancelled");
	await invocation;

	assert.equal(executorSignal.aborted, true);
	assert.equal(executorSignal.reason, "agent-cancelled");
});
