import assert from "node:assert/strict";
import test from "node:test";

import {
	registerWebMcpToolSet,
	WebMcpRegistrationError,
} from "../dist/index.js";

function createDocumentHarness({ failOnName } = {}) {
	const registrations = [];
	return {
		document: {
			modelContext: {
				async registerTool(tool, options) {
					if (tool.name === failOnName) {
						throw new Error(`registration-failed:${tool.name}`);
					}
					registrations.push({ tool, options });
				},
			},
		},
		registrations,
	};
}

const readTool = {
	name: "admin.catalog.search.read",
	title: "Search catalog",
	description: "Search the authorized Indigo catalog.",
	inputSchema: {
		type: "object",
		properties: {
			query: { type: "string" },
		},
		additionalProperties: false,
	},
	annotations: {
		readOnlyHint: true,
		untrustedContentHint: false,
	},
};

test("registers a tool with a registration signal and delegates execution", async () => {
	const harness = createDocumentHarness();
	const invocations = [];
	const registration = await registerWebMcpToolSet({
		document: harness.document,
		tools: [readTool],
		execute: async (request) => {
			invocations.push(request);
			return { ok: true, tool: request.toolName };
		},
	});

	assert.deepEqual(registration.toolNames, ["admin.catalog.search.read"]);
	assert.equal(harness.registrations.length, 1);
	const registered = harness.registrations[0];
	assert.equal(registered.tool.name, readTool.name);
	assert.equal(registered.tool.title, readTool.title);
	assert.deepEqual(registered.tool.inputSchema, readTool.inputSchema);
	assert.deepEqual(registered.tool.annotations, readTool.annotations);
	assert.equal(registered.options.signal, registration.signal);
	assert.equal(registration.signal.aborted, false);

	const executionController = new AbortController();
	const result = await registered.tool.execute(
		{ query: "coffee" },
		{ signal: executionController.signal },
	);

	assert.deepEqual(result, { ok: true, tool: readTool.name });
	assert.equal(invocations.length, 1);
	assert.equal(invocations[0].toolName, readTool.name);
	assert.deepEqual(invocations[0].input, { query: "coffee" });
	assert.equal(invocations[0].signal, executionController.signal);
});

test("disposes every registration through the shared AbortSignal", async () => {
	const harness = createDocumentHarness();
	const registration = await registerWebMcpToolSet({
		document: harness.document,
		tools: [readTool],
		execute: async () => null,
	});

	registration.dispose();
	registration.dispose();

	assert.equal(registration.signal.aborted, true);
});

test("passes explicit trusted origins to registerTool", async () => {
	const harness = createDocumentHarness();
	await registerWebMcpToolSet({
		document: harness.document,
		tools: [readTool],
		exposedTo: ["https://agent.example"],
		execute: async () => null,
	});

	assert.deepEqual(harness.registrations[0].options.exposedTo, [
		"https://agent.example",
	]);
});

test("rolls back earlier registrations when a later registration fails", async () => {
	const failingName = "admin.catalog.product.read";
	const harness = createDocumentHarness({ failOnName: failingName });

	await assert.rejects(
		registerWebMcpToolSet({
			document: harness.document,
			tools: [
				readTool,
				{
					...readTool,
					name: failingName,
					title: "Read product",
				},
			],
			execute: async () => null,
		}),
		(error) =>
			error instanceof WebMcpRegistrationError &&
			error.code === "webmcp_tool_registration_failed" &&
			error.toolName === failingName,
	);

	assert.equal(harness.registrations.length, 1);
	assert.equal(harness.registrations[0].options.signal.aborted, true);
});

test("returns an inert registration for an empty authorized tool set", async () => {
	const registration = await registerWebMcpToolSet({
		document: {},
		tools: [],
		execute: async () => null,
	});

	assert.deepEqual(registration.toolNames, []);
	assert.equal(registration.signal.aborted, false);
	registration.dispose();
	assert.equal(registration.signal.aborted, true);
});

test("fails explicitly when tools exist but WebMCP is unavailable", async () => {
	await assert.rejects(
		registerWebMcpToolSet({
			document: {},
			tools: [readTool],
			execute: async () => null,
		}),
		(error) =>
			error instanceof WebMcpRegistrationError &&
			error.code === "webmcp_unavailable",
	);
});

test("does not register tools when the external lifecycle signal is already aborted", async () => {
	const harness = createDocumentHarness();
	const lifecycle = new AbortController();
	lifecycle.abort("route-changed");

	const registration = await registerWebMcpToolSet({
		document: harness.document,
		tools: [readTool],
		signal: lifecycle.signal,
		execute: async () => null,
	});

	assert.equal(registration.signal.aborted, true);
	assert.equal(registration.signal.reason, "route-changed");
	assert.equal(harness.registrations.length, 0);
});

test("unregisters completed tools when the external lifecycle signal aborts", async () => {
	const harness = createDocumentHarness();
	const lifecycle = new AbortController();
	const registration = await registerWebMcpToolSet({
		document: harness.document,
		tools: [readTool],
		signal: lifecycle.signal,
		execute: async () => null,
	});

	const reason = new Error("session-changed");
	lifecycle.abort(reason);

	assert.equal(harness.registrations.length, 1);
	assert.equal(harness.registrations[0].options.signal, registration.signal);
	assert.equal(registration.signal.aborted, true);
	assert.equal(registration.signal.reason, reason);
});

test("cancels a pending browser registration and does not register later tools", async () => {
	const lifecycle = new AbortController();
	const started = Promise.withResolvers();
	const registrations = [];
	const document = {
		modelContext: {
			async registerTool(tool, options) {
				registrations.push({ tool, options });
				started.resolve();
				return new Promise((resolve, reject) => {
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
			},
		},
	};
	const registrationPromise = registerWebMcpToolSet({
		document,
		tools: [readTool, { ...readTool, name: "admin.catalog.product.read" }],
		signal: lifecycle.signal,
		execute: async () => null,
	});

	await started.promise;
	const reason = new Error("tenant-changed");
	lifecycle.abort(reason);
	const registration = await registrationPromise;

	assert.equal(registration.signal.aborted, true);
	assert.equal(registration.signal.reason, reason);
	assert.equal(registrations.length, 1);
	assert.equal(registrations[0].options.signal, registration.signal);
});
