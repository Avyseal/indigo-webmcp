import assert from "node:assert/strict";
import test from "node:test";

import { registerWebMcpToolSet, WebMcpRegistrationError } from "../dist/index.js";

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

const readTool = {
	name: "catalog.search",
	description: "Search the authorized catalog.",
	inputSchema: {
		type: "object",
		properties: { query: { type: "string" } },
		additionalProperties: false,
	},
};

test("rejects duplicate names before registering anything", async () => {
	const harness = createDocumentHarness();
	await assert.rejects(
		registerWebMcpToolSet({
			document: harness.document,
			tools: [readTool, { ...readTool }],
			execute: async () => null,
		}),
		(error) =>
			error instanceof WebMcpRegistrationError &&
			error.code === "webmcp_tool_name_duplicate",
	);
	assert.equal(harness.registrations.length, 0);
});

test("rejects names outside the WebMCP 1-128 character grammar", async () => {
	const harness = createDocumentHarness();
	await assert.rejects(
		registerWebMcpToolSet({
			document: harness.document,
			tools: [{ ...readTool, name: "catalog search" }],
			execute: async () => null,
		}),
		(error) =>
			error instanceof WebMcpRegistrationError &&
			error.code === "webmcp_tool_name_invalid",
	);
	assert.equal(harness.registrations.length, 0);
});

test("rejects blank descriptions before registering anything", async () => {
	const harness = createDocumentHarness();
	await assert.rejects(
		registerWebMcpToolSet({
			document: harness.document,
			tools: [{ ...readTool, description: "   " }],
			execute: async () => null,
		}),
		(error) =>
			error instanceof WebMcpRegistrationError &&
			error.code === "webmcp_tool_description_required",
	);
	assert.equal(harness.registrations.length, 0);
});

test("rejects non-serializable input schemas before registering anything", async () => {
	const harness = createDocumentHarness();
	const circular = {};
	circular.self = circular;
	await assert.rejects(
		registerWebMcpToolSet({
			document: harness.document,
			tools: [{ ...readTool, inputSchema: circular }],
			execute: async () => null,
		}),
		(error) =>
			error instanceof WebMcpRegistrationError &&
			error.code === "webmcp_tool_schema_not_serializable",
	);
	assert.equal(harness.registrations.length, 0);
});
