import assert from "node:assert/strict";
import test from "node:test";

import { createIndigoWebMcpSurface } from "../dist/index.js";

function createDocumentHarness({ holdFirstRegistration = false } = {}) {
	const registrations = [];
	let firstRegistrationStarted = null;
	if (holdFirstRegistration) firstRegistrationStarted = Promise.withResolvers();
	return {
		document: {
			modelContext: {
				async registerTool(tool, options) {
					registrations.push({ tool, options });
					if (holdFirstRegistration && registrations.length === 1) {
						firstRegistrationStarted.resolve();
						await new Promise((_resolve, reject) => {
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
	};
}

function projection({
	revision = "projection-1",
	route = "/products",
	capabilities = [
		{
			name: "catalog.search",
			title: "Search catalog",
			description: "Search the authorized catalog.",
			inputSchema: {
				type: "object",
				properties: { query: { type: "string" } },
				additionalProperties: false,
			},
			annotations: { readOnlyHint: true, untrustedContentHint: false },
			metadata: { domain: "catalog" },
		},
	],
} = {}) {
	return {
		revision,
		context: { surface: "admin", route, workspace: "demo" },
		capabilities,
	};
}

test("registers a projected capability and preserves execution context", async () => {
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
	assert.deepEqual(result.toolNames, ["catalog.search"]);
	const registered = harness.registrations[0];
	assert.deepEqual(registered.tool.annotations, {
		readOnlyHint: true,
		untrustedContentHint: false,
	});
	await registered.tool.execute(
		{ query: "coffee" },
		{ signal: new AbortController().signal },
	);
	assert.equal(executions[0].projectionRevision, "projection-1");
	assert.deepEqual(executions[0].context, {
		surface: "admin",
		route: "/products",
		workspace: "demo",
	});
	assert.deepEqual(executions[0].capability.metadata, { domain: "catalog" });
});

test("replaces the previous contextual tool set without stale registrations", async () => {
	const harness = createDocumentHarness();
	const surface = createIndigoWebMcpSurface({
		document: harness.document,
		execute: async () => null,
	});
	await surface.sync(projection());
	const firstSignal = harness.registrations[0].options.signal;
	const result = await surface.sync(
		projection({
			revision: "projection-2",
			capabilities: [
				{ ...projection().capabilities[0], name: "catalog.product.read" },
			],
		}),
	);
	assert.equal(firstSignal.aborted, true);
	assert.equal(result.status, "registered");
	assert.deepEqual(result.toolNames, ["catalog.product.read"]);
});

test("latest projection wins when an earlier registration is pending", async () => {
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
				{ ...projection().capabilities[0], name: "catalog.product.read" },
			],
		}),
	);
	const [firstResult, secondResult] = await Promise.all([firstSync, secondSync]);
	assert.equal(firstResult.status, "superseded");
	assert.equal(secondResult.status, "registered");
	assert.equal(secondResult.revision, "projection-new");
	assert.equal(harness.registrations[0].options.signal.aborted, true);
	assert.equal(harness.registrations.at(-1).tool.name, "catalog.product.read");
});

test("treats missing WebMCP support as progressive enhancement", async () => {
	const surface = createIndigoWebMcpSurface({
		document: {},
		execute: async () => null,
	});
	assert.deepEqual(await surface.sync(projection()), {
		status: "unsupported",
		revision: "projection-1",
		toolNames: [],
	});
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
				if (request.signal.aborted) return resolve();
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

test("empty projections remove previous tools and remain valid", async () => {
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

test("forwards agent execution cancellation into the host executor", async () => {
	const harness = createDocumentHarness();
	const executionStarted = Promise.withResolvers();
	let executorSignal = null;
	const surface = createIndigoWebMcpSurface({
		document: harness.document,
		execute: async (request) => {
			executorSignal = request.signal;
			executionStarted.resolve();
			await new Promise((resolve) => {
				if (request.signal.aborted) return resolve();
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
